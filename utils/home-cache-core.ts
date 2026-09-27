export type LatestActivitySummary = {
  id: string;
  merchant_name: string | null;
  amount: number;
  occurred_on: string;
  category: string;
  transaction_type: "expense" | "income" | "refund";
  source: "manual" | "receipt";
};

export type HomeSummary = {
  savedAt: number;
  month: string;
  username: string;
  avatarUrl: string | null;
  monthlyBudget: number;
  totalExpense: number;
  profileMonthlyIncome: number;
  latestActivity: LatestActivitySummary | null;
};

export type MonthSummary = {
  savedAt: number;
  month: string;
  categories: { category: string; amount: number }[];
  total: number;
  recordedIncome: number;
  budget: number;
  budgetUnavailable: boolean;
};

export type FinSummary = {
  savedAt: number;
  insights: string[];
  recordedTransactions: number | null;
  historyLimited: boolean;
};

type Store = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const PREFIX = "safespend.home.v1";
const ACTIVE_USER_KEY = `${PREFIX}.last-user`;
const CURRENT_MONTH_TTL = 5 * 60_000;
const PAST_MONTH_TTL = 24 * 60 * 60_000;
const FIN_TTL = 30 * 60_000;
const HOME_TTL = 5 * 60_000;
const MAX_CACHED_MONTHS = 24;

function localMonth(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function key(userId: string, suffix: string) {
  return `${PREFIX}.${userId}.${suffix}`;
}

function parseRecord<T extends { savedAt: number }>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" ||
      !Number.isFinite((value as T).savedAt)) return null;
    return value as T;
  } catch {
    return null;
  }
}

export function isFresh(savedAt: number, ttl: number, now = Date.now()) {
  return savedAt > 0 && savedAt <= now && now - savedAt < ttl;
}

export function isHomeFresh(summary: HomeSummary, now = Date.now()) {
  return isFresh(summary.savedAt, HOME_TTL, now) &&
    summary.month === localMonth(now);
}

export function isMonthFresh(summary: MonthSummary, now = Date.now()) {
  const ttl = summary.month === localMonth(now)
    ? CURRENT_MONTH_TTL : PAST_MONTH_TTL;
  return isFresh(summary.savedAt, ttl, now);
}

export function isFinFresh(summary: FinSummary, now = Date.now()) {
  return isFresh(summary.savedAt, FIN_TTL, now) &&
    localMonth(summary.savedAt) === localMonth(now);
}

export function createHomeCache(store: Store) {
  const memory = new Map<string, string>();
  const writeQueues = new Map<string, Promise<void>>();
  const generations = new Map<string, number>();

  function generation(userId: string) {
    return generations.get(userId) ?? 0;
  }

  function advance(userId: string) {
    generations.set(userId, generation(userId) + 1);
  }

  function enqueue(userId: string, work: () => Promise<void>) {
    const next = (writeQueues.get(userId) ?? Promise.resolve())
      .catch(() => {})
      .then(work);
    writeQueues.set(userId, next);
    void next.finally(() => {
      if (writeQueues.get(userId) === next) writeQueues.delete(userId);
    }).catch(() => {});
    return next;
  }

  async function read<T extends { savedAt: number }>(storageKey: string): Promise<T | null> {
    const userId = storageKey.slice(PREFIX.length + 1).split(".")[0];
    const before = generation(userId);
    const raw = memory.get(storageKey) ?? await store.getItem(storageKey);
    if (before !== generation(userId)) return null;
    if (raw) memory.set(storageKey, raw);
    return parseRecord<T>(raw);
  }

  function peek<T extends { savedAt: number }>(storageKey: string): T | null {
    return parseRecord<T>(memory.get(storageKey) ?? null);
  }

  function put<T>(userId: string, storageKey: string, value: T) {
    const raw = JSON.stringify(value);
    memory.set(storageKey, raw);
    return enqueue(userId, async () => store.setItem(storageKey, raw));
  }

  async function remove(userId: string, storageKeys: string[]) {
    advance(userId);
    for (const storageKey of storageKeys) memory.delete(storageKey);
    await enqueue(userId, async () => {
      await Promise.all(storageKeys.map((storageKey) => store.removeItem(storageKey)));
    });
  }

  return {
    generation,
    getOfflineUserId: async () => {
      const value = memory.get(ACTIVE_USER_KEY) ?? await store.getItem(ACTIVE_USER_KEY);
      if (!value || !/^[a-f0-9-]{36}$/i.test(value)) return null;
      memory.set(ACTIVE_USER_KEY, value);
      return value;
    },
    markOfflineUser: (userId: string) => {
      memory.set(ACTIVE_USER_KEY, userId);
      return enqueue(userId, async () => store.setItem(ACTIVE_USER_KEY, userId));
    },
    getHome: (userId: string) => read<HomeSummary>(key(userId, "home")),
    getFin: (userId: string) => read<FinSummary>(key(userId, "fin")),
    getMonth: (userId: string, month: string) =>
      read<MonthSummary>(key(userId, `month.${month}`)),
    peekMonth: (userId: string, month: string) =>
      peek<MonthSummary>(key(userId, `month.${month}`)),
    putHome: (userId: string, summary: HomeSummary) =>
      put(userId, key(userId, "home"), summary),
    putFin: (userId: string, summary: FinSummary) =>
      put(userId, key(userId, "fin"), summary),
    putMonth: (userId: string, summary: MonthSummary) => {
      const storageKey = key(userId, `month.${summary.month}`);
      const raw = JSON.stringify(summary);
      memory.set(storageKey, raw);
      return enqueue(userId, async () => {
        await store.setItem(storageKey, raw);
        const indexKey = key(userId, "months");
        let months: string[] = [];
        try {
          const parsed: unknown = JSON.parse(await store.getItem(indexKey) ?? "[]");
          if (Array.isArray(parsed)) months = parsed.filter((item): item is string => typeof item === "string");
        } catch { /* Rebuild an invalid index. */ }
        months = months.filter((month) => month !== summary.month);
        months.push(summary.month);
        const evicted = months.splice(0, Math.max(0, months.length - MAX_CACHED_MONTHS));
        for (const month of evicted) {
          const evictedKey = key(userId, `month.${month}`);
          memory.delete(evictedKey);
          await store.removeItem(evictedKey);
        }
        await store.setItem(indexKey, JSON.stringify(months));
      });
    },
    invalidateFin: (userId: string) => remove(userId, [key(userId, "fin")]),
    invalidateHome: (userId: string) => remove(userId, [key(userId, "home")]),
    invalidateHomeAndFin: (userId: string) =>
      remove(userId, [key(userId, "home"), key(userId, "fin")]),
    invalidateMonths: (userId: string, months: string[]) =>
      remove(userId, [
        key(userId, "home"), key(userId, "fin"),
        ...[...new Set(months)].map((month) => key(userId, `month.${month}`)),
      ]),
    clearUser: (userId: string) => {
      advance(userId);
      if (memory.get(ACTIVE_USER_KEY) === userId) memory.delete(ACTIVE_USER_KEY);
      for (const storageKey of memory.keys()) {
        if (storageKey.startsWith(`${PREFIX}.${userId}.`)) memory.delete(storageKey);
      }
      return enqueue(userId, async () => {
        const indexKey = key(userId, "months");
        let months: string[] = [];
        try {
          const parsed: unknown = JSON.parse(await store.getItem(indexKey) ?? "[]");
          if (Array.isArray(parsed)) months = parsed.filter((item): item is string => typeof item === "string");
        } catch { /* The known keys are still removed. */ }
        if (await store.getItem(ACTIVE_USER_KEY) === userId) {
          await store.removeItem(ACTIVE_USER_KEY);
        }
        await Promise.all([
          ...months.map((month) => store.removeItem(key(userId, `month.${month}`))),
          store.removeItem(key(userId, "home")),
          store.removeItem(key(userId, "fin")),
          store.removeItem(indexKey),
        ]);
      });
    },
  };
}
