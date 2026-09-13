import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../utils/supabase";

const PRIMARY = "#00D09E";
const CARD_BG = "#E9FFF4";

function computeStreak(dates: string[]): number {
  if (!dates.length) return 0;

  const sorted = [...dates].sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  );

  let streak = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);

    const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

type LearningPath = {
  id: string; // Assuming Supabase UUIDs. Change to 'number' if you used bigints.
  title: string;
  description: string;
  cover_image_url: string | null;
  totalModules: number;
  completedModules: number;
  isFullyComplete: boolean;
};

type Goal = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  week_start: string;
  completed: boolean;
  created_at: string;
};

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toISODateOnly(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export default function EduFinanceScreen() {
  const [learningPaths, setLearningPaths] = useState<LearningPath[]>([]);
  const [streakCount, setStreakCount] = useState(0);
  const router = useRouter();
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalNotes, setNewGoalNotes] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);

  const PATH_IMAGES: Record<string, any> = {
    "The 50/30/20 Rule": require("../../assets/images/credit card.png"),
    "The Emergency Fund": require("../../assets/images/safe box.png"),
    "Tracking Every Ringgit": require("../../assets/images/wallet with cash.png"),
  };

  const [selectedWeekStart] = useState<string>(
    toISODateOnly(getMonday(new Date())),
  );

  const loadGoals = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const { data, error } = await supabase
      .from("user_goals")
      .select("*")
      .eq("user_id", user.id)
      .gte("week_start", toISODateOnly(monthStart))
      .lt("week_start", toISODateOnly(monthEnd))
      .order("week_start", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.log("loadGoals error:", error.message);
      return;
    }

    setGoals((data as Goal[]) || []);
  }, []);

  const addGoal = useCallback(async () => {
    const title = newGoalTitle.trim();
    const notes = newGoalNotes.trim();
    if (!title) return;

    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    const payload = {
      user_id: user.id,
      title,
      notes: notes ? notes : null,
      week_start: selectedWeekStart,
      completed: false,
    };

    const { data, error } = await supabase
      .from("user_goals")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.log("addGoal error:", error.message);
      return;
    }

    setGoals((prev) => [data as Goal, ...prev]);
    setNewGoalTitle("");
    setNewGoalNotes("");
    setGoalModalVisible(false);
  }, [newGoalTitle, newGoalNotes, selectedWeekStart]);

  const toggleGoal = useCallback(async (goal: Goal) => {
    const nextCompleted = !goal.completed;

    setGoals((prev) =>
      prev.map((g) =>
        g.id === goal.id ? { ...g, completed: nextCompleted } : g,
      ),
    );

    const { error } = await supabase
      .from("user_goals")
      .update({ completed: nextCompleted })
      .eq("id", goal.id);

    if (error) {
      console.log("toggleGoal error:", error.message);
      setGoals((prev) =>
        prev.map((g) =>
          g.id === goal.id ? { ...g, completed: goal.completed } : g,
        ),
      );
    }
  }, []);

  const loadStreak = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user;

    if (authError || !user) {
      console.log("No user for streak:", authError);
      setStreakCount(0);
      return;
    }

    const { data, error } = await supabase
      .from("user_streaks")
      .select("date")
      .eq("user_id", user.id)
      .order("date", { ascending: false });

    if (error) {
      console.log("Error loading streaks:", error);
      setStreakCount(0);
      return;
    }

    const dates = (data || []).map((row) => row.date as string);
    const streak = computeStreak(dates);
    setStreakCount(streak);
  }, []);

  const loadLearningPaths = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData?.user;
    if (!user) return;

    const today = new Date().toISOString();

    const { data: pathsData, error: pathsError } = await supabase
      .from("learning_paths")
      .select(
        `
        id, 
        title, 
        description, 
        cover_image_url,
        learning_modules ( id )
      `,
      )
      .eq("is_published", true)
      .lte("publish_date", today)
      .order("publish_date", { ascending: false });

    if (pathsError) {
      console.log("Error fetching paths:", pathsError);
      return;
    }

    const { data: progressData } = await supabase
      .from("user_path_progress")
      .select("module_id")
      .eq("user_id", user.id);

    const completedModuleIds = new Set(
      (progressData || []).map((p) => p.module_id),
    );

    const enrichedPaths = (pathsData || []).map((path) => {
      const totalModules = path.learning_modules.length;
      const completedModules = path.learning_modules.filter((m) =>
        completedModuleIds.has(m.id),
      ).length;

      return {
        ...path,
        totalModules,
        completedModules,
        isFullyComplete: totalModules > 0 && totalModules === completedModules,
      };
    });

    setLearningPaths(enrichedPaths);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadGoals();
      loadStreak();
      loadLearningPaths(); // We will add this function next
    }, [loadGoals, loadStreak, loadLearningPaths]),
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>EduFinance</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.innerContainer}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionTitle}>Create A Streak Going!</Text>
            <TaskCard
              title="Streaks!"
              description={
                streakCount > 0
                  ? `Current streak: ${streakCount} day${streakCount > 1 ? "s" : ""}`
                  : "Complete at least 1 task today to start your streak!"
              }
              image={require("../../assets/images/fire flame-png 1.png")}
              multiline
              imageStyle={{ width: 40, height: 40 }}
              showCircle={false}
            />

            <View style={{ marginTop: 18 }}>
              <View style={styles.goalHeaderRow}>
                <Text style={styles.sectionTitle}>Goals</Text>

                <TouchableOpacity
                  style={styles.setGoalsBtn}
                  onPress={() => setGoalModalVisible(true)}
                >
                  <Text style={styles.setGoalsBtnText}>Set your goals</Text>
                </TouchableOpacity>
              </View>

              {goals.length === 0 ? (
                <Text style={styles.goalEmptyText}>
                  No goals yet. Set one to start building better habits 💪
                </Text>
              ) : (
                <View style={styles.goalList}>
                  {goals.map((goal) => (
                    <TouchableOpacity
                      key={goal.id}
                      style={[
                        styles.goalCard,
                        goal.completed && styles.goalCardCompleted,
                      ]}
                      onPress={() => toggleGoal(goal)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.goalCardLeft}>
                        <View
                          style={[
                            styles.goalCheck,
                            goal.completed && styles.goalCheckOn,
                          ]}
                        >
                          {goal.completed ? (
                            <Text style={styles.goalCheckMark}>✓</Text>
                          ) : null}
                        </View>
                      </View>

                      <View style={styles.goalCardBody}>
                        <Text
                          style={[
                            styles.goalTitle,
                            goal.completed && styles.goalTitleCompleted,
                          ]}
                        >
                          {goal.title}
                        </Text>

                        <Text style={styles.goalWeekText}>
                          Week of {goal.week_start}
                        </Text>

                        {goal.notes ? (
                          <Text
                            style={[
                              styles.goalNotes,
                              goal.completed && styles.goalNotesCompleted,
                            ]}
                          >
                            {goal.notes}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <Modal
              visible={goalModalVisible}
              transparent
              animationType="fade"
              onRequestClose={() => setGoalModalVisible(false)}
            >
              <View style={styles.goalModalOverlay}>
                <View style={styles.goalModalCard}>
                  <Text style={styles.goalModalTitle}>Set a new goal</Text>

                  <TextInput
                    value={newGoalTitle}
                    onChangeText={setNewGoalTitle}
                    placeholder="Goal title (e.g., Save RM200)"
                    style={styles.goalModalInput}
                    placeholderTextColor="#9CA3AF"
                  />

                  <TextInput
                    value={newGoalNotes}
                    onChangeText={setNewGoalNotes}
                    placeholder="Notes (optional)"
                    style={[styles.goalModalInput, { height: 80 }]}
                    placeholderTextColor="#9CA3AF"
                    multiline
                  />

                  <View style={styles.goalModalBtnRow}>
                    <TouchableOpacity
                      style={[styles.goalModalBtn, styles.goalModalBtnGhost]}
                      onPress={() => setGoalModalVisible(false)}
                    >
                      <Text style={styles.goalModalBtnGhostText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.goalModalBtn}
                      onPress={addGoal}
                    >
                      <Text style={styles.goalModalBtnText}>Add goal</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>

            <Text style={styles.subtitle}>Learning Paths</Text>

            {learningPaths.length === 0 ? (
              <Text style={styles.goalEmptyText}>
                Loading financial modules...
              </Text>
            ) : (
              learningPaths.map((path) => (
                <TaskCard
                  key={path.id}
                  title={path.title}
                  description={
                    path.isFullyComplete
                      ? "🎉 Path Completed!"
                      : `${path.completedModules} of ${path.totalModules} modules finished`
                  }
                  image={
                    PATH_IMAGES[path.title] ||
                    require("../../assets/images/safe box.png")
                  }
                  onPress={() =>
                    router.push({
                      pathname: "/learning-path-details",
                      params: { pathId: path.id, title: path.title },
                    })
                  }
                />
              ))
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type TaskCardProps = {
  title: string;
  description: string;
  image: any;
  imageStyle?: any;
  multiline?: boolean;
  showCircle?: boolean;
  onPress?: () => void;
};

const TaskCard: React.FC<TaskCardProps> = ({
  title,
  description,
  multiline,
  image,
  imageStyle,
  showCircle = true,
  onPress,
}) => {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <View style={styles.card}>
        <View style={styles.imageWrapper}>
          <Image source={image} style={[styles.cardImage, imageStyle]} />
        </View>

        <View style={styles.cardTextContainer}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text
            style={[styles.cardDescription, multiline && { width: "90%" }]}
            numberOfLines={multiline ? 3 : 1}
          >
            {description}
          </Text>
        </View>

        {showCircle ? (
          <View style={styles.arrowWrapper}>
            <Ionicons name="chevron-forward" size={20} color="#2F80ED" />
          </View>
        ) : (
          <View style={styles.circleSpacer} />
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY,
  },
  header: {
    flexDirection: "column",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 25,
    paddingTop: 25,
    justifyContent: "space-between",
  },
  headerTitle: {
    color: "#052224",
    fontSize: 18,
    fontWeight: "700",
  },
  innerContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    overflow: "hidden",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  subtitle: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "#0E3E3E",
    marginBottom: 24,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0E3E3E",
    marginBottom: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  imageWrapper: {
    width: 70,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#16302A",
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 12,
    color: "#6B7A7A",
  },
  cardImage: {
    width: 80,
    height: 80,
    resizeMode: "cover",
  },
  circleSpacer: {
    width: 24,
    height: 24,
    marginLeft: 8,
  },
  arrowWrapper: {
    width: 24,
    height: 24,
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    marginBottom: 24,
  },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E9FFF4",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  badgeEmoji: {
    fontSize: 16,
  },
  badgeName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#16302A",
  },
  badgeDescription: {
    fontSize: 10,
    color: "#4A5B5B",
  },
  badgeHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 6,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2F80ED",
  },
  badgeProgressText: {
    fontSize: 11,
    color: "#4A5B5B",
    marginBottom: 4,
  },
  badgeProgressBar: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#E3EBEB",
    overflow: "hidden",
    marginBottom: 10,
  },
  badgeProgressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#00D09E",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#052224",
  },
  modalScrollContent: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  modalBadgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  modalBadgeCard: {
    width: "48%",
    backgroundColor: "#E9FFF4",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  modalBadgeEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  modalBadgeName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16302A",
    textAlign: "center",
    marginBottom: 4,
  },
  modalBadgeDescription: {
    fontSize: 11,
    color: "#4A5B5B",
    textAlign: "center",
  },
  modalEmptyState: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  modalEmptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  modalEmptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#16302A",
    marginBottom: 4,
  },
  modalEmptyText: {
    fontSize: 12,
    color: "#4A5B5B",
    textAlign: "center",
  },
  moreBadgesText: {
    marginTop: 6,
    fontSize: 12,
    color: "#6B7280",
    textAlign: "right",
  },
  goalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  setGoalsBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#00D09E",
  },
  setGoalsBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  goalEmptyText: {
    color: "#6B7280",
    fontSize: 13,
    marginTop: 6,
  },
  goalList: {
    gap: 10,
  },
  goalCard: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 20,
  },
  goalCardCompleted: {
    opacity: 0.75,
  },
  goalCardLeft: {
    marginRight: 10,
    justifyContent: "center",
  },
  goalCheck: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
  },
  goalCheckOn: {
    borderColor: "#16A34A",
    backgroundColor: "#16A34A",
  },
  goalCheckMark: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    marginTop: -1,
  },
  goalCardBody: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  goalTitleCompleted: {
    textDecorationLine: "line-through",
    color: "#6B7280",
  },
  goalNotes: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
  },
  goalNotesCompleted: {
    textDecorationLine: "line-through",
  },
  goalModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 18,
  },
  goalModalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
  },
  goalModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
    color: "#111827",
  },
  goalModalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: "#111827",
    marginBottom: 10,
  },
  goalModalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  goalModalBtn: {
    backgroundColor: "#00D09E",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  goalModalBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  goalModalBtnGhost: {
    backgroundColor: "#F3F4F6",
  },
  goalModalBtnGhostText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 13,
  },
  goalWeekText: {
    marginTop: 2,
    fontSize: 11,
    color: "#9CA3AF",
  },
});
