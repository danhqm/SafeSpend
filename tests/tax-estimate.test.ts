import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateResidentEmploymentTax, residentTax2025 } from '../types/tax-estimate.ts';
import type { TaxAnnualInputs } from '../types/tax-estimate.ts';
import type { TaxFilingProfile } from '../types/tax-filing.ts';

const profile: TaxFilingProfile = {
  user_id: 'test', tax_year: 2025, residency_status: 'resident', business_income_status: 'no',
};
const inputs: TaxAnnualInputs = {
  tax_year: 2025, employment_income: 100_000, pcb_paid: 5_000,
  zakat_paid: 1_000, approved_donations: 20_000, scope_confirmed: true,
};

test('YA2025 progressive bands match HASiL boundary totals', () => {
  const boundaries = [
    [0, 0], [5_000, 0], [20_000, 150], [35_000, 600],
    [50_000, 1_500], [70_000, 3_700], [100_000, 9_400],
    [400_000, 84_400], [600_000, 136_400], [2_000_000, 528_400],
    [2_100_000, 558_400],
  ];
  for (const [income, expected] of boundaries) assert.equal(residentTax2025(income), expected);
});

test('approved donations are capped before reliefs, zakat offsets tax, PCB determines balance', () => {
  assert.deepEqual(estimateResidentEmploymentTax(inputs, profile, 9_000, true), {
    employmentIncome: 100_000, donationRequested: 20_000, donationAllowed: 10_000,
    donationOverLimit: 10_000, reliefs: 9_000, chargeableIncome: 81_000,
    taxBeforeRebates: 5_790, personalRebate: 0, zakatApplied: 1_000,
    taxAfterRebates: 4_790, pcbPaid: 5_000, balance: -210,
  });
});

test('RM400 rebate applies at RM35,000 but not above it', () => {
  const atLimit = estimateResidentEmploymentTax({ ...inputs, employment_income: 44_000,
    approved_donations: 0, zakat_paid: 0, pcb_paid: 0 }, profile, 9_000, true);
  assert.equal(atLimit?.chargeableIncome, 35_000);
  assert.equal(atLimit?.personalRebate, 400);
  assert.equal(atLimit?.taxAfterRebates, 200);
  const aboveLimit = estimateResidentEmploymentTax({ ...inputs, employment_income: 44_000.01,
    approved_donations: 0, zakat_paid: 0, pcb_paid: 0 }, profile, 9_000, true);
  assert.equal(aboveLimit?.personalRebate, 0);
});

test('rebates never create a negative tax and reliefs cannot push income below zero', () => {
  const estimate = estimateResidentEmploymentTax({ ...inputs, employment_income: 9_000,
    approved_donations: 0, zakat_paid: 10_000, pcb_paid: 100 }, profile, 9_000, true);
  assert.equal(estimate?.chargeableIncome, 0);
  assert.equal(estimate?.taxAfterRebates, 0);
  assert.equal(estimate?.balance, -100);
});

test('no estimate for missing scope, incomplete figures, business, non-resident or YA2026', () => {
  assert.equal(estimateResidentEmploymentTax(inputs, profile, 9_000, false), null);
  assert.equal(estimateResidentEmploymentTax({ ...inputs, scope_confirmed: false }, profile, 9_000, true), null);
  assert.equal(estimateResidentEmploymentTax({ ...inputs, pcb_paid: null }, profile, 9_000, true), null);
  assert.equal(estimateResidentEmploymentTax(inputs, { ...profile, business_income_status: 'yes' }, 9_000, true), null);
  assert.equal(estimateResidentEmploymentTax(inputs, { ...profile, residency_status: 'non_resident' }, 9_000, true), null);
  assert.equal(estimateResidentEmploymentTax({ ...inputs, tax_year: 2026 }, profile, 9_000, true), null);
});
