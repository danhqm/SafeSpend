import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { freshGuide, observeGuide, replayGuide, type GuideFacts, type GuideProgress, type GuideStep } from "../utils/home-guide-core";
import { homeGuide } from "../utils/home-guide";
import { getSavedUserId } from "../utils/offline-session";
import { supabase } from "../utils/supabase";

export function useHomeGuide(replayKey?: string) {
  const [progress, setProgress] = useState<GuideProgress | null>(null);
  const [step, setStep] = useState<GuideStep | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const owner = useRef<string | null>(null);
  const current = useRef<GuideProgress | null>(null);
  const generation = useRef(0);
  const action = useRef(0);
  const handledReplay = useRef<string | undefined>(undefined);

  useFocusEffect(useCallback(() => {
    const request = ++generation.current;
    let active = true;
    setStep(null);
    setProgress(null);
    const valid = () => active && request === generation.current;
    void (async () => {
      try {
        const { userId, offline } = await getSavedUserId();
        if (!valid()) return;
        if (owner.current !== userId) {
          owner.current = userId;
          current.current = null;
          setProgress(null);
          setNotice(null);
          handledReplay.current = undefined;
        }
        if (!userId) return;
        const replay = Boolean(replayKey && handledReplay.current !== replayKey);
        let saved: GuideProgress | null = null;
        let storageFailed = false;
        try { saved = await homeGuide.read(userId); }
        catch { storageFailed = true; }
        if (!valid()) return;
        let next = saved ?? current.current ?? freshGuide();
        let facts: GuideFacts | null = null;
        let factsFailed = false;
        if (!offline && (next.visibility !== "hidden" || replay)) {
          try {
            const [activity, expense, budget] = await Promise.all([
              supabase.from("transactions").select("id").eq("user_id", userId).eq("status", "posted").limit(1),
              supabase.from("transactions").select("id").eq("user_id", userId).eq("status", "posted")
                .eq("transaction_type", "expense").gt("amount", 0).limit(1),
              supabase.from("budgets").select("id").eq("user_id", userId).eq("category", "ALL").gt("amount", 0).limit(1),
            ]);
            if (activity.error || expense.error || budget.error) throw new Error("Setup progress unavailable");
            facts = { hasActivity: Boolean(activity.data?.length),
              hasExpense: Boolean(expense.data?.length), hasBudget: Boolean(budget.data?.length) };
            next = observeGuide(next, facts);
          } catch { factsFailed = true; }
        } else if (offline) factsFailed = true;
        if (!valid()) return;
        // Never mistake unavailable history for an empty account.
        if (next.visibility === "new" && (factsFailed || storageFailed) && !replay) {
          setProgress(null);
          return;
        }
        if (replay) next = replayGuide(next);
        if (!storageFailed && (facts || replay)) {
          try { next = await homeGuide.update(userId, (latest) => {
            if (!valid()) return latest;
            const observed = facts ? observeGuide(latest, facts) : latest;
            return replay ? replayGuide(observed) : observed;
          }); }
          catch { storageFailed = true; }
        }
        if (!valid()) return;
        current.current = next;
        setProgress(next);
        setNotice(storageFailed ? "Your guide progress couldn’t be saved. You can keep going."
          : factsFailed && next.visibility === "active" ? "Reconnect to refresh your setup progress." : null);
        if (replay) {
          handledReplay.current = replayKey;
          setStep(0);
        }
      } catch {
        if (valid()) { setProgress(null); setStep(null); }
      }
    })();
    return () => { active = false; generation.current += 1; };
  }, [replayKey]));

  const change = useCallback((update: (state: GuideProgress) => GuideProgress) => {
    const userId = owner.current;
    if (!userId || !current.current) return;
    const next = update(current.current);
    current.current = next;
    setProgress(next);
    const request = ++action.current;
    const epoch = generation.current;
    void homeGuide.update(userId, update).then(() => {
      if (owner.current === userId && epoch === generation.current && request === action.current) setNotice(null);
    }).catch(() => {
      if (owner.current === userId && epoch === generation.current && request === action.current)
        setNotice("Your guide progress couldn’t be saved. You can keep going.");
    });
  }, []);

  const open = (target?: GuideStep) => {
    const nextStep = target ?? current.current?.step ?? 0;
    change((state) => ({ ...state, visibility: "active", step: nextStep, tourFinished: false }));
    setStep(nextStep);
  };
  const close = () => {
    change((state) => ({ ...state, tourFinished: true }));
    setStep(null);
  };
  const next = () => {
    if (step === null) return;
    const nextStep = Math.min(2, step + 1) as GuideStep;
    change((state) => ({ ...state, step: nextStep, summaryViewed: state.summaryViewed || step === 1 }));
    setStep(nextStep);
  };
  const leaveForTask = () => {
    if (step === null) return;
    change((state) => ({ ...state, step: step === 0 ? 1 : step }));
    setStep(null);
  };
  return { progress, step, notice, open, next, close, leaveForTask,
    back: () => { if (step !== null) open(Math.max(0, step - 1) as GuideStep); },
    dismiss: () => { change((state) => ({ ...state, visibility: "hidden" })); setStep(null); },
  };
}
