// Email confirmation must not use the default Site URL, which is reserved for password setup.
export const emailConfirmationRedirect =
  "https://rise-fund-6r5s.vercel.app/confirm-email";

// The backend serves a fragment-token password form at this existing rewrite.
export const passwordRecoveryRedirect =
  "https://rise-fund-6r5s.vercel.app/set-password";
