import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createTestDatabase, OWNER_ID, OTHER_ID } from './helpers/local-database.mjs';

let db;
before(async () => { db = await createTestDatabase(); });
after(async () => { await db?.close(); });
const facts = { merchant_name: 'Fixture grocery', total_amount: 100, receipt_date: '2025-06-01',
  category: 'GROCERIES', currency: 'MYR', items: [{ name: 'Rice', price: 100 }] };
async function ingest(user, hash, values = facts, tax = false, allow = false) {
  await db.exec('set role service_role');
  try {
    return (await db.query('select public.ingest_scanned_receipt($1,$2::jsonb,$3,$4,$5,$6) as result',
      [user, JSON.stringify(values), hash.repeat(64), `${user}/${hash}.jpg`, tax, allow])).rows[0].result;
  } finally { await db.exec('reset role'); }
}

test('tax evidence starts as a spending draft even on legacy direct inserts', async () => {
  const { rows } = await db.query(`insert into public.receipts(user_id,merchant_name,total_amount,receipt_date,items,category,lhdn_category)
    values($1,'Draft test',75,'2025-06-01','[]','OTHER','Tax review') returning id`, [OWNER_ID]);
  const result = await db.query('select status from public.transactions where receipt_id=$1', [rows[0].id]);
  assert.equal(result.rows[0].status, 'draft');
});

test('identical scans reused for tax evidence create only one expense', async () => {
  const initial = await ingest(OWNER_ID, 'a');
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${OWNER_ID}',false)`);
  await db.query(`select public.confirm_receipt_transaction($1,'Fixture grocery',100,'2025-06-01','GROCERIES',null,null,'[]')`, [initial.transaction.id]);
  await db.exec('reset role');
  const reused = await ingest(OWNER_ID, 'a', facts, true);
  assert.equal(reused.receipt.id, initial.receipt.id);
  assert.equal(reused.reused, true);
  assert.equal(reused.transaction.status, 'posted');
  const totals = await db.query(`select count(*)::int n,sum(amount)::int amount from public.transactions where receipt_id=$1`, [initial.receipt.id]);
  assert.deepEqual(totals.rows[0], { n: 1, amount: 100 });
  const claim = await db.query('select status,eligible_amount from public.tax_claims where receipt_id=$1', [initial.receipt.id]);
  assert.equal(claim.rows[0].status, 'needs_review');
  assert.equal(Number(claim.rows[0].eligible_amount), 0);
});

test('similar receipt requires explicit review rather than silent merge or duplication', async () => {
  const possible = await ingest(OWNER_ID, 'b');
  assert.equal(possible.outcome, 'possible_duplicate');
  const allowed = await ingest(OWNER_ID, 'b', facts, false, true);
  assert.equal(allowed.outcome, 'saved');
  assert.equal(allowed.transaction.status, 'draft');
});

test('same image belongs independently to each user and never exposes another account', async () => {
  const first = await ingest(OTHER_ID, 'a');
  assert.equal(first.receipt.user_id, OTHER_ID);
  const other = await ingest(OWNER_ID, 'a');
  assert.notEqual(first.receipt.id, other.receipt.id);
});

test('saved evidence can be attached once without changing or posting its ledger', async () => {
  const saved = await ingest(OWNER_ID, 'c', { ...facts, total_amount: 30 });
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${OWNER_ID}',false)`);
  try {
    const first = await db.query('select (public.attach_receipt_tax_claim($1)).id', [saved.receipt.id]);
    const second = await db.query('select (public.attach_receipt_tax_claim($1)).id', [saved.receipt.id]);
    assert.equal(first.rows[0].id, second.rows[0].id);
  } finally { await db.exec('reset role'); }
  assert.equal((await db.query('select status from public.transactions where id=$1', [saved.transaction.id])).rows[0].status, 'draft');
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${OTHER_ID}',false)`);
  try { await assert.rejects(db.query('select public.attach_receipt_tax_claim($1)', [saved.receipt.id])); }
  finally { await db.exec('reset role'); }
});

test('client roles cannot bypass backend ingestion validation', async () => {
  await db.exec('set role authenticated');
  try { await assert.rejects(db.query('select public.ingest_scanned_receipt($1,$2::jsonb,$3,$4,false,false)',
    [OWNER_ID, JSON.stringify(facts), 'd'.repeat(64), `${OWNER_ID}/d.jpg`])); }
  finally { await db.exec('reset role'); }
  await assert.rejects(ingest(OWNER_ID, 'e', { ...facts, currency: 'USD' }));
});

test('Demo Mart reuse and exclusion do not block a separate YA2025 book claim', async () => {
  await db.exec('begin');
  try {
    const grocery = await ingest(OWNER_ID, 'f', { ...facts, merchant_name: 'SafeSpend Demo Mart',
      total_amount: 45.9, receipt_date: '2026-10-17', items: [{ name: 'Groceries', price: 45.9 }] });
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${OWNER_ID}',false)`);
    await db.query(`select public.confirm_receipt_transaction($1,'SafeSpend Demo Mart',45.9,'2026-10-17','GROCERIES',null,null,'[]')`, [grocery.transaction.id]);
    const attached = (await db.query('select to_jsonb(claim) as claim from public.attach_receipt_tax_claim($1) as claim', [grocery.receipt.id])).rows[0].claim;
    assert.equal(attached.tax_year, 2026);
    assert.equal(attached.occurred_on, '2026-10-17');
    await db.query(`update public.tax_claims set beneficiary='Self',status='needs_review' where id=$1`, [attached.id]);
    await db.query(`update public.tax_claims set status='rejected',eligibility_confirmed=false where id=$1`, [attached.id]);
    await db.exec('reset role');

    const books = await ingest(OWNER_ID, '1', { ...facts, merchant_name: 'Demo Book Corner', total_amount: 114.8,
      receipt_date: '2025-10-17', category: 'EDUCATION', items: [
        { name: 'Personal Finance Basics', price: 45 }, { name: 'Everyday Budgeting', price: 39.9 },
        { name: 'Home Cooking Guide', price: 29.9 },
      ] }, true);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${OWNER_ID}',false)`);
    const confirmed = await db.query(`update public.tax_claims set rule_id='lifestyle',rule_version='2025.1',
      beneficiary='Self',eligible_amount=114.8,eligible_items='[0,1,2]',status='confirmed',eligibility_confirmed=true
      where receipt_id=$1 returning status,tax_year,occurred_on::text as occurred_on`, [books.receipt.id]);
    assert.deepEqual(confirmed.rows[0], { status: 'confirmed', tax_year: 2025, occurred_on: '2025-10-17' });
    const original = await db.query('select status,amount from public.transactions where receipt_id=$1', [grocery.receipt.id]);
    assert.equal(original.rows.length, 1);
    assert.equal(original.rows[0].status, 'posted');
    assert.equal(Number(original.rows[0].amount), 45.9);
    assert.equal((await db.query('select status from public.transactions where receipt_id=$1', [books.receipt.id])).rows[0].status, 'draft');
  } finally { await db.exec('reset role; rollback'); }
});

test('auth deletion cascades receipt, ledger and tax history without touching another user', async () => {
  await db.exec('begin');
  try {
    const tables = ['users', 'receipts', 'transactions', 'tax_claims', 'tax_claim_history'];
    const otherBefore = [];
    for (const table of tables) otherBefore.push((await db.query(
      `select count(*)::int n from public.${table} where user_id=$1`, [OTHER_ID])).rows[0].n);
    assert.ok((await db.query('select count(*)::int n from public.tax_claim_history where user_id=$1', [OWNER_ID])).rows[0].n > 0);
    await db.query('delete from auth.users where id=$1', [OWNER_ID]);
    for (let index = 0; index < tables.length; index++) {
      const table = tables[index];
      assert.equal((await db.query(`select count(*)::int n from public.${table} where user_id=$1`, [OWNER_ID])).rows[0].n, 0, table);
      assert.equal((await db.query(`select count(*)::int n from public.${table} where user_id=$1`, [OTHER_ID])).rows[0].n, otherBefore[index], table);
    }
  } finally { await db.exec('rollback'); }
});
