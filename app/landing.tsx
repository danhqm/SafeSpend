import { useRouter } from "expo-router";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LandingScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.logoContainer}>
        <Image
          source={require("../assets/images/RiseFund-Light.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.appName}>SafeSpend</Text>
        <Text style={styles.description}>
          Master Your Money, Design Your Future.
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.replace("/login")}
        >
          <Text style={styles.loginText}>Log In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signupButton}
          onPress={() => router.push("/register")}
        >
          <Text style={styles.signupText}>Sign Up</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1FFF3",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 50,
  },

  logoContainer: {
    alignItems: "center",
    marginTop: 80,
  },

  logo: {
    width: 110,
    height: 110,
  },

  appName: {
    fontSize: 52,
    fontWeight: "700",
    fontFamily: "Poppins_700Bold",
    color: "#00D09E",
    marginTop: 10,
  },

  description: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    color: "#0E3E3E",
    textAlign: "center",
    marginTop: 10,
    paddingHorizontal: 30,
  },

  buttonContainer: {
    width: "100%",
    alignItems: "center",
    marginBottom: 200,
  },

  loginButton: {
    width: "80%",
    backgroundColor: "#00D09E",
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: "center",
    marginBottom: 15,
  },

  loginText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
  },

  signupButton: {
    width: "80%",
    backgroundColor: "#DFF7E2",
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: "center",
    marginBottom: 10,
  },

  signupText: {
    color: "#0E3E3E",
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
  },
});
