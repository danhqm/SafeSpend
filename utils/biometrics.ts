import Constants from "expo-constants";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const faceIdUserKey = "safespend.faceid.user";
const faceIdOfferedKey = "safespend.faceid.offered";
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function canUseFaceId(): Promise<boolean> {
  if (Platform.OS !== "ios" || Constants.expoGoConfig) return false;
  const [hasHardware, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  return (
    hasHardware &&
    enrolled &&
    types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
  );
}

export async function isFaceIdEnabledFor(userId: string): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  return (await SecureStore.getItemAsync(faceIdUserKey)) === userId;
}

export async function enableFaceIdFor(userId: string): Promise<boolean> {
  if (!(await canUseFaceId())) return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Enable Face ID for SafeSpend",
    disableDeviceFallback: true,
  });
  if (!result.success) return false;
  await SecureStore.setItemAsync(faceIdUserKey, userId, options);
  return true;
}

export async function disableFaceId(): Promise<void> {
  await SecureStore.deleteItemAsync(faceIdUserKey);
}

export async function shouldOfferFaceIdTo(userId: string): Promise<boolean> {
  return (
    (await canUseFaceId()) &&
    !(await isFaceIdEnabledFor(userId)) &&
    (await SecureStore.getItemAsync(faceIdOfferedKey)) !== userId
  );
}

export async function markFaceIdOfferedTo(userId: string): Promise<void> {
  await SecureStore.setItemAsync(faceIdOfferedKey, userId, options);
}

export async function unlockWithFaceId(): Promise<boolean> {
  if (!(await canUseFaceId())) return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Unlock SafeSpend",
    disableDeviceFallback: true,
  });
  return result.success;
}
