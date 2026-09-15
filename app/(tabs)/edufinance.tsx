import { WeeklyMoneyMissionCard } from "@/components/weekly-money-mission-card";
import {
  computeLearningStreak,
  getLocalMonday,
  localLearningDate,
  missionFromAssignment,
  type LearningModuleType,
  type LearningPath,
  type MoneyMissionTemplate,
  type WeeklyMoneyMission,
} from "@/types/learning";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PRIMARY = "#00D09E";
const INK = "#093030";

type ModuleSummary = {
  id: string;
  module_type: LearningModuleType;
  sort_order: number;
};

type LearningPathRow = LearningPath & {
  learning_modules: ModuleSummary[];
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

type PathTheme = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  background: string;
};

const PATH_THEMES: Record<string, PathTheme> = {
  "money-basics": {
    icon: "pie-chart-outline",
    color: "#126B5A",
    background: "#DDF5ED",
  },
  "emergency-savings": {
    icon: "shield-checkmark-outline",
    color: "#3669A8",
    background: "#E1EDFA",
  },
  "debt-bnpl": {
    icon: "card-outline",
    color: "#9A5B13",
    background: "#FFF0D9",
  },
};

export default function EduFinanceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openGoal } = useLocalSearchParams<{ openGoal?: string }>();
  const [weekStart, setWeekStart] = useState(() =>
    localLearningDate(getLocalMonday(new Date())),
  );
  const [paths, setPaths] = useState<LearningPathRow[]>([]);
  const [completedModuleIds, setCompletedModuleIds] = useState<Set<string>>(
    new Set(),
  );
  const [streakCount, setStreakCount] = useState(0);
  const [weeklyMissions, setWeeklyMissions] = useState<WeeklyMoneyMission[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showMissionHistory, setShowMissionHistory] = useState(false);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalNotes, setNewGoalNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [savingMission, setSavingMission] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLearning = useCallback(async () => {
    setError(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (authError || !userId) {
        throw authError ?? new Error("Authentication required");
      }

      const streakCutoff = new Date();
      streakCutoff.setDate(streakCutoff.getDate() - 90);
      const currentWeekStart = localLearningDate(getLocalMonday(new Date()));
      setWeekStart(currentWeekStart);

      const { error: assignmentError } = await supabase.rpc(
        "assign_weekly_money_mission",
      );
      if (assignmentError) throw assignmentError;

      const [
        pathResult,
        progressResult,
        streakResult,
        goalResult,
        missionResult,
      ] =
        await Promise.all([
          supabase
            .from("learning_paths")
            .select(
              "id, slug, title, description, outcome, estimated_minutes, reviewed_at, sort_order, learning_modules(id, module_type, sort_order)",
            )
            .eq("is_published", true)
            .lte("publish_date", new Date().toISOString())
            .order("sort_order", { ascending: true }),
          supabase
            .from("user_path_progress")
            .select("module_id")
            .eq("user_id", userId),
          supabase
            .from("user_streaks")
            .select("date")
            .eq("user_id", userId)
            .gte("date", localLearningDate(streakCutoff))
            .order("date", { ascending: false }),
          supabase
            .from("user_goals")
            .select(
              "id, user_id, title, notes, week_start, completed, created_at",
            )
            .eq("user_id", userId)
            .eq("week_start", currentWeekStart)
            .order("created_at", { ascending: false }),
          supabase
            .from("user_weekly_missions")
            .select(
              "id, user_id, mission_id, week_start, completed_at, created_at, money_mission_templates(id, slug, title, summary, why_it_helps, steps, category, estimated_minutes, action_label, action_trigger, rotation_order, reviewed_at, money_mission_sources(sort_order, evidence_note, content_sources(id, source_key, title, authors, publisher, publication_year, source_type, url, doi, jurisdiction, summary, limitations, reviewed_at)))",
            )
            .eq("user_id", userId)
            .order("week_start", { ascending: false })
            .limit(6),
        ]);

      if (pathResult.error) throw pathResult.error;
      if (progressResult.error) throw progressResult.error;
      if (streakResult.error) throw streakResult.error;
      if (goalResult.error) throw goalResult.error;
      if (missionResult.error) throw missionResult.error;

      const nextPaths = (pathResult.data || []).map((path) => ({
        ...path,
        learning_modules: [...(path.learning_modules || [])].sort(
          (left, right) => left.sort_order - right.sort_order,
        ),
      })) as unknown as LearningPathRow[];

      setPaths(nextPaths);
      setCompletedModuleIds(
        new Set((progressResult.data || []).map((row) => row.module_id)),
      );
      setStreakCount(
        computeLearningStreak((streakResult.data || []).map((row) => row.date)),
      );
      setWeeklyMissions(
        (missionResult.data || []) as unknown as WeeklyMoneyMission[],
      );
      setGoals((goalResult.data || []) as Goal[]);
    } catch (loadError) {
      console.error("Learning dashboard load failed", loadError);
      setError("Could not load Money Skills. Pull down to try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLearning();
    }, [loadLearning]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void loadLearning();
    });
    return () => subscription.remove();
  }, [loadLearning]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLearning();
    setRefreshing(false);
  }, [loadLearning]);

  const closeGoalModal = useCallback(() => {
    setGoalModalVisible(false);
    if (openGoal === "1") router.setParams({ openGoal: "0" });
  }, [openGoal, router]);

  const addGoal = useCallback(async () => {
    const title = newGoalTitle.trim();
    const notes = newGoalNotes.trim();
    if (!title || title.length > 100 || notes.length > 500) {
      setError("Enter a goal title under 100 characters.");
      return;
    }

    setSavingGoal(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (authError || !userId) {
        throw authError ?? new Error("Authentication required");
      }

      const { data, error: insertError } = await supabase
        .from("user_goals")
        .insert({
          user_id: userId,
          title,
          notes: notes || null,
          week_start: weekStart,
          completed: false,
        })
        .select(
          "id, user_id, title, notes, week_start, completed, created_at",
        )
        .single();
      if (insertError) throw insertError;

      setGoals((current) => [data as Goal, ...current]);
      setNewGoalTitle("");
      setNewGoalNotes("");
      closeGoalModal();
    } catch (saveError) {
      console.error("Learning goal save failed", saveError);
      setError("Could not save that goal. Please try again.");
    } finally {
      setSavingGoal(false);
    }
  }, [closeGoalModal, newGoalNotes, newGoalTitle, weekStart]);

  const toggleGoal = useCallback(async (goal: Goal) => {
    const nextCompleted = !goal.completed;
    setGoals((current) =>
      current.map((row) =>
        row.id === goal.id ? { ...row, completed: nextCompleted } : row,
      ),
    );

    const { error: updateError } = await supabase
      .from("user_goals")
      .update({ completed: nextCompleted })
      .eq("id", goal.id);
    if (updateError) {
      console.error("Learning goal update failed", updateError);
      setGoals((current) =>
        current.map((row) =>
          row.id === goal.id ? { ...row, completed: goal.completed } : row,
        ),
      );
      setError("Could not update that goal.");
    }
  }, []);

  const openMissionAction = useCallback(
    (mission: MoneyMissionTemplate) => {
      if (mission.action_trigger === "add_transaction") {
        router.push("/add-transaction");
        return;
      }
      if (mission.action_trigger === "budgets") {
        router.push("/budgets");
        return;
      }
      if (mission.action_trigger === "goal") {
        setGoalModalVisible(true);
        return;
      }
      if (mission.action_trigger === "home") {
        router.push("/(tabs)");
      }
    },
    [router],
  );

  const toggleWeeklyMission = useCallback(
    async (assignment: WeeklyMoneyMission) => {
      const nextCompleted = !assignment.completed_at;
      const optimisticCompletedAt = nextCompleted
        ? new Date().toISOString()
        : null;

      setSavingMission(true);
      setError(null);
      setWeeklyMissions((current) =>
        current.map((row) =>
          row.id === assignment.id
            ? { ...row, completed_at: optimisticCompletedAt }
            : row,
        ),
      );

      try {
        const { error: updateError } = await supabase.rpc(
          "set_weekly_money_mission_completion",
          {
            p_assignment_id: assignment.id,
            p_completed: nextCompleted,
          },
        );
        if (updateError) throw updateError;
        await loadLearning();
      } catch (updateError) {
        console.error("Weekly money mission update failed", updateError);
        setWeeklyMissions((current) =>
          current.map((row) =>
            row.id === assignment.id
              ? { ...row, completed_at: assignment.completed_at }
              : row,
          ),
        );
        setError("Could not update your weekly mission. Please try again.");
      } finally {
        setSavingMission(false);
      }
    },
    [loadLearning],
  );

  const totalModules = paths.reduce(
    (sum, path) => sum + path.learning_modules.length,
    0,
  );
  const completedModules = paths.reduce(
    (sum, path) =>
      sum +
      path.learning_modules.filter((module) => completedModuleIds.has(module.id))
        .length,
    0,
  );
  const nextPath = paths.find((path) =>
    path.learning_modules.some((module) => !completedModuleIds.has(module.id)),
  );
  const currentWeeklyMission =
    weeklyMissions.find((assignment) => assignment.week_start === weekStart) ??
    weeklyMissions[0];
  const currentMission = currentWeeklyMission
    ? missionFromAssignment(currentWeeklyMission)
    : null;
  const missionHistory = weeklyMissions.filter(
    (assignment) => assignment.id !== currentWeeklyMission?.id,
  );

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 110 },
        ]}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.eyebrow}>SAFE SPEND</Text>
            <Text style={styles.screenTitle}>Money Skills</Text>
          </View>
          <View style={styles.streakPill}>
            <Ionicons name="flame" size={17} color="#B75B0A" />
            <Text selectable style={styles.streakText}>
              {streakCount} day{streakCount === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>LEARN. DECIDE. ACT.</Text>
          <Text style={styles.heroTitle}>
            Build money habits that work in real Malaysian life.
          </Text>
          <Text selectable style={styles.heroBody}>
            Short lessons, practical decisions and sources you can inspect.
          </Text>
          <View style={styles.heroProgressRow}>
            <View style={styles.heroProgressTrack}>
              <View
                style={[
                  styles.heroProgressFill,
                  {
                    width: `${totalModules ? (completedModules / totalModules) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
            <Text selectable style={styles.heroProgressText}>
              {completedModules}/{totalModules}
            </Text>
          </View>
        </View>

        {error ? <Text selectable style={styles.errorText}>{error}</Text> : null}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>Weekly money mission</Text>
            <Text selectable style={styles.sectionSubtitle}>
              One practical, research-linked action. A new mission arrives Monday.
            </Text>
          </View>
          <View style={styles.mondayBadge}>
            <Ionicons name="calendar-outline" size={13} color="#087D65" />
            <Text style={styles.mondayBadgeText}>MONDAY</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.missionLoadingCard}>
            <ActivityIndicator color={PRIMARY} />
            <Text selectable style={styles.missionLoadingText}>
              Preparing this week&apos;s mission…
            </Text>
          </View>
        ) : currentWeeklyMission && currentMission ? (
          <>
            <WeeklyMoneyMissionCard
              assignment={currentWeeklyMission}
              mission={currentMission}
              busy={savingMission}
              onAction={openMissionAction}
              onToggleComplete={(assignment) =>
                void toggleWeeklyMission(assignment)
              }
            />
            {missionHistory.length ? (
              <View style={styles.historyCard}>
                <TouchableOpacity
                  style={styles.historyHeader}
                  onPress={() =>
                    setShowMissionHistory((current) => !current)
                  }
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showMissionHistory }}
                >
                  <View style={styles.historyHeaderText}>
                    <Text style={styles.historyTitle}>Mission history</Text>
                    <Text selectable style={styles.historySubtitle}>
                      {missionHistory.length} previous week
                      {missionHistory.length === 1 ? "" : "s"} saved
                    </Text>
                  </View>
                  <Ionicons
                    name={showMissionHistory ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#526C66"
                  />
                </TouchableOpacity>
                {showMissionHistory ? (
                  <View style={styles.historyList}>
                    {missionHistory.map((assignment) => {
                      const mission = missionFromAssignment(assignment);
                      if (!mission) return null;
                      const completed = Boolean(assignment.completed_at);
                      return (
                        <View key={assignment.id} style={styles.historyRow}>
                          <Ionicons
                            name={
                              completed
                                ? "checkmark-circle"
                                : "ellipse-outline"
                            }
                            size={20}
                            color={completed ? "#138A6C" : "#8A9A96"}
                          />
                          <View style={styles.historyTextBlock}>
                            <Text selectable style={styles.historyMissionTitle}>
                              {mission.title}
                            </Text>
                            <Text selectable style={styles.historyWeek}>
                              Week of {assignment.week_start} · {completed ? "Completed" : "Not completed"}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.missionLoadingCard}>
            <Ionicons name="cloud-offline-outline" size={24} color="#6C817D" />
            <Text selectable style={styles.missionLoadingText}>
              This week&apos;s mission is unavailable. Pull down to retry.
            </Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Foundation paths</Text>
            <Text style={styles.sectionSubtitle}>
              Start with the next unfinished path or revisit any lesson.
            </Text>
          </View>
          {nextPath ? (
            <Text style={styles.nextBadge}>NEXT: {nextPath.sort_order}</Text>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        ) : paths.length ? (
          paths.map((path) => {
            const theme =
              PATH_THEMES[path.slug || ""] ?? PATH_THEMES["money-basics"];
            const pathCompleted = path.learning_modules.filter((module) =>
              completedModuleIds.has(module.id),
            ).length;
            const percent = path.learning_modules.length
              ? (pathCompleted / path.learning_modules.length) * 100
              : 0;
            const complete =
              path.learning_modules.length > 0 &&
              pathCompleted === path.learning_modules.length;

            return (
              <Link
                key={path.id}
                href={{
                  pathname: "/learning-path-details",
                  params: {
                    pathId: path.id,
                    title: path.title,
                    reviewedAt: path.reviewed_at || "",
                  },
                }}
                asChild
              >
                <TouchableOpacity
                  style={styles.pathCard}
                  activeOpacity={0.82}
                  accessibilityLabel={`Open ${path.title}`}
                >
                  <View style={styles.pathTopRow}>
                    <View
                      style={[
                        styles.pathIcon,
                        { backgroundColor: theme.background },
                      ]}
                    >
                      <Ionicons name={theme.icon} size={24} color={theme.color} />
                    </View>
                    <View style={styles.pathOrderBlock}>
                      <Text style={styles.pathOrder}>PATH {path.sort_order}</Text>
                      <Text style={styles.pathTime}>
                        {path.estimated_minutes} min
                      </Text>
                    </View>
                    {complete ? (
                      <Ionicons name="checkmark-circle" size={24} color="#138A6C" />
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color="#7C918C" />
                    )}
                  </View>
                  <Text style={styles.pathTitle}>{path.title}</Text>
                  <Text selectable style={styles.pathDescription}>
                    {path.description}
                  </Text>
                  <View style={styles.pathMetaRow}>
                    <View style={styles.researchBadge}>
                      <Ionicons name="library-outline" size={13} color="#406B62" />
                      <Text style={styles.researchText}>Sources included</Text>
                    </View>
                    <Text selectable style={styles.moduleCount}>
                      {pathCompleted}/{path.learning_modules.length} steps
                    </Text>
                  </View>
                  <View style={styles.pathProgressTrack}>
                    <View
                      style={[
                        styles.pathProgressFill,
                        { width: `${percent}%`, backgroundColor: theme.color },
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              </Link>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="cloud-offline-outline" size={30} color="#6C817D" />
            <Text style={styles.emptyTitle}>No published paths available</Text>
            <Text selectable style={styles.emptyText}>
              Pull down to refresh once your connection returns.
            </Text>
          </View>
        )}

        <View style={styles.evidencePromise}>
          <Ionicons name="shield-checkmark-outline" size={25} color="#087D65" />
          <View style={styles.evidenceTextBlock}>
            <Text style={styles.evidenceTitle}>Evidence you can inspect</Text>
            <Text selectable style={styles.evidenceBody}>
              Every path identifies official Malaysian guidance, research findings,
              limitations and its last review date.
            </Text>
          </View>
        </View>

        <View style={styles.goalCard}>
          <View style={styles.goalHeader}>
            <View>
              <Text style={styles.sectionTitle}>Personal money goals</Text>
              <Text style={styles.goalWeek}>Week of {weekStart}</Text>
            </View>
            <TouchableOpacity
              style={styles.addGoalButton}
              onPress={() => setGoalModalVisible(true)}
              accessibilityLabel="Add a weekly money goal"
            >
              <Ionicons name="add" size={19} color="#052224" />
              <Text style={styles.addGoalText}>Add</Text>
            </TouchableOpacity>
          </View>
          {goals.length ? (
            <View style={styles.goalList}>
              {goals.map((goal) => (
                <TouchableOpacity
                  key={goal.id}
                  style={styles.goalRow}
                  onPress={() => void toggleGoal(goal)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: goal.completed }}
                >
                  <Ionicons
                    name={goal.completed ? "checkmark-circle" : "ellipse-outline"}
                    size={23}
                    color={goal.completed ? "#138A6C" : "#78908A"}
                  />
                  <View style={styles.goalTextBlock}>
                    <Text
                      selectable
                      style={[
                        styles.goalTitle,
                        goal.completed && styles.goalTitleComplete,
                      ]}
                    >
                      {goal.title}
                    </Text>
                    {goal.notes ? (
                      <Text selectable style={styles.goalNotes}>
                        {goal.notes}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text selectable style={styles.noGoalText}>
              Add your own goal alongside the curated weekly mission.
            </Text>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={goalModalVisible || openGoal === "1"}
        transparent
        animationType="fade"
        onRequestClose={closeGoalModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>ONE ACTION THIS WEEK</Text>
            <Text style={styles.modalTitle}>Create a money goal</Text>
            <TextInput
              value={newGoalTitle}
              onChangeText={setNewGoalTitle}
              placeholder="Example: Move RM50 to my emergency fund"
              placeholderTextColor="#8A9A96"
              maxLength={100}
              style={styles.modalInput}
            />
            <TextInput
              value={newGoalNotes}
              onChangeText={setNewGoalNotes}
              placeholder="Why this matters or when you will do it (optional)"
              placeholderTextColor="#8A9A96"
              maxLength={500}
              multiline
              style={[styles.modalInput, styles.modalNotes]}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeGoalModal}
                disabled={savingGoal}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveGoalButton, savingGoal && styles.disabled]}
                onPress={() => void addGoal()}
                disabled={savingGoal}
              >
                {savingGoal ? (
                  <ActivityIndicator color="#052224" />
                ) : (
                  <Text style={styles.saveGoalText}>Save goal</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F8F6" },
  content: { paddingHorizontal: 18, gap: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: "#4D6F68", fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  screenTitle: { color: INK, fontSize: 27, fontWeight: "800" },
  streakPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: "#FFF0D9" },
  streakText: { color: "#7B470B", fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  heroCard: { padding: 20, borderRadius: 22, backgroundColor: INK, borderCurve: "continuous" },
  heroEyebrow: { color: "#7AE2C6", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  heroTitle: { color: "#FFFFFF", fontSize: 21, lineHeight: 29, fontWeight: "800", paddingTop: 6 },
  heroBody: { color: "#BBD3CD", fontSize: 12, lineHeight: 19, paddingTop: 7 },
  heroProgressRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 18 },
  heroProgressTrack: { flex: 1, height: 7, borderRadius: 999, backgroundColor: "#315653", overflow: "hidden" },
  heroProgressFill: { height: "100%", borderRadius: 999, backgroundColor: PRIMARY },
  heroProgressText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  errorText: { color: "#A33D3D", fontSize: 12, lineHeight: 18, textAlign: "center" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingTop: 6 },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { color: INK, fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { color: "#667C77", fontSize: 11, paddingTop: 3 },
  nextBadge: { color: "#087D65", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  mondayBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, backgroundColor: "#DDF5ED" },
  mondayBadgeText: { color: "#087D65", fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  missionLoadingCard: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: 9, padding: 20, borderRadius: 18, backgroundColor: "#FFFFFF", borderCurve: "continuous" },
  missionLoadingText: { color: "#667C77", fontSize: 10, lineHeight: 16, textAlign: "center" },
  historyCard: { borderRadius: 16, backgroundColor: "#FFFFFF", overflow: "hidden", borderCurve: "continuous" },
  historyHeader: { flexDirection: "row", alignItems: "center", padding: 14 },
  historyHeaderText: { flex: 1 },
  historyTitle: { color: INK, fontSize: 12, fontWeight: "800" },
  historySubtitle: { color: "#768A85", fontSize: 9, paddingTop: 2 },
  historyList: { gap: 1, paddingHorizontal: 10, paddingBottom: 10 },
  historyRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 10, borderRadius: 12, backgroundColor: "#F4F8F6" },
  historyTextBlock: { flex: 1 },
  historyMissionTitle: { color: INK, fontSize: 10, lineHeight: 15, fontWeight: "700" },
  historyWeek: { color: "#7A8E89", fontSize: 8, paddingTop: 2, fontVariant: ["tabular-nums"] },
  loadingState: { minHeight: 330, alignItems: "center", justifyContent: "center" },
  pathCard: { padding: 16, borderRadius: 18, backgroundColor: "#FFFFFF", borderCurve: "continuous", boxShadow: "0 2px 8px rgba(5, 34, 36, 0.06)" },
  pathTopRow: { flexDirection: "row", alignItems: "center" },
  pathIcon: { width: 47, height: 47, alignItems: "center", justifyContent: "center", borderRadius: 15, borderCurve: "continuous" },
  pathOrderBlock: { flex: 1, paddingHorizontal: 11 },
  pathOrder: { color: "#59746E", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  pathTime: { color: "#849590", fontSize: 10, paddingTop: 2 },
  pathTitle: { color: INK, fontSize: 17, fontWeight: "800", paddingTop: 13 },
  pathDescription: { color: "#5D716D", fontSize: 11, lineHeight: 18, paddingTop: 5 },
  pathMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 13 },
  researchBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: "#EDF5F2" },
  researchText: { color: "#406B62", fontSize: 9, fontWeight: "700" },
  moduleCount: { color: "#667C77", fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] },
  pathProgressTrack: { height: 5, borderRadius: 999, backgroundColor: "#E7EFEC", overflow: "hidden", marginTop: 10 },
  pathProgressFill: { height: "100%", borderRadius: 999 },
  emptyCard: { minHeight: 220, alignItems: "center", justifyContent: "center", padding: 24, borderRadius: 18, backgroundColor: "#FFFFFF" },
  emptyTitle: { color: INK, fontSize: 15, fontWeight: "800", paddingTop: 8 },
  emptyText: { color: "#667C77", fontSize: 11, textAlign: "center", paddingTop: 4 },
  evidencePromise: { flexDirection: "row", gap: 12, padding: 15, borderRadius: 17, backgroundColor: "#E3F5EF", borderCurve: "continuous" },
  evidenceTextBlock: { flex: 1 },
  evidenceTitle: { color: INK, fontSize: 13, fontWeight: "800" },
  evidenceBody: { color: "#526C66", fontSize: 10, lineHeight: 16, paddingTop: 3 },
  goalCard: { padding: 16, borderRadius: 18, backgroundColor: "#FFFFFF", borderCurve: "continuous" },
  goalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  goalWeek: { color: "#81928E", fontSize: 9, paddingTop: 2 },
  addGoalButton: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: PRIMARY },
  addGoalText: { color: "#052224", fontSize: 11, fontWeight: "800" },
  goalList: { gap: 10, paddingTop: 14 },
  goalRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 11, borderRadius: 13, backgroundColor: "#F4F8F6" },
  goalTextBlock: { flex: 1 },
  goalTitle: { color: INK, fontSize: 12, fontWeight: "700" },
  goalTitleComplete: { color: "#748681", textDecorationLine: "line-through" },
  goalNotes: { color: "#71837F", fontSize: 10, lineHeight: 15, paddingTop: 2 },
  noGoalText: { color: "#667C77", fontSize: 11, lineHeight: 17, paddingTop: 12 },
  modalOverlay: { flex: 1, justifyContent: "center", padding: 18, backgroundColor: "rgba(3, 25, 26, 0.55)" },
  modalCard: { padding: 19, borderRadius: 20, backgroundColor: "#FFFFFF", borderCurve: "continuous" },
  modalEyebrow: { color: "#087D65", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  modalTitle: { color: INK, fontSize: 20, fontWeight: "800", paddingTop: 4, paddingBottom: 14 },
  modalInput: { minHeight: 50, paddingHorizontal: 13, borderWidth: 1, borderColor: "#C9DAD4", borderRadius: 13, backgroundColor: "#FFFFFF", color: INK, fontSize: 12, marginBottom: 10 },
  modalNotes: { minHeight: 82, paddingTop: 13, textAlignVertical: "top" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 9, paddingTop: 4 },
  cancelButton: { minWidth: 88, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#E8EFED" },
  cancelText: { color: INK, fontSize: 12, fontWeight: "700" },
  saveGoalButton: { minWidth: 110, minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: PRIMARY },
  saveGoalText: { color: "#052224", fontSize: 12, fontWeight: "800" },
  disabled: { opacity: 0.55 },
});
