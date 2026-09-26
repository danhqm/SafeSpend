// app/register.tsx
import { useRouter } from "expo-router";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../utils/supabase";
import { emailConfirmationRedirect } from "../utils/auth-redirect";

const minimumBirthDate = new Date(1900, 0, 1);

function formatBirthDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseBirthDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatBirthDate(date) === value ? date : null;
}

export default function Register() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [dob, setDob] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPickerVisible, setPickerVisible] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date(2000, 0, 1));

  const openBirthDatePicker = () => {
    const initialDate = parseBirthDate(dob) ?? new Date(2000, 0, 1);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: "date",
        display: "calendar",
        minimumDate: minimumBirthDate,
        maximumDate: new Date(),
        onChange: (event, selectedDate) => {
          if (event.type === "set" && selectedDate) setDob(formatBirthDate(selectedDate));
        },
      });
    } else {
      setPickerDate(initialDate);
      setPickerVisible(true);
    }
  };

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password) {
      Alert.alert("Error", "Username, email, and password are required");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }
    const parsedDob = dob ? parseBirthDate(dob) : null;
    if (dob && (!parsedDob || parsedDob < minimumBirthDate || parsedDob > new Date())) {
      Alert.alert("Error", "Please choose a valid date of birth");
      return;
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: emailConfirmationRedirect,
        data: {
          username: username.trim(),
          mobile: mobile.trim() || null,
          dob: dob || null,
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
          {Platform.OS === "web" ? (
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9DBDB0"
              value={dob}
              onChangeText={setDob}
              keyboardType="numbers-and-punctuation"
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose date of birth"
              onPress={openBirthDatePicker}
              style={styles.dateInput}
            >
              <Text style={[styles.dateText, !dob && styles.datePlaceholder]}>
                {dob ? parseBirthDate(dob)?.toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" }) : "Choose your date of birth"}
              </Text>
              <Ionicons name="calendar-outline" size={22} color="#0E3E3E" />
            </Pressable>
          )}

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

          <TouchableOpacity onPress={() => router.replace("/login")}>
            <Text style={styles.loginText}>
              Already have an account?{" "}
              <Text style={{ fontWeight: "700" }}></Text>
              <Text style={styles.footerLink}>Log In</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
      {Platform.OS === "ios" && (
        <Modal
          visible={isPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerVisible(false)}
        >
          <View style={styles.pickerBackdrop}>
            <View style={styles.pickerSheet}>
              <Text style={styles.pickerHeading}>Choose your date of birth</Text>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="inline"
                minimumDate={minimumBirthDate}
                maximumDate={new Date()}
                onChange={(_, selectedDate) => {
                  if (selectedDate) setPickerDate(selectedDate);
                }}
                style={styles.picker}
              />
              <View style={styles.pickerActions}>
                <Pressable onPress={() => setPickerVisible(false)} style={styles.pickerAction}>
                  <Text style={styles.pickerCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setDob(formatBirthDate(pickerDate));
                    setPickerVisible(false);
                  }}
                  style={[styles.pickerAction, styles.pickerDone]}
                >
                  <Text style={styles.pickerDoneText}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
  dateInput: {
    height: 50,
    backgroundColor: "#DFF7E2",
    borderWidth: 1,
    borderColor: "#0E3E3E",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginBottom: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateText: { color: "#0E3E3E", fontFamily: "Poppins_400Regular", fontSize: 16 },
  datePlaceholder: { color: "#9DBDB0" },
  pickerBackdrop: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0008", padding: 10 },
  pickerSheet: { width: "100%", maxWidth: 400, borderRadius: 20, backgroundColor: "#fff", padding: 10 },
  pickerHeading: { color: "#0E3E3E", fontFamily: "Poppins_700Bold", fontSize: 18, textAlign: "center" },
  picker: { alignSelf: "center", width: "100%", height: 340 },
  pickerActions: { flexDirection: "row", gap: 12, marginTop: 16 },
  pickerAction: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12 },
  pickerCancelText: { color: "#0E3E3E", fontFamily: "Poppins_700Bold" },
  pickerDone: { backgroundColor: "#00D09E" },
  pickerDoneText: { color: "#0E3E3E", fontFamily: "Poppins_700Bold" },

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
