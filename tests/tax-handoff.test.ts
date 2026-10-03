import assert from 'node:assert/strict';
import test from 'node:test';
import { filingDeadline, filingDateState, handoffSummary } from '../types/tax-handoff.ts';
import type { HandoffData } from '../types/tax-handoff.ts';
import type { TaxClaim } from '../types/tax.ts';

const base: HandoffData = {
  year: 2025,
  profile: { user_id: 'test', tax_year: 2025, residency_status: 'resident', business_income_status: 'no' },
  annual: { tax_year: 2025, employment_income: 50000, pcb_paid: 100, zakat_paid: null, approved_donations: 0, scope_confirmed: false },
  business: [], claims: [],
};
const claim = (status: string, year = 2025): TaxClaim => ({
  id: 'c1', tax_year: year, rule_id: 'individual', rule_version: '2025.1', receipt_id: null,
  title: 'Individual relief', amount: 9000, eligible_amount: 9000, status,
  beneficiary: 'Self', evidence_note: '', eligibility_confirmed: status === 'confirmed', occurred_on: null,
});

test('only verified YA2025 BE and B dates are available', () => {
  assert.deepEqual(filingDeadline(2025, 'BE'), { statutory: '2026-04-30', eFilingGrace: '2026-05-15' });
  assert.deepEqual(filingDeadline(2025, 'B'), { statutory: '2026-06-30', eFilingGrace: '2026-07-15' });
  assert.equal(filingDeadline(2025, 'M'), null);
  assert.equal(filingDeadline(2026, 'BE'), null);
  assert.equal(filingDateState('2026-05-15', '2026-05-15'), 'today');
  assert.equal(filingDateState('2026-05-15', '2026-10-04'), 'past');
});

test('export distinguishes unknown amounts, confirmed reliefs and review items', () => {
  const summary = handoffSummary({ ...base, claims: [claim('confirmed'), { ...claim('needs_review'), id: 'c2', title: 'Other claim' }] }, '2026-10-04T00:00:00Z');
  assert.match(summary, /Form BE/);
  assert.match(summary, /2026-04-30/);
  assert.match(summary, /Zakat \/ fitrah paid: Not entered/);
  assert.match(summary, /Approved section 44\(6\) donations: RM 0\.00/);
  assert.match(summary, /Confirmed, cap-adjusted reliefs: RM 9,000\.00/);
  assert.match(summary, /Claims needing review: 1/);
  assert.match(summary, /NOT A TAX RETURN/);
});

test('YA2026 and non-resident exports do not expose an eligible relief total', () => {
  const draft = handoffSummary({ ...base, year: 2026,
    profile: { ...base.profile!, tax_year: 2026 }, annual: null, claims: [claim('confirmed', 2026)] }, '2026-10-04T00:00:00Z');
  assert.match(draft, /no verified date/);
  assert.match(draft, /YA2026 relief rules are not reviewed/);
  assert.doesNotMatch(draft, /Confirmed, cap-adjusted reliefs/);
  const nonResident = handoffSummary({ ...base,
    profile: { ...base.profile!, residency_status: 'non_resident' }, claims: [claim('confirmed')] }, '2026-10-04T00:00:00Z');
  assert.match(nonResident, /Form M/);
  assert.match(nonResident, /Personal relief total paused/);
  assert.doesNotMatch(nonResident, /Confirmed, cap-adjusted reliefs/);
  const noProfile = handoffSummary({ ...base, profile: null, claims: [claim('confirmed')] }, '2026-10-04T00:00:00Z');
  assert.match(noProfile, /paused until a resident filing profile is saved/);
  assert.doesNotMatch(noProfile, /Confirmed, cap-adjusted reliefs/);
});

test('working business entries are exported without implying deductible profit', () => {
  const summary = handoffSummary({ ...base, business: [{
    id: 'b1', user_id: 'test', tax_year: 2025, entry_type: 'expense', title: 'Laptop',
    amount: 1200, occurred_on: '2025-08-01', evidence_ref: 'Invoice 42', notes: '', created_at: '', updated_at: '',
  }, {
    id: 'b2', user_id: 'test', tax_year: 2026, entry_type: 'income', title: 'Future work',
    amount: 500, occurred_on: '2026-01-01', evidence_ref: '', notes: '', created_at: '', updated_at: '',
  }] }, '2026-10-04T00:00:00Z');
  assert.match(summary, /Unadjusted difference: RM -1,200\.00/);
  assert.match(summary, /Invoice 42/);
  assert.match(summary, /business entries exist despite a Form BE profile/);
  assert.doesNotMatch(summary, /Future work/);
});
