import { homeCache } from "./home-cache";
import { supabase } from "./supabase";

function isNetworkFailure(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const issue = error as { name?: string; status?: number };
  return issue.name === "AuthRetryableFetchError" && issue.status === 0;
}

export async function getSavedUserId(): Promise<{ userId: string | null; offline: boolean }> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (data.session?.user.id) {
      return { userId: data.session.user.id, offline: false };
    }
    if (!isNetworkFailure(error)) return { userId: null, offline: false };
  } catch (error) {
    if (!isNetworkFailure(error)) return { userId: null, offline: false };
  }
  const userId = await homeCache.getOfflineUserId();
  if (!userId || !await homeCache.getHome(userId)) {
    return { userId: null, offline: false };
  }
  return { userId, offline: true };
}
