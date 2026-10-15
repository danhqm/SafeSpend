import assert from "node:assert/strict";
import test from "node:test";
import { createGuideStore, freshGuide, guideComplete, observeGuide, replayGuide } from "../utils/home-guide-core.ts";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

test("tour navigation alone never completes expense or budget tasks", () => {
  const state = { ...freshGuide(), visibility: "active" as const, step: 2 as const, tourFinished: true, summaryViewed: true };
  assert.equal(guideComplete(state), false);
  assert.equal(state.expenseRecorded, false);
  assert.equal(state.budgetSet, false);
});

test("confirmed facts complete milestones and returning users do not get a welcome", () => {
  const state = observeGuide(freshGuide(), { hasActivity: true, hasExpense: true, hasBudget: true });
  assert.equal(state.visibility, "hidden");
  assert.equal(state.expenseRecorded, true);
  assert.equal(state.budgetSet, true);
  assert.equal(guideComplete(state), false);
  assert.equal(guideComplete({ ...state, summaryViewed: true }), true);
});

test("new users receive an optional welcome and missing facts never erase milestones", () => {
  const state = observeGuide(freshGuide(), { hasActivity: false, hasExpense: false, hasBudget: false });
  assert.equal(state.visibility, "new");
  const progressed = observeGuide({ ...state, expenseRecorded: true, budgetSet: true },
    { hasActivity: false, hasExpense: false, hasBudget: false });
  assert.equal(progressed.expenseRecorded, true);
  assert.equal(progressed.budgetSet, true);
});

test("replaying starts at the first explanation without deleting real accomplishments", () => {
  const replayed = replayGuide({ ...freshGuide(), visibility: "hidden", expenseRecorded: true,
    budgetSet: true, summaryViewed: true, tourFinished: true, step: 2 });
  assert.equal(replayed.visibility, "active");
  assert.equal(replayed.step, 0);
  assert.equal(replayed.tourFinished, false);
  assert.equal(guideComplete(replayed), true);
});

test("dismissal and unfinished tour position survive reopening and stay user-specific", async () => {
  const backend = storage();
  const first = createGuideStore(backend);
  await first.update("user-a", (state) => ({ ...state, visibility: "hidden", step: 1 }));
  const reopened = createGuideStore(backend);
  assert.equal((await reopened.read("user-a"))?.visibility, "hidden");
  assert.equal((await reopened.read("user-a"))?.step, 1);
  assert.equal(await reopened.read("user-b"), null);
});

test("concurrent progress updates keep both milestones", async () => {
  const store = createGuideStore(storage());
  await Promise.all([
    store.update("user-a", (state) => ({ ...state, expenseRecorded: true })),
    store.update("user-a", (state) => ({ ...state, summaryViewed: true })),
    store.update("user-a", (state) => ({ ...state, budgetSet: true })),
  ]);
  assert.equal(guideComplete((await store.read("user-a"))!), true);
});

test("corrupt or future progress is ignored and anonymous progress is never stored", async () => {
  const backend = storage();
  const store = createGuideStore(backend);
  backend.values.set("safespend.guide.v1.user-a", '{"version":99,"visibility":"new"}');
  assert.equal(await store.read("user-a"), null);
  backend.values.set("safespend.guide.v1.user-b", '{"version":1,"visibility":"active","step":400}');
  assert.equal(await store.read("user-b"), null);
  await assert.rejects(store.update("", (state) => state), /user/i);
});

test("a failed write does not prevent a later retry", async () => {
  const backend = storage();
  let failing = true;
  const store = createGuideStore({ ...backend, setItem: async (key, value) => {
    if (failing) throw new Error("Storage unavailable");
    await backend.setItem(key, value);
  } });
  await assert.rejects(store.update("user-a", (state) => ({ ...state, summaryViewed: true })));
  failing = false;
  const saved = await store.update("user-a", (state) => ({ ...state, summaryViewed: true }));
  assert.equal(saved.summaryViewed, true);
});

test("a focus read waits for pending actions instead of returning the earlier snapshot", async () => {
  const backend = storage();
  const store = createGuideStore(backend);
  await store.update("user-a", (state) => ({ ...state, visibility: "active" }));
  const dismissing = store.update("user-a", (state) => ({ ...state, visibility: "hidden" }));
  const observed = await store.read("user-a");
  assert.equal(observed?.visibility, "hidden");
  await dismissing;
});

test("history observations preserve a dismissal and acknowledged overview", async () => {
  const store = createGuideStore(storage());
  await store.update("user-a", (state) => ({ ...state, visibility: "hidden", summaryViewed: true }));
  await store.update("user-a", (latest) => observeGuide(latest, { hasActivity: true, hasExpense: true, hasBudget: false }));
  const state = await store.read("user-a");
  assert.equal(state?.visibility, "hidden");
  assert.equal(state?.summaryViewed, true);
  assert.equal(state?.expenseRecorded, true);
});
