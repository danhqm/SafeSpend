import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { useEffect, useState } from "react";
import { Animated, Keyboard, Pressable, StyleSheet, Text, View } from "react-native";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];
type IconName = ComponentProps<typeof Ionicons>["name"];

const TAB_ICONS: Record<string, { idle: IconName; active: IconName }> = {
  index: { idle: "home-outline", active: "home" },
  edufinance: { idle: "school-outline", active: "school" },
  receiptscanner: { idle: "scan-outline", active: "scan" },
  chatbot: {
    idle: "chatbubble-ellipses-outline",
    active: "chatbubble-ellipses",
  },
  profile: { idle: "person-outline", active: "person" },
};

function TabItem({
  label,
  icon,
  focused,
  isScan,
  onPress,
  onLongPress,
}: {
  label: string;
  icon: IconName;
  focused: boolean;
  isScan: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const [progress] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      tension: 140,
      friction: 12,
    }).start();
  }, [focused, progress]);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.tab, isScan && styles.scanTab]}
    >
      {isScan ? (
        <Animated.View
          style={[
            styles.scanCircle,
            {
              transform: [
                {
                  scale: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.08],
                  }),
                },
              ],
            },
          ]}
        >
          <Ionicons name={icon} size={27} color="#0E3E3E" />
        </Animated.View>
      ) : (
        <>
          <Animated.View
            style={[
              styles.activeMark,
              {
                opacity: progress,
                transform: [
                  {
                    scaleX: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 1],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={{
              transform: [
                {
                  scale: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.08],
                  }),
                },
              ],
            }}
          >
            <Ionicons
              name={icon}
              size={23}
              color={focused ? "#00D09E" : "#A9C9BE"}
            />
          </Animated.View>
        </>
      )}
      <Text style={[styles.label, focused && styles.activeLabel]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SafeSpendTabBar({ state, descriptors, navigation, insets }: TabBarProps) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const safeAreaColor = state.routes[state.index]?.name === "edufinance"
    ? "#F4F8F6"
    : "#FFFFFF";

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    const willShow = Keyboard.addListener("keyboardWillShow", () => setKeyboardVisible(true));
    return () => {
      show.remove();
      hide.remove();
      willShow.remove();
    };
  }, []);

  if (keyboardVisible) return null;

  return (
    <>
      <View
        pointerEvents="none"
        style={[styles.bottomSafeArea, {
          height: Math.max(insets.bottom, 10),
          backgroundColor: safeAreaColor,
        }]}
      />
      <View
        pointerEvents="box-none"
        style={[styles.positioner, { bottom: Math.max(insets.bottom - 10, 10) }]}
      >
        <View style={styles.dock}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const title = descriptors[route.key].options.title;
            const label = typeof title === "string" ? title : route.name;
            const isScan = route.name === "receiptscanner";
            const icons = TAB_ICONS[route.name] ?? TAB_ICONS.index;

            return (
              <TabItem
                key={route.key}
                label={label}
                icon={focused ? icons.active : icons.idle}
                focused={focused}
                isScan={isScan}
                onPress={() => {
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    if (process.env.EXPO_OS === "ios") {
                      void Haptics.selectionAsync().catch(() => {});
                    }
                    navigation.navigate(route.name);
                  }
                }}
                onLongPress={() =>
                  navigation.emit({ type: "tabLongPress", target: route.key })
                }
              />
            );
          })}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bottomSafeArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  positioner: {
    position: "absolute",
    left: 14,
    right: 14,
    height: 78,
  },
  dock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#24594F",
    backgroundColor: "#0E3E3E",
    boxShadow: "0 8px 22px rgba(4, 42, 38, 0.26)",
    overflow: "visible",
    paddingHorizontal: 5,
  },
  tab: {
    flex: 1,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  scanTab: { transform: [{ translateY: -13 }] },
  scanCircle: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    borderWidth: 4,
    borderColor: "#0E3E3E",
    backgroundColor: "#00D09E",
    boxShadow: "0 4px 12px rgba(0, 208, 158, 0.35)",
  },
  activeMark: {
    position: "absolute",
    top: 5,
    width: 25,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#00D09E",
  },
  label: {
    color: "#A9C9BE",
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    lineHeight: 15,
  },
  activeLabel: { color: "#00D09E", fontFamily: "Poppins_700Bold" },
});
