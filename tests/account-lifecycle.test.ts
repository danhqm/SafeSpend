import assert from "node:assert/strict";
import test from "node:test";
import { createDeleteAccountAction, requestPasswordRecovery, removableNotificationIds } from "../utils/account-lifecycle-core.ts";
import { clearOwnedBiometricPreferences } from "../utils/biometrics-core.ts";

function deletionFixture(options: { apiFails?: boolean; malformed?: boolean; failedCleanup?: boolean; changedUser?: boolean } = {}) {
  const state = { user: "user-a", deleted: false, cleaned: [] as string[], signedOut: false, sent: null as RequestInit | null };
  const remove = createDeleteAccountAction({
    getSession: async () => ({ data: { session: { user: { id: state.user } } }, error: null }),
    request: async (path, init) => {
      assert.equal(path, "/api/account"); state.sent = init ?? null;
      if (options.apiFails) return new Response(JSON.stringify({ success: false, error: "Password not verified" }), { status: 401 });
      if (options.malformed) return new Response("{}");
      state.deleted = true;
      if (options.changedUser) state.user = "user-b";
      return new Response(JSON.stringify({ success: true }));
    },
    signOut: async () => { assert.equal(state.deleted, true); state.signedOut = true; },
    cleanups: ["cache", "consent", "biometrics", "notifications", "guides"].map(name => ({ name, run: async (id: string) => {
      assert.equal(id, "user-a"); assert.equal(state.deleted, true); state.cleaned.push(name);
      if (options.failedCleanup && name === "cache") throw new Error("local storage unavailable");
    } })),
  });
  return { state, remove };
}

test("account deletion sends only confirmation/password, then clears every device data category and signs out", async () => {
  const { state, remove } = deletionFixture();
  assert.deepEqual(await remove("user-a", "dummy-password", "DELETE"), { localCleanupErrors: [] });
  assert.equal(state.sent?.method, "DELETE");
  assert.deepEqual(JSON.parse(String(state.sent?.body)), { password: "dummy-password", confirmation: "DELETE" });
  assert.deepEqual(state.cleaned.sort(), ["biometrics", "cache", "consent", "guides", "notifications"]);
  assert.equal(state.signedOut, true);
});

for (const options of [{ apiFails: true }, { malformed: true }]) {
  test("failed or unconfirmed remote deletion retains local data and the signed-in session", async () => {
    const { state, remove } = deletionFixture(options);
    await assert.rejects(remove("user-a", "dummy-password", "DELETE"));
    assert.deepEqual(state.cleaned, []);
    assert.equal(state.signedOut, false);
  });
}

test("local cleanup failures are reported but cannot skip other cleanup tasks after account deletion", async () => {
  const { state, remove } = deletionFixture({ failedCleanup: true });
  assert.deepEqual(await remove("user-a", "dummy-password", "DELETE"), { localCleanupErrors: ["cache"] });
  assert.equal(state.cleaned.length, 5);
  assert.equal(state.signedOut, true);
});

test("deletion never signs out a different account that became active while the server was working", async () => {
  const { state, remove } = deletionFixture({ changedUser: true });
  await remove("user-a", "dummy-password", "DELETE");
  assert.equal(state.signedOut, false);
  assert.equal(state.cleaned.length, 5);
});

test("typed confirmation and current identity are checked before the deletion request", async () => {
  const { state, remove } = deletionFixture();
  await assert.rejects(remove("user-a", "dummy-password", "delete"), /DELETE/);
  await assert.rejects(remove("user-b", "dummy-password", "DELETE"), /session changed/i);
  assert.equal(state.sent, null);
});

test("password recovery normalizes email, uses the configured password page and propagates delivery failures", async () => {
  let args: unknown[] = [];
  await requestPasswordRecovery({ resetPasswordForEmail: async (...value) => { args = value; return { error: null }; } }, " DUMMY@EXAMPLE.TEST ", "https://example.test/set-password");
  assert.deepEqual(args, ["dummy@example.test", { redirectTo: "https://example.test/set-password" }]);
  await assert.rejects(requestPasswordRecovery({ resetPasswordForEmail: async () => ({ error: new Error("Email service unavailable") }) }, "dummy@example.test", "https://example.test/set-password"), /Email service unavailable/);
  await assert.rejects(requestPasswordRecovery({ resetPasswordForEmail: async () => { throw new Error("must not call provider"); } }, "", "https://example.test/set-password"), /email/i);
});

test("biometric cleanup removes only preferences belonging to the deleted account", async () => {
  const values = new Map([["safespend.faceid.user", "user-b"], ["safespend.faceid.offered", "user-a"]]);
  await clearOwnedBiometricPreferences({ getItem: async key => values.get(key) ?? null, removeItem: async key => { values.delete(key); } }, "user-a");
  assert.equal(values.get("safespend.faceid.user"), "user-b");
  assert.equal(values.has("safespend.faceid.offered"), false);
});

test("notification cleanup selects own tax and generic app reminders while preserving other accounts", () => {
  assert.deepEqual(removableNotificationIds([
    { identifier: "own-tax", content: { data: { userId: "user-a", kind: "safespend.tax-check-in" } } },
    { identifier: "other-tax", content: { data: { userId: "user-b", kind: "safespend.tax-check-in" } } },
    { identifier: "smart", content: { data: { kind: "safespend.smart" } } },
    { identifier: "legacy", content: { title: "SafeSpend", data: {} } },
  ], "user-a"), ["own-tax", "smart", "legacy"]);
});
