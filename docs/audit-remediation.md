# Audit remediation

Scope: the 16 October competition assessment, approved for implementation on 17 October 2026. Preserve the existing app identity and supported tax scope. Fix code defects; do not manufacture market, accuracy, or impact evidence.

## Implementation and verification

- [x] Receipt integrity (F1, F7): all new scans remain spending drafts; exact image reuse and atomic deduplication; attach saved evidence to Tax Relief without a second purchase; reject unsupported/uncertain OCR output and bound generation.
- [x] Reconciliation (F2, F5): one net-refund definition; complete paginated financial queries, including tax summaries/exports; ignore stale arithmetic cache entries while retaining deliberate offline identity.
- [x] Access (F3): unreadable sessions remain covered by the biometric gate; preserve deliberate offline access for a matching saved account.
- [x] Deletion (F4): failed image removal retains a retryable receipt; never report completed cleanup prematurely.
- [x] Learning (F6): new practice completion is server-validated and module-specific; a generic weekly goal cannot qualify. Budget selection is explicit, savings/debt plans are structured, and confirmed evidence survives draft edits. See `learning.md` for required migration/backend release and verification limits.
- [x] Fin (F8 enforcement gap): a finance answer requires a successful authenticated lookup in the current request, independent of question language. This is not proof of answer accuracy.
- [x] Privacy and recovery: public data-processing notice, per-account/device optional AI controls, password-verified account removal, and password-reset initiation.
- [x] Operations: client response deadlines, bounded model calls without automatic retries, per-user plus global paid-AI quotas, reproducible SQL bootstrap/tests, failure-path regressions and a GitHub checks workflow.

For each code defect, reproduce with a failing regression first, implement the narrow correction, then run the relevant and complete suites. Use dummy users/data for database integration. Do not alter existing financial history or remove suspected duplicates automatically. Prepare deployment changes and record their validation status; production deployment is a separate final step.

## Local verification, 17 October 2026

| Check | Result |
| --- | --- |
| App logic, `npm test` | 126 passed |
| Actual migration/SQL integration, `npm run test:database` | 21 passed |
| Backend, `npm test` in `chatbot-backend` | 87 passed |
| TypeScript, Expo lint, backend syntax, `git diff --check` | Passed |
| `npx expo export --platform web --output-dir dist` | Passed, 28 static routes including `/privacy` |
| Browser, signed out | Privacy notice renders; back navigation reaches Login; Forgot password control appears; signup notice link opens Privacy before account creation |
| GitHub workflow | YAML parsed locally; its test/build commands passed locally. No hosted Actions run yet |

Failure regressions include cross-feature receipt reuse, posted receipt retry, duplicate review, foreign/unknown currency, committed OCR data after a lost RPC response, cleanup-read failure, refund reconciliation, low server page caps, session/preference read failure, unsaved learning actions, multilingual lookup enforcement, storage deletion failures, consent/session races, stalled response bodies and quota exhaustion. SQL tests exercise the actual checked-in functions, constraints, RLS and triggers, including owner deletion cascades and preservation of another user's receipt/ledger/tax records.

The SQL runner uses isolated PGlite PostgreSQL with dummy Supabase Auth/Storage boundary schemas. It does not emulate their HTTP services, validate real JWTs or establish concurrent multi-connection behavior. Native authenticated flows, actual extraction quality and hosted configuration are still unverified.

## Deployment order

1. Back up the existing database and both uploaded-file buckets. Record the currently deployed app/backend versions and migration history. Do not reset the hosted project or apply the fresh-only baseline there.
2. Restore representative non-sensitive test data into a separate Supabase project. Apply only pending migrations, including `20261016161330_receipt_integrity.sql` followed by `20261016161905_global_ai_quota.sql`.
3. Deploy the updated backend against that test project. Configure the existing server secrets and `SUPABASE_PUBLISHABLE_KEY` for isolated password reauthentication. Review the per-user and `GLOBAL_*` request quotas in `chatbot-backend/.env.example`; configure provider billing controls separately. Leave `OWNER_USER_ID` unset for shared access, or set the intended owner UUID for a personal installation.
4. Build the updated app against the test backend. Allow the existing confirmation and password-recovery redirects in Supabase Auth; check the hosted `/set-password` email journey. AI starts off per account/device and manual entry remains available. Test two dummy identities and unsupported/slow/offline conditions.
5. Check a new receipt is a draft from both Scan and Tax Relief; confirm it once; attach/rescan it and verify one posted expense. Review a similar-but-different purchase explicitly. Verify existing private images and old posted history still open correctly.
6. On a supported native device, test Face ID after backgrounding and controlled session errors, camera/library extraction, the saved-receipt picker, the keyboard, notifications, native export/share cleanup and text scaling. Verify password recovery without disclosing credentials. Delete only a disposable test account after explicitly confirming that action, then check owned storage objects and database rows are gone while another account is intact.
7. After those checks and deployment authorization, apply the pending production migrations first, deploy the backend second, and release the updated app last. Smoke-test the same flows. The global quota function is required by the new backend; deploying it out of order makes AI fail closed. The new app's saved-receipt action needs the receipt-integrity function.

The database migrations and backend were subsequently deployed with explicit user authorization on 17 October 2026. See the [production deployment record](deployment-2026-10-17.md) for targets, verification and limitations. No commit, GitHub push or mobile binary release was made.

## Receipt scanning follow-up

The user reproduced a date error by selecting YA2025 for the Demo Mart sample dated 2026-10-17. The original validator conflated year mismatch and malformed date, even when a fixed-relief selection hid the payment-date field. Tax Relief now explains the mismatch, keeps linked evidence dates visible, offers the matching supported year, and trims surrounding whitespace before saving. It does not rewrite a purchase date or enable YA2026 confirmations.

The Book Corner failure happened during scanning, before claim editing. The app previously passed arbitrary API error objects into `new Error`, which can display `[object Object]`. Both scan screens now use the same response/error parser, including structured errors and non-JSON/413 responses. The exact upstream failure of that historical request was not recovered from available runtime logs.

Read-only Vercel metadata and the app's configured public API URL initially confirmed an older production backend at commit `f7a36d6`. Before uploading image bytes, the updated app now performs authenticated `GET /api/ocr` and requires `receiptProtocol: 2`. This endpoint performs no OCR, upload, write or quota consumption. An older/mismatched backend produces an actionable update message and receives no receipt image. The matching migrations and backend were deployed on 17 October 2026; reload the updated app before testing.

The local SQL regression follows the reported sequence: post Demo Mart spending, attach its YA2026 evidence, save/exclude its claim, ingest Book Corner separately for YA2025 and confirm its lifestyle claim. Demo Mart retains one posted expense and Book Corner's spending remains a draft. These are disposable synthetic fixtures, not real tax evidence.

## Boundaries and remaining technical work

- Existing posted entries and suspected historical duplicates are preserved. Exact hashes are populated for new uploads, not retroactively inferred from old files. Different encodings/photos of one purchase can evade hash reuse; merchant/date/amount matching prompts review and is not a guaranteed purchase identity.
- A receipt deletion removes its image before its database row. If the database step then fails, metadata can remain without an image; retry completes removal. Account deletion can likewise remove some files before a later failure. Neither flow promises a transactional rollback across Storage and Postgres.
- If OCR ingestion may have committed but its response/reference lookup fails, private image evidence is retained. Unreferenced uploads can remain until owner-folder cleanup; no scheduled orphan sweeper was added.
- Account removal deletes active Auth/app records and owned receipt/avatar objects. It does not erase exported/shared copies, provider backups or already submitted AI requests. An already issued access token may remain cryptographically valid until expiry; post-deletion behavior and any racing writes require the hosted disposable-account test.
- AI consent is a client/device control, not server-enforced centralized consent. Previously sent data cannot be recalled by changing it. Fin can still produce incorrect prose/numbers despite a required lookup. Measure factual accuracy and safe refusal separately.
- Quotas count requests, not RM expenditure; chat can make up to three bounded model rounds. Individual and global reservations are separate: global rejection can still consume the caller's own allowance. New signup identities can still compete for available capacity.
- Learning records lesson acknowledgement, server-scored checks and saved plans separately. Historical unverified action progress remains labelled as earlier progress. Weekly mission completion remains self-reported. Neither a saved plan nor a checkbox is evidence of changed financial behaviour.
- The compatible baseline is reconstructed from checked-in source. Compare it with the actual hosted schema before claiming a clean hosted installation is equivalent.
- A compatible `shell-quote` patch removed the reported critical dependency advisory. The root npm audit still reported 43 advisories (1 low, 14 moderate, 28 high); the backend reported zero. Forced Expo/React Native downgrades were not applied. Triage the remaining dependency paths with a tested SDK upgrade, rather than claiming the app is vulnerability-free.
- Dense legacy learning/source text still needs a physical-device readability and assistive-technology pass. Future tax-year review, named maintenance ownership and real service-cost measurements remain operational work. The Actions workflow has not yet run on GitHub.

## Evidence still required outside code

Representative users, measured time/correction effort, OCR and Fin accuracy evaluation, repeat use, cost measurements, competitor task comparison, physical-device testing and the competition poster/synopsis/technical drawing remain evidence work. No implementation or unit-test pass substitutes for these outcomes.

Use [the validation protocol](competition-validation.md) to collect that evidence without turning implementation claims into invented results.
