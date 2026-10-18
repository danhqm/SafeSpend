export const FACE_ID_USER_KEY = "safespend.faceid.user";
export const FACE_ID_OFFERED_KEY = "safespend.faceid.offered";

export async function clearOwnedBiometricPreferences(store: {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
}, userId: string): Promise<void> {
  await Promise.all([FACE_ID_USER_KEY, FACE_ID_OFFERED_KEY].map(async key => {
    if (await store.getItem(key) === userId) await store.removeItem(key);
  }));
}
