export type GuideStep = 0 | 1 | 2;
export type GuideProgress = {
  version: 1;
  visibility: "new" | "active" | "hidden";
  step: GuideStep;
  tourFinished: boolean;
  expenseRecorded: boolean;
  summaryViewed: boolean;
  budgetSet: boolean;
};
export type GuideFacts = { hasActivity: boolean; hasExpense: boolean; hasBudget: boolean };

export function freshGuide(): GuideProgress {
  return { version: 1, visibility: "new", step: 0, tourFinished: false,
    expenseRecorded: false, summaryViewed: false, budgetSet: false };
}

export function guideComplete(state: GuideProgress) {
  return state.expenseRecorded && state.summaryViewed && state.budgetSet;
}

export function observeGuide(state: GuideProgress, facts: GuideFacts): GuideProgress {
  return { ...state,
    visibility: state.visibility === "new" && (facts.hasActivity || facts.hasBudget) ? "hidden" : state.visibility,
    expenseRecorded: state.expenseRecorded || facts.hasExpense,
    budgetSet: state.budgetSet || facts.hasBudget,
  };
}

export function replayGuide(state: GuideProgress): GuideProgress {
  return { ...state, visibility: "active", step: 0, tourFinished: false };
}

function decode(value: string | null): GuideProgress | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed.version !== 1 || !["new", "active", "hidden"].includes(parsed.visibility) ||
      ![0, 1, 2].includes(parsed.step) ||
      !["tourFinished", "expenseRecorded", "summaryViewed", "budgetSet"].every((key) => typeof parsed[key] === "boolean")) return null;
    return { version: 1, visibility: parsed.visibility, step: parsed.step,
      tourFinished: parsed.tourFinished, expenseRecorded: parsed.expenseRecorded,
      summaryViewed: parsed.summaryViewed, budgetSet: parsed.budgetSet };
  } catch { return null; }
}

type GuideStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };

export function createGuideStore(storage: GuideStorage) {
  const queues = new Map<string, Promise<unknown>>();
  const keyFor = (userId: string) => {
    if (!userId) throw new Error("Guide progress requires a signed-in user");
    return `safespend.guide.v1.${userId}`;
  };
  const readStored = async (userId: string) => decode(await storage.getItem(keyFor(userId)));
  const read = async (userId: string) => {
    await queues.get(userId)?.catch(() => {});
    return readStored(userId);
  };
  const update = async (userId: string, change: (state: GuideProgress) => GuideProgress): Promise<GuideProgress> => {
    keyFor(userId);
    const pending = (queues.get(userId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      const state = change(await readStored(userId) ?? freshGuide());
      await storage.setItem(keyFor(userId), JSON.stringify(state));
      return state;
    });
    queues.set(userId, pending);
    try { return await pending; }
    finally { if (queues.get(userId) === pending) queues.delete(userId); }
  };
  return { read, update };
}
