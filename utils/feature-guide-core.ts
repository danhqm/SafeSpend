export type FeatureGuideKey = "learn" | "fin" | "lhdn";
export type FeatureGuideEvent = "start" | "replay" | "next" | "back" | "dismiss" | "finish";
export type FeatureGuideProgress = {
  version: 1;
  status: "new" | "started" | "dismissed" | "finished";
  step: 0 | 1 | 2;
};
export type GuideStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function freshFeatureGuide(): FeatureGuideProgress {
  return { version: 1, status: "new", step: 0 };
}

export function transitionFeatureGuide(state: FeatureGuideProgress, event: FeatureGuideEvent): FeatureGuideProgress {
  switch (event) {
    case "start": return { ...state, status: "started", step: state.status === "started" ? state.step : 0 };
    case "replay": return { ...state, status: "started", step: 0 };
    case "next": return { ...state, status: "started", step: Math.min(2, state.step + 1) as 0 | 1 | 2 };
    case "back": return { ...state, status: "started", step: Math.max(0, state.step - 1) as 0 | 1 | 2 };
    case "dismiss": return { ...state, status: "dismissed" };
    case "finish": return { ...state, status: "finished", step: 2 };
  }
}

function decode(raw: string | null): FeatureGuideProgress | null {
  try {
    const state = JSON.parse(raw ?? "null");
    return state?.version === 1 && ["new", "started", "dismissed", "finished"].includes(state.status) && [0, 1, 2].includes(state.step)
      ? { version: 1, status: state.status, step: state.step } : null;
  } catch { return null; }
}

export function createFeatureGuideStore(storage: GuideStorage) {
  const queues = new Map<string, Promise<unknown>>();
  // Retain unsaved choices for this session if device storage fails.
  const unsaved = new Map<string, FeatureGuideProgress>();
  const keyFor = (userId: string, feature: FeatureGuideKey) => {
    if (!userId) throw new Error("A feature guide requires a signed-in user");
    return `safespend.feature-guide.v1.${feature}.${userId}`;
  };
  const readStored = async (key: string) => unsaved.get(key) ?? decode(await storage.getItem(key));
  const read = async (userId: string, feature: FeatureGuideKey) => {
    const key = keyFor(userId, feature);
    await queues.get(key)?.catch(() => {});
    return readStored(key);
  };
  const update = async (userId: string, feature: FeatureGuideKey, event: FeatureGuideEvent) => {
    const key = keyFor(userId, feature);
    const pending = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      let previous = unsaved.get(key);
      if (!previous) {
        try { previous = await readStored(key) ?? freshFeatureGuide(); }
        catch { previous = freshFeatureGuide(); }
      }
      const state = transitionFeatureGuide(previous, event);
      unsaved.set(key, state);
      await storage.setItem(key, JSON.stringify(state));
      unsaved.delete(key);
      return state;
    });
    queues.set(key, pending);
    try { return await pending; }
    finally { if (queues.get(key) === pending) queues.delete(key); }
  };
  return { read, update };
}
