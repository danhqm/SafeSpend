import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

const onboardingData = [
  {
    id: "1",
    title: "Welcome To SafeSpend",
    image: require("../assets/images/coinhand.png"),
    circleColor: "#DFF7E2",
  },
  {
    id: "2",
    title: "Are You Ready To Take Control Of Your Finance?",
    image: require("../assets/images/bankhand.png"),
    circleColor: "#CDE6D8",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const listRef = useRef<FlatList<(typeof onboardingData)[number]>>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useSharedValue(0);
  const illustrationSize = Math.min(width - 96, height * 0.32, 280);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });
  const progressStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          scrollX.value,
          [0, width * (onboardingData.length - 1)],
          [0, 32 * (onboardingData.length - 1)],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const updatePage = (offset: number) => {
    setCurrentIndex(
      Math.max(0, Math.min(onboardingData.length - 1, Math.round(offset / width)))
    );
  };

  const handleContinue = () => {
    if (currentIndex < onboardingData.length - 1) {
      const nextIndex = currentIndex + 1;
      listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setCurrentIndex(nextIndex);
    } else {
      router.push("/landing");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <Animated.FlatList
        ref={listRef}
        data={onboardingData}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollEndDrag={(event) => updatePage(event.nativeEvent.contentOffset.x)}
        onMomentumScrollEnd={(event) => updatePage(event.nativeEvent.contentOffset.x)}
        renderItem={({ item }) => (
          <View style={[styles.page, { width }]}>
            <View style={styles.hero}>
              <Text style={styles.title}>{item.title}</Text>
            </View>
            <View style={styles.card}>
              <View
                style={[
                  styles.imageHalo,
                  {
                    width: illustrationSize,
                    height: illustrationSize,
                    borderRadius: illustrationSize / 2,
                    backgroundColor: item.circleColor,
                  },
                ]}
              >
                <Image
                  source={item.image}
                  style={{ width: illustrationSize, height: illustrationSize }}
                  contentFit="contain"
                />
              </View>
            </View>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(bottom, 16) }]}>
        <View
          style={styles.progressTrack}
          accessible
          accessibilityLabel={`Page ${currentIndex + 1} of ${onboardingData.length}`}
        >
          {onboardingData.map((item) => (
            <View key={item.id} style={styles.progressSlot}>
              <View style={styles.dot} />
            </View>
          ))}
          <Animated.View style={[styles.activeDot, progressStyle]} />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={handleContinue}
          style={styles.continueButton}
        >
          <Animated.Text
            key={currentIndex}
            entering={FadeIn.duration(180)}
            style={styles.continueText}
          >
            {currentIndex === onboardingData.length - 1 ? "Continue" : "Next"}
          </Animated.Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#00D09E" },
  page: { flex: 1, backgroundColor: "#00D09E" },
  hero: {
    flex: 0.9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 20,
  },
  title: {
    maxWidth: 350,
    color: "#0E3E3E",
    fontFamily: "Poppins_700Bold",
    fontSize: 28,
    lineHeight: 38,
    textAlign: "center",
  },
  card: {
    flex: 1.1,
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    backgroundColor: "#F1FFF3",
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  imageHalo: { alignItems: "center", justifyContent: "center" },
  footer: {
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 28,
    paddingTop: 16,
    backgroundColor: "#F1FFF3",
  },
  progressTrack: { flexDirection: "row", gap: 12, height: 12, alignItems: "center" },
  progressSlot: { width: 20, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#C5DDD3" },
  activeDot: {
    position: "absolute",
    left: 0,
    width: 20,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00B98C",
  },
  continueButton: {
    width: "100%",
    maxWidth: 400,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    backgroundColor: "#00D09E",
  },
  continueText: {
    color: "#0E3E3E",
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
  },
});
