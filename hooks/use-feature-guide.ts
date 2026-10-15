import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { featureGuide } from "../utils/feature-guide";
import { freshFeatureGuide, transitionFeatureGuide, type FeatureGuideEvent, type FeatureGuideKey, type FeatureGuideProgress } from "../utils/feature-guide-core";
import { getSavedUserId } from "../utils/offline-session";

export function useFeatureGuide(feature: FeatureGuideKey, resolveUser: () => Promise<{ userId: string | null }> = getSavedUserId) {
  const [progress, setProgress] = useState<FeatureGuideProgress | null>(null);
  const [step, setStep] = useState<0 | 1 | 2 | null>(null);
  const [ready, setReady] = useState(false);
  const [hasUser, setHasUser] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const owner = useRef<string | null>(null);
  const scope = useRef<string | null>(null);
  const current = useRef<FeatureGuideProgress | null>(null);
  const generation = useRef(0);
  const action = useRef(0);

  useFocusEffect(useCallback(() => {
    const request = ++generation.current;
    setReady(false);
    setHasUser(false);
    setProgress(null);
    setStep(null);
    let identityResolved = false;
    void (async () => {
      try {
        const { userId } = await resolveUser();
        if (request !== generation.current) return;
        if (`${feature}:${userId}` !== scope.current) current.current = null;
        scope.current = `${feature}:${userId}`;
        owner.current = userId;
        setHasUser(Boolean(userId));
        if (!userId) return;
        identityResolved = true;
        const saved = await featureGuide.read(userId, feature);
        if (request !== generation.current) return;
        current.current = saved ?? freshFeatureGuide();
        setProgress(current.current);
        setNotice(null);
      } catch {
        // Failed preference reads must not repeatedly invite the user.
        if (request === generation.current) {
          setProgress(identityResolved && current.current?.status === "started" ? current.current : null);
          setNotice("Guide progress is only available for this visit.");
        }
      } finally {
        if (request === generation.current) setReady(true);
      }
    })();
    return () => { generation.current += 1; };
  }, [feature, resolveUser]));

  const change = (event: FeatureGuideEvent) => {
    const userId = owner.current;
    if (!ready || !hasUser || !userId) return null;
    const next = transitionFeatureGuide(current.current ?? freshFeatureGuide(), event);
    current.current = next;
    setProgress(next);
    const request = ++action.current;
    const epoch = generation.current;
    void featureGuide.update(userId, feature, event).then(() => {
      if (generation.current === epoch && action.current === request) setNotice(null);
    }).catch(() => {
      if (generation.current === epoch && action.current === request)
        setNotice("Guide progress is only available for this visit.");
    });
    return next;
  };
  const open = (replay = false) => {
    const next = change(replay ? "replay" : "start");
    if (next) setStep(next.step);
  };
  return { progress, step, ready: ready && hasUser, notice, open,
    next: () => { const next = change("next"); if (next) setStep(next.step); },
    back: () => { const next = change("back"); if (next) setStep(next.step); },
    dismiss: () => { change("dismiss"); setStep(null); },
    finish: () => { change("finish"); setStep(null); },
    leave: () => { change(step === 2 ? "finish" : "next"); setStep(null); },
  };
}

export type FeatureGuideController = ReturnType<typeof useFeatureGuide>;
