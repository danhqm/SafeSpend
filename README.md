# SafeSpend

SafeSpend is an Expo/React Native personal-finance app for tracking receipts, monthly spending, goals, learning progress, and Malaysian LHDN tax-relief claims. A small Vercel Functions backend authenticates requests, performs receipt OCR with OpenAI, and generates financial insights. Supabase provides Auth, Postgres, and private image storage.

## Financial data model

- `transactions` is the canonical ledger used by the dashboard and reports.
- `receipts` stores OCR evidence and LHDN metadata; a receipt-backed transaction links to it with `receipt_id`.
- Manual expenses, income, and refunds are posted directly to the ledger.
- Normal receipt scans are saved as drafts. They do not affect totals until the user checks the merchant, date, amount, and category and confirms the draft.
- Receipt-backed transactions open the original private image with a short-lived signed URL; permanent storage paths are never exposed as public links.
- Tax Relief scans also remain spending drafts. Tax eligibility review and posting an expense are separate actions. Saved receipts can be attached to Tax Relief without recording another purchase.
- Re-uploading identical image bytes reuses the owner's receipt, including an already confirmed transaction. Similar merchant/date/amount matches require review; different photos of the same purchase are not guaranteed duplicates.
- OCR accepts clear MYR purchase evidence only. Unknown currency, missing facts and invalid dates are rejected; users can still record a transaction manually.
- Before sending an image, the app checks authenticated `GET /api/ocr` for receipt protocol 2. Deploy the matching backend and pending receipt migrations first; an older backend is blocked with an update message to prevent legacy duplicate/posting behavior.
- Reports use `occurred_on`, the financial event date, rather than the upload timestamp.
- Dashboard, account, budget and tax totals load complete result pages and reject incomplete reads. Net spending subtracts refunds before clamping the final total to zero; the chart explains when its positive category slices exceed that net total.

## Fin's Analysis

- The backend reads the signed-in user's confirmed ledger entries, monthly budgets, account types, and recent goals. It does not accept financial totals supplied by the phone.
- Fin receives aggregated monthly and last-90-day patterns, not raw receipt images or transaction notes. Draft receipts, internal transfers, non-MYR transactions, tax claims, and learning progress are excluded.
- The analysis uses up to the latest 5,000 posted transactions. If that limit is reached, the app labels the result as a recent-history sample.
- Spending totals account for refunds; purchase frequency counts expenses only. The current partial month is compared only with the same elapsed period of the prior month.

## Security model

- The Expo client uses only a Supabase publishable key. Never put a secret or service-role key in `app.config.js`, an `EXPO_PUBLIC_*` variable, or an Expo build.
- Every backend endpoint requires `Authorization: Bearer <Supabase access token>` and derives the user ID from that verified token.
- `OWNER_USER_ID` can restrict all backend APIs to one Supabase Auth user.
- Paid AI endpoints enforce atomic per-user and deployment-wide burst/daily quotas in Postgres. Exhausted accounts are rejected before touching the shared allowance. If either quota service is unavailable, requests fail closed before an OpenAI call. These request caps are not a currency-denominated billing ceiling.
- Database tables use row-level security (RLS). Receipt images are private and are displayed with short-lived signed URLs.
- AI output is untrusted data and is validated before it is stored or returned.

## Privacy and account controls

`Profile > Privacy & data` explains the providers and data sent for AI processing. The same notice is available before registration. AI starts off for each account/device; enabling it allows receipt OCR, Fin chat and automatic Home insights. Manual tracking remains available. Consent is enforced by the app request helper, not a server-side consent ledger; disabling it does not recall an in-flight request or data already sent to a provider.

The page also supports password-verified account deletion. The server plans owned receipt/avatar cleanup, removes files, then deletes Auth and cascading app records. A failed cleanup retains the account for retry; files already removed cannot be restored by retrying. Local summaries, preferences, reminders and temporary tax exports are then cleared with cleanup errors reported. Exported/shared copies and provider backups remain outside this flow. Login includes password recovery through the existing hosted password page.

## Local setup

SafeSpend uses Expo SDK 57 and requires Node.js 22.13 or newer.

1. Install the app dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and enter the public client settings.
3. Install backend dependencies with `cd chatbot-backend && npm install`.
4. Copy `chatbot-backend/.env.example` to `chatbot-backend/.env` and enter server-only secrets.
5. Run the app with `npm start` and run the backend with `vercel dev` from `chatbot-backend`.

Do not commit either populated environment file.

## Database changes

The `supabase/migrations` directory is the source of truth for database changes. The two audit-remediation migrations and matching backend were deployed on 17 October 2026. See the [deployment record](docs/deployment-2026-10-17.md) and [audit remediation and rollout](docs/audit-remediation.md).

For fresh installations only, `supabase/baseline/legacy-schema.sql` reconstructs the legacy tables expected by the earliest migration. Apply it to an empty Supabase public schema, then apply every migration in filename order. It is not a hosted schema snapshot and refuses an existing app schema. Existing installations must apply only pending migrations.

Before applying future migrations:

1. Back up the hosted database and the `receipts` storage bucket.
2. Review structural changes, policy changes, grants, and storage privacy changes.
3. Test it against a separate Supabase project restored from representative data.
4. Confirm existing receipt images open through signed URLs.
5. Apply with `supabase db push` only after the test project passes.

For a single-user installation, confirm the owner's Auth UUID and set the backend `OWNER_USER_ID`. For a shared installation, leave `OWNER_USER_ID` unset; public sign-ups can remain enabled and RLS keeps each user's data isolated.

Fin chat answers personal-record questions through authenticated, user-scoped lookups. It can search saved receipts by scan date or purchase date, search confirmed transactions, and use a calculated financial overview for spending patterns. A saved but unconfirmed receipt is identified as such and is not counted as spending. Only selected financial records are sent to the configured OpenAI model for each question; Tax Relief claims, lessons, quizzes and mission progress are excluded (user-entered weekly financial goals are included in the overview). Search results are capped at 500 records per lookup and the overview at 5,000 transactions, so Fin must disclose when coverage is incomplete. It does not have a permanent conversational memory.

Fin also supports everyday financial coaching with validated cash-purchase,
no-interest savings and reducing-balance repayment scenarios. The chat keeps an
AI guidance notice visible, asks for missing financial inputs and distinguishes
scenario inputs from saved records. See [Fin's scope, calculators and verification
limits](docs/fin-coach.md).

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:database
cd chatbot-backend
npm run check
npm test
```

Database tests run the baseline and actual migration SQL in isolated PGlite PostgreSQL instances with dummy identities. They exercise RLS, constraints and triggers, including the existing rollback tax suites. They do not emulate Supabase Auth/Storage HTTP, verify JWT signatures or prove multi-connection concurrency.

`.github/workflows/checks.yml` runs the checks and a web export on pushes and pull requests with dummy build settings and read-only repository access. Its action configuration follows the official [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node) documentation. A hosted Actions run remains to be verified after pushing.

## Deployment checklist

- Rotate any secret that was ever placed in a mobile bundle or committed to source control.
- Configure the Expo public variables and Vercel server variables separately.
- Set `OWNER_USER_ID` on Vercel only for personal-only access; leave it unset for multi-user access.
- Keep Supabase public sign-ups enabled only when new users should be able to register.
- Enable leaked-password protection and MFA for the owner account.
- Deploy the backend near the Supabase region where possible.
- Review per-user and global quotas for `/api/chat`, `/api/ocr`, and `/api/fin-insights` before sharing any URL, and set provider billing limits separately.
- Verify login, receipt scan, signed-image viewing, deletion, insights, and logout end to end.

## SafeSpend Launch Video

https://github.com/user-attachments/assets/10ab0068-f0e1-4ee0-8354-e047f4ead23c
