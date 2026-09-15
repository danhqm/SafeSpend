// app/_layout.tsx
import {
  Poppins_400Regular,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import "react-native-url-polyfill/auto";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#00D09E" />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="splashscreen" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="landing" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
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
        <Stack.Screen name="(tabs)" />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
