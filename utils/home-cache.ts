import { Platform } from "react-native";
import { createHomeCache } from "./home-cache-core";
import { secureAuthStorage } from "./secure-auth-storage";

// Only compact summaries are persisted. The native adapter encrypts each
// chunk with the device Keychain/Keystore; web keeps summaries in memory only.
const memoryStore = new Map<string, string>();
const storage = Platform.OS === "web" ? {
  getItem: async (key: string) => memoryStore.get(key) ?? null,
  setItem: async (key: string, value: string) => { memoryStore.set(key, value); },
  removeItem: async (key: string) => { memoryStore.delete(key); },
} : secureAuthStorage;

export const homeCache = createHomeCache(storage);

export function monthOfDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date.slice(0, 7)}-01` : null;
}
