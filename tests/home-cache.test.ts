import assert from "node:assert/strict";
import test from "node:test";
import {
  createHomeCache,
  isFinFresh,
  isHomeFresh,
  isMonthFresh,
  type FinSummary,
  type HomeSummary,
  type MonthSummary,
} from "../utils/home-cache-core.ts";

function makeStore() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); },
    values,
  };
}

const month: MonthSummary = {
  savedAt: new Date(2026, 8, 27, 10).getTime(),
  month: "2026-09-01",
  categories: [{ category: "GROCERIES", amount: 40 }],
  total: 40,
  recordedIncome: 900,
  budget: 500,
  budgetUnavailable: false,
};
const home: HomeSummary = {
  savedAt: month.savedAt,
  month: month.month,
  username: "Example",
  avatarUrl: null,
  monthlyBudget: 500,
  totalExpense: 40,
  profileMonthlyIncome: 1000,
  latestActivity: null,
};
const fin: FinSummary = {
  savedAt: month.savedAt,
  insights: ["Groceries are your largest category."],
  recordedTransactions: 4,
  historyLimited: false,
};

test("encrypted-store adapter can restore per-user summaries after a new app instance", async () => {
  const store = makeStore();
  const first = createHomeCache(store);
  await first.putMonth("user-a", month);
  await first.putHome("user-a", home);
  await first.putFin("user-a", fin);

  const reopened = createHomeCache(store);
  assert.deepEqual(await reopened.getMonth("user-a", month.month), month);
  assert.deepEqual(await reopened.getHome("user-a"), home);
  assert.deepEqual(await reopened.getFin("user-a"), fin);
  assert.equal(await reopened.getMonth("user-b", month.month), null);
});

test("freshness differs for the active month, older months and Fin", () => {
  const now = new Date(2026, 8, 27, 10, 6).getTime();
  assert.equal(isMonthFresh(month, now), false);
  assert.equal(isHomeFresh(home, now), false);
  assert.equal(isFinFresh(fin, now), true);
  assert.equal(isMonthFresh({ ...month, month: "2026-08-01" }, now), true);
  assert.equal(isHomeFresh(home, new Date(2026, 9, 1, 0, 1).getTime()), false);
});

test("editing a month removes its snapshot and Fin but not another month", async () => {
  const store = makeStore();
  const cache = createHomeCache(store);
  await cache.putMonth("user-a", month);
  await cache.putMonth("user-a", { ...month, month: "2026-08-01" });
  await cache.putHome("user-a", home);
  await cache.putFin("user-a", fin);
  const priorGeneration = cache.generation("user-a");
  await cache.invalidateMonths("user-a", [month.month]);
  assert.ok(cache.generation("user-a") > priorGeneration);
  assert.equal(await cache.getMonth("user-a", month.month), null);
  assert.equal(await cache.getHome("user-a"), null);
  assert.equal(await cache.getFin("user-a"), null);
  assert.ok(await cache.getMonth("user-a", "2026-08-01"));
  await cache.clearUser("user-a");
  assert.equal(await createHomeCache(store).getMonth("user-a", "2026-08-01"), null);
  assert.equal(store.values.size, 0);
});

test("offline account marker is user-specific and removed at sign-out", async () => {
  const store = makeStore();
  const first = createHomeCache(store);
  const userId = "00000000-0000-4000-8000-000000000001";
  await first.putHome(userId, home);
  await first.markOfflineUser(userId);
  const reopened = createHomeCache(store);
  assert.equal(await reopened.getOfflineUserId(), userId);
  await reopened.clearUser(userId);
  assert.equal(await createHomeCache(store).getOfflineUserId(), null);
});

test("keeps a bounded number of persisted months", async () => {
  const store = makeStore();
  const cache = createHomeCache(store);
  for (let index = 0; index < 25; index += 1) {
    const date = new Date(2024, index, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
    await cache.putMonth("user-a", { ...month, month: monthKey });
  }
  const reopened = createHomeCache(store);
  assert.equal(await reopened.getMonth("user-a", "2024-01-01"), null);
  assert.ok(await reopened.getMonth("user-a", "2026-01-01"));
});
