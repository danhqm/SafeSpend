import assert from "node:assert/strict";
import test from "node:test";
import { checkBiometricAccess, createSavedUserIdReader } from "../utils/offline-session-core.ts";

const storageError = new Error("Keychain read failed");
const networkError = { name: "AuthRetryableFetchError", status: 0 };

function readerFor(getSession: Parameters<typeof createSavedUserIdReader>[0]["getSession"], cached = true) {
  return createSavedUserIdReader({
    getSession,
    async getOfflineUserId() { return "saved-user"; },
    async getHome(userId) { return cached && userId === "saved-user" ? { month: "2026-10-01" } : null; },
  });
}

for (const thrown of [false, true]) {
  test(`${thrown ? "thrown" : "returned"} session read error cannot open a loaded screen`, async () => {
    const read = readerFor(async () => {
      if (thrown) throw storageError;
      return { data: { session: null }, error: storageError };
    });
    assert.equal(await checkBiometricAccess({ getSavedUserId: read, isEnabledFor: async () => true }), "unavailable");
    await assert.rejects(read, /Keychain read failed/);
  });
}

test("definitely absent session opens the signed-out screen without using cached identity", async () => {
  const read = readerFor(async () => ({ data: { session: null }, error: null }));
  assert.deepEqual(await read(), { userId: null, offline: false });
  assert.equal(await checkBiometricAccess({ getSavedUserId: read, isEnabledFor: async () => true }), "open");
});

test("network failure with saved home still requires that user's enabled biometric lock", async () => {
  const read = readerFor(async () => ({ data: { session: null }, error: networkError }));
  assert.deepEqual(await read(), { userId: "saved-user", offline: true });
  assert.equal(await checkBiometricAccess({ getSavedUserId: read, isEnabledFor: async (id) => id === "saved-user" }), "locked");
});

test("network failure without a saved home does not become a definite sign-out", async () => {
  const read = readerFor(async () => { throw networkError; }, false);
  assert.equal(await checkBiometricAccess({ getSavedUserId: read, isEnabledFor: async () => false }), "unavailable");
});

test("unreadable biometric preference cannot be bypassed with another biometric prompt", async () => {
  const read = readerFor(async () => ({ data: { session: { user: { id: "user" } } }, error: null }));
  assert.equal(await checkBiometricAccess({ getSavedUserId: read, isEnabledFor: async () => { throw storageError; } }), "unavailable");
});
