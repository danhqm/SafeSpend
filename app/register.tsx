// app/register.tsx
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../utils/supabase";

export default function Register() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [dob, setDob] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password) {
      Alert.alert("Error", "Username, email, and password are required");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      Alert.alert("Error", "Date of birth must use YYYY-MM-DD");
      return;
    }
    if (monthlyIncome && (!Number.isFinite(Number(monthlyIncome)) || Number(monthlyIncome) < 0)) {
      Alert.alert("Error", "Monthly income must be a non-negative number");
      return;
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          username: username.trim(),
          mobile: mobile.trim() || null,
          dob: dob || null,
          monthly_income: monthlyIncome ? Number(monthlyIncome) : null,
        },
      },
    });

    if (authError || !data?.user) {
      Alert.alert("Error", authError?.message || "Failed to create user");
      return;
    }

    Alert.alert(
      "Verify your email",
      "We’ve sent a verification link to your email. Please confirm it before logging in.",
      [{ text: "OK", onPress: () => router.replace("/login") }],
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.headerText}>Create Account</Text>
      </View>

      <View style={styles.card}>
        <ScrollView
          contentContainerStyle={styles.formContainer}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your username"
            placeholderTextColor={"#9DBDB0"}
            value={username}
            onChangeText={setUsername}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor={"#9DBDB0"}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />

          <Text style={styles.label}>Mobile Number</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your mobile number"
            placeholderTextColor={"#9DBDB0"}
            value={mobile}
            onChangeText={setMobile}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Date Of Birth</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={"#9DBDB0"}
            value={dob}
            onChangeText={setDob}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter password"
            placeholderTextColor={"#9DBDB0"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={"#9DBDB0"}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          <Text style={styles.label}>Monthly Income</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your monthly income"
            placeholderTextColor={"#9DBDB0"}
            value={monthlyIncome}
            onChangeText={setMonthlyIncome}
            keyboardType="numeric"
          />

          <Text style={styles.policyText}>
            By continuing, you agree to Terms of Use and Privacy Policy{" "}
            <Text style={{ fontWeight: "700" }}>Log In</Text>
          </Text>

          <TouchableOpacity
            style={styles.signUpButton}
            onPress={handleRegister}
          >
            <Text style={styles.signUpText}>Sign Up</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/landing")}>
            <Text style={styles.loginText}>
              Already have an account?{" "}
              <Text style={{ fontWeight: "700" }}></Text>
              <Text style={styles.footerLink}>Log In</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#00D09E",
  },

  header: {
    paddingTop: 120,
    paddingBottom: 20,
    alignItems: "center",
  },

  headerText: {
    fontSize: 28,
    fontFamily: "Poppins_700Bold",
    color: "#093030",
  },

  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingHorizontal: 25,
    paddingTop: 30,
    top: 20,
  },

  formContainer: {
    paddingBottom: 40,
  },

  label: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    marginBottom: 5,
    color: "#0E3E3E",
  },

  input: {
    height: 50,
    backgroundColor: "#DFF7E2",
    borderWidth: 1,
    borderColor: "#0E3E3E",
    borderRadius: 12,
    paddingHorizontal: 15,
    fontFamily: "Poppins_400Regular",
    fontSize: 16,
    marginBottom: 15,
  },

  signUpButton: {
    backgroundColor: "#00D09E",
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 10,
  },

  signUpText: {
    color: "#fff",
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
  },

  loginText: {
    textAlign: "center",
    marginTop: 15,
    fontFamily: "Poppins_400Regular",
    color: "#0E3E3E",
    fontSize: 14,
  },

  policyText: {
    width: 300,
    alignSelf: "center",
    textAlign: "center",
    marginTop: 10,
    fontFamily: "Poppins_400Regular",
    color: "#0E3E3E",
    fontSize: 14,
  },
  footerLink: {
    color: "#00D09E",
    fontFamily: "Poppins_700Bold",
  },
});
