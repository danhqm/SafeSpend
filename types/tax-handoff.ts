import { summarizeBusinessRecords, type TaxBusinessEntry } from './tax-business.ts';
import type { TaxAnnualInputs } from './tax-estimate.ts';
import { suggestedFilingForm, type FilingForm, type TaxFilingProfile } from './tax-filing.ts';
import { calculateClaims, money, type TaxClaim } from './tax.ts';

export const FILING_PROGRAMME_2026 = 'https://www.hasil.gov.my/wp-content/uploads/program-memfail-bn-bagi-tahun-2026.pdf';
export const HASIL_MYTAX = 'https://mytax.hasil.gov.my/';
export const HASIL_RECORDS = 'https://www.hasil.gov.my/individu/soalan-lazim-individu/';

type Year = 2025 | 2026;
type DatePair = { statutory: string; eFilingGrace: string };
// Only dates verified against HASiL's 2026 programme for YA2025. Do not infer
// the following filing season's dates from this table.
const verifiedDeadlines: Partial<Record<Year, Partial<Record<Exclude<FilingForm, null>, DatePair>>>> = {
  2025: {
    BE: { statutory: '2026-04-30', eFilingGrace: '2026-05-15' },
    B: { statutory: '2026-06-30', eFilingGrace: '2026-07-15' },
  },
};

export function filingDeadline(year: Year, form: FilingForm): DatePair | null {
  return form ? verifiedDeadlines[year]?.[form] ?? null : null;
}

export function filingDateState(date: string, today: string): 'past' | 'today' | 'future' {
  return date < today ? 'past' : date === today ? 'today' : 'future';
}

export type HandoffData = {
  year: Year;
  profile: TaxFilingProfile | null;
  annual: TaxAnnualInputs | null;
  claims: TaxClaim[];
  business: TaxBusinessEntry[];
};

export function handoffSummary(data: HandoffData, generatedAt: string): string {
  const { year, profile, annual, claims, business } = data;
  const form = profile ? suggestedFilingForm(profile.residency_status, profile.business_income_status) : null;
  const deadline = filingDeadline(year, form);
  const calculated = calculateClaims(claims, year);
  const mayShowReliefs = year === 2025 && profile?.residency_status === 'resident';
  const pending = claims.filter(c => c.tax_year === year && c.status === 'needs_review');
  const businessTotals = summarizeBusinessRecords(business, year);
  const fmt = (amount: number | null | undefined) => amount == null ? 'Not entered' : money(amount);
  const lines = [
    `SafeSpend filing preparation | YA ${year}`,
    `Generated: ${generatedAt}`,
    'PERSONAL WORKING NOTES — NOT A TAX RETURN OR HASiL APPROVAL',
    '',
    `Suggested form to verify: ${form ? `Form ${form}` : 'Not determined'}`,
    `Tax residency declared: ${profile?.residency_status ?? 'Not entered'}`,
    `Business income declared: ${profile?.business_income_status ?? 'Not entered'}`,
    deadline ? `HASiL 2026 programme: statutory ${deadline.statutory}; e-Filing grace through ${deadline.eFilingGrace}` :
      'Filing deadline: no verified date for this year/form in SafeSpend. Check the current HASiL programme.',
    `Official programme: ${FILING_PROGRAMME_2026}`,
    '',
    '1. ANNUAL FIGURES ENTERED BY YOU',
    `Employment income: ${fmt(annual?.employment_income)}`,
    `Approved section 44(6) donations: ${fmt(annual?.approved_donations)}`,
    `Zakat / fitrah paid: ${fmt(annual?.zakat_paid)}`,
    `PCB paid: ${fmt(annual?.pcb_paid)}`,
    'These figures are not inferred from ordinary SafeSpend transactions.',
    '',
    '2. BUSINESS WORKING RECORDS',
    `Income entries: ${money(businessTotals.income)}`,
    `Expense entries: ${money(businessTotals.expense)}`,
    `Unadjusted difference: ${money(businessTotals.difference)}`,
    'Not statutory business profit; expense deductibility and adjustments need separate review.',
  ];
  if (businessTotals.count) {
    lines.push('Entry detail (retain invoices and receipts separately):');
    business.filter(entry => entry.tax_year === year)
      .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.id.localeCompare(b.id))
      .forEach(entry => lines.push(`- ${entry.occurred_on} | ${entry.entry_type} | ${entry.title} | ${money(Number(entry.amount))}${entry.evidence_ref ? ` | Ref: ${entry.evidence_ref}` : ''}`));
  }
  lines.push('', '3. PERSONAL RELIEF REVIEW');
  if (mayShowReliefs && calculated.available) {
    lines.push(`Confirmed, cap-adjusted reliefs: ${money(calculated.total)}`);
    let previousCategory = '';
    for (const row of calculated.rows) {
      if (row.allowed <= 0) continue;
      if (row.rule.category !== previousCategory) {
        lines.push(`${row.rule.category}:`);
        previousCategory = row.rule.category;
      }
      lines.push(`- ${row.rule.title}: ${money(row.allowed)} allowed from ${money(row.requested)} confirmed`);
    }
  } else {
    lines.push(year === 2026 ? 'YA2026 relief rules are not reviewed; no eligible total is calculated.' :
      profile?.residency_status === 'non_resident' ? 'Personal relief total paused for a declared non-resident. Check eligibility with HASiL.' :
        'Personal relief total paused until a resident filing profile is saved for this year.');
  }
  lines.push(`Claims needing review: ${pending.length}`);
  if (pending.length) lines.push(...pending.map(c => `- ${c.title} (${c.occurred_on ?? 'date not entered'})`));
  lines.push('', '4. BEFORE FILING',
    ...(form === 'BE' && businessTotals.count > 0 ? ['Warning: business entries exist despite a Form BE profile. Recheck the appropriate form with HASiL.'] : []),
    'Reconcile every figure, claim and supporting document with the current MyTax form.',
    'Other income, deductions, rebates and special taxpayer circumstances may not be captured here.',
    'Keep your original supporting documents; this text export does not include receipt images.',
    `MyTax: ${HASIL_MYTAX}`,
    `Record guidance: ${HASIL_RECORDS}`);
  return lines.join('\n');
}
