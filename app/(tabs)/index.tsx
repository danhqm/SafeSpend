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
import ConfettiCannon from "react-native-confetti-cannon";
import { SafeAreaView } from "react-native-safe-area-context";
import { expenseEffect, localDateString } from "../../types/finance";
import { setupSmartNotifications } from "../../utils/notifications";
import { authenticatedApiFetch } from "../../utils/api";
import { supabase } from "../../utils/supabase";

const PRIMARY = "#00D09E";

const CATEGORY_COLORS: Record<string, string> = {
  FOOD_AND_DRINK: "#FF6B6B",
  GROCERIES: "#22C55E",
  TRANSPORT: "#F59E0B",
  SHOPPING: "#3B82F6",
  BILLS: "#8B5CF6",
  ENTERTAINMENT: "#EC4899",
  HEALTHCARE: "#14B8A6",
  EDUCATION: "#6366F1",
  HOUSING: "#A16207",
  OTHER: "#9CA3AF",
};

type WeeklyPoint = {
  label: string;
  total: number;
  categories: Record<string, number>;
};

function computeStreak(dates: string[]): number {
  if (!dates.length) return 0;

  const uniqueDates = Array.from(new Set(dates));
  const sorted = uniqueDates
    .map((d) => new Date(d + "T00:00:00"))
    .sort((a, b) => b.getTime() - a.getTime());

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    const diffDays = Math.round(
      (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays === streak) {
      streak++;
    } else if (diffDays > streak) {
      break;
    }
  }
  return streak;
}

function getDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateString(d);
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

function finSentence(s: string): string {
  if (!s) return "";
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function formatWeekLabel(startOfWeek: Date) {
  const end = new Date(startOfWeek);
  end.setDate(startOfWeek.getDate() + 6);

  const monthShort = (d: Date) => d.toLocaleString("en-GB", { month: "short" });

  const day = (d: Date) => d.getDate();

  if (startOfWeek.getMonth() === end.getMonth()) {
    return `Week of ${day(startOfWeek)}–${day(end)} ${monthShort(end)}`;
  }

  return `Week of ${day(startOfWeek)} ${monthShort(startOfWeek)} – ${day(end)} ${monthShort(end)}`;
}

export default function HomeScreen() {
  const router = useRouter();

  const [username, setUsername] = useState<string>("Guest");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [monthlyBudget, setMonthlyBudget] = useState<number>(0);
  const [totalExpense, setTotalExpense] = useState<number>(0);
  const [weeklyData, setWeeklyData] = useState<WeeklyPoint[]>(
    Array.from({ length: 7 }, (_, i) => ({
      label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
      total: 0,
      categories: {},
    })),
  );
  const [monthReceiptCount, setMonthReceiptCount] = useState<number>(0);
  const [streakCount, setStreakCount] = useState<number>(0);
  const [insights, setInsights] = useState<string[]>([]);
  const [lastReceipt, setLastReceipt] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const status = getSmartStatus(totalExpense, monthlyBudget);
  const [aiInsights, setAiInsights] = useState<string[] | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [weekLabel, setWeekLabel] = useState<string>("");
  const [showConfetti, setShowConfetti] = useState(false);
  const prevStreakRef = useRef<number>(0);

  useEffect(() => {
    void setupSmartNotifications();
  }, []);

  useEffect(() => {
    const prev = prevStreakRef.current;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    if (streakCount > prev) {
      const milestones = new Set([3, 7, 30]);
      if (milestones.has(streakCount)) {
        showTimer = setTimeout(() => {
          setShowConfetti(true);
          hideTimer = setTimeout(() => setShowConfetti(false), 2500);
        }, 0);
      }
    }
    prevStreakRef.current = streakCount;

    return () => {
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [streakCount]);

  const progressPercent =
    monthlyBudget > 0
      ? Math.min(100, Math.round((totalExpense / monthlyBudget) * 100))
      : 0;

  const fetchAIInsights = React.useCallback(async (payload: any) => {
    try {
      setAiInsightsLoading(true);
      setAiInsights(null);

      const resp = await authenticatedApiFetch("/api/fin-insights", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const text = await resp.text();
      if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
        console.log("Not JSON response (likely HTML). Check API URL/route.");
        return;
      }

      const json = JSON.parse(text);

      setAiInsights(json.insights);
    } catch (err) {
      console.log("Fin insights fetch error:", err);
    } finally {
      setAiInsightsLoading(false);
    }
  }, []);

  const loadData = React.useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user;

    if (authError || !user) {
      console.log("Home: no user", authError);
      return;
    }

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
      .select("amount, transaction_type, receipt_id")
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
      setMonthReceiptCount(
        monthTransactions.filter((row: any) => Boolean(row.receipt_id)).length,
      );
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

    const todayAtMidnight = new Date();
    todayAtMidnight.setHours(0, 0, 0, 0);

    const jsDay = todayAtMidnight.getDay();
    const diffToMonday = (jsDay + 6) % 7;

    const startOfWeek = new Date(todayAtMidnight);
    startOfWeek.setDate(todayAtMidnight.getDate() - diffToMonday);
    setWeekLabel(formatWeekLabel(startOfWeek));

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const points: WeeklyPoint[] = [
      { label: "Mon", total: 0, categories: {} },
      { label: "Tue", total: 0, categories: {} },
      { label: "Wed", total: 0, categories: {} },
      { label: "Thu", total: 0, categories: {} },
      { label: "Fri", total: 0, categories: {} },
      { label: "Sat", total: 0, categories: {} },
      { label: "Sun", total: 0, categories: {} },
    ];

    const weekStartStr = localDateString(startOfWeek);
    const weekEndStr = localDateString(endOfWeek);

    const { data: weekTransactions, error: weekError } = await supabase
      .from("transactions")
      .select("amount, occurred_on, category, transaction_type")
      .eq("user_id", user.id)
      .eq("status", "posted")
      .in("transaction_type", ["expense", "refund"])
      .gte("occurred_on", weekStartStr)
      .lt("occurred_on", weekEndStr);

    if (weekError) {
      console.log("Home: week transactions error", weekError);
    } else {
      (weekTransactions || []).forEach((row: any) => {
        const transactionDate = new Date(`${row.occurred_on}T00:00:00`);
        const js = transactionDate.getDay();
        const idx = js === 0 ? 6 : js - 1;
        const amount = expenseEffect(row.transaction_type, row.amount);
        const rawCat = (row.category || "OTHER") as string;
        const cat = CATEGORY_COLORS[rawCat] ? rawCat : "OTHER";

        points[idx].total += amount;
        points[idx].categories[cat] =
          (points[idx].categories[cat] || 0) + amount;
      });

      points.forEach((point) => {
        point.categories = Object.fromEntries(
          Object.entries(point.categories).filter(([, amount]) => amount > 0),
        );
        point.total = Object.values(point.categories).reduce(
          (sum, amount) => sum + amount,
          0,
        );
      });

      setWeeklyData(points);
    }

    const weeklyTotal = points.reduce((acc, p) => acc + p.total, 0);

    const byCat: Record<string, number> = {};
    points.forEach((p) => {
      Object.entries(p.categories).forEach(([cat, amt]) => {
        byCat[cat] = (byCat[cat] || 0) + Number(amt || 0);
      });
    });

    const topCategories = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, amount]) => ({
        category,
        amount: Number(amount.toFixed(2)),
      }));

    const { data: weekGoals, error: goalsErr } = await supabase
      .from("user_goals")
      .select("title, notes, completed, week_start")
      .eq("user_id", user.id)
      .eq("week_start", weekStartStr);

    if (goalsErr) console.log("Home: goals error", goalsErr);

    const weeklyIncomeEstimate = incomeNum > 0 ? incomeNum / 4 : 0;

    const payload = {
      currency: "MYR",
      month: today.getMonth() + 1,
      year: today.getFullYear(),
      monthlyIncome: incomeNum,
      weeklyIncomeEstimate,
      weekStartStr,
      weekEndStr,
      weeklyExpense: Number(weeklyTotal.toFixed(2)),
      topSpendCategories: topCategories,
      weeklyGoals: (weekGoals || []).map((g: any) => ({
        title: g.title,
        notes: g.notes,
        completed: g.completed,
        week_start: g.week_start,
      })),
    };

    await fetchAIInsights(payload);

    const { data: streakRows, error: streakError } = await supabase
      .from("user_streaks")
      .select("date")
      .eq("user_id", user.id);

    if (streakError) {
      console.log("Home: streak error", streakError);
    } else if (streakRows) {
      const dates = streakRows.map((r: any) => r.date as string);
      setStreakCount(computeStreak(dates));
    }

    const fourteenDaysAgoStr = getDateNDaysAgo(13);

    const { data: insightTransactions, error: insightError } = await supabase
      .from("transactions")
      .select("amount, category, occurred_on, transaction_type")
      .eq("user_id", user.id)
      .eq("status", "posted")
      .in("transaction_type", ["expense", "refund"])
      .gte("occurred_on", fourteenDaysAgoStr)
      .lte("occurred_on", todayStr);

    if (insightError) {
      console.log("Home: insight transactions error", insightError);
      setInsights([]);
    } else if (insightTransactions) {
      const now = new Date();
      const startOfThisWeek = new Date(now);
      startOfThisWeek.setDate(now.getDate() - now.getDay());
      startOfThisWeek.setHours(0, 0, 0, 0);

      const startOfLastWeek = new Date(startOfThisWeek);
      startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

      const thisWeekByCat: Record<string, number> = {};
      const lastWeekByCat: Record<string, number> = {};
      let thisWeekTotal = 0;
      let lastWeekTotal = 0;

      (insightTransactions || []).forEach((row: any) => {
        const date = new Date(`${row.occurred_on}T00:00:00`);
        const amount = expenseEffect(row.transaction_type, row.amount);
        const cat = (row.category || "OTHER") as string;

        if (date >= startOfThisWeek) {
          thisWeekByCat[cat] = (thisWeekByCat[cat] || 0) + amount;
          thisWeekTotal += amount;
        } else if (date >= startOfLastWeek && date < startOfThisWeek) {
          lastWeekByCat[cat] = (lastWeekByCat[cat] || 0) + amount;
          lastWeekTotal += amount;
        }
      });

      const newInsights: string[] = [];
      let topCategory: string | null = null;
      let topAmount = 0;
      for (const cat in thisWeekByCat) {
        if (thisWeekByCat[cat] > topAmount) {
          topAmount = thisWeekByCat[cat];
          topCategory = cat;
        }
      }

      if (topCategory) {
        newInsights.push(
          `🏅 Highest spending this week: ${topCategory
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (c) =>
              c.toUpperCase(),
            )} (RM${topAmount.toFixed(2)}).`,
        );
      }

      if (lastWeekTotal > 0) {
        const diff = thisWeekTotal - lastWeekTotal;
        const pct = Math.round((diff / lastWeekTotal) * 100);

        if (pct > 0) {
          newInsights.push(
            `📈 Your total spending is up ${pct}% compared to last week.`,
          );
        } else if (pct < 0) {
          newInsights.push(
            `📉 Your total spending is down ${Math.abs(pct)}% compared to last week. Nice job!`,
          );
        } else {
          newInsights.push(`⚖️ Your spending is about the same as last week.`);
        }
      } else if (thisWeekTotal > 0) {
        newInsights.push(
          `🆕 You started tracking this week with RM${thisWeekTotal.toFixed(2)} recorded.`,
        );
      }

      setInsights(newInsights);
    }
  }, [fetchAIInsights]);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const maxWeekly = Math.max(...weeklyData.map((p) => p.total), 1);

  let suggestion = "Keep tracking your spending to build better habits.";
  if (progressPercent >= 80) {
    suggestion =
      "You’ve used most of your monthly budget. Try slowing down non-essential spending.";
  } else if (progressPercent >= 50) {
    suggestion =
      "You’re halfway through your budget this month. Review your transactions to stay on track.";
  } else if (progressPercent > 0 && progressPercent < 50) {
    suggestion =
      "Nice! Your spending is under 50% of your budget. Keep tracking consistently.";
  }

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
          contentContainerStyle={{ paddingBottom: 65 }}
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
          </View>

          <Text style={styles.sectionTitle}>Your Spending Pattern</Text>

          <Text style={styles.weekLabel}>{weekLabel}</Text>

          <View style={styles.chartCard}>
            <View style={styles.chartHeaderRow}>
              <Text style={styles.chartTitle}>Weekly Expenses</Text>
              <View style={styles.chartIconBubble}>
                <Ionicons name="calendar-outline" size={18} color="#093030" />
              </View>
            </View>

            <View style={styles.chartBody}>
              {weeklyData.map((point, idx) => {
                const height =
                  maxWeekly > 0 ? 20 + (80 * point.total) / maxWeekly : 20;

                const categories = Object.entries(point.categories);

                return (
                  <View key={idx} style={styles.barWrapper}>
                    <View style={[styles.bar, { height }]}>
                      {point.total > 0 && categories.length > 0 ? (
                        categories.map(([cat, amount]) => {
                          const ratio = Number(amount) / point.total || 0;
                          const segmentHeight = ratio * height;
                          const color = CATEGORY_COLORS[cat] || "#9CA3AF";

                          return (
                            <View
                              key={cat}
                              style={{
                                width: "100%",
                                height: segmentHeight,
                                backgroundColor: color,
                              }}
                            />
                          );
                        })
                      ) : (
                        <View
                          style={{
                            width: "100%",
                            height: "100%",
                            backgroundColor: "#E5E7EB",
                          }}
                        />
                      )}
                    </View>
                    <Text style={styles.barLabel}>{point.label}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.legendRow}>
              {Object.entries(CATEGORY_COLORS).map(([key, color]) => (
                <View key={key} style={styles.legendItem}>
                  <View
                    style={[styles.legendDot, { backgroundColor: color }]}
                  />
                  <Text style={styles.legendLabel}>
                    {key
                      .replace(/_/g, " ")
                      .toLowerCase()
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.insightsCard}>
            <Text style={styles.insightsTitle}>Fin&apos;s Insights</Text>

            {aiInsightsLoading && (
              <Text style={styles.insightsText}>
                Fin is analysing your recent receipts...
              </Text>
            )}

            {!aiInsightsLoading && aiInsights && aiInsights.length > 0 && (
              <View style={{ marginTop: 12 }}>
                {aiInsights.map((line, index) => (
                  <Text key={index} style={styles.insightsText}>
                    • {line}
                  </Text>
                ))}
              </View>
            )}

            {!aiInsightsLoading && (!aiInsights || aiInsights.length === 0) && (
              <View>
                <Text style={styles.insightsText}>
                  Fin found out that {finSentence(suggestion)}
                </Text>

                {insights.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={[styles.insightsText, { marginBottom: 4 }]}>
                      Here&apos;s what else Fin noticed:
                    </Text>
                    {insights.map((line, index) => (
                      <Text key={index} style={styles.insightsText}>
                        • {line}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
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

          <View style={styles.streakRow}>
            <View
              style={[
                styles.statCard,
                streakCount >= 3 && styles.streakGlowCard,
              ]}
            >
              <View style={[styles.statIcon, { backgroundColor: "#E0FFF4" }]}>
                <Ionicons name="flame" size={18} color="#00D09E" />
              </View>

              <Text style={styles.statValue}>
                {streakCount}
                <Text style={styles.statUnit}>
                  {" "}
                  day{streakCount === 1 ? "" : "s"}
                </Text>
              </Text>

              <Text style={styles.statLabel}>Daily Streak</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: "#FFF4E0" }]}>
                <Ionicons name="receipt-outline" size={18} color="#F59E0B" />
              </View>

              <Text style={styles.statValue}>{monthReceiptCount}</Text>
              <Text style={styles.statLabel}>Receipts this month</Text>
            </View>
          </View>
        </ScrollView>
      </View>
      {showConfetti && (
        <ConfettiCannon
          count={90}
          origin={{ x: 180, y: 0 }}
          fadeOut
          fallSpeed={2500}
        />
      )}
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
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#093030",
  },
  statUnit: {
    fontSize: 13,
    fontWeight: "600",
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

  sectionTitle: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
    color: "#093030",
    marginBottom: 4,
  },
  chartCard: {
    backgroundColor: "#E9FFF4",
    borderRadius: 26,
    padding: 16,
    marginBottom: 16,
  },
  chartHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#093030",
  },
  chartIconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#C7F2D9",
    justifyContent: "center",
    alignItems: "center",
  },

  chartBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 12,
  },
  barWrapper: {
    alignItems: "center",
    flex: 1,
  },
  bar: {
    width: 10,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    flexDirection: "column-reverse",
  },
  barLabel: {
    fontSize: 10,
    color: "#093030",
    marginTop: 4,
  },
  chartSummaryText: {
    marginTop: 10,
    fontSize: 12,
    color: "#093030",
  },
  insightsCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: "#F4FBF7",
    marginBottom: 16,
  },
  insightsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#093030",
    marginBottom: 4,
  },
  insightsText: {
    fontSize: 11,
    color: "#093030",
    lineHeight: 22,
    marginBottom: 10,
  },
  streakRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginVertical: 16,
  },
  streakLabel: {
    fontSize: 12,
    color: "#4A5B5B",
  },
  streakValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#093030",
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
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
    marginBottom: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  legendLabel: {
    fontSize: 10,
    color: "#093030",
  },
  weekLabel: {
    marginTop: 5,
    marginBottom: 16,
    fontWeight: "600",
    textAlign: "center",
    fontSize: 18,
    color: "#093030",
  },
  streakGlowCard: {
    borderWidth: 1.5,
    borderColor: "#00D09E",
    shadowColor: "#00D09E",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
