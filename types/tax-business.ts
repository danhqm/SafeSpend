export type TaxBusinessEntry = {
  id: string;
  user_id: string;
  tax_year: 2025 | 2026;
  entry_type: 'income' | 'expense';
  title: string;
  amount: number;
  occurred_on: string;
  evidence_ref: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export function summarizeBusinessRecords(entries: TaxBusinessEntry[], year: 2025 | 2026) {
  let incomeSen = 0;
  let expenseSen = 0;
  let count = 0;
  for (const entry of entries) {
    if (entry.tax_year !== year) continue;
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999_999_999) continue;
    const sen = Math.round(amount * 100);
    if (entry.entry_type === 'income') incomeSen += sen;
    else if (entry.entry_type === 'expense') expenseSen += sen;
    else continue;
    count++;
  }
  return {
    income: incomeSen / 100,
    expense: expenseSen / 100,
    difference: (incomeSen - expenseSen) / 100,
    count,
  };
}
