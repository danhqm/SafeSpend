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
import {
  expenseEffect,
  localDateString,
  monthStartString,
  shiftMonth,
  summarizeMonthlySpending,
  type MonthlySpendingRow,
} from "../../types/finance";
import { setupSmartNotifications } from "../../utils/notifications";
import { authenticatedApiFetch } from "../../utils/api";
import { supabase } from "../../utils/supabase";

const PRIMARY = "#00D09E";
const INSIGHT_ACCENTS = ["#00A884", "#2775E8", "#F5A524"];
const INSIGHT_BACKGROUNDS = ["#E8FFF5", "#EAF3FF", "#FFF5E2"];

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
  const [chartSnapshot, setChartSnapshot] = useState<{
    month: string;
    rows: MonthlySpendingRow[];
    budget: number;
    budgetUnavailable: boolean;
  } | null>(null);
  const [chartDirection, setChartDirection] = useState<"previous" | "next">("next");
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const chartRequestRef = useRef(0);
  const [lastReceipt, setLastReceipt] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const status = getSmartStatus(totalExpense, monthlyBudget);
  const [aiInsights, setAiInsights] = useState<string[] | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsError, setAiInsightsError] = useState<string | null>(null);
  const [analysisTransactionCount, setAnalysisTransactionCount] = useState<number | null>(null);
  const [analysisHistoryLimited, setAnalysisHistoryLimited] = useState(false);
  const analysisRequestRef = useRef(0);
  const monthlySpending = React.useMemo(
    () => summarizeMonthlySpending(chartSnapshot?.rows ?? [], profileMonthlyIncome),
    [chartSnapshot, profileMonthlyIncome],
  );

  useEffect(() => {
    void setupSmartNotifications();
  }, []);

  const progressPercent =
    monthlyBudget > 0
      ? Math.min(100, Math.round((totalExpense / monthlyBudget) * 100))
      : 0;

  const fetchAIInsights = React.useCallback(async () => {
    const requestId = ++analysisRequestRef.current;
    try {
      setAiInsightsLoading(true);
      setAiInsightsError(null);
      setAiInsights(null);

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
      if (requestId === analysisRequestRef.current) {
        setAiInsights(lines);
        setAnalysisTransactionCount(
          Number.isInteger(json.recordedTransactions) ? json.recordedTransactions : null,
        );
        setAnalysisHistoryLimited(Boolean(json.historyLimited));
      }
    } catch (err) {
      console.log("Fin analysis fetch error:", err);
      if (requestId === analysisRequestRef.current) {
        setAiInsightsError("Fin's analysis is unavailable. Pull down to retry.");
      }
    } finally {
      if (requestId === analysisRequestRef.current) setAiInsightsLoading(false);
    }
  }, []);

  const loadMonthlyChart = React.useCallback(async () => {
    const requestId = ++chartRequestRef.current;
    setChartLoading(true);
    setChartError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const user = authData?.user;
      if (authError || !user) throw authError ?? new Error("Please sign in again.");

      const pageSize = 500;
      const rows: MonthlySpendingRow[] = [];
      const budgetResult = Promise.resolve(supabase
        .from("budgets")
        .select("amount")
        .eq("user_id", user.id)
        .eq("month_start", chartMonth)
        .eq("category", "ALL")
        .maybeSingle());
      const monthEnd = shiftMonth(chartMonth, 1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endExclusive = chartMonth === monthStartString()
        ? localDateString(tomorrow)
        : monthEnd;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("transactions")
          .select("id, amount, category, transaction_type")
          .eq("user_id", user.id)
          .eq("status", "posted")
          .in("transaction_type", ["expense", "refund", "income"])
          .gte("occurred_on", chartMonth)
          .lt("occurred_on", endExclusive)
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;
        rows.push(...((data ?? []) as MonthlySpendingRow[]));
        if (!data || data.length < pageSize) break;
      }

      const { data: budget, error: budgetError } = await budgetResult;
      if (budgetError) console.log("Home: chart budget error", budgetError);

      if (requestId === chartRequestRef.current) {
        setChartSnapshot({
          month: chartMonth,
          rows,
          budget: Math.max(0, Number(budget?.amount) || 0),
          budgetUnavailable: Boolean(budgetError),
        });
      }
    } catch (error) {
      console.log("Home: monthly spending error", error);
      if (requestId === chartRequestRef.current) {
        setChartError("Could not load this month.");
      }
    } finally {
      if (requestId === chartRequestRef.current) setChartLoading(false);
    }
  }, [chartMonth]);

  const loadData = React.useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user;

    if (authError || !user) {
      console.log("Home: no user", authError);
      return;
    }

    const analysisPromise = fetchAIInsights();

    let incomeNum = 0;

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("username, monthly_income, avatar_url")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      console.log("Home: profile error", profileError);
    } else if (profile) {
      setUsername(profile.username || "User");
      if (profile.avatar_url) setAvatarUrl(profile.avatar_url);

      const rawIncome = profile.monthly_income;
      if (typeof rawIncome === "number") incomeNum = rawIncome;
      else incomeNum = parseFloat(rawIncome ?? "0");
    }
    setProfileMonthlyIncome(Number.isFinite(incomeNum) ? incomeNum : 0);

    const today = new Date();
    const todayStr = localDateString(today);
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstOfMonthStr = localDateString(firstOfMonth);

    const { data: overallBudget, error: budgetError } = await supabase
      .from("budgets")
      .select("amount")
      .eq("user_id", user.id)
      .eq("month_start", firstOfMonthStr)
      .eq("category", "ALL")
      .maybeSingle();

    if (budgetError) {
      console.log("Home: budget error", budgetError);
      setMonthlyBudget(0);
    } else {
      setMonthlyBudget(Number(overallBudget?.amount) || 0);
    }

    const { data: monthTransactions, error: monthError } = await supabase
      .from("transactions")
      .select("amount, transaction_type")
      .eq("user_id", user.id)
      .eq("status", "posted")
      .in("transaction_type", ["expense", "refund"])
      .gte("occurred_on", firstOfMonthStr)
      .lte("occurred_on", todayStr);

    if (monthError) {
      console.log("Home: month transactions error", monthError);
    } else if (monthTransactions) {
      const sum = monthTransactions.reduce((acc: number, row: any) => {
        return acc + expenseEffect(row.transaction_type, row.amount);
      }, 0);

      setTotalExpense(Math.max(0, sum));
    }

    const { data: lastRows, error: lastError } = await supabase
      .from("transactions")
      .select(
        "id, merchant_name, amount, occurred_on, category, created_at, receipt_id",
      )
      .eq("user_id", user.id)
      .eq("status", "posted")
      .not("receipt_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (lastError) {
      console.log("Home: last receipt error", lastError);
    } else if (lastRows && lastRows.length > 0) {
      const latest = lastRows[0];
      setLastReceipt({
        ...latest,
        total_amount: latest.amount,
        receipt_date: latest.occurred_on,
      });
    } else {
      setLastReceipt(null);
    }

    await analysisPromise;
  }, [fetchAIInsights]);

  useFocusEffect(
    React.useCallback(() => {
      void loadData();
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
      await Promise.all([loadData(), loadMonthlyChart()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadData, loadMonthlyChart]);

  const showPreviousMonth = React.useCallback(() => {
    if (chartLoading) return;
    setChartDirection("previous");
    setChartMonth(shiftMonth(chartSnapshot?.month ?? chartMonth, -1));
  }, [chartLoading, chartMonth, chartSnapshot]);

  const showNextMonth = React.useCallback(() => {
    if (chartLoading) return;
    const next = shiftMonth(chartSnapshot?.month ?? chartMonth, 1);
    if (next > monthStartString()) return;
    setChartDirection("next");
    setChartMonth(next);
  }, [chartLoading, chartMonth, chartSnapshot]);

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

      <View style={styles.bottomSheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 125 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
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
            month={chartSnapshot?.month ?? chartMonth}
            pendingMonth={chartMonth}
            direction={chartDirection}
            categories={monthlySpending.categories}
            total={monthlySpending.total}
            income={monthlySpending.income}
            incomeSource={monthlySpending.incomeSource}
            budget={chartSnapshot?.budget ?? 0}
            budgetUnavailable={chartSnapshot?.budgetUnavailable ?? false}
            hasData={chartSnapshot !== null}
            loading={chartLoading}
            error={chartError}
            canGoNext={!chartLoading && (chartSnapshot?.month ?? chartMonth) < monthStartString()}
            onPrevious={showPreviousMonth}
            onNext={showNextMonth}
            onRetry={loadMonthlyChart}
          />

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

            {!aiInsightsLoading && aiInsights && aiInsights.length > 0 && (
              <View style={styles.insightsList}>
                {analysisTransactionCount !== null && (
                  <Text style={styles.insightsCoverage}>
                    Based on {analysisHistoryLimited ? "the latest " : ""}
                    {analysisTransactionCount} confirmed transactions
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

          {lastReceipt && (
            <View style={styles.lastReceiptCard}>
              <Text style={styles.lastReceiptTitle}>Last Receipt</Text>

              <Text style={styles.lastReceiptLabel}>Merchant</Text>
              <Text style={styles.lastReceiptValue}>
                {lastReceipt.merchant_name || "Unknown"}
              </Text>

              <Text style={styles.lastReceiptLabel}>Date</Text>
              <Text style={styles.lastReceiptValue}>
                {lastReceipt.receipt_date || "—"}
              </Text>

              <Text style={styles.lastReceiptLabel}>Total Amount</Text>
              <Text style={styles.lastReceiptValue}>
                RM {Number(lastReceipt.total_amount || 0).toFixed(2)}
              </Text>

              <Text style={styles.lastReceiptLabel}>Category</Text>
              <Text style={styles.lastReceiptValue}>
                {lastReceipt.category
                  ? lastReceipt.category
                      .replace(/_/g, " ")
                      .toLowerCase()
                      .replace(/\b\w/g, (c: string) => c.toUpperCase())
                  : "Not categorized"}
              </Text>
            </View>
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
  lastReceiptCard: {
    marginTop: 10,
    marginBottom: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#F4FBF7",
  },
  lastReceiptTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#093030",
    marginBottom: 8,
  },
  lastReceiptLabel: {
    fontSize: 11,
    color: "#4A5B5B",
    marginTop: 4,
  },
  lastReceiptValue: {
    fontSize: 12,
    color: "#093030",
    fontWeight: "600",
  },
});
