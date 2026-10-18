import * as Notifications from "expo-notifications";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { clearAiConsent } from "./ai-consent";
import { authenticatedApiFetch } from "./api";
import { createDeleteAccountAction, removableNotificationIds } from "./account-lifecycle-core";
import { clearBiometricsFor } from "./biometrics";
import { homeCache } from "./home-cache";
import { secureAuthStorage } from "./secure-auth-storage";
import { supabase } from "./supabase";

async function clearGuides(userId: string) {
  const keys = [`safespend.guide.v1.${userId}`,
    ...["learn", "fin", "lhdn"].map(feature => `safespend.feature-guide.v1.${feature}.${userId}`)];
  await Promise.all(keys.map(async key => {
    if (Platform.OS === "web") window.localStorage.removeItem(key);
    else await secureAuthStorage.removeItem(key);
  }));
}
async function clearNotifications(userId: string) {
  if (Platform.OS === "web") return;
  const ids = removableNotificationIds(await Notifications.getAllScheduledNotificationsAsync(), userId);
  await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)));
}
async function clearTemporaryExports() {
  if (Platform.OS === "web") return;
  for (const year of [2025, 2026]) {
    const file = new File(Paths.cache, `SafeSpend-YA${year}-filing-notes.txt`);
    if (file.exists) file.delete();
  }
}
export const deleteAccountAndClearDevice = createDeleteAccountAction({
  getSession: () => supabase.auth.getSession(),
  request: authenticatedApiFetch,
  signOut: async () => {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  },
  cleanups: [
    { name: "saved summaries", run: (userId) => homeCache.clearUser(userId) },
    { name: "AI preference", run: clearAiConsent },
    { name: "Face ID preference", run: clearBiometricsFor },
    { name: "reminders", run: clearNotifications },
    { name: "guide preferences", run: clearGuides },
    { name: "temporary tax exports", run: clearTemporaryExports },
  ],
});
