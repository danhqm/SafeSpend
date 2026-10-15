import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { ProfileOverview, type ProfileIdentity } from "../../components/profile-overview";
import {
  canUseFaceId,
  disableFaceId,
  enableFaceIdFor,
  isFaceIdEnabledFor,
} from "../../utils/biometrics";
import { homeCache } from "../../utils/home-cache";
import { supabase } from "../../utils/supabase";

const emptyIdentity: ProfileIdentity = {
  name: "Your profile", email: null, memberId: null, avatarUri: null,
};

export default function ProfileScreen() {
  const router = useRouter();
  const [identity, setIdentity] = useState<ProfileIdentity>(emptyIdentity);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [faceIdAvailable, setFaceIdAvailable] = useState(false);
  const [faceIdEnabled, setFaceIdEnabled] = useState(false);
  const [faceIdBusy, setFaceIdBusy] = useState(false);
  const mounted = useRef(true);
  const profileRequest = useRef(0);
  const photoOperation = useRef(false);
  const signOutOperation = useRef(false);
  const faceIdOperation = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; profileRequest.current += 1; };
  }, []);

  // Returning from Edit Profile refreshes the identity shown in this tab.
  const loadProfile = useCallback(async () => {
      const request = ++profileRequest.current;
      const currentRequest = () => mounted.current && request === profileRequest.current;
      setLoading(true);
      setLoadError(null);
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) throw new Error("Sign in to view your profile.");
        if (!currentRequest()) return;
        setAuthUserId(user.id);

        const [profileResult, biometricResult] = await Promise.all([
          supabase.from("users").select("id, username, email, user_id, avatar_url")
            .eq("user_id", user.id).single(),
          (async () => {
            try {
              const available = await canUseFaceId();
              return { available, enabled: available && await isFaceIdEnabledFor(user.id) };
            } catch {
              return { available: false, enabled: false };
            }
          })(),
        ]);
        if (!currentRequest()) return;
        setFaceIdAvailable(biometricResult.available);
        setFaceIdEnabled(biometricResult.enabled);
        if (profileResult.error) throw new Error("Could not load your profile. Please try again.");
        const profile = profileResult.data;
        setIdentity({
          name: profile?.username?.trim() || "Your profile",
          email: profile?.email || user.email || null,
          memberId: profile?.id == null ? null : String(profile.id),
          avatarUri: profile?.avatar_url || null,
        });
      } catch (error) {
        if (currentRequest()) setLoadError(error instanceof Error ? error.message : "Could not load your profile. Please try again.");
      } finally {
        if (currentRequest()) setLoading(false);
      }
  }, []);

  useFocusEffect(useCallback(() => {
    if (photoOperation.current || signOutOperation.current) return;
    void loadProfile();
    return () => { profileRequest.current += 1; };
  }, [loadProfile]));

  const pickAvatar = async () => {
    if (photoOperation.current || signOutOperation.current || loading) return;
    photoOperation.current = true;
    setPhotoBusy(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again before changing your photo.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8,
      });
      const uri = result.canceled ? null : result.assets[0]?.uri;
      if (!uri) return;

      const { error } = await supabase.from("users")
        .update({ avatar_url: uri }).eq("user_id", user.id);
      if (error) throw new Error("Your photo could not be saved. Please try again.");
      if (mounted.current) setIdentity((current) => ({ ...current, avatarUri: uri }));
      await homeCache.invalidateHome(user.id)
        .catch((cacheError) => console.warn("Could not refresh the saved Home photo", cacheError));
    } catch (error) {
      if (mounted.current) Alert.alert("Photo not updated", error instanceof Error ? error.message : "Please try again.");
    } finally {
      photoOperation.current = false;
      if (mounted.current) setPhotoBusy(false);
    }
  };

  const toggleFaceId = async () => {
    if (!authUserId || faceIdOperation.current || signOutOperation.current) return;
    faceIdOperation.current = true;
    setFaceIdBusy(true);
    try {
      if (faceIdEnabled) {
        await disableFaceId();
        if (mounted.current) setFaceIdEnabled(false);
      } else if (await enableFaceIdFor(authUserId)) {
        if (mounted.current) setFaceIdEnabled(true);
      }
    } catch {
      if (mounted.current) Alert.alert("Face ID unavailable", "Please try again later.");
    } finally {
      faceIdOperation.current = false;
      if (mounted.current) setFaceIdBusy(false);
    }
  };

  const logout = async () => {
    if (signOutOperation.current || photoOperation.current || faceIdOperation.current) return;
    signOutOperation.current = true;
    setSigningOut(true);
    try {
      const cachedUserId = await homeCache.getOfflineUserId();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      if (cachedUserId) await homeCache.clearUser(cachedUserId);
      router.replace("/login");
    } catch (error) {
      if (mounted.current) Alert.alert("Logout failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      signOutOperation.current = false;
      if (mounted.current) setSigningOut(false);
    }
  };

  return <ProfileOverview
    identity={identity} loading={loading} loadError={loadError}
    photoBusy={photoBusy} signingOut={signingOut}
    faceIdAvailable={faceIdAvailable && Boolean(authUserId)}
    faceIdEnabled={faceIdEnabled} faceIdBusy={faceIdBusy}
    onEdit={() => router.push("/editprofile")}
    onPhoto={() => void pickAvatar()}
    onAccounts={() => router.push("/accounts")}
    onTaxRelief={() => router.push("/lhdn")}
    onToggleFaceId={() => void toggleFaceId()}
    onLogout={() => void logout()}
    onRetry={() => void loadProfile()}
    onGuide={() => router.push({ pathname: "/(tabs)", params: { guide: String(Date.now()) } })}
  />;
}
