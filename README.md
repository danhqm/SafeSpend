# SafeSpend

SafeSpend is an Expo/React Native personal-finance app for tracking receipts, weekly spending, goals, learning progress, and Malaysian LHDN tax-relief claims. A small Vercel Functions backend authenticates requests, performs receipt OCR with OpenAI, and generates financial insights. Supabase provides Auth, Postgres, and private image storage.

## Financial data model

- `transactions` is the canonical ledger used by the dashboard and reports.
- `receipts` stores OCR evidence and LHDN metadata; a receipt-backed transaction links to it with `receipt_id`.
- Manual expenses, income, and refunds are posted directly to the ledger.
- Normal receipt scans are saved as drafts. They do not affect totals until the user checks the merchant, date, amount, and category and confirms the draft.
- Receipt-backed transactions open the original private image with a short-lived signed URL; permanent storage paths are never exposed as public links.
- LHDN scans remain immediately posted so they continue to count as real expenses while also contributing to tax-relief estimates.
- Reports use `occurred_on`, the financial event date, rather than the upload timestamp.

## Security model

- The Expo client uses only a Supabase publishable key. Never put a secret or service-role key in `app.config.js`, an `EXPO_PUBLIC_*` variable, or an Expo build.
- Every backend endpoint requires `Authorization: Bearer <Supabase access token>` and derives the user ID from that verified token.
- `OWNER_USER_ID` can restrict all backend APIs to one Supabase Auth user.
- Paid AI endpoints enforce atomic per-user burst and daily quotas in Postgres. If the quota service is unavailable, requests fail closed before any OpenAI call.
- Database tables use row-level security (RLS). Receipt images are private and are displayed with short-lived signed URLs.
- AI output is untrusted data and is validated before it is stored or returned.

## Local setup

SafeSpend uses Expo SDK 57 and requires Node.js 22.13 or newer.

1. Install the app dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and enter the public client settings.
3. Install backend dependencies with `cd chatbot-backend && npm install`.
4. Copy `chatbot-backend/.env.example` to `chatbot-backend/.env` and enter server-only secrets.
5. Run the app with `npm start` and run the backend with `vercel dev` from `chatbot-backend`.

Do not commit either populated environment file.

## Database changes

The `supabase/migrations` directory is the source of truth for database changes. The hosted project includes the hardening, API-quota, and transaction-ledger migrations in this directory.

Before applying future migrations:

1. Back up the hosted database and the `receipts` storage bucket.
2. Review structural changes, policy changes, grants, and storage privacy changes.
3. Test it against a separate Supabase project restored from representative data.
4. Confirm existing receipt images open through signed URLs.
5. Apply with `supabase db push` only after the test project passes.

For a single-user installation, confirm the owner's Auth UUID and set the backend `OWNER_USER_ID`. For a shared installation, leave `OWNER_USER_ID` unset; public sign-ups can remain enabled and RLS keeps each user's data isolated.

## Checks

```bash
npm run lint
npm run typecheck
npm test
cd chatbot-backend
npm run check
```

## Deployment checklist

- Rotate any secret that was ever placed in a mobile bundle or committed to source control.
- Configure the Expo public variables and Vercel server variables separately.
- Set `OWNER_USER_ID` on Vercel only for personal-only access; leave it unset for multi-user access.
- Keep Supabase public sign-ups enabled only when new users should be able to register.
- Enable leaked-password protection and MFA for the owner account.
- Deploy the backend near the Supabase region where possible.
- Review the per-user burst and daily quotas for `/api/chat`, `/api/ocr`, and `/api/fin-insights` before sharing any URL.
- Verify login, receipt scan, signed-image viewing, deletion, insights, and logout end to end.
