# SafeSpend learning release — 18 October 2026

## Deployed targets

- Supabase: `qorqcjjuomgmclyghbnp` / SafeSpend, through the authorized Supabase connector account.
- Backend project: `rise-fund-6r5s` / `prj_Prxu064AVOmFwRp4MtzMvrutIpkb`, team `team_usMgkQ97GnkIJdgmaJUEaBi9`.
- Live API: [rise-fund-6r5s.vercel.app](https://rise-fund-6r5s.vercel.app).
- Deployment: `dpl_CMr5Wyary4kYSD4wg3S8KLrigoTQ`, READY and promoted to the production domain.
- [Deployment details](https://vercel.com/danhqms-projects/rise-fund-6r5s/CMr5Wyary4kYSD4wg3S8KLrigoTQ).
- Backend manifest: 22 files, SHA256 `56229fbf408eda64b0f3497e736d0e40f6e5d8fa5cbf2c9804482a5b70e46805`.

This release used the existing Vercel environment configuration and local source upload. No environment-secret download, project relinking, Git commit/push or mobile binary release occurred.

## Database migrations

The production migration service assigned these canonical versions. Local filenames were aligned to that history without changing SQL contents:

1. `20261018052258_learning_quiz_sessions.sql`
2. `20261018052308_learning_practice.sql`
3. `20261018052619_learning_missions_and_content.sql`

The third call initially returned an expired connector-request error. The schema/history were checked before retrying: neither preferences nor the migration existed. The subsequent call succeeded once. All three versions are now recorded.

Published modules matched the expected three paths and three-question checks before deployment. Afterwards there are six private quiz sets, zero answer keys in published quiz payloads, RLS on the three new public learner tables, and no direct authenticated INSERT privilege on learning progress.

## Hosted checks

The [hosted smoke SQL](../tests/learning-hosted-smoke.sql) first passed against local PostgreSQL migrations, then passed against the production database. It uses two generated fixture identities inside one transaction and rolls every write back. Verified: active quiz resumption, private answer keys, scoring/replay, varied retry, direct-write denial, old-client update message, draft recovery, preservation of confirmed evidence, idempotent linked goals, explicit budget confirmation, focus-based/stable missions and cross-user read/write denial.

| Records | Before | After rolled-back smoke test |
| --- | ---: | ---: |
| Receipts | 40 | 40 |
| Transactions | 48 | 48 |
| Tax claims | 6 | 6 |
| Learning progress | 23 | 23 |
| Quiz attempts | 5 | 5 |
| Goals | 13 | 13 |

No generated test identities or quiz sessions remained. These are count checks, not a database/storage backup export.

The staged backend rejected unauthenticated chat requests with 401 before promotion. On the live domain, POST chat, GET OCR and POST Fin insights returned the expected 401; GET chat and GET account returned 405. All five responses had `Cache-Control: no-store`.

Anonymous Data API checks returned 401 for quiz/practice RPCs and learner-session/practice reads. The private question-bank table was unavailable through the public API (404). No credentials or paid AI request were used for these checks.

Fresh release checks: 59 local database tests and 118 backend tests passed, with backend syntax validation. The renamed migration files passed the full database suite again.

## Advisory review

The advisor reports intentional authenticated SECURITY DEFINER entry points. These operations need controlled server writes/private-key access; the owner checks, restricted privileges, empty search paths and denied anonymous/direct writes were exercised above. See [Supabase's function-exposure advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Existing private quota tables have no client policies intentionally. Existing [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains disabled; this release did not alter authentication settings.

## Interactive testing

The user signed into a local Expo Web tab connected to these deployed services. Verified against the hosted database:

- Changing focus changed the recommendation; restoring All preserved the existing weekly mission.
- An unfinished quiz resumed after a full reload with the same questions and option order. Empty submission was rejected. A deliberate 2/3 submission saved a pass, its feedback opened the relevant lesson point, and an explicit retry opened the other reviewed set without removing the pass.
- An incomplete savings plan could not be confirmed but could be saved as a partial draft. After a full reload, the target and labelled first step were restored. No plan was confirmed and no linked goal was created by this UI check.
- Fin handoff displayed the selected lesson and editable starter without sending. AI-off submission retained the draft and displayed the consent notice.
- With the user's specific approval, one live lesson question returned an explanation and hypothetical savings example from the deployed Fin handler. AI processing was restored to **Off** afterwards and verified in Privacy & data.

The initial browser Fin attempt was blocked by CORS before reaching the handler: OPTIONS from `http://localhost:8083` returned 204 without `Access-Control-Allow-Origin`. For the approved live question, a temporary proxy bound only to `127.0.0.1:8084` forwarded the existing authenticated request to the production chat route. It accepted only the test origin and chat route, rejected other origins/routes, preserved backend authentication and did not log requests. The Expo process used a temporary API URL; saved environment files and production CORS were unchanged. This verifies the deployed handler through that test transport, not direct browser compatibility with the production API. The temporary tab, Expo server and proxy were stopped afterwards, and the proxy script was removed.

Testing found two small app issues, now fixed locally: the earlier-progress count included archived modules (the signed-in display now correctly shows one published earlier practice step), and draft saving lacked a visible success message. The count regression failed before the fix and passed afterwards; the success message was observed live. Final local checks: **152 app tests**, **59 database tests**, **118 backend tests**, type checking, Expo lint, backend syntax validation and Web export passed.

The signed-in UI check intentionally left one passed quiz attempt/progress update, an unfinished retry and a clearly labelled `QA RELEASE TEST — draft only; no financial action.` savings draft with a RM1,000 target. It did not create a financial transaction, receipt, tax claim or confirmed goal. Focus was restored to All and the mission was unchanged. The earlier rolled-back fixture-count table does not describe these later, real signed-in learning writes.

This is not a released native build or a physical-device test. Native keyboard/IME, large system text, screen readers and concurrent hosted database connections remain unchecked. One successful model response is not evidence of general advice quality or improved financial outcomes. The existing app deployment must use the compatible client code; no mobile binary was published.

Subsequent user verification: the user reported that the learning update works well on a physical device. This is user-reported testing, not an independently observed device matrix or verification of the later detail-page styling changes.
