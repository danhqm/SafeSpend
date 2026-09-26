# Tax tracker milestone 1

The tracker records user-confirmed YA2025 personal relief claims. It does not calculate tax payable or file returns.

## Rules and review

- `types/tax.ts` contains the versioned calculation configuration; the database stores matching read-only definitions to validate confirmations.
- YA2026 and other years are draft-only. Never copy YA2025 caps into another year's calculations.
- Each change to a published ruleset needs a new version, official-source review, migration and calculation tests. Old-version claims must be reviewed again.
- Current support covers 28 rules, including personal relief, spouse/alimony, medical sub-limits, lifestyle, education, savings and first-home interest.
- Per-child relief calculations and dependent profiles, deductions, rebates, PCB reconciliation and filing exports remain later milestones. Existing receipts for unsupported categories remain unconfirmed.
- Eligibility is a user declaration backed by official guidance. OCR provides evidence, not approval.

## Claims and evidence

All existing LHDN receipts are imported as needs-review claims with zero eligible amount. New tax scans create drafts through a database trigger, compatible with the existing OCR endpoint.

Users can select eligible receipt items after scanning or choosing a photo, adjust the requested amount, or enter a manual claim with a statement reference. The first milestone links one receipt to one claim; mixed receipts across multiple relief rules and direct PDF uploads are not yet supported. The Tax Relief screen shows only YA2025 and YA2026 and no longer offers a saved-receipt picker.

Only confirmed claims with matching rule versions contribute to the estimate. Sub-limits apply before shared caps. Shared-cap allocation follows rule order and is explained in the breakdown. Amounts are accumulated in sen.

Receipt changes invalidate confirmation and clear selected items. Receipt deletion detaches the claim and sends it back for review. Excluding a claim preserves its receipt and ledger transaction.

Claims and their change history are account-isolated with RLS. Database triggers validate receipt ownership, assessment year, known rule version, fixed amounts and supporting details. Optimistic updates prevent silently overwriting another device's edits.

## Verification

- `npm test`, `npm run typecheck`, `npm run lint`.
- `tests/tax-database.sql` runs receipt/claim integration and two-account isolation checks in a transaction and rolls it back. It requires two existing accounts and an administrative SQL connection.
- Mobile camera, image viewer and keyboard behaviour still require a physical-device check.

## Deployment

Apply the checked-in migration before using the new app screen. The Supabase migration was applied to the connected SafeSpend project during implementation. The existing OCR API supports this workflow; no backend deployment is required for this milestone.
