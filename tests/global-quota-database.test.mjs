import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createTestDatabase, OWNER_ID, OTHER_ID } from "./helpers/local-database.mjs";

let db;
before(async () => { db = await createTestDatabase({ through: "20261016161905_global_ai_quota.sql" }); });
after(async () => { await db?.close(); });

async function withRole(role, work) {
  await db.exec(`begin; set local role ${role};`);
  try { return await work(); }
  finally { await db.exec("rollback;"); }
}

async function consume(endpoint, burst = 10, daily = 100) {
  return (await db.query("select * from public.consume_global_api_quota($1, $2, 60, $3, 86400)", [endpoint, burst, daily])).rows[0];
}

test("changing authenticated user IDs cannot reset shared AI capacity", async () => {
  await withRole("service_role", async () => {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [OWNER_ID]);
    assert.equal((await consume("fin-insights", 1)).allowed, true);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [OTHER_ID]);
    const result = await consume("fin-insights", 1);
    assert.equal(result.allowed, false);
    assert.equal(result.limit_scope, "burst");
    assert.ok(result.retry_after > 0 && result.retry_after <= 60);
    assert.deepEqual((await db.query("select request_count from private.global_api_quota_windows where endpoint = 'fin-insights' order by window_seconds")).rows,
      [{ request_count: 1 }, { request_count: 1 }]);
  });
});

test("global burst ceiling denies excess requests without charging the daily counter", async () => {
  await withRole("service_role", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => consume("chat", 2, 20)));
    assert.equal(results.filter((row) => row.allowed).length, 2);
    assert.equal(results.filter((row) => !row.allowed && row.limit_scope === "burst").length, 6);
    assert.deepEqual((await db.query("select request_count from private.global_api_quota_windows where endpoint = 'chat' order by window_seconds")).rows,
      [{ request_count: 2 }, { request_count: 2 }]);
  });
});

test("global daily ceiling stops a deployment even when burst capacity remains", async () => {
  await withRole("service_role", async () => {
    assert.equal((await consume("ocr", 10, 2)).allowed, true);
    assert.equal((await consume("ocr", 10, 2)).allowed, true);
    const result = await consume("ocr", 10, 2);
    assert.deepEqual({ allowed: result.allowed, scope: result.limit_scope, daily: result.daily_remaining },
      { allowed: false, scope: "daily", daily: 0 });
    assert.ok(result.retry_after > 0 && result.retry_after <= 86400);
  });
});

test("anon and authenticated clients cannot consume or edit global quotas", async () => {
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(withRole(role, () => consume("chat")), { code: "42501" });
    await assert.rejects(withRole(role, () => db.query("select * from private.global_api_quota_windows")), { code: "42501" });
  }
});

test("invalid global quota configuration is rejected without a counter write", async () => {
  for (const args of [
    ["chat", null, 60, 100, 86400],
    ["chat", 10, null, 100, 86400],
    ["chat", 10, 60, null, 86400],
    ["chat", 10, 60, 100, null],
    ["chat", 0, 60, 100, 86400],
    ["chat", 10, 86400, 100, 86400],
    ["account-delete", 10, 60, 100, 86400],
  ]) {
    await assert.rejects(withRole("service_role", () => db.query(
      "select * from public.consume_global_api_quota($1, $2, $3, $4, $5)", args,
    )), { code: "22023" });
  }
  assert.equal((await db.query("select count(*)::integer as count from private.global_api_quota_windows")).rows[0].count, 0);
});
