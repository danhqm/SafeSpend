import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../utils/supabase";
import { emailConfirmationRedirect, passwordRecoveryRedirect } from "../utils/auth-redirect";
import { requestPasswordRecovery } from "../utils/account-lifecycle-core";
import {
  enableFaceIdFor,
  markFaceIdOfferedTo,
  shouldOfferFaceIdTo,
} from "../utils/biometrics";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const recoveryOperation = useRef(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      if (authError.message.includes("Email not confirmed")) {
        Alert.alert(
          "Email not verified",
          "Please check your email and confirm your account before logging in.",
        );
      } else {
        Alert.alert("Login Failed", authError.message);
      }
      return;
    }

    router.replace("/(tabs)");

    if (data.user) {
      try {
        if (await shouldOfferFaceIdTo(data.user.id)) {
          await markFaceIdOfferedTo(data.user.id);
          Alert.alert(
            "Use Face ID next time?",
            "Unlock SafeSpend with Face ID whenever you open the app. Your password will not be saved.",
            [
              { text: "Not now", style: "cancel" },
              {
                text: "Enable Face ID",
                onPress: () => {
                  void enableFaceIdFor(data.user.id).catch(() =>
                    Alert.alert("Face ID unavailable", "You can try again from Profile."),
                  );
                },
              },
            ],
          );
        }
      } catch {
        // Face ID is optional; a successful password sign-in must still work.
      }
    }
  };

  const handlePasswordRecovery = async () => {
    if (recoveryOperation.current) return;
    recoveryOperation.current = true;
    setRecoveryBusy(true);
    try {
      await requestPasswordRecovery(supabase.auth, email, passwordRecoveryRedirect);
      Alert.alert("Check your email", "If that address has an account, you will receive a password reset link. Open it in your browser, choose a new password, then return here to sign in.");
    } catch (error) {
      Alert.alert("Password reset not sent", error instanceof Error ? error.message : "Please try again.");
    } finally {
      recoveryOperation.current = false;
      setRecoveryBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email first");
      return;
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: emailConfirmationRedirect },
    });

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert(
      "Verification sent",
      "Please check your email to confirm your account.",
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>Welcome</Text>

      <View style={styles.card}>
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Email</Text>
        <TextInput
          placeholder="Email"
          placeholderTextColor="#9DBDB0"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            placeholder="••••••••"
            placeholderTextColor="#9DBDB0"
            secureTextEntry
            style={styles.passwordInput}
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginText}>Log In</Text>
        </TouchableOpacity>

        <TouchableOpacity accessibilityRole="button" onPress={() => void handlePasswordRecovery()} disabled={recoveryBusy}>
          <Text style={styles.forgot}>{recoveryBusy ? "Sending reset link…" : "Forgot password?"}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleResendVerification}>
          <Text style={styles.resendText}>Resend verification email</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          Don’t have an account?{" "}
          <Text
            style={styles.footerLink}
            onPress={() => router.push("/register")}
          >
            Sign Up
          </Text>
        </Text>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#00D09E",
    alignItems: "center",
  },

  header: {
    marginTop: 60,
    fontSize: 28,
    fontFamily: "Poppins_700Bold",
    color: "#0E3E3E",
  },

  card: {
    marginTop: 50,
    width: "100%",
    flex: 1,
    backgroundColor: "#F1FFF3",
    borderTopLeftRadius: 60,
    borderTopRightRadius: 60,
    paddingHorizontal: 30,
    paddingTop: 40,
  },
  formContent: { alignItems: "center", paddingBottom: 40 },

  label: {
    alignSelf: "flex-start",
    fontSize: 14,
    color: "#0E3E3E",
    fontFamily: "Poppins_400Regular",
    marginTop: 15,
  },

  input: {
    borderColor: "#0E3E3E",
    width: "100%",
    backgroundColor: "#DFF7E2",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    fontFamily: "Poppins_400Regular",
    marginTop: 6,
  },

  passwordContainer: {
    width: "100%",
    flexDirection: "row",
    borderColor: "#0E3E3E",
    alignItems: "center",
    backgroundColor: "#DFF7E2",
    borderRadius: 20,
    paddingHorizontal: 20,
    marginTop: 6,
  },

  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: "Poppins_400Regular",
    borderColor: "#0E3E3E",
  },

  loginButton: {
    width: "80%",
    backgroundColor: "#00D09E",
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 30,
  },

  loginText: {
    color: "#0E3E3E",
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
  },

  forgot: {
    marginTop: 15,
    color: "#0E3E3E",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },

  footer: {
    marginTop: 30,
    fontSize: 12,
    color: "#7FA89A",
    fontFamily: "Poppins_400Regular",
  },

  footerLink: {
    color: "#00D09E",
    fontFamily: "Poppins_700Bold",
  },

  resendText: {
    marginTop: 16,
    color: "#00D09E",
    textAlign: "center",
    fontFamily: "Poppins_500Medium",
  },
});
