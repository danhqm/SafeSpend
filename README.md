# SafeSpend

SafeSpend is an Expo/React Native personal-finance app for tracking receipts, weekly spending, goals, learning progress, and Malaysian LHDN tax-relief claims. A small Vercel Functions backend authenticates requests, performs receipt OCR with OpenAI, and generates financial insights. Supabase provides Auth, Postgres, and private image storage.

## Security model

- The Expo client uses only a Supabase publishable key. Never put a secret or service-role key in `app.config.js`, an `EXPO_PUBLIC_*` variable, or an Expo build.
- Every backend endpoint requires `Authorization: Bearer <Supabase access token>` and derives the user ID from that verified token.
- `OWNER_USER_ID` can restrict all backend APIs to one Supabase Auth user.
- Database tables use row-level security (RLS). Receipt images are private and are displayed with short-lived signed URLs.
- AI output is untrusted data and is validated before it is stored or returned.

## Local setup

1. Install the app dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and enter the public client settings.
3. Install backend dependencies with `cd chatbot-backend && npm install`.
4. Copy `chatbot-backend/.env.example` to `chatbot-backend/.env` and enter server-only secrets.
5. Run the app with `npm start` and run the backend with `vercel dev` from `chatbot-backend`.

Do not commit either populated environment file.

## Database changes

The `supabase/migrations` directory is the source of truth for database changes. The current hardening migration was generated with the Supabase CLI and is review-only until explicitly applied.

Before applying it:

1. Back up the hosted database and the `receipts` storage bucket.
2. Review the preflight checks, column rename, old empty `password` column removal, policy replacement, and storage privacy changes.
3. Test it against a separate Supabase project restored from representative data.
4. Confirm existing receipt images open through signed URLs.
5. Apply with `supabase db push` only after the test project passes.

For a single-user installation, first confirm the owner's Auth UUID, set the backend `OWNER_USER_ID`, and then disable public sign-ups in Supabase Auth after the owner account is usable.

## Checks

```bash
npm run lint
npx tsc --noEmit
cd chatbot-backend
npm run check
```

## Deployment checklist

- Rotate any secret that was ever placed in a mobile bundle or committed to source control.
- Configure the Expo public variables and Vercel server variables separately.
- Set `OWNER_USER_ID` on Vercel for personal-only access.
- Disable Supabase public sign-ups after confirming the owner account.
- Enable leaked-password protection and MFA for the owner account.
- Deploy the backend near the Supabase region where possible.
- Add rate limits for `/api/chat`, `/api/ocr`, and `/api/fin-insights` before sharing any URL.
- Verify login, receipt scan, signed-image viewing, deletion, insights, and logout end to end.
