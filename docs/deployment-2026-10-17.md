# SafeSpend production deployment — 17 October 2026

## Result

Both pending database migrations were applied to Supabase project `qorqcjjuomgmclyghbnp` and recorded in `supabase_migrations.schema_migrations` in the same transaction:

- `20261016161330_receipt_integrity`
- `20261016161905_global_ai_quota`

The backend was built from the local workspace, staged with production configuration, checked, then promoted to the existing [production API](https://rise-fund-6r5s.vercel.app).

- Vercel team: `team_usMgkQ97GnkIJdgmaJUEaBi9`
- Project: `rise-fund-6r5s` / `prj_Prxu064AVOmFwRp4MtzMvrutIpkb`
- Deployment: `dpl_FvgR8gbzE8aYxcr5cNu82X5RHsZz` — READY
- [Build and deployment](https://vercel.com/danhqms-projects/rise-fund-6r5s/FvgR8gbzE8aYxcr5cNu82X5RHsZz)
- Uploaded source: 20 backend files, 72.4 KB, limited by `.vercelignore`.
- Source SHA256: `f0fcefdb5e0a988d82a713f68c1dc0dae9765d4be974105419672c0d261c5941`

This was a CLI upload of uncommitted local changes. Vercel's inherited Git metadata still names base commit `f7a36d6`; that is not the complete deployed source. No commit or GitHub push was made.

## Verification

Fresh local checks before deployment: 21 database integration tests, 87 backend tests and backend syntax checks passed. The preceding app verification passed 126 tests, typecheck, lint and web export.

Hosted SQL checks passed:

| Check | Result |
| --- | --- |
| Both migration versions recorded | Yes |
| Receipts before / after | 40 / 40 |
| Transactions before / after | 48 / 48 |
| Tax claims before / after | 5 / 5 |
| Quota executes as `service_role`, increments consistently, then rolls back | Passed |
| Temporary quota counters remaining | 0 |
| Receipt ingestion callable only by the server role | Passed |
| Receipt attachment requires the authenticated role | Passed |
| Global quota callable only by the server role | Passed |
| Receipt/avatar storage buckets remain private | Passed |
| New receipt trigger creates spending drafts | Passed |

The migration transaction changes schema/functions and records migration history; it does not rewrite historical receipts, spending or claims. Only metadata and counts were inspected, not a full database/storage backup export. The previous trigger definition was inspected before replacement. [Hosted verification query](https://supabase.com/dashboard/project/qorqcjjuomgmclyghbnp/sql/4225e637-bbcd-437e-8cf3-718444d272e4).

The 11 hosted verification rows were also exported to CSV. A browser screenshot attempt timed out; the CSV, SQL results and deployment metadata provide the retained verification record.

Public production checks, without credentials or paid model calls:

| Request | Observed |
| --- | --- |
| `GET /api/ocr` | 401, Authentication required; the new GET handler is present |
| `GET /api/account` | 405, Allow: DELETE; the new route is present |
| `POST /api/chat` | 401, Authentication required |
| `POST /api/fin-insights` | 401, Authentication required |
| `GET /set-password` | 200, page loaded |

The staged deployment also passed its unauthenticated OCR/account checks before promotion. The deployment-specific error-log query for the most recent 15 minutes returned no matching errors. This short scan is not a reliability or authenticated OCR accuracy guarantee.

## Operational notes

Supabase CLI access remained denied, while the user-authorized Chrome session had access to the correct SafeSpend project. The reviewed migrations and checks were executed through that project's SQL editor. No unrelated Supabase project was modified.

The older Vercel CLI automatically replaced the root `.env.local` during project linking. The original three public app settings were recovered from the already verified web build; server variables were removed from that app file. An attempted separate production-environment download was rejected by automatic approval and was not performed. Deployment used the server configuration already held by Vercel. Local Vercel linkage and source/HTTP-check manifests are ignored under `.vercel/`.

An initial staged build failed because the upload ignore rules omitted the backend directory. The corrected allowlist was checked against the 20-file source manifest before the successful staged build. The failed deployment was never promoted.

## Remaining app check

Reload SafeSpend to use the updated local client. Demo Mart's 2026-10-17 date belongs to YA2026 draft tracking; Book Corner's 2025-10-17 date belongs to YA2025. Retry scanning while signed in and after reviewing the AI choice. No authenticated receipt scan, account deletion, recovery email or physical-device flow was performed during deployment verification, and no new mobile binary was released.

The new hashes are not retroactively populated on old receipts. Existing scans are preserved; suspected historical duplicates require explicit review. Do not rescan old evidence merely to attach it to Tax Relief: use the saved-receipt picker.
