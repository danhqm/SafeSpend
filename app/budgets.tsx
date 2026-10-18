import {
  BUDGET_CATEGORIES,
  EXPENSE_CATEGORIES,
  expenseEffect,
  formatCategory,
  monthDisplayName,
  monthStartString,
  shiftMonth,
  type BudgetCategory,
  type LedgerTransaction,
  type MonthlyBudget,
} from "@/types/finance";
import { supabase } from "@/utils/supabase";
import { homeCache } from "@/utils/home-cache";
import { fetchAllPages } from "@/utils/pagination-core";
import { screenColors as colors } from "@/utils/screen-theme";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const PRIMARY = "#00D09E";

type BudgetInputs = Partial<Record<BudgetCategory, string>>;
type Actuals = Record<string, number>;

function budgetProgress(actual: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, Math.max(0, (actual / limit) * 100));
}

export default function BudgetsScreen() {
  const [selectedMonth, setSelectedMonth] = useState(monthStartString());
  const [inputs, setInputs] = useState<BudgetInputs>({});
  const [actuals, setActuals] = useState<Actuals>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalActual = useMemo(
    () => Math.max(0, Object.values(actuals).reduce((sum, amount) => sum + amount, 0)),
    [actuals],
  );

  const loadMonth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (authError || !userId) throw authError ?? new Error("Authentication required");

      const monthEnd = shiftMonth(selectedMonth, 1);
      const [budgetResult, transactions] = await Promise.all([
        supabase
          .from("budgets")
          .select("id, user_id, month_start, category, amount, currency")
          .eq("user_id", userId)
          .eq("month_start", selectedMonth),
        fetchAllPages(() => supabase
          .from("transactions")
          .select("id, transaction_type, amount, category", { count: "exact" })
          .eq("user_id", userId)
          .eq("status", "posted")
          .in("transaction_type", ["expense", "refund"])
          .gte("occurred_on", selectedMonth)
          .lt("occurred_on", monthEnd)),
      ]);

      if (budgetResult.error) throw budgetResult.error;

      const nextInputs: BudgetInputs = {};
      ((budgetResult.data || []) as unknown as MonthlyBudget[]).forEach((budget) => {
        nextInputs[budget.category] = Number(budget.amount).toFixed(2);
      });

      const nextActuals: Actuals = {};
      transactions.forEach((transaction) => {
        const row = transaction as Pick<LedgerTransaction, "transaction_type" | "amount" | "category">;
        nextActuals[row.category] =
          (nextActuals[row.category] || 0) + expenseEffect(row.transaction_type, row.amount);
      });

      setInputs(nextInputs);
      setActuals(nextActuals);
    } catch (loadError) {
      console.error("Budget load failed", loadError);
      setError("Could not load this month’s budget. Pull down or try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useFocusEffect(
    useCallback(() => {
      void loadMonth();
    }, [loadMonth]),
  );

  const saveBudgets = async () => {
    const payload: Partial<Record<BudgetCategory, number>> = {};
    for (const category of BUDGET_CATEGORIES) {
      const raw = inputs[category]?.trim();
      if (!raw) continue;
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99) {
        Alert.alert("Check budget", `${formatCategory(category)} must be greater than zero.`);
        return;
      }
      payload[category] = Math.round(amount * 100) / 100;
    }

    setSaving(true);
    try {
      const { error: saveError } = await supabase.rpc("replace_monthly_budgets", {
        p_month_start: selectedMonth,
        p_budgets: payload,
      });
      if (saveError) throw saveError;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user.id) {
          await homeCache.invalidateMonths(sessionData.session.user.id, [selectedMonth]);
        }
      } catch (cacheError) {
        console.warn("Could not clear saved Home summary", cacheError);
      }
      await loadMonth();
      Alert.alert("Budget saved", `Your plan for ${monthDisplayName(selectedMonth)} is ready.`);
    } catch (saveError) {
      console.error("Budget save failed", saveError);
      Alert.alert("Could not save", "Your current budget was not changed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const renderBudgetRow = (category: BudgetCategory, actual: number) => {
    const limit = Number(inputs[category]) || 0;
    const remaining = limit - actual;
    const over = limit > 0 && remaining < 0;
    return (
      <View key={category} style={[styles.budgetCard, category === 'ALL' && styles.overallCard]}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBlock}>
            <Text style={[styles.categoryTitle, category === 'ALL' && styles.overallTitle]}>
              {category === "ALL" ? "Overall monthly limit" : formatCategory(category)}
            </Text>
            <Text style={[styles.actualText, category === 'ALL' && styles.overallActual, over && (category === 'ALL' ? styles.overallOver : styles.overText)]}>
              RM{Math.max(0, actual).toFixed(2)} spent
              {limit > 0
                ? ` · ${over ? "RM" + Math.abs(remaining).toFixed(2) + " over" : "RM" + remaining.toFixed(2) + " left"}`
                : " · No limit"}
            </Text>
          </View>
          <View style={styles.inputWrap}>
            <Text style={styles.currencyPrefix}>RM</Text>
            <TextInput
              value={inputs[category] ?? ""}
              onChangeText={(value) =>
                setInputs((current) => ({ ...current, [category]: value }))
              }
              placeholder="—"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              accessibilityLabel={`${formatCategory(category)} budget in ringgit`}
              style={styles.amountInput}
            />
          </View>
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              over && styles.fillOver,
              { width: `${budgetProgress(actual, limit)}%` },
            ]}
          />
        </View>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "Monthly Budget" }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.monthPicker}>
            <TouchableOpacity
              style={styles.monthButton}
              accessibilityRole="button"
              onPress={() => setSelectedMonth((month) => shiftMonth(month, -1))}
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={22} color={colors.mint} />
            </TouchableOpacity>
            <View style={styles.monthTextBlock}>
              <Text style={styles.monthLabel}>{monthDisplayName(selectedMonth)}</Text>
              <Text style={styles.monthHint}>Plan versus posted spending</Text>
            </View>
            <TouchableOpacity
              style={styles.monthButton}
              accessibilityRole="button"
              onPress={() => setSelectedMonth((month) => shiftMonth(month, 1))}
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={22} color={colors.mint} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.teal} />
            </View>
          ) : (
            <>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {renderBudgetRow("ALL", totalActual)}
              <Text style={styles.sectionTitle}>Category limits</Text>
              <Text style={styles.sectionHint}>
                Optional limits help you see where the month is drifting. Refunds reduce spending.
              </Text>
              {EXPENSE_CATEGORIES.map((category) =>
                renderBudgetRow(category, Math.max(0, actuals[category] || 0)),
              )}
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.disabled]}
                accessibilityRole="button"
                onPress={saveBudgets}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.mint} />
                ) : (
                  <Text style={styles.saveText}>Save monthly budget</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.saveHint}>Leave a field blank to remove that limit.</Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 20, paddingTop: 28, paddingBottom: 48, width: '100%', maxWidth: 780, alignSelf: 'center' },
  monthPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  monthButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.teal,
  },
  monthTextBlock: { alignItems: "center" },
  monthLabel: { color: colors.ink, fontFamily: 'Poppins_700Bold', fontSize: 19 },
  monthHint: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 2 },
  loadingState: { minHeight: 420, alignItems: "center", justifyContent: "center" },
  errorText: { color: '#B42318', backgroundColor: '#FFF0ED', padding: 12, borderRadius: 12, textAlign: "center", marginBottom: 12 },
  budgetCard: {
    padding: 18,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  overallCard: { backgroundColor: colors.teal, paddingVertical: 24 },
  overallTitle: { color: colors.surface },
  overallActual: { color: colors.field },
  overallOver: { color: '#FFD6C9', fontWeight: '700' },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: 'wrap' },
  cardTitleBlock: { flex: 1, minWidth: 0 },
  categoryTitle: { color: colors.ink, fontFamily: 'Poppins_700Bold', fontSize: 14 },
  actualText: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 11, marginTop: 4, lineHeight: 18 },
  overText: { color: "#B42318", fontWeight: "700" },
  inputWrap: {
    width: 112,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#C9DAD4",
    borderRadius: 11,
    backgroundColor: "#F9FBFA",
    paddingLeft: 10,
  },
  currencyPrefix: { color: "#617470", fontSize: 11, fontWeight: "700" },
  amountInput: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    paddingHorizontal: 6,
    color: "#093030",
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 7,
    marginTop: 13,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#E5EEEB",
  },
  fill: { height: "100%", borderRadius: 999, backgroundColor: PRIMARY },
  fillOver: { backgroundColor: "#E45151" },
  sectionTitle: { color: colors.ink, fontFamily: 'Poppins_700Bold', fontSize: 18, marginTop: 18 },
  sectionHint: { color: colors.muted, fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 20, marginTop: 4, marginBottom: 16 },
  saveButton: {
    minHeight: 52,
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.teal,
  },
  disabled: { opacity: 0.55 },
  saveText: { color: colors.mint, fontFamily: 'Poppins_700Bold', fontSize: 15 },
  saveHint: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 8 },
});
