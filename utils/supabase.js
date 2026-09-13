// utils/supabase.js
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import "react-native-url-polyfill/auto";

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

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
