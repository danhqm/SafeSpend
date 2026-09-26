import * as SecureStore from "expo-secure-store";
import { createChunkedAuthStorage } from "./secure-auth-storage-core";

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export const secureAuthStorage = createChunkedAuthStorage({
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
});
