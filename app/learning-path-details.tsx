import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../utils/supabase";

function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const { width } = Dimensions.get("window");
const PRIMARY = "#00D09E";

export default function LearningPathDetailsScreen() {
  const router = useRouter();
  const { pathId, title } = useLocalSearchParams();

  const [modules, setModules] = useState<any[]>([]);
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  const scrollRef = useRef<ScrollView>(null);

  const loadModules = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    // 1. Fetch modules for this specific path
    const { data: moduleData, error: moduleError } = await supabase
      .from("learning_modules")
      .select("*")
      .eq("path_id", pathId)
      .order("sort_order", { ascending: true });

    if (moduleError || !moduleData) {
      console.log("Error loading modules:", moduleError);
      setLoading(false);
      return;
    }

    // 2. Fetch user progress
    const { data: progressData } = await supabase
      .from("user_path_progress")
      .select("module_id")
      .eq("user_id", user.id);

    const completedIds = new Set((progressData || []).map((p) => p.module_id));

    // 3. Find where the user left off
    let nextUnfinishedIndex = 0;
    let allCompleted = true;

    for (let i = 0; i < moduleData.length; i++) {
      if (!completedIds.has(moduleData[i].id)) {
        nextUnfinishedIndex = i;
        allCompleted = false;
        break;
      }
    }

    // If they finished everything, let them review from the beginning
    setModules(moduleData);
    setActiveModuleIndex(allCompleted ? 0 : nextUnfinishedIndex);
    setLoading(false);
  }, [pathId]);

  useEffect(() => {
    loadModules();
  }, [loadModules]);

  const markModuleComplete = async (skipNavigation = false) => {
    const currentModule = modules[activeModuleIndex];
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    // Save progress to Supabase
    await supabase.from("user_path_progress").upsert(
      {
        user_id: user.id,
        module_id: currentModule.id,
      },
      { onConflict: "user_id,module_id" },
    );

    // 🔥 STREAK LOGIC: If this is the last module, award the streak!
    if (activeModuleIndex === modules.length - 1) {
      await awardStreakIfNeeded(user.id);
    }

    // Move to next module or finish
    if (activeModuleIndex < modules.length - 1) {
      setActiveModuleIndex((prev) => prev + 1);
      setCurrentSlideIndex(0);
    } else if (!skipNavigation) {
      router.back();
    }
  };

  const awardStreakIfNeeded = async (userId: string) => {
    const today = getTodayDateString();

    // Check if they already earned a streak today
    const { data: existing, error: existingError } = await supabase
      .from("user_streaks")
      .select("id")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();

    if (existingError) {
      console.log("Error checking streak:", existingError);
      return;
    }

    // If they already have a streak for today, do nothing
    if (existing) return;

    // Otherwise, insert a new streak record
    const { error: insertError } = await supabase
      .from("user_streaks")
      .insert({ user_id: userId, date: today });

    if (insertError) {
      console.log("Error inserting streak:", insertError);
    } else {
      console.log("🔥 Daily streak recorded for", today);
    }
  };

  const handleScroll = (event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    setCurrentSlideIndex(Math.round(index));
  };

  const renderActiveModule = () => {
    if (modules.length === 0)
      return <Text style={styles.emptyText}>No modules found.</Text>;

    const currentModule = modules[activeModuleIndex];

    // --- LESSON RENDERER ---
    if (currentModule.module_type === "lesson") {
      const lessonData = currentModule.content_payload;
      const slides = lessonData?.slides || [];

      return (
        <View style={styles.moduleContainer}>
          <Text style={styles.moduleTitle}>{currentModule.title}</Text>

          <View style={styles.carouselContainer}>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
            >
              {slides.map((slide: any, index: number) => (
                <View key={index} style={styles.slide}>
                  <Text style={styles.slideTitle}>{slide.title}</Text>
                  <Text style={styles.slideBody}>{slide.body}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Pagination Dots */}
          <View style={styles.pagination}>
            {slides.map((_: any, index: number) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  currentSlideIndex === index ? styles.activeDot : null,
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              if (currentSlideIndex < slides.length - 1) {
                // Go to next slide
                scrollRef.current?.scrollTo({
                  x: (currentSlideIndex + 1) * width,
                  animated: true,
                });
              } else {
                // Finish lesson
                markModuleComplete();
              }
            }}
          >
            <Text style={styles.actionButtonText}>
              {currentSlideIndex < slides.length - 1
                ? "Next Slide"
                : "Complete Lesson"}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // --- ACTION RENDERER ---
    if (currentModule.module_type === "action") {
      return (
        <View style={styles.moduleContainer}>
          <View style={styles.actionHero}>
            <Text style={styles.actionHeroEmoji}>🎯</Text>
            <Text style={styles.moduleTitle}>{currentModule.title}</Text>
            <Text style={styles.slideBody}>
              It&apos;s time to put your knowledge into practice.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={async () => {
              // Pass 'true' to prevent the automatic router.back()
              await markModuleComplete(true);

              switch (currentModule.action_trigger) {
                case "set_goal":
                  router.push("/edufinance");
                  break;
                case "scan_receipt":
                  router.push("/receiptscanner");
                  break;
                case "set_budget":
                  router.push("/");
                  break;
                default:
                  router.back();
              }
            }}
          >
            <Text style={styles.actionButtonText}>Take Action</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={28} color="#093030" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title || "Learning Path"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          Step {activeModuleIndex + 1} of {modules.length}
        </Text>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${modules.length > 0 ? ((activeModuleIndex + 1) / modules.length) * 100 : 0}%`,
              },
            ]}
          />
        </View>
      </View>

      {/* Content Area */}
      <View style={styles.innerContainer}>
        {loading ? (
          <Text style={styles.emptyText}>Loading module...</Text>
        ) : (
          renderActiveModule()
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    alignItems: "flex-start",
  },
  headerTitle: {
    color: "#093030",
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  progressText: {
    color: "#093030",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 3,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#093030",
    borderRadius: 3,
  },
  innerContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 24,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 40,
    color: "#6B7280",
  },
  moduleContainer: {
    flex: 1,
  },
  moduleTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 20,
    textAlign: "center",
  },
  carouselContainer: {
    height: 300,
    backgroundColor: "#F9FAFB",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  slide: {
    width: width - 48, // screen width minus padding
    padding: 24,
    justifyContent: "center",
  },
  slideTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 12,
  },
  slideBody: {
    fontSize: 15,
    color: "#4B5563",
    lineHeight: 24,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 30,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D1D5DB",
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: PRIMARY,
    width: 20,
  },
  actionButton: {
    backgroundColor: PRIMARY,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: "auto",
    marginBottom: 20,
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  actionHero: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  actionHeroEmoji: {
    fontSize: 60,
    marginBottom: 20,
  },
});
