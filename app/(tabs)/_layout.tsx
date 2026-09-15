// app/(tabs)/_layout.tsx
import { Redirect, Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Animated, Image, View } from "react-native";
import { supabase } from "../../utils/supabase";

function AnimatedTabIcon({
  source,
  focused,
}: {
  source: any;
  focused: boolean;
}) {
  const [scale] = useState(() => new Animated.Value(focused ? 1.1 : 1));

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1.1 : 1,
      useNativeDriver: true,
      tension: 120,
      friction: 10,
    }).start();
  }, [focused, scale]);

  return (
    <Animated.View
      style={{
        backgroundColor: focused ? "#00D09E" : "transparent",
        padding: 14,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ scale }, { translateY: focused ? -4 : 0 }],
        shadowColor: "#00D09E",
        shadowOpacity: focused ? 0.4 : 0,
        shadowRadius: 6,
        elevation: focused ? 6 : 0,
      }}
    >
      <Image
        source={source}
        style={{
          width: 28,
          height: 28,
          tintColor: "#093030",
        }}
      />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
      setCheckingSession(false);
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
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: "#00D09E",
        tabBarInactiveTintColor: "#093030",
        tabBarStyle: {
          backgroundColor: "#DFF7E2",
          height: 80,
          paddingTop: 20,
          borderTopWidth: 0.3,
          shadowOpacity: 0,
          elevation: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          position: "absolute",
          overflow: "hidden",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              source={require("../../assets/images/home-03.png")}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="edufinance"
        options={{
          title: "Learn",
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              source={require("../../assets/images/graduation-hat-02.png")}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="receiptscanner"
        options={{
          title: "Scanner",
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              source={require("../../assets/images/receipt-check.png")}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chatbot"
        options={{
          title: "Fin",
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              source={require("../../assets/images/Fin.png")}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <AnimatedTabIcon
              focused={focused}
              source={require("../../assets/images/user-02.png")}
            />
          ),
        }}
      />
    </Tabs>
  );
}
