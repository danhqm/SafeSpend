export type ResidencyStatus = 'resident' | 'non_resident' | 'unsure';
export type BusinessIncomeStatus = 'yes' | 'no' | 'unsure';
export type HouseholdRelationship = 'spouse' | 'child' | 'parent' | 'grandparent';

export type TaxFilingProfile = {
  user_id: string;
  tax_year: 2025 | 2026;
  residency_status: ResidencyStatus;
  business_income_status: BusinessIncomeStatus;
  updated_at?: string;
};

export type TaxHouseholdMember = {
  id: string;
  user_id: string;
  tax_year: 2025 | 2026;
  relationship: HouseholdRelationship;
  display_name: string;
};

export type FilingForm = 'BE' | 'B' | 'M' | null;

// A form guide, not a legal residency or filing determination. Special taxpayer
// categories can use other forms and must be checked against current HASiL advice.
export function suggestedFilingForm(
  residency: ResidencyStatus,
  businessIncome: BusinessIncomeStatus,
): FilingForm {
  if (residency === 'non_resident') return 'M';
  if (residency !== 'resident') return null;
  if (businessIncome === 'yes') return 'B';
  if (businessIncome === 'no') return 'BE';
  return null;
}

export const relationshipLabel: Record<HouseholdRelationship, string> = {
  spouse: 'Spouse', child: 'Child', parent: 'Parent', grandparent: 'Grandparent',
};
