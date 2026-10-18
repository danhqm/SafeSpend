import { createClient } from "@supabase/supabase-js";
import { prepareResponse, requireUser, serverError } from "../lib/http.js";
import { enforceRateLimit } from "../lib/rate-limit.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { createAccountDeletionHandler } from "../lib/account-deletion.js";

async function reauthenticate(email, password) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Password verification is not configured");
  }
  // An isolated client prevents password reauthentication from changing the
  // shared admin client's authorization or persisting a temporary user session.
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (data?.session) await client.auth.signOut({ scope: "local" });
  return { user: data?.user ?? null, error };
}

export default createAccountDeletionHandler({
  db: supabaseAdmin, prepareResponse, requireUser, serverError, enforceRateLimit, reauthenticate,
});
