import assert from "node:assert/strict";
import test from "node:test";
import { createAccountDeletionHandler } from "../lib/account-deletion.js";

const userId = "11111111-1111-4111-8111-111111111111";
const anotherUser = "22222222-2222-4222-8222-222222222222";
function fixture(options = {}) {
  const state = { authExists: true, rowsExist: true, storageFails: false, authFails: false, listFails: false, databaseFails: false,
    events: [], receipts: [{ image_url: `https://example.test/storage/v1/object/public/receipts/${userId}%2Flegacy%20receipt.jpg` }],
    files: { receipts: new Set([`${userId}/legacy receipt.jpg`, `${userId}/orphan.jpg`, `${userId}/nested/old.jpg`, `${anotherUser}/private.jpg`]), avatars: new Set([`${userId}/avatar.jpg`, `${anotherUser}/avatar.jpg`]) }, ...options };
  const db = {
    from(table) {
      assert.equal(table, "receipts");
      let owner;
      const query = {
        select() { return query; }, eq(column, value) { assert.equal(column, "user_id"); owner = value; return query; }, order() { return query; },
        async range(from, through) {
          assert.equal(owner, userId);
          if (state.databaseFails) return { error: new Error("database offline"), data: null };
          return { data: state.receipts.slice(from, Math.min(through + 1, from + (state.receiptPageCap ?? 100))), error: null };
        },
      };
      return query;
    },
    storage: { from(bucket) {
      assert.ok(["receipts", "avatars"].includes(bucket));
      return {
        async list(prefix, { limit, offset, sortBy }) {
          assert.ok(prefix === userId || prefix.startsWith(`${userId}/`));
          assert.deepEqual(sortBy, { column: "name", order: "asc" });
          state.events.push(["list", bucket, prefix, offset]);
          if (state.listFails) return { data: null, error: new Error("list offline") };
          const children = new Map();
          for (const path of state.files[bucket]) {
            if (!path.startsWith(`${prefix}/`)) continue;
            const rest = path.slice(prefix.length + 1);
            const name = rest.split("/")[0];
            children.set(name, rest.includes("/") ? { name, id: null, metadata: null } : { name, id: `id-${name}`, metadata: { size: 12 } });
          }
          return { data: [...children.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(offset, offset + Math.min(limit, state.storagePageCap ?? limit)), error: null };
        },
        async remove(paths) {
          state.events.push(["remove", bucket, ...paths]);
          assert.equal(state.authExists, true);
          assert.equal(state.rowsExist, true);
          for (const path of paths) assert.ok(path.startsWith(`${userId}/`));
          if (state.storageFails) return { error: new Error("storage offline") };
          paths.forEach(path => state.files[bucket].delete(path));
          return { data: [], error: null };
        },
      };
    } },
    auth: { admin: { async deleteUser(id, soft) {
      assert.equal(id, userId);
      assert.equal(soft, false);
      state.events.push(["delete-auth", id]);
      assert.equal([...state.files.receipts, ...state.files.avatars].some(path => path.startsWith(`${userId}/`)), false);
      if (state.authFails) return { data: null, error: new Error("auth offline") };
      state.authExists = false; state.rowsExist = false;
      return { data: { user: { id } }, error: null };
    } } },
  };
  const handler = createAccountDeletionHandler({ db, prepareResponse: () => true,
    requireUser: async (_req, res) => {
      if (options.signedOut) { res.status(401).json({ success: false }); return null; }
      return { id: userId, email: "dummy@example.test" };
    },
    enforceRateLimit: async (res, id, endpoint) => {
      assert.equal(id, userId); assert.equal(endpoint, "account-delete");
      if (options.rateLimited) res.status(429).json({ success: false });
      return !options.rateLimited;
    },
    reauthenticate: async (email, password) => {
      assert.equal(email, "dummy@example.test");
      assert.equal(password, "dummy-password");
      state.events.push(["reauthenticate"]);
      return options.badPassword ? { user: null, error: new Error("invalid password") } : { user: { id: options.reauthId ?? userId }, error: null };
    },
    serverError: (res, _context, error) => {
      assert.doesNotMatch(JSON.stringify(error), /dummy-password/);
      return res.status(500).json({ success: false, error: "Cleanup failed" });
    },
  });
  return { state, async remove(overrides = {}) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} };
    await handler({ method: "DELETE", headers: { "content-type": "application/json" }, body: { password: "dummy-password", confirmation: "DELETE" }, ...overrides }, res);
    return res;
  } };
}

test("deleting an account rechecks its password, removes own receipt/avatar objects including orphans, then deletes auth", async () => {
  const { state, remove } = fixture();
  for (let i = 0; i < 230; i++) state.files.receipts.add(`${userId}/scan-${String(i).padStart(3, "0")}.jpg`);
  const result = await remove();
  assert.equal(result.statusCode, 200);
  assert.equal(state.authExists, false);
  assert.equal(state.rowsExist, false);
  assert.deepEqual([...state.files.receipts], [`${anotherUser}/private.jpg`]);
  assert.deepEqual([...state.files.avatars], [`${anotherUser}/avatar.jpg`]);
  assert.deepEqual(state.events.at(-1), ["delete-auth", userId]);
  assert.equal(state.events.filter(event => event[0] === "list" && event[1] === "receipts" && event[2] === userId).length, 4);
});

test("short server pages do not truncate receipt validation or orphan cleanup", async () => {
  const { state, remove } = fixture({ receiptPageCap: 1, storagePageCap: 1 });
  assert.equal((await remove()).statusCode, 200);
  assert.equal(state.authExists, false);

  const invalid = fixture({ receiptPageCap: 1, receipts: [
    { image_url: `${userId}/own.jpg` }, { image_url: `${anotherUser}/private.jpg` },
  ] });
  assert.equal((await invalid.remove()).statusCode, 500);
  assert.equal(invalid.state.events.some(event => event[0] === "remove"), false);
});

for (const failure of ["storageFails", "listFails", "databaseFails"]) {
  test(`${failure}: keeps account and database records intact so the user can retry`, async () => {
    const { state, remove } = fixture({ [failure]: true });
    assert.equal((await remove()).statusCode, 500);
    assert.equal(state.authExists, true);
    assert.equal(state.rowsExist, true);
    assert.equal(state.events.some(event => event[0] === "delete-auth"), false);
    state[failure] = false;
    assert.equal((await remove()).statusCode, 200);
    assert.equal(state.authExists, false);
  });
}

test("auth deletion failure after storage cleanup can be retried without losing account metadata", async () => {
  const { state, remove } = fixture({ authFails: true });
  assert.equal((await remove()).statusCode, 500);
  assert.equal(state.authExists, true);
  assert.equal(state.rowsExist, true);
  state.authFails = false;
  assert.equal((await remove()).statusCode, 200);
  assert.equal(state.authExists, false);
});

for (const [options, status] of [[{ badPassword: true }, 401], [{ reauthId: anotherUser }, 403], [{ signedOut: true }, 401], [{ rateLimited: true }, 429]]) {
  test(`identity/reauth/usage guard rejects before any storage operation: ${JSON.stringify(options)}`, async () => {
    const { state, remove } = fixture(options);
    assert.equal((await remove()).statusCode, status);
    assert.equal(state.authExists, true);
    assert.equal(state.events.some(event => ["list", "remove", "delete-auth"].includes(event[0])), false);
  });
}

for (const body of [{ password: "dummy-password", confirmation: "delete" }, { password: "", confirmation: "DELETE" }, { password: "dummy-password", confirmation: "DELETE", userId: anotherUser }, { password: "x".repeat(1025), confirmation: "DELETE" }]) {
  test("invalid confirmation, password or client-supplied identity never reaches reauthentication", async () => {
    const { state, remove } = fixture();
    assert.equal((await remove({ body })).statusCode, 400);
    assert.deepEqual(state.events, []);
  });
}

test("oversized requests and unsupported methods are rejected before destructive actions", async () => {
  const { state, remove } = fixture();
  assert.equal((await remove({ headers: { "content-length": "5000", "content-type": "application/json" } })).statusCode, 413);
  assert.equal((await remove({ method: "GET" })).statusCode, 405);
  assert.deepEqual(state.events, []);
});

for (const path of [`${anotherUser}/private.jpg`, `${userId}/../other/file.jpg`, "https://example.test/not-a-receipt.jpg"]) {
  test(`untrusted receipt paths fail closed without deleting account or objects: ${path}`, async () => {
    const { state, remove } = fixture({ receipts: [{ image_url: path }] });
    assert.equal((await remove()).statusCode, 500);
    assert.equal(state.authExists, true);
    assert.equal(state.events.some(event => event[0] === "remove"), false);
  });
}
