import { getAiConsent } from "./ai-consent";
import { createAuthenticatedApiFetch } from "./api-core";
import { supabase } from "./supabase";

export { isAiConsentRequired } from "./api-core";
export const authenticatedApiFetch = createAuthenticatedApiFetch({
  apiUrl: process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, ""),
  getSession: () => supabase.auth.getSession(),
  getAiConsent,
  fetch: (input, init) => fetch(input, init),
});
