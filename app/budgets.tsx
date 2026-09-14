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
      const [budgetResult, transactionResult] = await Promise.all([
        supabase
          .from("budgets")
          .select("id, user_id, month_start, category, amount, currency")
          .eq("user_id", userId)
          .eq("month_start", selectedMonth),
        supabase
          .from("transactions")
          .select("transaction_type, amount, category")
          .eq("user_id", userId)
          .eq("status", "posted")
          .in("transaction_type", ["expense", "refund"])
          .gte("occurred_on", selectedMonth)
          .lt("occurred_on", monthEnd),
      ]);

      if (budgetResult.error) throw budgetResult.error;
      if (transactionResult.error) throw transactionResult.error;

      const nextInputs: BudgetInputs = {};
      ((budgetResult.data || []) as unknown as MonthlyBudget[]).forEach((budget) => {
        nextInputs[budget.category] = Number(budget.amount).toFixed(2);
      });

      const nextActuals: Actuals = {};
      (transactionResult.data || []).forEach((transaction) => {
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
      <View key={category} style={styles.budgetCard}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.categoryTitle}>
              {category === "ALL" ? "Overall monthly limit" : formatCategory(category)}
            </Text>
            <Text style={[styles.actualText, over && styles.overText]}>
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
              onPress={() => setSelectedMonth((month) => shiftMonth(month, -1))}
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={22} color="#093030" />
            </TouchableOpacity>
            <View style={styles.monthTextBlock}>
              <Text style={styles.monthLabel}>{monthDisplayName(selectedMonth)}</Text>
              <Text style={styles.monthHint}>Plan versus posted spending</Text>
            </View>
            <TouchableOpacity
              style={styles.monthButton}
              onPress={() => setSelectedMonth((month) => shiftMonth(month, 1))}
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={22} color="#093030" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={PRIMARY} />
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
                onPress={saveBudgets}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#052224" />
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
  container: { flex: 1, backgroundColor: "#F4F8F6" },
  content: { padding: 18, paddingBottom: 48 },
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
    backgroundColor: "#FFFFFF",
  },
  monthTextBlock: { alignItems: "center" },
  monthLabel: { color: "#093030", fontSize: 19, fontWeight: "800" },
  monthHint: { color: "#617470", fontSize: 11, marginTop: 2 },
  loadingState: { minHeight: 420, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#A33D3D", textAlign: "center", marginBottom: 12 },
  budgetCard: {
    padding: 15,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    boxShadow: "0 1px 3px rgba(5, 34, 36, 0.07)",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTitleBlock: { flex: 1, minWidth: 0 },
  categoryTitle: { color: "#093030", fontSize: 14, fontWeight: "800" },
  actualText: { color: "#617470", fontSize: 11, marginTop: 4 },
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
  sectionTitle: { color: "#093030", fontSize: 17, fontWeight: "800", marginTop: 14 },
  sectionHint: { color: "#617470", fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  saveButton: {
    minHeight: 52,
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: PRIMARY,
  },
  disabled: { opacity: 0.55 },
  saveText: { color: "#052224", fontSize: 15, fontWeight: "800" },
  saveHint: { color: "#617470", fontSize: 11, textAlign: "center", marginTop: 8 },
});
