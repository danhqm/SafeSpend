import { Redirect, Tabs } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeSpendTabBar } from "../../components/safe-spend-tab-bar";
import { homeCache } from "../../utils/home-cache";
import { getSavedUserId } from "../../utils/offline-session";
import { supabase } from "../../utils/supabase";

export default function TabsLayout() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void getSavedUserId()
      .then(({ userId }) => {
        if (!active) return;
        lastUserId.current = userId;
        setSignedIn(Boolean(userId));
        setCheckingSession(false);
      })
      .catch(() => {
        if (active) setCheckingSession(false);
      });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        if (lastUserId.current) void homeCache.clearUser(lastUserId.current).catch(() => {});
        lastUserId.current = null;
        setSignedIn(false);
        setCheckingSession(false);
      } else if (session?.user.id) {
        lastUserId.current = session.user.id;
        setSignedIn(true);
        setCheckingSession(false);
      }
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
