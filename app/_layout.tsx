// app/_layout.tsx
import {
  Poppins_400Regular,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-url-polyfill/auto";
import { BiometricGate } from "../components/biometric-gate";
import { BrandSplash } from "../components/brand-splash";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_700Bold,
  });

  if (!fontsLoaded) {
    return <BrandSplash />;
  }

  return (
    <BiometricGate>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="splashscreen" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="landing" />
        <Stack.Screen name="login" options={{ gestureEnabled: false }} />
        <Stack.Screen name="register" options={{ gestureEnabled: false }} />
        <Stack.Screen name="editprofile" />
        <Stack.Screen
          name="add-transaction"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="receipt/[id]"
          options={{
            headerShown: true,
            title: "Stored Receipt",
            headerBackTitle: "Transactions",
          }}
        />
        <Stack.Screen
          name="transaction/[id]"
          options={{
            headerShown: true,
            title: "Transaction Details",
            headerBackTitle: "Transactions",
          }}
        />
        <Stack.Screen
          name="budgets"
          options={{
            headerShown: true,
            title: "Monthly Budget",
            headerBackTitle: "Home",
          }}
        />
        <Stack.Screen
          name="accounts"
          options={{ headerShown: true, title: "Accounts", headerBackTitle: "Home" }}
        />
        <Stack.Screen
          name="add-account"
          options={{
            headerShown: true,
            title: "Add Account",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="transfer"
          options={{
            headerShown: true,
            title: "Record Transfer",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="learning-path-details"
          options={{
            headerShown: true,
            title: "Money Skills",
            headerBackTitle: "Learn",
          }}
        />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <StatusBar style="light" />
    </BiometricGate>
  );
}
