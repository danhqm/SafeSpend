// app/_layout.tsx
import {
  Poppins_400Regular,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-url-polyfill/auto";
import { BiometricGate } from "../components/biometric-gate";
import { BrandSplash } from "../components/brand-splash";
import { ScreenBackButton } from "../components/screen-back-button";
import { goBackOrReplace } from "../utils/back-navigation";
import { screenColors } from "../utils/screen-theme";

const backRoutes: Record<string, '/accounts' | '/(tabs)/edufinance' | '/(tabs)'> = {
  'add-account': '/accounts',
  transfer: '/accounts',
  'learning-path-details': '/(tabs)/edufinance',
};

export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_700Bold,
  });

  if (!fontsLoaded) {
    return <BrandSplash />;
  }

  return (
    <BiometricGate>
      <Stack screenOptions={({ route }) => ({
        headerShown: false,
        headerStyle: { backgroundColor: screenColors.teal },
        headerTintColor: screenColors.surface,
        headerTitleStyle: { fontFamily: 'Poppins_700Bold', fontSize: 18 },
        headerTitleAlign: 'left',
        headerShadowVisible: false,
        headerBackVisible: false,
        headerLeft: () => <ScreenBackButton onPress={() => goBackOrReplace(router, backRoutes[route.name] ?? '/(tabs)')} />,
      })}>
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
          }}
        />
        <Stack.Screen
          name="transaction/[id]"
          options={{
            headerShown: true,
            title: "Transaction Details",
          }}
        />
        <Stack.Screen
          name="budgets"
          options={{
            headerShown: true,
            title: "Monthly Budget",
          }}
        />
        <Stack.Screen
          name="accounts"
          options={{ headerShown: true, title: "Accounts" }}
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
          }}
        />
        <Stack.Screen name="tax-filing" />
        <Stack.Screen name="tax-estimate" />
        <Stack.Screen name="tax-business" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <StatusBar style="light" />
    </BiometricGate>
  );
}
