import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { OnboardingReceipt } from "../components/onboarding-receipt";

const pages = [
  {
    id: "mint-welcome",
    title: "Your money.\nYour next chapter.",
    body: "Master your money and design your future, one step at a time.",
  },
  {
    id: "receipt-focus",
    title: "Every receipt.\nA clearer picture.",
    body: "Turn everyday purchases into spending you can understand.",
  },
] as const;

export default function Onboarding() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const listRef = useRef<FlatList<(typeof pages)[number]>>(null);
  const selectedPage = useRef(0);
  const primaryButtons = useRef<(View | null)[]>([]);
  const focusAfterPaging = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const pageWidth = width - insets.left - insets.right;
  const availableHeight = height - insets.top;
  const compact = availableHeight < 760;
  const artHeight = compact ? Math.min(245, availableHeight * 0.36) : 310;
  const contentWidth = Math.min(pageWidth, 460);
  const narrow = contentWidth < 350;
  const horizontalPadding = narrow ? 22 : 28;

  // Keep the selected page aligned when the window or safe area changes.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: selectedPage.current * pageWidth, animated: false });
  }, [pageWidth]);

  useEffect(() => {
    if (!focusAfterPaging.current) return;
    focusAfterPaging.current = false;
    if (Platform.OS === "web") {
      const button = primaryButtons.current[currentIndex] as unknown as
        { focus: (options: { preventScroll: boolean }) => void } | null;
      button?.focus({ preventScroll: true });
    }
  }, [currentIndex]);

  const goToPage = (index: number) => {
    focusAfterPaging.current = index !== selectedPage.current;
    selectedPage.current = index;
    setCurrentIndex(index);
    listRef.current?.scrollToOffset({ offset: index * pageWidth, animated: !reduceMotion });
  };

  const updatePage = (offset: number) => {
    const index = Math.max(0, Math.min(1, Math.round(offset / pageWidth)));
    selectedPage.current = index;
    setCurrentIndex(index);
  };

  const footer = (index: number) => (
    <View style={[styles.footer, compact && styles.compactFooter,
      { paddingBottom: Math.max(insets.bottom, 16) }]}>
      {index === 1 && <Text style={styles.promise}>Scan it. Review it. Keep it.</Text>}
      <View style={[styles.progress, compact && styles.compactProgress]}>
        {pages.map((page, dotIndex) => (
          <Pressable key={page.id} accessibilityRole="button"
            tabIndex={currentIndex === index ? 0 : -1}
            accessibilityLabel={`Go to onboarding page ${dotIndex + 1}`}
            accessibilityState={{ selected: index === dotIndex }}
            onPress={() => goToPage(dotIndex)}
            style={({ pressed }) => [styles.dotTarget, pressed && styles.pressed]}>
            <View style={[styles.dot, index === dotIndex && styles.activeDot]} />
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={index === 0 ? "Next" : "Get started"}
        ref={(node) => { primaryButtons.current[index] = node; }}
        tabIndex={currentIndex === index ? 0 : -1}
        onPress={() => index === 0 ? goToPage(1) : router.push("/landing")}
        style={({ pressed }) => [styles.primary, compact && styles.compactPrimary,
          pressed && styles.pressed]}>
        <Text style={styles.primaryText}>{index === 0 ? "Next" : "Get started"}</Text>
        <Feather name="arrow-right" size={20} color="#0E3E3E" />
      </Pressable>
      {index === 1 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Mint Welcome"
          tabIndex={currentIndex === index ? 0 : -1}
          onPress={() => goToPage(0)}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Feather name="arrow-left" size={15} color="#0E3E3E" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      ) : <View style={styles.footerSpace} />}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, currentIndex === 0 && styles.mintBackground]}
      edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <FlatList ref={listRef} data={pages} horizontal pagingEnabled bounces={false}
        showsHorizontalScrollIndicator={false}
        extraData={{ compact, contentWidth, availableHeight, currentIndex, bottom: insets.bottom }}
        keyExtractor={(item) => item.id}
        getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
        onMomentumScrollEnd={(event) => updatePage(event.nativeEvent.contentOffset.x)}
        onScrollEndDrag={(event) => {
          // Reduced-motion navigation and web dragging may finish without momentum.
          if (!event.nativeEvent.velocity?.x) updatePage(event.nativeEvent.contentOffset.x);
        }}
        renderItem={({ item, index }) => (
          <View style={[styles.page, { width: pageWidth, height: availableHeight }, index === 0 && styles.mintBackground]}
            aria-hidden={currentIndex !== index}>
            <ScrollView style={{ flex: 1, width: contentWidth, alignSelf: "center" }}
              contentContainerStyle={{ minHeight: availableHeight, flexGrow: 1 }}
              showsVerticalScrollIndicator={false} bounces={false}
              accessibilityElementsHidden={currentIndex !== index}
              importantForAccessibility={currentIndex === index ? "auto" : "no-hide-descendants"}>
              <View style={[styles.topbar, { paddingHorizontal: horizontalPadding }]}>
                <View style={styles.brand} accessibilityLabel="SafeSpend">
                  <Image source={index === 0
                    ? require("../assets/images/RiseFund-Dark.png")
                    : require("../assets/images/RiseFund-Light.png")}
                    style={styles.brandMark} contentFit="contain" accessible={false} />
                  <Text style={[styles.brandText, narrow && styles.narrowBrand]}>SafeSpend</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityHint="Go directly to login"
                  tabIndex={currentIndex === index ? 0 : -1}
                  onPress={() => router.replace("/login")}
                  style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
                  <Text style={styles.skipText}>Skip</Text>
                </Pressable>
              </View>
              {index === 0 ? (
                <>
                  <View style={[styles.mintArt, { height: artHeight }]}>
                    <View style={[styles.halo, { width: Math.min(250, artHeight - 20),
                      height: Math.min(250, artHeight - 20) }]} />
                    <Image source={require("../assets/images/coinhand.png")}
                      accessibilityLabel="Golden coins falling into an open hand"
                      style={[styles.coinHand, {
                        width: Math.min(contentWidth - 45, compact ? 275 : 327),
                        height: compact ? artHeight : 316,
                      }]} contentFit="contain" />
                  </View>
                  <View style={[styles.mintSheet, compact && styles.compactSheet,
                    { paddingHorizontal: horizontalPadding }]}>
                    <Text accessibilityRole="header" style={[styles.title, styles.centered,
                      (compact || narrow) && styles.smallTitle]}>{item.title}</Text>
                    <Text style={[styles.body, styles.centeredBody, compact && styles.smallBody]}>{item.body}</Text>
                    {footer(index)}
                  </View>
                </>
              ) : (
                <View style={[styles.receiptMain, compact && styles.compactReceiptMain,
                  { paddingHorizontal: horizontalPadding }]}>
                  <Text accessibilityRole="header" style={[styles.title, styles.receiptTitle,
                    (compact || narrow) && styles.smallTitle]}>{item.title}</Text>
                  <Text style={[styles.body, styles.receiptBody, compact && styles.smallBody]}>{item.body}</Text>
                  <OnboardingReceipt compact={compact} />
                  {footer(index)}
                </View>
              )}
            </ScrollView>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F1FFF3" },
  mintBackground: { backgroundColor: "#00D09E" },
  page: { flex: 1, backgroundColor: "#F1FFF3" },
  topbar: { minHeight: 60, paddingVertical: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexShrink: 1, marginRight: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  brandMark: { width: 25, height: 28 },
  brandText: { flexShrink: 1, fontFamily: "Poppins_700Bold", fontSize: 20, letterSpacing: -0.6, color: "#0E3E3E" },
  narrowBrand: { fontSize: 18 },
  skip: { minWidth: 48, minHeight: 48, alignItems: "flex-end", justifyContent: "center" },
  skipText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#0E3E3E" },
  mintArt: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  halo: { position: "absolute", top: 24, borderRadius: 125, backgroundColor: "#DFF7E2" },
  coinHand: { marginTop: 4, transform: [{ rotate: "-5deg" }] },
  mintSheet: { flexGrow: 1, minHeight: 365, paddingTop: 33,
    borderTopLeftRadius: 40, borderTopRightRadius: 40, backgroundColor: "#F1FFF3" },
  compactSheet: { minHeight: 0, paddingTop: 24 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 30, lineHeight: 39,
    letterSpacing: -0.8, color: "#0E3E3E" },
  centered: { textAlign: "center" },
  smallTitle: { fontSize: 28, lineHeight: 36 },
  body: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 24.5, color: "#617470", marginTop: 13 },
  centeredBody: { maxWidth: 290, alignSelf: "center", textAlign: "center" },
  smallBody: { fontSize: 13, lineHeight: 23 },
  receiptMain: { flexGrow: 1, paddingTop: 30 },
  compactReceiptMain: { paddingTop: 18 },
  receiptTitle: { fontSize: 32, lineHeight: 41, letterSpacing: -1 },
  receiptBody: { maxWidth: 285 },
  footer: { marginTop: "auto", paddingTop: 22, alignItems: "center", width: "100%" },
  compactFooter: { paddingTop: 12 },
  promise: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 19, color: "#617470", marginBottom: 12 },
  progress: { flexDirection: "row", gap: 2, marginBottom: 18 },
  compactProgress: { marginBottom: 12 },
  dotTarget: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#C5DDD3" },
  activeDot: { width: 24, backgroundColor: "#087D65" },
  primary: { width: "100%", minHeight: 56, paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 28, backgroundColor: "#00D09E", flexDirection: "row", gap: 13,
    alignItems: "center", justifyContent: "center" },
  compactPrimary: { minHeight: 52, paddingVertical: 12 },
  primaryText: { fontFamily: "Poppins_700Bold", fontSize: 16, color: "#0E3E3E" },
  back: { minHeight: 48, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 12, marginTop: 6 },
  backText: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#0E3E3E" },
  footerSpace: { height: 54 },
  pressed: { opacity: 0.7 },
});
