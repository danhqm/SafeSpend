# Tax tracker milestones 1–4

The tracker records user-confirmed YA2025 personal relief claims, offers a narrowly scoped employment tax estimate, and keeps manual business-entry notes for Form B preparation. It does not file returns.

## Rules and review

- `types/tax.ts` contains the versioned calculation configuration; the database stores matching read-only definitions to validate confirmations.
- YA2026 and other years are draft-only. Never copy YA2025 caps into another year's calculations.
- Each change to a published ruleset needs a new version, official-source review, migration and calculation tests. Old-version claims must be reviewed again.
- Current support covers 28 rules, including personal relief, spouse/alimony, medical sub-limits, lifestyle, education, savings and first-home interest.
- Per-child relief calculations and filing exports remain later milestones. Existing receipts for unsupported categories remain unconfirmed.
- Eligibility is a user declaration backed by official guidance. OCR provides evidence, not approval.

## Claims and evidence

All existing LHDN receipts are imported as needs-review claims with zero eligible amount. New tax scans create drafts through a database trigger, compatible with the existing OCR endpoint.

Users can select eligible receipt items after scanning or choosing a photo, adjust the requested amount, or enter a manual claim with a statement reference. The first milestone links one receipt to one claim; mixed receipts across multiple relief rules and direct PDF uploads are not yet supported. The Tax Relief screen shows only YA2025 and YA2026 and no longer offers a saved-receipt picker.

Only confirmed claims with matching rule versions contribute to the estimate. Sub-limits apply before shared caps. Shared-cap allocation follows rule order and is explained in the breakdown. Amounts are accumulated in sen.

Receipt changes invalidate confirmation and clear selected items. Receipt deletion detaches the claim and sends it back for review. Excluding a claim preserves its receipt and ledger transaction.

Claims and their change history are account-isolated with RLS. Database triggers validate receipt ownership, assessment year, known rule version, fixed amounts and supporting details. Optimistic updates prevent silently overwriting another device's edits.

## Filing profile and family nicknames

For YA2025 and YA2026, users can self-declare tax residency and whether they had business income. The filing guide points resident non-business users to Form BE, resident business users to Form B, and non-residents to Form M. It does **not** determine tax residency, legal eligibility, or account for special forms; every suggestion links to [HASiL's individual filing guidance](https://www.hasil.gov.my/individu/pengenalan-cukai-pendapatan-individu/). Users who are unsure get no form suggestion. See [HASiL residency guidance](https://www.hasil.gov.my/en/individu/taraf-mastautin/) before selecting a status—day count alone is insufficient.

Optional spouse, child, parent and grandparent entries store only a relationship and a name/nickname, scoped to the assessment year. They do not collect identity numbers or dates of birth, calculate dependent relief, or automatically confirm claims. In the claim editor, a saved nickname can fill the existing beneficiary text; the user must still check the relief's eligibility and evidence. Family nicknames can be edited or removed without changing existing claims.

If a filing profile explicitly says non-resident, the Tax Relief screen pauses the personal-relief estimate and blocks new confirmations in the app; existing claims are retained for review. The database's existing tax-claim validation still relies on the user's explicit residency declaration in each confirmed claim, so this screen safeguard is not an official residency determination.

`tax_filing_profiles` and `tax_household_members` have separate RLS policies for each operation and restrict records to the signed-in user. Ownership and assessment year are immutable after insert. No existing claims, receipts, or transactions are migrated or deleted by milestone 2.

## Annual tax estimate

For YA2025 only, a resident who declares no business income can manually record statutory employment income, PCB actually paid, zakat/fitrah, and donations to approved section 44(6) institutions. Unknown figures remain blank; a true zero must be entered explicitly. No salary, tax paid, or donation amount is inferred from ordinary SafeSpend transactions. YA2026 figures can be saved but cannot produce a tax estimate until that year's rules are reviewed.

The estimate requires a saved filing profile, a confirmed individual relief claim, complete annual figures, and the user's explicit declaration that this employment-only, separate-assessment calculation fits their situation. It applies the [YA2025 resident tax bands](https://www.hasil.gov.my/individu/kadar-cukai/), the [personal and zakat rebates](https://www.hasil.gov.my/individu/rebat/), and the [10% aggregate-income cap for approved-institution donations](https://www.hasil.gov.my/individu/derma-hadiah/). It subtracts confirmed reliefs before calculating tax, then rebates, then PCB. A negative difference is a possible overpayment, **not** an approved refund.

Business, rental or foreign income, joint assessment, child relief, spouse rebate, other donation classes, other deductions and tax credits are outside this calculation. A user with any of these must leave the scope declaration unchecked. Any saved business entry for the year also pauses the Form BE estimate until the entries are reviewed; the business entries are **never** folded into the employment-only calculation. The result remains an estimate even when every field is complete; MyTax and HASiL are authoritative. [HASiL's Form BE downloads](https://www.hasil.gov.my/muat-turun-borang/muat-turun-borang-individu/) provide the filing instructions.

`tax_annual_inputs` stores only these manually entered figures, with owner-scoped RLS, immutable owner/year, non-negative amounts, and a database check that forbids confirmation with missing figures. It does not change existing financial records or tax claims.

## Freelancer and side-hustle records

Users can manually add, edit and remove dated business income and expense entries for YA2025 or YA2026. Each entry has a title, actual amount and optional invoice/receipt reference and notes. The screen shows recorded money in, money out and their **unadjusted** difference. It does not calculate statutory business income, decide expense deductibility, apply stock/capital/private-use adjustments, or produce a Form B tax estimate. Users must retain source documents separately. No ordinary SafeSpend transaction or receipt is imported automatically, preventing an unreviewed personal transaction from being treated as a business deduction.

The filing-profile guide continues to suggest Form B only for a self-declared resident with business income. Saving a business entry never silently changes those answers; instead the screen prompts review if the profile does not match. HASiL describes [Form B as covering resident individuals with business income](https://www.hasil.gov.my/individu/pengenalan-cukai-pendapatan-individu/) and says [business records and supporting documents must be retained](https://www.hasil.gov.my/individu/soalan-lazim-individu/). Its [business profit-and-loss template](https://www.hasil.gov.my/eduzone/kira-dan-kalkulator-cukai/) is linked for users preparing their actual accounts.

`tax_business_entries` has owner-scoped RLS, immutable identity/owner/year, a matching entry date and year, positive amounts, text limits, and an owner/year/date index. It is a working record, not an audit-grade document vault or a filed return. The physical documents and any statutory retention obligation remain the user's responsibility.

## Verification

- `npm test`, `npm run typecheck`, `npm run lint`.
- `tests/tax-estimate.test.ts` covers bracket boundaries, the donation cap, rebates, PCB and estimate gating.
- `tests/tax-database.sql` runs receipt/claim integration and two-account isolation checks in a transaction and rolls it back. It requires two existing accounts and an administrative SQL connection.
- `tests/tax-filing-database.sql` checks filing-profile and household RLS plus immutable assessment year, also rolling back.
- `tests/tax-estimate-database.sql` checks annual-input RLS, immutable year and incomplete-confirmation rejection, also rolling back.
- `tests/tax-business.test.ts` checks cent-safe record summaries and year separation; `tests/tax-business-database.sql` checks business-entry RLS and constraints in a rolled-back two-account test.
- Mobile camera, image viewer and keyboard behaviour still require a physical-device check.

## Deployment

Apply the checked-in migrations before using the app screens. All four tax migrations were applied to the connected SafeSpend Supabase project during implementation. The existing OCR API supports this workflow; no backend deployment is required for this milestone.
