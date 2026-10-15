import { Platform } from "react-native";
import { createGuideStore } from "./home-guide-core";
import { secureAuthStorage } from "./secure-auth-storage";

// Only tour preferences and milestone booleans; no financial values are stored here.
export const guideStorage = Platform.OS === "web" ? {
  getItem: async (key: string) => typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => { window.localStorage.setItem(key, value); },
} : secureAuthStorage;

export const homeGuide = createGuideStore(guideStorage);
