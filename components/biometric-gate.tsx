import { useRouter } from "expo-router";
import { ReactNode, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { isFaceIdEnabledFor, unlockWithFaceId } from "../utils/biometrics";
import { supabase } from "../utils/supabase";
import { BrandSplash } from "./brand-splash";

type GateStatus = "checking" | "open" | "locked";

export function BiometricGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<GateStatus>("checking");
  const [challenge, setChallenge] = useState(0);
  const [prompting, setPrompting] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const checkId = useRef(0);
  const mountedRef = useRef(false);
  const lastAttempt = useRef(-1);
  const promptInFlight = useRef(false);
  const wasBackgrounded = useRef(false);

  useEffect(() => {
    let mounted = true;
    mountedRef.current = true;

    const checkLock = async () => {
      const id = ++checkId.current;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const enabled = data.session?.user
          ? await isFaceIdEnabledFor(data.session.user.id)
          : false;
        if (!mounted || id !== checkId.current) return;
        setUnlockError("");
        setStatus(enabled ? "locked" : "open");
        if (enabled) setChallenge((value) => value + 1);
      } catch {
        if (!mounted || id !== checkId.current) return;
        // Fail closed if a stored session or its Face ID preference cannot be read.
        setUnlockError("Could not check your saved sign-in. Use your password to continue.");
        setStatus("locked");
      } finally {
        if (mounted && id === checkId.current) setReady(true);
      }
    };

    void checkLock();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        wasBackgrounded.current = true;
        checkId.current += 1;
        setStatus("checking");
      } else if (state === "active" && wasBackgrounded.current) {
        wasBackgrounded.current = false;
        void checkLock();
      } else if (state === "active" && lastAttempt.current === -1) {
        // iOS can still be inactive while the first session check completes.
        setChallenge((value) => value + 1);
      }
    });

    return () => {
      mounted = false;
      mountedRef.current = false;
      checkId.current += 1;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (
      status !== "locked" ||
      AppState.currentState !== "active" ||
      lastAttempt.current === challenge ||
      promptInFlight.current
    ) {
      return;
    }

    let current = true;
    lastAttempt.current = challenge;
    promptInFlight.current = true;
    setPrompting(true);
    void unlockWithFaceId()
      .then((unlocked) => {
        if (!current) return;
        if (unlocked) setStatus("open");
        else setUnlockError("Face ID was unavailable or cancelled. Try again or use your password.");
      })
      .catch(() => {
        if (current) setUnlockError("Face ID could not unlock SafeSpend. Use your password instead.");
      })
      .finally(() => {
        promptInFlight.current = false;
        if (mountedRef.current) {
          setPrompting(false);
          if (!current) setChallenge((value) => value + 1);
        }
      });

    return () => {
      current = false;
    };
  }, [status, challenge]);

  const handlePasswordFallback = async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      setStatus("open");
      router.replace("/login");
    } catch {
      Alert.alert("Unable to switch sign-in", "Please try again.");
    }
  };

  if (!ready) return <BrandSplash />;

  return (
    <View style={styles.root}>
      <View
        style={styles.app}
        pointerEvents={status === "open" ? "auto" : "none"}
        accessibilityElementsHidden={status !== "open"}
        importantForAccessibility={status === "open" ? "auto" : "no-hide-descendants"}
      >
        {children}
      </View>
      {status !== "open" && (
        <SafeAreaView style={styles.overlay}>
          <Text style={styles.brand}>SafeSpend</Text>
          {status === "locked" ? (
            <View style={styles.lockContent}>
              <Text style={styles.title}>Unlock SafeSpend</Text>
              <Text style={styles.description}>
                Use Face ID to view your financial information.
              </Text>
              {unlockError ? <Text style={styles.error}>{unlockError}</Text> : null}
              <Pressable
                accessibilityRole="button"
                disabled={prompting}
                onPress={() => setChallenge((value) => value + 1)}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryText}>
                  {prompting ? "Waiting for Face ID…" : "Try Face ID again"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={prompting}
                onPress={() => void handlePasswordFallback()}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryText}>Use password instead</Text>
              </Pressable>
            </View>
          ) : null}
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1FFF3" },
  app: { flex: 1 },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#F1FFF3",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  brand: {
    position: "absolute",
    top: 80,
    color: "#008F70",
    fontFamily: "Poppins_700Bold",
    fontSize: 30,
  },
  lockContent: { width: "100%", maxWidth: 360, alignItems: "center", gap: 16 },
  title: { color: "#0E3E3E", fontFamily: "Poppins_700Bold", fontSize: 27 },
  description: {
    color: "#42645B",
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    textAlign: "center",
  },
  error: { color: "#A23939", fontSize: 13, textAlign: "center" },
  primaryButton: {
    width: "100%",
    alignItems: "center",
    borderRadius: 24,
    backgroundColor: "#00D09E",
    paddingVertical: 15,
    marginTop: 8,
  },
  primaryText: { color: "#0E3E3E", fontFamily: "Poppins_700Bold", fontSize: 16 },
  secondaryButton: { padding: 10 },
  secondaryText: { color: "#006F58", fontFamily: "Poppins_700Bold", fontSize: 14 },
});
