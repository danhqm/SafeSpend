export type ConsentStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// Permission is per signed-in user and device. An unreadable record fails closed.
export function createAiConsentStore(storage: ConsentStorage) {
  const choices = new Map<string, boolean>();
  const revisions = new Map<string, number>();
  const writes = new Map<string, Promise<void>>();
  const key = (userId: string) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) throw new Error("A signed-in user is required");
    return `safespend.ai-consent.v1.${userId}`;
  };
  async function get(userId: string): Promise<boolean> {
    const storageKey = key(userId);
    if (choices.has(userId)) return choices.get(userId) === true;
    const revision = revisions.get(userId);
    try {
      const raw = await storage.getItem(storageKey);
      if (revision !== revisions.get(userId)) return choices.get(userId) === true;
      const value: unknown = JSON.parse(raw ?? "null");
      return typeof value === "object" && value !== null && "version" in value
        && value.version === 1 && "allowed" in value && value.allowed === true;
    } catch { return false; }
  }
  async function save(userId: string, allowed: boolean | null): Promise<void> {
    const storageKey = key(userId);
    const revision = (revisions.get(userId) ?? 0) + 1;
    revisions.set(userId, revision);
    // Revoke immediately; enabling only takes effect after a successful write.
    choices.set(userId, false);
    const pending = (writes.get(userId) ?? Promise.resolve()).catch(() => {}).then(async () => {
      if (allowed === null) await storage.removeItem(storageKey);
      else await storage.setItem(storageKey, JSON.stringify({ version: 1, allowed }));
      if (revisions.get(userId) === revision) choices.set(userId, allowed === true);
    });
    writes.set(userId, pending);
    try { await pending; }
    finally { if (writes.get(userId) === pending) writes.delete(userId); }
  }
  return { get, set: (userId: string, allowed: boolean) => save(userId, allowed),
    clear: (userId: string) => save(userId, null) };
}
