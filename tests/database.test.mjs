import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { createTestDatabase, OWNER_ID, OTHER_ID } from "./helpers/local-database.mjs";

let db;
before(async () => { db = await createTestDatabase(); });
after(async () => { await db?.close(); });

test("fresh bootstrap applies actual migrations and creates profiles through the auth trigger", async () => {
  const { rows } = await db.query("select user_id from public.users order by user_id");
  assert.deepEqual(rows.map((row) => row.user_id), [OWNER_ID, OTHER_ID]);
  const curriculum = await db.query("select count(*)::integer as count from public.learning_modules");
  assert.ok(curriculum.rows[0].count > 0);
  const obsolete = await db.query("select to_regclass('public.user_streaks') as relation");
  assert.equal(obsolete.rows[0].relation, null);
});

for (const filename of [
  "tax-database.sql", "tax-filing-database.sql", "tax-estimate-database.sql", "tax-business-database.sql",
]) {
  test(`actual ${filename} assertions pass and roll back their fixtures`, async () => {
    const sql = await readFile(new URL(filename, import.meta.url), "utf8");
    const results = await db.exec(sql);
    assert.ok(results.some((result) => result.rows.some((row) => String(row.result).startsWith("PASS:"))));
    const receipts = await db.query("select count(*)::integer as count from public.receipts");
    assert.equal(receipts.rows[0].count, 0);
  });
}

test("fresh-only baseline refuses an existing app schema without changing it", async () => {
  const sql = await readFile(new URL("../supabase/baseline/legacy-schema.sql", import.meta.url), "utf8");
  await assert.rejects(db.exec(sql), /empty public schema/i);
  await db.exec("rollback");
  const { rows } = await db.query("select count(*)::integer as count from public.users");
  assert.equal(rows[0].count, 2);
});

test("a migration cutoff isolates an earlier schema for regression tests", async () => {
  const earlier = await createTestDatabase({ through: "20260913104105_harden_personal_app.sql" });
  try {
    const tables = await earlier.query("select to_regclass('public.transactions') as ledger");
    assert.equal(tables.rows[0].ledger, null);
    const profiles = await earlier.query("select count(*)::integer as count from public.users");
    assert.equal(profiles.rows[0].count, 2);
  } finally {
    await earlier.close();
  }
});

test("an unknown migration cutoff cannot silently test the latest schema", async () => {
  await assert.rejects(createTestDatabase({ through: "not-a-migration.sql" }), /Unknown migration/);
});
