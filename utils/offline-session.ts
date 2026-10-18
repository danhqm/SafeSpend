import { homeCache } from "./home-cache";
import { createSavedUserIdReader } from "./offline-session-core";
import { supabase } from "./supabase";

export const getSavedUserId = createSavedUserIdReader({
  getSession: () => supabase.auth.getSession(),
  getOfflineUserId: () => homeCache.getOfflineUserId(),
  getHome: (userId) => homeCache.getHome(userId),
});
