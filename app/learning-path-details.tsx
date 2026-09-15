import { EvidenceSection } from "@/components/evidence-section";
import {
  isActionPayload,
  isLessonPayload,
  isQuizPayload,
  localLearningDate,
  type LearningModule,
  type QuizResult,
} from "@/types/learning";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const PRIMARY = "#00D09E";
const INK = "#093030";

type QuizAnswers = Record<string, string>;

function moduleLabel(module: LearningModule): string {
  if (module.module_type === "quiz") return "KNOWLEDGE CHECK";
  if (module.module_type === "action") return "PUT IT INTO PRACTICE";
  return "SHORT LESSON";
}

export default function LearningPathDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    pathId?: string | string[];
    title?: string | string[];
    reviewedAt?: string | string[];
  }>();
  const pathId = Array.isArray(params.pathId) ? params.pathId[0] : params.pathId;
  const pathTitle = Array.isArray(params.title) ? params.title[0] : params.title;
  const reviewedAt = Array.isArray(params.reviewedAt)
    ? params.reviewedAt[0]
    : params.reviewedAt;
  const [modules, setModules] = useState<LearningModule[]>([]);
  const [completedModuleIds, setCompletedModuleIds] = useState<Set<string>>(
    new Set(),
  );
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswers>({});
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadModules = useCallback(async () => {
    if (!pathId) {
      setError("This learning path is missing its identifier.");
      setLoading(false);
      return;
    }

    setError(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (authError || !userId) {
        throw authError ?? new Error("Authentication required");
      }

      const [moduleResult, progressResult] = await Promise.all([
        supabase
          .from("learning_modules")
          .select(
            "id, path_id, slug, title, module_type, content_payload, action_trigger, sort_order, estimated_minutes, competency, learning_module_sources(sort_order, evidence_note, content_sources(id, source_key, title, authors, publisher, publication_year, source_type, url, doi, jurisdiction, summary, limitations, reviewed_at))",
          )
          .eq("path_id", pathId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("user_path_progress")
          .select("module_id")
          .eq("user_id", userId),
      ]);

      if (moduleResult.error) throw moduleResult.error;
      if (progressResult.error) throw progressResult.error;

      const nextModules = (moduleResult.data || []) as unknown as LearningModule[];
      const nextCompletedIds = new Set(
        (progressResult.data || []).map((row) => row.module_id),
      );
      const firstUnfinished = nextModules.findIndex(
        (module) => !nextCompletedIds.has(module.id),
      );

      setModules(nextModules);
      setCompletedModuleIds(nextCompletedIds);
      setActiveModuleIndex(firstUnfinished >= 0 ? firstUnfinished : 0);
      setSlideIndex(0);
      setQuizAnswers({});
      setQuizResult(null);
    } catch (loadError) {
      console.error("Learning path load failed", loadError);
      setError("Could not load this learning path. Please go back and try again.");
    } finally {
      setLoading(false);
    }
  }, [pathId]);

  useFocusEffect(
    useCallback(() => {
      void loadModules();
    }, [loadModules]),
  );

  const currentModule = modules[activeModuleIndex];

  const completedCount = useMemo(
    () => modules.filter((module) => completedModuleIds.has(module.id)).length,
    [completedModuleIds, modules],
  );

  const finishModule = useCallback(async (moduleId: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (authError || !userId) {
        throw authError ?? new Error("Authentication required");
      }

      const [progressResult, streakResult] = await Promise.all([
        supabase.from("user_path_progress").upsert(
          { user_id: userId, module_id: moduleId },
          { onConflict: "user_id,module_id", ignoreDuplicates: true },
        ),
        supabase.from("user_streaks").upsert(
          { user_id: userId, date: localLearningDate() },
          { onConflict: "user_id,date", ignoreDuplicates: true },
        ),
      ]);
      if (progressResult.error) throw progressResult.error;
      if (streakResult.error) throw streakResult.error;

      setCompletedModuleIds((current) => new Set(current).add(moduleId));
      return true;
    } catch (saveError) {
      console.error("Learning progress save failed", saveError);
      setError("Your progress could not be saved. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const continueToNextModule = useCallback(() => {
    if (activeModuleIndex < modules.length - 1) {
      setSlideIndex(0);
      setQuizAnswers({});
      setQuizResult(null);
      setError(null);
      setActiveModuleIndex((current) => current + 1);
    } else {
      router.back();
    }
  }, [activeModuleIndex, modules.length, router]);

  const completeAndContinue = useCallback(async () => {
    if (!currentModule) return;
    const saved = await finishModule(currentModule.id);
    if (saved) continueToNextModule();
  }, [continueToNextModule, currentModule, finishModule]);

  const submitQuiz = useCallback(async () => {
    if (!currentModule || !isQuizPayload(currentModule.content_payload)) return;
    const unanswered = currentModule.content_payload.questions.some(
      (question) => !quizAnswers[question.id],
    );
    if (unanswered) {
      Alert.alert("Complete every question", "Choose one answer for each question first.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { data, error: submitError } = await supabase.rpc(
        "submit_quiz_attempt",
        {
          p_module_id: currentModule.id,
          p_answers: quizAnswers,
        },
      );
      if (submitError) throw submitError;
      const result = (data?.[0] || null) as QuizResult | null;
      if (!result) throw new Error("Quiz result was empty");

      setQuizResult(result);
      if (result.passed) {
        setCompletedModuleIds((current) => new Set(current).add(currentModule.id));
      }
    } catch (submitError) {
      console.error("Quiz submission failed", submitError);
      setError("Your quiz could not be scored. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [currentModule, quizAnswers]);

  const takeAction = useCallback(async () => {
    if (!currentModule) return;
    const saved = await finishModule(currentModule.id);
    if (!saved) return;

    if (currentModule.action_trigger === "set_budget") {
      router.replace("/budgets");
      return;
    }
    if (currentModule.action_trigger === "set_goal") {
      router.replace("/edufinance?openGoal=1");
      return;
    }
    continueToNextModule();
  }, [continueToNextModule, currentModule, finishModule, router]);

  const renderLesson = () => {
    if (!currentModule || !isLessonPayload(currentModule.content_payload)) {
      return <Text style={styles.errorText}>This lesson is not available.</Text>;
    }
    const slides = currentModule.content_payload.slides;
    const slide = slides[slideIndex];
    const isLastSlide = slideIndex === slides.length - 1;

    return (
      <>
        <View style={styles.lessonCard}>
          <Text style={styles.slideNumber}>
            POINT {slideIndex + 1} OF {slides.length}
          </Text>
          <Text style={styles.slideTitle}>{slide.title}</Text>
          <Text selectable style={styles.slideBody}>
            {slide.body}
          </Text>
          {slide.takeaway ? (
            <View style={styles.takeawayBox}>
              <Ionicons name="bulb-outline" size={18} color="#8A5A00" />
              <Text selectable style={styles.takeawayText}>
                {slide.takeaway}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.pagination}>
          {slides.map((entry, index) => (
            <View
              key={`${entry.title}-${index}`}
              style={[styles.dot, index === slideIndex && styles.activeDot]}
            />
          ))}
        </View>
        <View style={styles.buttonRow}>
          {slideIndex > 0 ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setSlideIndex((current) => current - 1)}
              disabled={busy}
            >
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.disabled]}
            onPress={() => {
              if (isLastSlide) void completeAndContinue();
              else setSlideIndex((current) => current + 1);
            }}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#052224" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isLastSlide ? "Complete lesson" : "Next point"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </>
    );
  };

  const renderQuiz = () => {
    if (!currentModule || !isQuizPayload(currentModule.content_payload)) {
      return <Text style={styles.errorText}>This quiz is not available.</Text>;
    }
    const payload = currentModule.content_payload;

    return (
      <>
        <View style={styles.quizIntro}>
          <Ionicons name="checkmark-done-outline" size={22} color="#087D65" />
          <Text selectable style={styles.quizIntroText}>
            Answer every scenario. A score of {payload.passPercent}% or higher
            completes this step.
          </Text>
        </View>
        {payload.questions.map((question, questionIndex) => (
          <View key={question.id} style={styles.questionCard}>
            <Text style={styles.questionNumber}>QUESTION {questionIndex + 1}</Text>
            <Text selectable style={styles.questionPrompt}>
              {question.prompt}
            </Text>
            <View style={styles.optionList}>
              {question.options.map((option) => {
                const selected = quizAnswers[question.id] === option.id;
                const correct = quizResult && option.id === question.correctOptionId;
                const selectedWrong = quizResult && selected && !correct;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.optionButton,
                      selected && styles.optionSelected,
                      correct && styles.optionCorrect,
                      selectedWrong && styles.optionWrong,
                    ]}
                    onPress={() =>
                      !quizResult &&
                      setQuizAnswers((current) => ({
                        ...current,
                        [question.id]: option.id,
                      }))
                    }
                    disabled={Boolean(quizResult)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Ionicons
                      name={selected ? "radio-button-on" : "radio-button-off"}
                      size={19}
                      color={
                        correct ? "#087D65" : selectedWrong ? "#A33D3D" : "#68807A"
                      }
                    />
                    <Text selectable style={styles.optionText}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {quizResult ? (
              <Text selectable style={styles.explanationText}>
                {question.explanation}
              </Text>
            ) : null}
          </View>
        ))}

        {quizResult ? (
          <View
            style={[
              styles.resultCard,
              quizResult.passed ? styles.resultPass : styles.resultRetry,
            ]}
          >
            <Ionicons
              name={quizResult.passed ? "checkmark-circle" : "refresh-circle"}
              size={30}
              color={quizResult.passed ? "#087D65" : "#9A5B13"}
            />
            <View style={styles.resultTextBlock}>
              <Text style={styles.resultTitle}>
                {quizResult.passed ? "Knowledge check passed" : "Review and retry"}
              </Text>
              <Text selectable style={styles.resultText}>
                {quizResult.score} of {quizResult.total_questions} correct
              </Text>
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.disabled]}
          onPress={() => {
            if (!quizResult) void submitQuiz();
            else if (quizResult.passed) continueToNextModule();
            else {
              setQuizAnswers({});
              setQuizResult(null);
            }
          }}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#052224" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {!quizResult
                ? "Check my answers"
                : quizResult.passed
                  ? "Continue"
                  : "Try again"}
            </Text>
          )}
        </TouchableOpacity>
      </>
    );
  };

  const renderAction = () => {
    if (!currentModule || !isActionPayload(currentModule.content_payload)) {
      return <Text style={styles.errorText}>This action is not available.</Text>;
    }

    return (
      <>
        <View style={styles.actionCard}>
          <View style={styles.actionIcon}>
            <Ionicons name="flag-outline" size={31} color="#087D65" />
          </View>
          <Text style={styles.actionTitle}>Turn knowledge into a real step</Text>
          <Text selectable style={styles.actionBody}>
            {currentModule.content_payload.description}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.disabled]}
          onPress={() => void takeAction()}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#052224" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {currentModule.content_payload.buttonLabel}
            </Text>
          )}
        </TouchableOpacity>
      </>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: pathTitle || "Money Skills",
          headerBackTitle: "Learn",
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        ) : error && !currentModule ? (
          <View style={styles.loadingState}>
            <Ionicons name="alert-circle-outline" size={31} color="#A33D3D" />
            <Text selectable style={styles.errorText}>{error}</Text>
          </View>
        ) : currentModule ? (
          <>
            <View style={styles.progressHeader}>
              <View style={styles.progressTextRow}>
                <Text style={styles.progressLabel}>
                  STEP {activeModuleIndex + 1} OF {modules.length}
                </Text>
                <Text selectable style={styles.completedText}>
                  {completedCount} complete
                </Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${modules.length ? ((activeModuleIndex + 1) / modules.length) * 100 : 0}%`,
                    },
                  ]}
                />
              </View>
            </View>

            <View style={styles.moduleHeader}>
              <Text style={styles.moduleType}>{moduleLabel(currentModule)}</Text>
              <Text style={styles.moduleTitle}>{currentModule.title}</Text>
              {currentModule.competency ? (
                <Text selectable style={styles.competency}>
                  Goal: {currentModule.competency}
                </Text>
              ) : null}
              <View style={styles.timeBadge}>
                <Ionicons name="time-outline" size={13} color="#58716B" />
                <Text style={styles.timeText}>
                  About {currentModule.estimated_minutes} minutes
                </Text>
              </View>
            </View>

            {error ? <Text selectable style={styles.inlineError}>{error}</Text> : null}

            {currentModule.module_type === "lesson" ? renderLesson() : null}
            {currentModule.module_type === "quiz" ? renderQuiz() : null}
            {currentModule.module_type === "action" ? renderAction() : null}

            <EvidenceSection
              links={currentModule.learning_module_sources || []}
              reviewedAt={reviewedAt}
            />

            <View style={styles.disclaimerCard}>
              <Ionicons name="information-circle-outline" size={18} color="#5E726D" />
              <Text selectable style={styles.disclaimerText}>
                Educational information only—not personalised financial advice.
                Rules and product terms can change; inspect the original sources.
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.loadingState}>
            <Text selectable style={styles.errorText}>
              No published modules were found for this path.
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F8F6" },
  content: { padding: 18, paddingBottom: 48, gap: 14 },
  loadingState: { minHeight: 520, alignItems: "center", justifyContent: "center", gap: 9 },
  errorText: { color: "#A33D3D", fontSize: 12, lineHeight: 18, textAlign: "center" },
  progressHeader: { padding: 15, borderRadius: 16, backgroundColor: INK },
  progressTextRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressLabel: { color: "#86DCC6", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  completedText: { color: "#C7DDD7", fontSize: 9, fontVariant: ["tabular-nums"] },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: "#315653", overflow: "hidden", marginTop: 10 },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: PRIMARY },
  moduleHeader: { alignItems: "center", paddingVertical: 8 },
  moduleType: { color: "#087D65", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  moduleTitle: { color: INK, fontSize: 23, lineHeight: 31, fontWeight: "800", textAlign: "center", paddingTop: 5 },
  competency: { color: "#5D716D", fontSize: 11, lineHeight: 17, textAlign: "center", paddingTop: 7 },
  timeBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "#E5EFEC", marginTop: 9 },
  timeText: { color: "#58716B", fontSize: 9, fontWeight: "700" },
  inlineError: { color: "#A33D3D", fontSize: 11, lineHeight: 17, textAlign: "center", padding: 10, borderRadius: 12, backgroundColor: "#FDECEC" },
  lessonCard: { minHeight: 330, justifyContent: "center", padding: 22, borderRadius: 20, backgroundColor: "#FFFFFF", borderCurve: "continuous", boxShadow: "0 2px 8px rgba(5, 34, 36, 0.06)" },
  slideNumber: { color: "#087D65", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  slideTitle: { color: INK, fontSize: 21, lineHeight: 28, fontWeight: "800", paddingTop: 9 },
  slideBody: { color: "#425C56", fontSize: 14, lineHeight: 23, paddingTop: 12 },
  takeawayBox: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 13, borderRadius: 13, backgroundColor: "#FFF4D6", marginTop: 18 },
  takeawayText: { flex: 1, color: "#6C4A0A", fontSize: 11, lineHeight: 17, fontWeight: "700" },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 999, backgroundColor: "#C9D6D2" },
  activeDot: { width: 22, backgroundColor: PRIMARY },
  buttonRow: { flexDirection: "row", gap: 9 },
  primaryButton: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: PRIMARY },
  primaryButtonText: { color: "#052224", fontSize: 13, fontWeight: "800" },
  secondaryButton: { minWidth: 92, minHeight: 52, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#E3ECE9" },
  secondaryButtonText: { color: INK, fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  quizIntro: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 13, borderRadius: 14, backgroundColor: "#E3F5EF" },
  quizIntroText: { flex: 1, color: "#41635B", fontSize: 10, lineHeight: 16 },
  questionCard: { padding: 16, borderRadius: 18, backgroundColor: "#FFFFFF", borderCurve: "continuous" },
  questionNumber: { color: "#087D65", fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  questionPrompt: { color: INK, fontSize: 14, lineHeight: 21, fontWeight: "800", paddingTop: 7 },
  optionList: { gap: 8, paddingTop: 13 },
  optionButton: { minHeight: 51, flexDirection: "row", alignItems: "center", gap: 9, padding: 11, borderWidth: 1, borderColor: "#D4E0DD", borderRadius: 13, backgroundColor: "#FAFCFB" },
  optionSelected: { borderColor: "#087D65", backgroundColor: "#E7F6F1" },
  optionCorrect: { borderColor: "#087D65", backgroundColor: "#DDF5ED" },
  optionWrong: { borderColor: "#B65A5A", backgroundColor: "#FDECEC" },
  optionText: { flex: 1, color: "#31504D", fontSize: 11, lineHeight: 17 },
  explanationText: { color: "#526C66", fontSize: 10, lineHeight: 16, paddingTop: 12 },
  resultCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14, borderRadius: 15 },
  resultPass: { backgroundColor: "#DDF5ED" },
  resultRetry: { backgroundColor: "#FFF0D9" },
  resultTextBlock: { flex: 1 },
  resultTitle: { color: INK, fontSize: 13, fontWeight: "800" },
  resultText: { color: "#5D716D", fontSize: 10, paddingTop: 2, fontVariant: ["tabular-nums"] },
  actionCard: { minHeight: 300, alignItems: "center", justifyContent: "center", padding: 24, borderRadius: 20, backgroundColor: "#FFFFFF", borderCurve: "continuous" },
  actionIcon: { width: 68, height: 68, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: "#DDF5ED" },
  actionTitle: { color: INK, fontSize: 19, lineHeight: 27, fontWeight: "800", textAlign: "center", paddingTop: 16 },
  actionBody: { color: "#526C66", fontSize: 12, lineHeight: 20, textAlign: "center", paddingTop: 9 },
  disclaimerCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 13, backgroundColor: "#E8EFED" },
  disclaimerText: { flex: 1, color: "#5E726D", fontSize: 9, lineHeight: 15 },
});
