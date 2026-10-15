import { Image } from "expo-image";
import { StyleSheet, Text, View } from "react-native";

export function BrandSplash() {
  return (
    <View style={styles.container}>
      <Image
        source={require("../assets/images/RiseFund-Dark.png")}
        style={styles.logo}
        contentFit="contain"
        accessibilityLabel="SafeSpend icon"
      />
      <Text style={styles.title}>SafeSpend</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    backgroundColor: "#00D09E",
  },
  logo: { width: 112, height: 112 },
  title: { color: "#fff", fontSize: 32, fontWeight: "700" },
});
