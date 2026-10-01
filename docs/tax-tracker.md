# Tax tracker milestones 1–2

The tracker records user-confirmed YA2025 personal relief claims. It does not calculate tax payable or file returns.

## Rules and review

- `types/tax.ts` contains the versioned calculation configuration; the database stores matching read-only definitions to validate confirmations.
- YA2026 and other years are draft-only. Never copy YA2025 caps into another year's calculations.
- Each change to a published ruleset needs a new version, official-source review, migration and calculation tests. Old-version claims must be reviewed again.
- Current support covers 28 rules, including personal relief, spouse/alimony, medical sub-limits, lifestyle, education, savings and first-home interest.
- Per-child relief calculations, deductions, rebates, PCB reconciliation and filing exports remain later milestones. Existing receipts for unsupported categories remain unconfirmed.
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

## Verification

- `npm test`, `npm run typecheck`, `npm run lint`.
- `tests/tax-database.sql` runs receipt/claim integration and two-account isolation checks in a transaction and rolls it back. It requires two existing accounts and an administrative SQL connection.
- `tests/tax-filing-database.sql` checks filing-profile and household RLS plus immutable assessment year, also rolling back.
- Mobile camera, image viewer and keyboard behaviour still require a physical-device check.

## Deployment

Apply the checked-in migrations before using the app screens. Both tax migrations were applied to the connected SafeSpend Supabase project during implementation. The existing OCR API supports this workflow; no backend deployment is required for this milestone.
