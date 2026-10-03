import type { TaxFilingProfile } from './tax-filing';

export const YA2025_TAX_RATE_SOURCE = 'https://www.hasil.gov.my/individu/kadar-cukai/';
export const YA2025_REBATE_SOURCE = 'https://www.hasil.gov.my/individu/rebat/';
export const YA2025_DONATION_SOURCE = 'https://www.hasil.gov.my/individu/derma-hadiah/';
export const YA2025_FORM_SOURCE = 'https://www.hasil.gov.my/muat-turun-borang/muat-turun-borang-individu/';
export const YA2025_ESTIMATE_VERSION = '2025.1';

export type TaxAnnualInputs = {
  user_id?: string;
  tax_year: 2025 | 2026;
  employment_income: number | null;
  pcb_paid: number | null;
  zakat_paid: number | null;
  approved_donations: number | null;
  scope_confirmed: boolean;
  updated_at?: string;
};

export type ResidentTaxEstimate = {
  employmentIncome: number;
  donationRequested: number;
  donationAllowed: number;
  donationOverLimit: number;
  reliefs: number;
  chargeableIncome: number;
  taxBeforeRebates: number;
  personalRebate: number;
  zakatApplied: number;
  taxAfterRebates: number;
  pcbPaid: number;
  balance: number;
};

const brackets = [
  { upper: 5_000, rate: 0 },
  { upper: 20_000, rate: 1 },
  { upper: 35_000, rate: 3 },
  { upper: 50_000, rate: 6 },
  { upper: 70_000, rate: 11 },
  { upper: 100_000, rate: 19 },
  { upper: 400_000, rate: 25 },
  { upper: 600_000, rate: 26 },
  { upper: 2_000_000, rate: 28 },
  { upper: Infinity, rate: 30 },
] as const;

const toSen = (amount: number) => Math.round(amount * 100);
const fromSen = (amount: number) => amount / 100;
const validMoney = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 0 && value <= 999_999_999;

// Official YA2025 progressive bands. Work in sen so each result remains stable
// across repeated renders and a tax band is never rounded to a whole ringgit.
export function residentTax2025(chargeableIncome: number): number {
  if (!validMoney(chargeableIncome)) throw new Error('Invalid chargeable income');
  const chargeableSen = toSen(chargeableIncome);
  let lowerSen = 0;
  let taxSen = 0;
  for (const bracket of brackets) {
    const upperSen = bracket.upper === Infinity ? Infinity : bracket.upper * 100;
    const portionSen = Math.max(0, Math.min(chargeableSen, upperSen) - lowerSen);
    taxSen += Math.round(portionSen * bracket.rate / 100);
    if (chargeableSen <= upperSen) break;
    lowerSen = upperSen;
  }
  return fromSen(taxSen);
}

export function estimateResidentEmploymentTax(
  inputs: TaxAnnualInputs,
  profile: TaxFilingProfile | null,
  confirmedReliefs: number,
  hasIndividualRelief: boolean,
  hasBusinessRecords: boolean,
): ResidentTaxEstimate | null {
  if (inputs.tax_year !== 2025 || profile?.tax_year !== 2025 ||
    profile.residency_status !== 'resident' || profile.business_income_status !== 'no' ||
    hasBusinessRecords || !inputs.scope_confirmed || !hasIndividualRelief || !validMoney(confirmedReliefs) ||
    !validMoney(inputs.employment_income) || !validMoney(inputs.pcb_paid) ||
    !validMoney(inputs.zakat_paid) || !validMoney(inputs.approved_donations)) return null;

  const incomeSen = toSen(inputs.employment_income);
  const donationRequestedSen = toSen(inputs.approved_donations);
  // This screen covers only approved 44(6) institution donations. Under its
  // employment-only assumption, statutory employment income is aggregate income.
  const donationAllowedSen = Math.min(donationRequestedSen, Math.floor(incomeSen / 10));
  const reliefSen = toSen(confirmedReliefs);
  const chargeableSen = Math.max(0, incomeSen - donationAllowedSen - reliefSen);
  const taxSen = toSen(residentTax2025(fromSen(chargeableSen)));
  const personalRebateSen = chargeableSen <= 3_500_000 ? Math.min(taxSen, 40_000) : 0;
  const zakatAppliedSen = Math.min(taxSen - personalRebateSen, toSen(inputs.zakat_paid));
  const taxAfterRebatesSen = taxSen - personalRebateSen - zakatAppliedSen;
  const pcbSen = toSen(inputs.pcb_paid);

  return {
    employmentIncome: fromSen(incomeSen),
    donationRequested: fromSen(donationRequestedSen),
    donationAllowed: fromSen(donationAllowedSen),
    donationOverLimit: fromSen(donationRequestedSen - donationAllowedSen),
    reliefs: fromSen(reliefSen),
    chargeableIncome: fromSen(chargeableSen),
    taxBeforeRebates: fromSen(taxSen),
    personalRebate: fromSen(personalRebateSen),
    zakatApplied: fromSen(zakatAppliedSen),
    taxAfterRebates: fromSen(taxAfterRebatesSen),
    pcbPaid: fromSen(pcbSen),
    balance: fromSen(taxAfterRebatesSen - pcbSen),
  };
}
