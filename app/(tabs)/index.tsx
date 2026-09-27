import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router/react-navigation";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MonthlySpendingChart } from "../../components/monthly-spending-chart";
import { IconSymbol } from "../../components/ui/icon-symbol";
import {
  expenseEffect,
  formatCategory,
  localDateString,
  monthStartString,
  shiftMonth,
  summarizeMonthlySpending,
  type MonthlySpendingRow,
} from "../../types/finance";
import {
  isFinFresh,
  isHomeFresh,
  isMonthFresh,
  type FinSummary,
  type HomeSummary,
  type LatestActivitySummary,
  type MonthSummary,
} from "../../utils/home-cache-core";
import { homeCache } from "../../utils/home-cache";
import { getSavedUserId } from "../../utils/offline-session";
import { setupSmartNotifications } from "../../utils/notifications";
import { authenticatedApiFetch } from "../../utils/api";
import { supabase } from "../../utils/supabase";

const PRIMARY = "#00D09E";
const INSIGHT_ACCENTS = ["#00A884", "#2775E8", "#F5A524"];
const INSIGHT_BACKGROUNDS = ["#E8FFF5", "#EAF3FF", "#FFF5E2"];

function displayActivityDate(value: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return value;
  const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  return date.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function displaySavedTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-MY", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}

function getSmartStatus(totalExpense: number, monthlyBudget: number) {
  if (!monthlyBudget || monthlyBudget <= 0) {
    return {
      icon: "information-circle-outline" as const,
      color: "#052224",
      text: "Set a monthly budget to see whether your spending is on track.",
    };
  }

  if (!totalExpense || totalExpense <= 0) {
    return {
      icon: "information-circle-outline" as const,
      color: "#052224",
      text: "You haven't recorded any spending yet. Scan a receipt to begin.",
    };
  }

  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
  ).getDate();

  const avgPerDaySoFar = totalExpense / dayOfMonth;
  const projectedMonthSpend = avgPerDaySoFar * daysInMonth;
  const projectedPercent = Math.round(
    (projectedMonthSpend / monthlyBudget) * 100,
  );

  if (projectedMonthSpend > monthlyBudget * 1.1) {
    const diff = projectedMonthSpend - monthlyBudget;
    return {
      icon: "warning-outline" as const,
      color: "#DC2626",
      text: `At this pace you may overshoot your budget by about RM${diff.toFixed(
        2,
      )}. Try slowing down non-essential spending.`,
    };
  }

  if (projectedMonthSpend > monthlyBudget * 0.95) {
    return {
      icon: "alert-circle-outline" as const,
      color: "#D97706",
      text: `You're close to your budget limit this month (around ${projectedPercent}%). Keep a closer eye on spending.`,
    };
  }

  return {
    icon: "checkmark-circle" as const,
    color: "#15803D",
    text: `Nice! You're on track and projected to use about ${projectedPercent}% of your monthly budget.`,
  };
}

export default function HomeScreen() {
  const router = useRouter();

  const [username, setUsername] = useState<string>("Guest");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [monthlyBudget, setMonthlyBudget] = useState<number>(0);
  const [totalExpense, setTotalExpense] = useState<number>(0);
  const [profileMonthlyIncome, setProfileMonthlyIncome] = useState(0);
  const [chartMonth, setChartMonth] = useState(monthStartString());
  const [chartSnapshot, setChartSnapshot] = useState<MonthSummary | null>(null);
  const [chartDirection, setChartDirection] = useState<"previous" | "next">("next");
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const chartRequestRef = useRef(0);
  const monthFetchesRef = useRef(new Map<string, Promise<MonthSummary>>());
  const homeRequestRef = useRef(0);
  const activeUserIdRef = useRef<string | null>(null);
  const [latestActivity, setLatestActivity] = useState<LatestActivitySummary | null>(null);
  const [homeSavedAt, setHomeSavedAt] = useState<number | null>(null);
  const [homeMonth, setHomeMonth] = useState<string | null>(null);
  const [homeCacheNotice, setHomeCacheNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const status = homeMonth && homeMonth !== monthStartString()
    ? {
      icon: "information-circle-outline" as const,
      color: "#052224",
      text: "Connect to update this month's spending status.",
    }
    : getSmartStatus(totalExpense, monthlyBudget);
  const [aiInsights, setAiInsights] = useState<string[] | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsError, setAiInsightsError] = useState<string | null>(null);
  const [analysisTransactionCount, setAnalysisTransactionCount] = useState<number | null>(null);
  const [analysisHistoryLimited, setAnalysisHistoryLimited] = useState(false);
  const [analysisSavedAt, setAnalysisSavedAt] = useState<number | null>(null);
  const analysisRequestRef = useRef(0);
  const monthlySpending = React.useMemo(
    () => {
      if (!chartSnapshot || chartSnapshot.month !== chartMonth) {
        return { categories: [], total: 0, income: 0, incomeSource: "none" as const };
      }
      const income = chartSnapshot.recordedIncome > 0
        ? chartSnapshot.recordedIncome : Math.max(0, profileMonthlyIncome);
      return {
        categories: chartSnapshot.categories,
        total: chartSnapshot.total,
        income,
        incomeSource: chartSnapshot.recordedIncome > 0 ? "recorded" as const :
          income > 0 ? "profile" as const : "none" as const,
      };
    },
    [chartSnapshot, chartMonth, profileMonthlyIncome],
  );

  useEffect(() => {
    void setupSmartNotifications();
  }, []);

  const progressPercent =
    monthlyBudget > 0
      ? Math.min(100, Math.round((totalExpense / monthlyBudget) * 100))
      : 0;

  const fetchAIInsights = React.useCallback(async (userId: string) => {
    const requestId = ++analysisRequestRef.current;
    const cacheGeneration = homeCache.generation(userId);
    try {
      setAiInsightsLoading(true);
      setAiInsightsError(null);

      const resp = await authenticatedApiFetch("/api/fin-insights", {
        method: "POST",
        body: "{}",
      });
      if (!resp.ok) throw new Error(`Fin analysis request failed (${resp.status})`);
      const json = await resp.json();
      if (json.analysisVersion !== 2 || !Array.isArray(json.insights)) {
        throw new Error("Fin analysis service is not updated yet");
      }
      const lines = json.insights.filter(
        (value: unknown): value is string => typeof value === "string" && value.trim().length > 0,
      ).slice(0, 3);
      if (lines.length === 0) throw new Error("Fin returned no analysis");
      const summary: FinSummary = {
        savedAt: Date.now(),
        insights: lines,
        recordedTransactions: Number.isInteger(json.recordedTransactions)
          ? json.recordedTransactions : null,
        historyLimited: Boolean(json.historyLimited),
      };
      if (requestId === analysisRequestRef.current &&
        cacheGeneration === homeCache.generation(userId)) {
        setAiInsights(lines);
        setAnalysisTransactionCount(summary.recordedTransactions);
        setAnalysisHistoryLimited(summary.historyLimited);
        setAnalysisSavedAt(summary.savedAt);
        void homeCache.putFin(userId, summary).catch((error) =>
          console.log("Home: could not save Fin analysis offline", error));
      }
    } catch (err) {
      console.log("Fin analysis fetch error:", err);
      if (requestId === analysisRequestRef.current) {
        setAiInsightsError("Fin could not refresh. Saved analysis remains available offline.");
      }
    } finally {
      if (requestId === analysisRequestRef.current) setAiInsightsLoading(false);
    }
  }, []);

  const fetchMonthFromServer = React.useCallback((userId: string, month: string) => {
    const fetchKey = `${userId}:${month}:${homeCache.generation(userId)}`;
    const existing = monthFetchesRef.current.get(fetchKey);
    if (existing) return existing;
    const cacheGeneration = homeCache.generation(userId);
    const promise = (async (): Promise<MonthSummary> => {
      const pageSize = 500;
      const rows: MonthlySpendingRow[] = [];
      const budgetResult = Promise.resolve(supabase
        .from("budgets")
        .select("amount")
        .eq("user_id", userId)
        .eq("month_start", month)
        .eq("category", "ALL")
        .maybeSingle());
      const monthEnd = shiftMonth(month, 1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endExclusive = month === monthStartString()
        ? localDateString(tomorrow)
        : monthEnd;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, amount, category, transaction_type")
          .eq("user_id", userId)
          .eq("status", "posted")
          .in("transaction_type", ["expense", "refund", "income"])
          .gte("occurred_on", month)
          .lt("occurred_on", endExclusive)
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;
        rows.push(...((data ?? []) as MonthlySpendingRow[]));
        if (!data || data.length < pageSize) break;
      }

      const { data: budget, error: budgetError } = await budgetResult;
      if (budgetError) console.log("Home: chart budget error", budgetError);
      const spending = summarizeMonthlySpending(rows, 0);
      const summary: MonthSummary = {
        savedAt: Date.now(),
        month,
        categories: spending.categories,
        total: spending.total,
        recordedIncome: spending.income,
        budget: Math.max(0, Number(budget?.amount) || 0),
        budgetUnavailable: Boolean(budgetError),
      };
      if (cacheGeneration !== homeCache.generation(userId)) {
        throw new Error("Financial activity changed while loading this month");
      }
      void homeCache.putMonth(userId, summary).catch((error) =>
        console.log("Home: could not save month offline", error));
      return summary;
    })();
    monthFetchesRef.current.set(fetchKey, promise);
    void promise.finally(() => monthFetchesRef.current.delete(fetchKey)).catch(() => {});
    return promise;
  }, []);

  const prefetchNeighbours = React.useCallback((userId: string, month: string) => {
    const neighbours = [shiftMonth(month, -1), shiftMonth(month, 1)]
      .filter((candidate) => candidate <= monthStartString());
    for (const candidate of neighbours) {
      void homeCache.getMonth(userId, candidate).then((cached) => {
        if (!cached) return fetchMonthFromServer(userId, candidate);
      }).catch(() => {});
    }
  }, [fetchMonthFromServer]);

  const loadMonthlyChart = React.useCallback(async (force = false) => {
    const requestId = ++chartRequestRef.current;
    setChartError(null);
    const selectedMonth = chartMonth;
    let cached: MonthSummary | null = null;
    try {
      const { userId, offline } = await getSavedUserId();
      if (!userId) throw new Error("No saved session");
      activeUserIdRef.current = userId;
      cached = await homeCache.getMonth(userId, selectedMonth);
      if (requestId !== chartRequestRef.current) return;
      if (cached) {
        setChartSnapshot(cached);
        setChartLoading(force || !isMonthFresh(cached));
      } else {
        setChartSnapshot(null);
        setChartLoading(true);
      }
      if (offline) {
        if (!cached) throw new Error("This month was not saved before going offline");
        setChartError("Showing saved month. Reconnect to refresh.");
        return;
      }
      if (!force && cached && isMonthFresh(cached)) {
        prefetchNeighbours(userId, selectedMonth);
        return;
      }
      const summary = await fetchMonthFromServer(userId, selectedMonth);
      if (requestId === chartRequestRef.current) {
        setChartSnapshot(summary);
        prefetchNeighbours(userId, selectedMonth);
      }
    } catch (error) {
      console.log("Home: monthly spending error", error);
      if (requestId === chartRequestRef.current) {
        setChartError(cached ? "Showing saved month. Tap to retry when online." : "Could not load this month.");
      }
    } finally {
      if (requestId === chartRequestRef.current) setChartLoading(false);
    }
  }, [chartMonth, fetchMonthFromServer, prefetchNeighbours]);

  const loadData = React.useCallback(async (force = false) => {
    const requestId = ++homeRequestRef.current;
    let cachedHome: HomeSummary | null = null;
    try {
      const { userId, offline } = await getSavedUserId();
      if (!userId) return;
      activeUserIdRef.current = userId;
      const [savedHome, cachedFin] = await Promise.all([
        homeCache.getHome(userId), homeCache.getFin(userId),
      ]);
      cachedHome = savedHome;
      if (requestId !== homeRequestRef.current) return;
      if (cachedHome) {
        setHomeSavedAt(cachedHome.savedAt);
        setHomeMonth(cachedHome.month);
        setUsername(cachedHome.username);
        setAvatarUrl(cachedHome.avatarUrl);
        setMonthlyBudget(cachedHome.month === monthStartString() ? cachedHome.monthlyBudget : 0);
        setTotalExpense(cachedHome.month === monthStartString() ? cachedHome.totalExpense : 0);
        setProfileMonthlyIncome(cachedHome.profileMonthlyIncome);
        setLatestActivity(cachedHome.latestActivity);
      } else {
        setHomeSavedAt(null);
        setHomeMonth(null);
        setMonthlyBudget(0);
        setTotalExpense(0);
        setLatestActivity(null);
      }
      if (cachedFin) {
        setAiInsights(cachedFin.insights);
        setAnalysisTransactionCount(cachedFin.recordedTransactions);
        setAnalysisHistoryLimited(cachedFin.historyLimited);
        setAnalysisSavedAt(cachedFin.savedAt);
      } else {
        setAiInsights(null);
        setAnalysisTransactionCount(null);
        setAnalysisHistoryLimited(false);
        setAnalysisSavedAt(null);
      }
      if (offline) {
        setHomeCacheNotice(cachedHome?.month === monthStartString()
          ? "Offline · showing your saved financial summary."
          : "Offline · this month's Home totals are not saved yet. Earlier months remain in the chart.");
        return;
      }
      if (!force && cachedHome && isHomeFresh(cachedHome) &&
        cachedFin && isFinFresh(cachedFin)) return;

      const cacheGeneration = homeCache.generation(userId);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || authData.user?.id !== userId) {
        throw authError ?? new Error("Please sign in again.");
      }
      if (requestId !== homeRequestRef.current) return;
      void homeCache.markOfflineUser(userId).catch((error) =>
        console.log("Home: could not save offline account", error));
      setHomeCacheNotice(null);

      const analysisPromise = force || !cachedFin || !isFinFresh(cachedFin)
        ? fetchAIInsights(userId) : Promise.resolve();
      if (force || !cachedHome || !isHomeFresh(cachedHome)) {
        const todayStr = localDateString();
        const firstOfMonthStr = monthStartString();
        const [profileResult, budgetResult, transactionResult, latestResult] = await Promise.all([
          supabase.from("users").select("username, monthly_income, avatar_url")
            .eq("user_id", userId).single(),
          supabase.from("budgets").select("amount")
            .eq("user_id", userId).eq("month_start", firstOfMonthStr)
            .eq("category", "ALL").maybeSingle(),
          supabase.from("transactions").select("amount, transaction_type")
            .eq("user_id", userId).eq("status", "posted")
            .in("transaction_type", ["expense", "refund"])
            .gte("occurred_on", firstOfMonthStr).lte("occurred_on", todayStr),
          supabase.from("transactions")
            .select("id, merchant_name, amount, occurred_on, category, transaction_type, source")
            .eq("user_id", userId).eq("status", "posted")
            .order("created_at", { ascending: false })
            .order("id", { ascending: false }).limit(1),
        ]);
        const error = profileResult.error || budgetResult.error ||
          transactionResult.error || latestResult.error;
        if (error) throw error;
        const rawIncome = Number(profileResult.data?.monthly_income);
        const summary: HomeSummary = {
          savedAt: Date.now(),
          month: firstOfMonthStr,
          username: profileResult.data?.username || "User",
          avatarUrl: profileResult.data?.avatar_url ?? null,
          monthlyBudget: Number(budgetResult.data?.amount) || 0,
          totalExpense: Math.max(0, (transactionResult.data ?? []).reduce(
            (sum, row) => sum + expenseEffect(row.transaction_type, row.amount), 0,
          )),
          profileMonthlyIncome: Number.isFinite(rawIncome) ? rawIncome : 0,
          latestActivity: (latestResult.data?.[0] as LatestActivitySummary | undefined) ?? null,
        };
        if (requestId === homeRequestRef.current &&
          cacheGeneration === homeCache.generation(userId)) {
          setUsername(summary.username);
          setHomeSavedAt(summary.savedAt);
          setHomeMonth(summary.month);
          setAvatarUrl(summary.avatarUrl);
          setMonthlyBudget(summary.monthlyBudget);
          setTotalExpense(summary.totalExpense);
          setProfileMonthlyIncome(summary.profileMonthlyIncome);
          setLatestActivity(summary.latestActivity);
          void homeCache.putHome(userId, summary).catch((error) =>
            console.log("Home: could not save summary offline", error));
        }
      }
      await analysisPromise;
    } catch (error) {
      console.log("Home: showing saved summary", error);
      if (requestId === homeRequestRef.current) {
        setHomeCacheNotice(cachedHome
          ? "Showing saved data. Reconnect to refresh your summary."
          : "Could not refresh Home. Pull down to retry when online.");
      }
    }
  }, [fetchAIInsights]);

  useFocusEffect(
    React.useCallback(() => {
      void loadData();
      return () => {
        homeRequestRef.current += 1;
        analysisRequestRef.current += 1;
        setAiInsightsLoading(false);
      };
    }, [loadData]),
  );

  useFocusEffect(
    React.useCallback(() => {
      void loadMonthlyChart();
      return () => {
        chartRequestRef.current += 1;
      };
    }, [loadMonthlyChart]),
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadData(true), loadMonthlyChart(true)]);
    } finally {
      setRefreshing(false);
    }
  }, [loadData, loadMonthlyChart]);

  const showPreviousMonth = React.useCallback(() => {
    const next = shiftMonth(chartMonth, -1);
    setChartDirection("previous");
    setChartSnapshot(activeUserIdRef.current
      ? homeCache.peekMonth(activeUserIdRef.current, next) : null);
    setChartMonth(next);
  }, [chartMonth]);

  const showNextMonth = React.useCallback(() => {
    const next = shiftMonth(chartMonth, 1);
    if (next > monthStartString()) return;
    setChartDirection("next");
    setChartSnapshot(activeUserIdRef.current
      ? homeCache.peekMonth(activeUserIdRef.current, next) : null);
    setChartMonth(next);
  }, [chartMonth]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greetingTitle}>Hi, {username}</Text>
          <Text style={styles.greetingSubtitle}>
            Let&apos;s improve your finances today
          </Text>
        </View>

        <TouchableOpacity
          style={styles.avatarWrapper}
          onPress={() => router.push("/profile")}
        >
          <View style={styles.avatarCircle}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{ width: "100%", height: "100%", borderRadius: 999 }}
              />
            ) : (
              <Ionicons name="person-outline" size={20} color={PRIMARY} />
            )}
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <TouchableOpacity
          style={styles.statBox}
          onPress={() => router.push("/budgets")}
          accessibilityLabel="Open monthly budget"
        >
          <View style={styles.statLabelRow}>
            <Ionicons name="calendar-outline" size={16} color="#052224" />
            <Text style={styles.statLabel}>Monthly Budget</Text>
          </View>
          <Text style={styles.incomeValue}>
            {monthlyBudget > 0 ? `RM${monthlyBudget.toFixed(2)}` : "Set budget"}
          </Text>
        </TouchableOpacity>

        <View style={[styles.statBox, styles.statBoxRight]}>
          <View style={styles.statLabelRow}>
            <Ionicons name="card-outline" size={16} color="#052224" />
            <Text style={styles.statLabel}>Total Expense</Text>
          </View>
          <Text style={styles.expenseValue}>RM{totalExpense.toFixed(2)}</Text>
        </View>
      </View>

      <View style={styles.progressWrapper}>
        <View style={styles.progressBarBackground}>
          <View
            style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
          />
        </View>
        <Text style={styles.progressPercentText}>{progressPercent}%</Text>
      </View>

      <View style={styles.statusRow}>
        <Ionicons name={status.icon} size={16} color={status.color} />
        <Text style={[styles.statusText, { color: status.color }]}>
          {status.text}
        </Text>
      </View>
      {homeSavedAt !== null && (
        <Text style={styles.homeSavedTime}>Home updated {displaySavedTime(homeSavedAt)}</Text>
      )}

      <View style={styles.bottomSheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 125 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {homeCacheNotice && (
            <View style={styles.cacheNotice}>
              <Ionicons name="cloud-offline-outline" size={18} color="#007D65" />
              <Text style={styles.cacheNoticeText}>{homeCacheNotice}</Text>
            </View>
          )}
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => router.push("/chatbot")}
            >
              <Image
                source={require("../../assets/images/Fin.png")}
                style={{ width: 22, height: 22 }}
                resizeMode="contain"
              />
              <Text style={styles.ctaText}>Ask Fin</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => router.push("/receiptscanner")}
            >
              <Ionicons name="receipt-outline" size={22} color="#093030" />
              <Text style={styles.ctaText}>Scan Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => router.push("/accounts")}
            >
              <Ionicons name="wallet-outline" size={22} color="#093030" />
              <Text style={styles.ctaText}>Accounts</Text>
            </TouchableOpacity>
          </View>

          <MonthlySpendingChart
            month={chartMonth}
            pendingMonth={chartMonth}
            direction={chartDirection}
            categories={monthlySpending.categories}
            total={monthlySpending.total}
            income={monthlySpending.income}
            incomeSource={monthlySpending.incomeSource}
            budget={chartSnapshot?.budget ?? 0}
            budgetUnavailable={chartSnapshot?.budgetUnavailable ?? false}
            hasData={chartSnapshot?.month === chartMonth}
            loading={chartLoading}
            error={chartError}
            canGoNext={chartMonth < monthStartString()}
            onPrevious={showPreviousMonth}
            onNext={showNextMonth}
            onRetry={loadMonthlyChart}
          />
          {chartSnapshot?.month === chartMonth && (
            <Text style={styles.cacheTimestamp}>
              Month saved {displaySavedTime(chartSnapshot.savedAt)} · available offline
            </Text>
          )}

          <View style={styles.insightsCard}>
            <View style={styles.insightsHeader}>
              <View style={styles.insightsHeaderAccent} />
              <View style={styles.insightsHeaderCopy}>
                <Text style={styles.insightsTitle}>Fin&apos;s Analysis</Text>
                <Text style={styles.insightsSubtitle}>
                  Patterns from your confirmed financial activity
                </Text>
              </View>
            </View>

            {aiInsightsLoading && (
              <Text style={styles.insightsMessage}>
                Fin is reviewing your spending habits...
              </Text>
            )}

            {aiInsights && aiInsights.length > 0 && (
              <View style={styles.insightsList}>
                {analysisTransactionCount !== null && (
                  <Text style={styles.insightsCoverage}>
                    Based on {analysisHistoryLimited ? "the latest " : ""}
                    {analysisTransactionCount} confirmed transactions
                  </Text>
                )}
                {analysisSavedAt !== null && (
                  <Text style={styles.insightsCoverage}>
                    Saved {displaySavedTime(analysisSavedAt)} · available offline
                  </Text>
                )}
                {aiInsights.map((line, index) => (
                  <View
                    key={`${index}-${line}`}
                    style={[
                      styles.insightRow,
                      { backgroundColor: INSIGHT_BACKGROUNDS[index % INSIGHT_BACKGROUNDS.length] },
                    ]}
                  >
                    <View
                      style={[
                        styles.insightBullet,
                        { backgroundColor: INSIGHT_ACCENTS[index % INSIGHT_ACCENTS.length] },
                      ]}
                    />
                    <Text selectable style={styles.insightText}>{line}</Text>
                  </View>
                ))}
              </View>
            )}

            {!aiInsightsLoading && (aiInsightsError || !aiInsights) && (
              <Text selectable style={styles.insightsMessage}>
                {aiInsightsError ?? "Fin's analysis will appear once your records load."}
              </Text>
            )}
          </View>

          {latestActivity && (
            <TouchableOpacity
              style={styles.latestActivityCard}
              onPress={() => router.push({
                pathname: "/transaction/[id]",
                params: { id: latestActivity.id },
              })}
              accessibilityRole="button"
              accessibilityLabel={`View latest ${latestActivity.source === "receipt" ? "scanned receipt" : "manual entry"}`}
              activeOpacity={0.85}
            >
              <View style={styles.latestActivityHeader}>
                <View style={styles.latestActivityHeaderIcon}>
                  <IconSymbol
                    name={latestActivity.source === "receipt" ? "doc.text" : "pencil"}
                    size={21}
                    color="#007D65"
                  />
                </View>
                <View style={styles.latestActivityHeaderText}>
                  <Text style={styles.latestActivityHeading}>Latest activity</Text>
                  <Text style={styles.latestActivitySubheading}>Your most recently added entry</Text>
                </View>
                <IconSymbol name="chevron.right" size={20} color="#52736D" />
              </View>

              <View style={styles.latestActivityMain}>
                <View style={styles.latestActivityMerchantBlock}>
                  <Text style={styles.latestActivityEyebrow}>
                    {latestActivity.transaction_type === "income" ? "FROM" : "AT"}
                  </Text>
                  <Text style={styles.latestActivityMerchant} numberOfLines={2}>
                    {latestActivity.merchant_name?.trim() ||
                      (latestActivity.transaction_type === "income" ? "Income" :
                        latestActivity.transaction_type === "refund" ? "Refund" : "Unnamed merchant")}
                  </Text>
                </View>
                <View style={styles.latestActivityAmountBlock}>
                  <Text style={styles.latestActivityEyebrow}>
                    {latestActivity.transaction_type === "income" ? "INCOME" :
                      latestActivity.transaction_type === "refund" ? "REFUND" : "SPENT"}
                  </Text>
                  <Text selectable numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.latestActivityAmount}>
                    {latestActivity.transaction_type === "expense" ? "−" : "+"}RM{Number(latestActivity.amount).toFixed(2)}
                  </Text>
                </View>
              </View>

              <View style={styles.latestActivityDetails}>
                <View style={styles.latestActivityDetail}>
                  <IconSymbol
                    name={latestActivity.source === "receipt" ? "doc.text" : "pencil"}
                    size={16}
                    color="#007D65"
                  />
                  <Text style={styles.latestActivityDetailText}>
                    {latestActivity.source === "receipt" ? "Scanned receipt" : "Manual entry"}
                  </Text>
                </View>
                <View style={styles.latestActivityDetail}>
                  <IconSymbol name="calendar" size={16} color="#007D65" />
                  <Text style={styles.latestActivityDetailText}>
                    {displayActivityDate(latestActivity.occurred_on)}
                  </Text>
                </View>
                <View style={styles.latestActivityDetail}>
                  <IconSymbol name="tag" size={16} color="#007D65" />
                  <Text style={styles.latestActivityDetailText} numberOfLines={1}>
                    {formatCategory(latestActivity.category)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        </ScrollView>
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
    paddingTop: 30,
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greetingTitle: {
    color: "#052224",
    fontSize: 20,
    fontWeight: "700",
  },
  greetingSubtitle: {
    color: "#052224",
    fontSize: 13,
    marginTop: 4,
  },
  avatarWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarCircle: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginTop: 8,
  },
  statBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  statBoxRight: {
    marginRight: 0,
    marginLeft: 8,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statLabel: {
    fontSize: 12,
    color: "#4A5B5B",
    marginTop: 2,
  },
  incomeValue: {
    marginTop: 6,
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  expenseValue: {
    marginTop: 6,
    color: "#0068FF",
    fontSize: 18,
    fontWeight: "800",
  },
  progressWrapper: {
    marginTop: 16,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  progressBarBackground: {
    flex: 1,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    overflow: "hidden",
    marginRight: 10,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#000000",
    borderRadius: 999,
  },
  progressPercentText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 4,
    gap: 6,
  },
  statusText: {
    color: "#052224",
    fontSize: 12,
  },
  homeSavedTime: {
    color: "#28665A",
    fontSize: 11,
    marginLeft: 20,
    marginTop: 3,
  },
  bottomSheet: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    marginTop: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  ctaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  ctaButton: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: PRIMARY,
    paddingVertical: 12,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 4,
    gap: 8,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#093030",
  },

  insightsCard: {
    marginTop: 16,
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CFEFE2",
    marginBottom: 16,
  },
  insightsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  insightsHeaderAccent: {
    width: 5,
    height: 46,
    borderRadius: 99,
    backgroundColor: "#00C995",
  },
  insightsHeaderCopy: { flex: 1 },
  insightsTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#093030",
  },
  insightsSubtitle: {
    fontSize: 12,
    color: "#41635D",
    lineHeight: 18,
    marginTop: 2,
  },
  insightsList: { gap: 10, marginTop: 16 },
  insightsCoverage: {
    fontSize: 11,
    fontWeight: "600",
    color: "#59736D",
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 15,
    borderRadius: 16,
  },
  insightBullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    color: "#093030",
  },
  insightsMessage: {
    fontSize: 13,
    lineHeight: 20,
    color: "#41635D",
    marginTop: 16,
  },
  cacheNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#E8FFF5",
    marginBottom: 14,
  },
  cacheNoticeText: { flex: 1, fontSize: 12, color: "#135547", fontWeight: "600" },
  cacheTimestamp: {
    fontSize: 11,
    color: "#59736D",
    marginTop: 7,
    marginLeft: 5,
  },
  badgeRow: {
    flexDirection: "row",
    marginTop: 14,
    justifyContent: "space-between",
  },
  badgeCard: {
    flex: 1,
    borderRadius: 16,
    padding: 10,
    marginHorizontal: 3,
  },
  badgeUnlocked: {
    backgroundColor: "#FFF7DA",
  },
  badgeLocked: {
    backgroundColor: "#E6ECEC",
  },
  badgeTitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#093030",
  },
  badgeDescription: {
    fontSize: 11,
    color: "#3B4B4B",
    marginTop: 2,
  },
  latestActivityCard: {
    marginTop: 10,
    marginBottom: 16,
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#F2FFF9",
    borderWidth: 1,
    borderColor: "#BFEEDA",
  },
  latestActivityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  latestActivityHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#CFF7E6",
  },
  latestActivityHeaderText: { flex: 1 },
  latestActivityHeading: {
    fontSize: 19,
    fontWeight: "800",
    color: "#093030",
  },
  latestActivitySubheading: {
    fontSize: 12,
    color: "#55736C",
    marginTop: 2,
  },
  latestActivityMain: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 18,
    marginTop: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D7EFE4",
  },
  latestActivityMerchantBlock: { flex: 1 },
  latestActivityAmountBlock: { alignItems: "flex-end", maxWidth: "55%" },
  latestActivityEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#598076",
    marginBottom: 5,
  },
  latestActivityMerchant: {
    fontSize: 17,
    fontWeight: "800",
    color: "#093030",
  },
  latestActivityAmount: {
    fontSize: 21,
    fontWeight: "800",
    color: "#008B6C",
    fontVariant: ["tabular-nums"],
  },
  latestActivityDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  latestActivityDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#DEF7EB",
  },
  latestActivityDetailText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#135547",
    flexShrink: 1,
  },
});
