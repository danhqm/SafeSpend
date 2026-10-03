import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeBusinessRecords } from '../types/tax-business.ts';
import type { TaxBusinessEntry } from '../types/tax-business.ts';

const entry = (type: 'income' | 'expense', amount: number, year: 2025 | 2026 = 2025): TaxBusinessEntry => ({
  id: 'test', user_id: 'test', tax_year: year, entry_type: type,
  title: 'Test entry', amount, occurred_on: `${year}-05-01`,
  evidence_ref: '', notes: '', created_at: '', updated_at: '',
});

test('business record totals stay in sen and separate income from expense', () => {
  assert.deepEqual(summarizeBusinessRecords([
    entry('income', 0.1), entry('income', 0.2), entry('expense', 0.15),
    entry('income', 100, 2026),
  ], 2025), { income: 0.3, expense: 0.15, difference: 0.15, count: 3 });
});

test('invalid imported values are not treated as business totals', () => {
  assert.deepEqual(summarizeBusinessRecords([entry('income', -1), entry('expense', Number.NaN)], 2025),
    { income: 0, expense: 0, difference: 0, count: 0 });
});
