import assert from "node:assert/strict";
import test from "node:test";
import { createFeatureGuideStore, freshFeatureGuide, transitionFeatureGuide } from "../utils/feature-guide-core.ts";

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); } };
}

test("a section can be paused and resumed at its next explanation", () => {
  const started = transitionFeatureGuide(freshFeatureGuide(), "start");
  const next = transitionFeatureGuide(started, "next");
  assert.equal(transitionFeatureGuide(next, "start").step, 1);
  assert.equal(next.status, "started");
});

test("replay restarts dismissed and finished guides without changing feature data", () => {
  for (const status of ["dismissed", "finished"] as const) {
    const replay = transitionFeatureGuide({ version: 1, status, step: 2 }, "replay");
    assert.deepEqual(replay, { version: 1, status: "started", step: 0 });
  }
});

test("tour steps are bounded and only Finish records walkthrough completion", () => {
  let state = transitionFeatureGuide(freshFeatureGuide(), "start");
  for (let i = 0; i < 4; i++) state = transitionFeatureGuide(state, "next");
  assert.equal(state.step, 2);
  assert.equal(state.status, "started");
  assert.equal(transitionFeatureGuide(state, "finish").status, "finished");
  for (let i = 0; i < 4; i++) state = transitionFeatureGuide(state, "back");
  assert.equal(state.step, 0);
});

test("dismissal is remembered separately for every user and section", async () => {
  const backend = storage();
  const first = createFeatureGuideStore(backend);
  await first.update("user-a", "learn", "dismiss");
  const reopened = createFeatureGuideStore(backend);
  assert.equal((await reopened.read("user-a", "learn"))?.status, "dismissed");
  assert.equal(await reopened.read("user-a", "fin"), null);
  assert.equal(await reopened.read("user-b", "learn"), null);
});

test("queued steps and immediate focus reads do not lose progress", async () => {
  const store = createFeatureGuideStore(storage());
  await store.update("user-a", "lhdn", "start");
  const actions = [store.update("user-a", "lhdn", "next"), store.update("user-a", "lhdn", "next")];
  assert.equal((await store.read("user-a", "lhdn"))?.step, 2);
  await Promise.all(actions);
});

test("invalid data is ignored and signed-out guides cannot be persisted", async () => {
  const backend = storage();
  backend.values.set("safespend.feature-guide.v1.fin.user-a", '{"version":1,"status":"finished","step":99}');
  const store = createFeatureGuideStore(backend);
  assert.equal(await store.read("user-a", "fin"), null);
  await assert.rejects(store.update("", "learn", "start"), /user/i);
});

test("failed writes retain session progress and later actions can save it", async () => {
  const backend = storage();
  let fail = true;
  const store = createFeatureGuideStore({ ...backend, setItem: async (key, value) => {
    if (fail) throw new Error("Storage unavailable");
    await backend.setItem(key, value);
  } });
  await assert.rejects(store.update("user-a", "fin", "start"));
  await assert.rejects(store.update("user-a", "fin", "next"));
  assert.equal((await store.read("user-a", "fin"))?.step, 1);
  fail = false;
  await store.update("user-a", "fin", "next");
  assert.equal((await createFeatureGuideStore(backend).read("user-a", "fin"))?.step, 2);
});
