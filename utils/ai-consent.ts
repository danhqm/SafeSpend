import { Platform } from "react-native";
import { createAiConsentStore } from "./ai-consent-core";
import { secureAuthStorage } from "./secure-auth-storage";

const storage = Platform.OS === "web" ? {
  getItem: async (key: string) => typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => { window.localStorage.setItem(key, value); },
  removeItem: async (key: string) => { window.localStorage.removeItem(key); },
} : secureAuthStorage;
const consent = createAiConsentStore(storage);

export const getAiConsent = consent.get;
export const setAiConsent = consent.set;
export const clearAiConsent = consent.clear;
