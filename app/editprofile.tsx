// app/edit-profile.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../utils/supabase"; // 🔁 adjust path if needed

const PRIMARY = "#00D09E";

export default function EditProfileScreen() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mobile, setMobile] = useState("");
  const [dob, setDob] = useState(""); // store as "YYYY-MM-DD"
  const [monthlyIncome, setMonthlyIncome] = useState("");

  // Load current username
  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.log("No user", userError);
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("username, mobile, dob, monthly_income, user_id")
        .eq("user_id", user.id)
        .single();

      if (!profileError && profile) {
        setUsername(profile.username ?? "");
        setMobile(profile.mobile ?? "");
        setDob(profile.dob ?? ""); // if it's a date, Supabase returns "YYYY-MM-DD"
        setMonthlyIncome(
          profile.monthly_income ? String(profile.monthly_income) : "",
        );
      }

      setLoading(false);
    };

    loadProfile();
  }, []);

  const handleSave = async () => {
    if (!username.trim()) {
      Alert.alert("Error", "Username cannot be empty");
      return;
    }
    if (monthlyIncome && (!Number.isFinite(Number(monthlyIncome)) || Number(monthlyIncome) < 0)) {
      Alert.alert("Error", "Monthly income must be a non-negative number");
      return;
    }
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      Alert.alert("Error", "Date of birth must use YYYY-MM-DD");
      return;
    }

    setSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaving(false);
      Alert.alert("Error", "You are not logged in");
      return;
    }

    const payload = {
      username: username.trim(),
      mobile: mobile.trim() || null,
      dob: dob.trim() || null,
      monthly_income: monthlyIncome.trim() ? Number(monthlyIncome) : null,
    };

    const { error: updateError } = await supabase
      .from("users")
      .update(payload)
      .eq("user_id", user.id);

    if (updateError) {
      console.log(updateError);
      Alert.alert("Error", "Failed to update profile");
      setSaving(false);
      return;
    }

    await supabase.auth.updateUser({
      data: { username: username.trim() },
    });

    setSaving(false);
    Alert.alert("Success", "Profile updated successfully", [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Profile Information</Text>

            {loading ? (
              <ActivityIndicator style={{ marginTop: 20 }} />
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Username</Text>
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Enter your username"
                    placeholderTextColor="#9BA4A4"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Mobile</Text>
                  <TextInput
                    style={styles.input}
                    value={mobile}
                    onChangeText={setMobile}
                    placeholder="e.g. 0123456789"
                    placeholderTextColor="#9BA4A4"
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Date of Birth</Text>
                  <TextInput
                    style={styles.input}
                    value={dob}
                    onChangeText={setDob}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#9BA4A4"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Monthly Income (RM)</Text>
                  <TextInput
                    style={styles.input}
                    value={monthlyIncome}
                    onChangeText={setMonthlyIncome}
                    placeholder="e.g. 3500"
                    placeholderTextColor="#9BA4A4"
                    keyboardType="numeric"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.saveButton, saving && { opacity: 0.7 }]}
                  activeOpacity={0.8}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 10,
    justifyContent: "space-between",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  contentContainer: {
    flexGrow: 1,
  },
  card: {
    top: 20,
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#16302A",
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: "#6B7A7A",
    marginBottom: 6,
    fontWeight: "500",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#16302A",
    borderWidth: 1,
    borderColor: "#D4E4E4",
  },
  saveButton: {
    marginTop: 24,
    backgroundColor: PRIMARY,
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
