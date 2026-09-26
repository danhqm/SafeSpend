// utils/supabase.js
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";
import "react-native-url-polyfill/auto";
import { secureAuthStorage } from "./secure-auth-storage";

const extra =
  Constants.expoConfig?.extra ??
  Constants.manifest?.extra ??
  {};

const supabaseUrl = extra.supabaseUrl;
const supabasePublishableKey = extra.supabasePublishableKey;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    ...(Platform.OS === "web"
      ? {}
      : { storage: secureAuthStorage, detectSessionInUrl: false }),
    autoRefreshToken: true,
    persistSession: true,
  },
});

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
