// Reviewed YA2025 rules. Never reuse these limits for an unreviewed assessment year.
export type TaxRule = {
  id: string; year: number; version: string; category: string; title: string;
  cap: number; mode: string; condition: string; group: string | null;
  groupCap: number | null; legacy: string | null; source: string;
  reviewed: string; kind: string; documents: string;
};
export const TAX_RULES: TaxRule[] = [
  {
    "id": "individual",
    "year": 2025,
    "version": "2025.1",
    "category": "Personal",
    "title": "Individual and dependent relatives",
    "cap": 9000,
    "mode": "fixed",
    "condition": "I was a Malaysian tax resident for this assessment year.",
    "group": null,
    "groupCap": null,
    "legacy": "asas_individu",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Personal declaration / relevant certification"
  },
  {
    "id": "disabled_self",
    "year": 2025,
    "version": "2025.1",
    "category": "Personal",
    "title": "Disabled individual",
    "cap": 7000,
    "mode": "fixed",
    "condition": "I have the required disability certification.",
    "group": null,
    "groupCap": null,
    "legacy": "med_oku",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Personal declaration / relevant certification"
  },
  {
    "id": "spouse",
    "year": 2025,
    "version": "2025.1",
    "category": "Personal",
    "title": "Spouse relief",
    "cap": 4000,
    "mode": "fixed",
    "condition": "I qualify for spouse relief under the applicable income and assessment conditions.",
    "group": "spouse",
    "groupCap": 4000,
    "legacy": "pasangan_alimoni",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Personal declaration / marriage and income evidence"
  },
  {
    "id": "alimony", "year": 2025, "version": "2025.1", "category": "Personal",
    "title": "Alimony to former wife", "cap": 4000, "mode": "expense",
    "condition": "These are qualifying alimony payments to my former wife, excluding child maintenance.",
    "group": "spouse", "groupCap": 4000, "legacy": null,
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25", "kind": "relief", "documents": "Payment record and supporting agreement"
  },
  {
    "id": "disabled_spouse",
    "year": 2025,
    "version": "2025.1",
    "category": "Personal",
    "title": "Disabled spouse",
    "cap": 6000,
    "mode": "fixed",
    "condition": "My spouse has the required disability certification and I qualify to claim this relief.",
    "group": null,
    "groupCap": null,
    "legacy": "pasangan_oku",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Personal declaration / relevant certification"
  },
  {
    "id": "education",
    "year": 2025,
    "version": "2025.1",
    "category": "Education",
    "title": "Self education fees",
    "cap": 7000,
    "mode": "expense",
    "condition": "The qualification, institution and field of study meet HASiL requirements.",
    "group": "education",
    "groupCap": 7000,
    "legacy": "edu_sendiri",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "skills",
    "year": 2025,
    "version": "2025.1",
    "category": "Education",
    "title": "Recognised skills / self-development courses",
    "cap": 2000,
    "mode": "expense",
    "condition": "This is a qualifying recognised course; I have not also claimed it under lifestyle.",
    "group": "education",
    "groupCap": 7000,
    "legacy": null,
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "parents",
    "year": 2025,
    "version": "2025.1",
    "category": "Medical",
    "title": "Parents / grandparents medical care",
    "cap": 8000,
    "mode": "expense",
    "condition": "The care and beneficiary qualify, with medical certification where required.",
    "group": "parents",
    "groupCap": 8000,
    "legacy": "med_ibubapa",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "parents_check",
    "year": 2025,
    "version": "2025.1",
    "category": "Medical",
    "title": "Parents / grandparents full medical examination",
    "cap": 1000,
    "mode": "expense",
    "condition": "This is a qualifying full medical examination for my parent or grandparent.",
    "group": "parents",
    "groupCap": 8000,
    "legacy": null,
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "equipment",
    "year": 2025,
    "version": "2025.1",
    "category": "Medical",
    "title": "Disability supporting equipment",
    "cap": 6000,
    "mode": "expense",
    "condition": "This is basic supporting equipment for an eligible disabled family member with the required certification.",
    "group": null,
    "groupCap": null,
    "legacy": "med_sokongan",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "medical",
    "year": 2025,
    "version": "2025.1",
    "category": "Medical",
    "title": "Serious illness / fertility treatment",
    "cap": 10000,
    "mode": "expense",
    "condition": "This is qualifying serious-illness or fertility treatment for an eligible beneficiary.",
    "group": "medical",
    "groupCap": 10000,
    "legacy": "med_gabungan",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "vaccination",
    "year": 2025,
    "version": "2025.1",
    "category": "Medical",
    "title": "Vaccinations",
    "cap": 1000,
    "mode": "expense",
    "condition": "These are qualifying vaccinations for myself, spouse or child.",
    "group": "medical",
    "groupCap": 10000,
    "legacy": null,
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "dental",
    "year": 2025,
    "version": "2025.1",
    "category": "Medical",
    "title": "Dental examination / treatment",
    "cap": 1000,
    "mode": "expense",
    "condition": "These are qualifying dental costs for myself, spouse or child.",
    "group": "medical",
    "groupCap": 10000,
    "legacy": null,
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "checkup",
    "year": 2025,
    "version": "2025.1",
    "category": "Medical",
    "title": "Check-ups, mental health and health screening",
    "cap": 1000,
    "mode": "expense",
    "condition": "These costs meet the eligible examination, consultation, testing or screening-equipment requirements.",
    "group": "medical",
    "groupCap": 10000,
    "legacy": null,
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "learning",
    "year": 2025,
    "version": "2025.1",
    "category": "Medical",
    "title": "Child learning-disability intervention",
    "cap": 6000,
    "mode": "expense",
    "condition": "The child is 18 or younger and the assessment / intervention and provider qualify.",
    "group": "medical",
    "groupCap": 10000,
    "legacy": null,
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "lifestyle",
    "year": 2025,
    "version": "2025.1",
    "category": "Lifestyle",
    "title": "Books, devices, internet and courses",
    "cap": 2500,
    "mode": "expense",
    "condition": "These are eligible personal-use purchases; internet is in my name and no item is claimed elsewhere.",
    "group": null,
    "groupCap": null,
    "legacy": "life_asas",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "sports",
    "year": 2025,
    "version": "2025.1",
    "category": "Lifestyle",
    "title": "Sports equipment, facilities and training",
    "cap": 1000,
    "mode": "expense",
    "condition": "The activity, provider and beneficiary meet the sports relief conditions.",
    "group": null,
    "groupCap": null,
    "legacy": "life_sukan",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "breastfeeding",
    "year": 2025,
    "version": "2025.1",
    "category": "Family",
    "title": "Breastfeeding equipment",
    "cap": 1000,
    "mode": "expense",
    "condition": "I am the mother, my child is 2 or younger, the equipment qualifies, and I did not claim this in the previous assessment year.",
    "group": null,
    "groupCap": null,
    "legacy": "life_susu",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "childcare",
    "year": 2025,
    "version": "2025.1",
    "category": "Family",
    "title": "Registered childcare / kindergarten",
    "cap": 3000,
    "mode": "expense",
    "condition": "My child is 6 or younger, the provider is registered, and my spouse is not claiming the same relief.",
    "group": null,
    "groupCap": null,
    "legacy": "edu_tadika",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "sspn",
    "year": 2025,
    "version": "2025.1",
    "category": "Savings",
    "title": "SSPN net savings",
    "cap": 8000,
    "mode": "expense",
    "condition": "I used the qualifying annual net savings from my SSPN statement, applying the withdrawal and parent-claim rules.",
    "group": null,
    "groupCap": null,
    "legacy": "edu_sspn",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "epf",
    "year": 2025,
    "version": "2025.1",
    "category": "Savings",
    "title": "EPF / approved scheme contributions",
    "cap": 4000,
    "mode": "expense",
    "condition": "These contributions qualify for the RM4,000 category and are not included in another claim.",
    "group": "epf_life",
    "groupCap": 7000,
    "legacy": null,
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "life",
    "year": 2025,
    "version": "2025.1",
    "category": "Savings",
    "title": "Life insurance / takaful / additional voluntary EPF",
    "cap": 3000,
    "mode": "expense",
    "condition": "These premiums or additional voluntary contributions qualify for this category and are not counted twice.",
    "group": "epf_life",
    "groupCap": 7000,
    "legacy": null,
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "insurance",
    "year": 2025,
    "version": "2025.1",
    "category": "Savings",
    "title": "Education / medical insurance",
    "cap": 4000,
    "mode": "expense",
    "condition": "I used the eligible premium amount from the insurer's annual tax statement.",
    "group": null,
    "groupCap": null,
    "legacy": "ins_med_edu",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "prs",
    "year": 2025,
    "version": "2025.1",
    "category": "Savings",
    "title": "PRS / deferred annuity",
    "cap": 3000,
    "mode": "expense",
    "condition": "These are qualifying contributions to an approved PRS or deferred annuity.",
    "group": null,
    "groupCap": null,
    "legacy": "ins_prs",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "socso",
    "year": 2025,
    "version": "2025.1",
    "category": "Savings",
    "title": "SOCSO / EIS",
    "cap": 350,
    "mode": "expense",
    "condition": "These are my eligible SOCSO / EIS contributions for the year.",
    "group": null,
    "groupCap": null,
    "legacy": "ins_perkeso",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "ev",
    "year": 2025,
    "version": "2025.1",
    "category": "Other",
    "title": "EV charging / domestic composting equipment",
    "cap": 2500,
    "mode": "expense",
    "condition": "These costs meet the permitted equipment / subscription conditions and are not for business use.",
    "group": null,
    "groupCap": null,
    "legacy": "lain_ev",
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "home_low",
    "year": 2025,
    "version": "2025.1",
    "category": "Other",
    "title": "First-home loan interest: home up to RM500,000",
    "cap": 7000,
    "mode": "expense",
    "condition": "I meet the first-home conditions: qualifying residential property, SPA dated 2025–2027, within the three consecutive claim years, no rental income, and only my eligible share of interest.",
    "group": "home",
    "groupCap": 7000,
    "legacy": null,
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  },
  {
    "id": "home_high",
    "year": 2025,
    "version": "2025.1",
    "category": "Other",
    "title": "First-home loan interest: RM500,001–RM750,000",
    "cap": 5000,
    "mode": "expense",
    "condition": "I meet the first-home conditions: qualifying residential property, SPA dated 2025–2027, within the three consecutive claim years, no rental income, and only my eligible share of interest.",
    "group": "home",
    "groupCap": 7000,
    "legacy": null,
    "source": "https://www.hasil.gov.my/individu/pelepasan-cukai/",
    "reviewed": "2026-09-25",
    "kind": "relief",
    "documents": "Receipt, payment record or annual statement"
  }
];
export const RULE_VERSION = "2025.1";
export type TaxClaim = {
  id: string; user_id?: string; tax_year: number; rule_id: string | null;
  rule_version: string | null; receipt_id: string | null; title: string;
  amount: number; eligible_amount: number; status: string;
  beneficiary: string; evidence_note: string; eligibility_confirmed: boolean;
  occurred_on: string | null; updated_at?: string;
  eligible_items?: number[];
};
export function money(value: number) {
  return "RM " + value.toLocaleString("en-MY", {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
export function parseAmount(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount <= 999999999 ? amount : null;
}
export function validDate(value: string, year: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0,4)) !== year) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export function calculateClaims(claims: TaxClaim[], year: number) {
  const rules = TAX_RULES.filter(r => r.year === year);
  const totals = rules.map(rule => {
    const confirmed = claims.filter(c => c.tax_year === year && c.rule_id === rule.id &&
      c.rule_version === rule.version && c.status === "confirmed" && c.eligibility_confirmed);
    const requested = confirmed.reduce((sum,c) => sum + Math.round(Number(c.eligible_amount)*100), 0);
    const allowed = Math.min(requested, Math.round(rule.cap*100));
    return {rule, requested, allowed, excluded: requested-allowed};
  });
  // Apply sub-limits first, then each shared annual cap. Stable rule order makes allocation reproducible.
  const remaining: Record<string,number> = {};
  for (const row of totals) {
    if (row.rule.group && row.rule.groupCap !== null) {
      const key = row.rule.group;
      remaining[key] ??= row.rule.groupCap*100;
      const allowed = Math.min(row.allowed, remaining[key]);
      row.excluded += row.allowed-allowed;
      row.allowed = allowed;
      remaining[key] -= allowed;
    }
  }
  return {available: rules.length > 0, total: totals.reduce((s,r)=>s+r.allowed,0)/100,
    rows: totals.map(r=>({...r,requested:r.requested/100,allowed:r.allowed/100,excluded:r.excluded/100,
      remaining:Math.min(Math.max(0,r.rule.cap*100-r.requested),r.rule.group ? remaining[r.rule.group] : Infinity)/100}))};
}
