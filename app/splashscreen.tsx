import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  StyleSheet,
  Text,
} from "react-native";

export default function SplashScreen() {
  const router = useRouter();
  const [fadeAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        router.replace("/onboarding");
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [fadeAnim, router]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image
        source={require("../assets/images/RiseFund-Dark.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.title}>SafeSpend</Text>
      <ActivityIndicator size="large" color="#fff" style={{ marginTop: 20 }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#00D09E",
  },
  logo: { width: 100, height: 100 },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 20,
  },
});
