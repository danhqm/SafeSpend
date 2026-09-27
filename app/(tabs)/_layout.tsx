import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeSpendTabBar } from "../../components/safe-spend-tab-bar";
import { supabase } from "../../utils/supabase";

export default function TabsLayout() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSignedIn(Boolean(data.session));
        setCheckingSession(false);
      })
      .catch(() => {
        if (active) setCheckingSession(false);
      });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      setCheckingSession(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (checkingSession) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#00D09E" />
      </View>
    );
  }

  if (!signedIn) return <Redirect href="/login" />;

  return (
    <Tabs
      tabBar={(props) => <SafeSpendTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="edufinance" options={{ title: "Learn" }} />
      <Tabs.Screen name="receiptscanner" options={{ title: "Scan" }} />
      <Tabs.Screen name="chatbot" options={{ title: "Fin" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
