import {
  formatCategory,
  localDateString,
  TRANSACTION_CATEGORIES,
  type FinancialAccount,
  type TransactionCategory,
  type TransactionType,
} from "@/types/finance";
import { AccountPicker } from "@/components/account-picker";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import { SafeAreaView } from "react-native-safe-area-context";

const PRIMARY = "#00D09E";
const TYPES: TransactionType[] = ["expense", "income", "refund"];

export default function AddTransactionScreen() {
  const router = useRouter();
  const [transactionType, setTransactionType] =
    useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDateString());
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState<TransactionCategory>("OTHER");
  const [notes, setNotes] = useState("");
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAccounts = useCallback(async () => {
    const { data, error } = await supabase
      .from("financial_accounts")
      .select("id, user_id, name, account_type, opening_balance, currency, is_archived, created_at")
      .eq("is_archived", false)
      .order("created_at");
    if (error) {
      console.error("Transaction account load failed", error);
      return;
    }
    setAccounts((data || []) as unknown as FinancialAccount[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAccounts();
    }, [loadAccounts]),
  );

  const categoryOptions = useMemo(
    () =>
      transactionType === "income"
        ? (["SALARY", "SAVINGS", "OTHER"] as TransactionCategory[])
        : TRANSACTION_CATEGORIES.filter(
            (item) => item !== "SALARY" && item !== "SAVINGS",
          ),
    [transactionType],
  );

  const selectType = (nextType: TransactionType) => {
    setTransactionType(nextType);
    if (nextType === "income" && !["SALARY", "SAVINGS", "OTHER"].includes(category)) {
      setCategory("SALARY");
    } else if (nextType !== "income" && ["SALARY", "SAVINGS"].includes(category)) {
      setCategory("OTHER");
    }
  };

  const saveTransaction = async () => {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Check amount", "Enter an amount greater than zero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert("Check date", "Use the date format YYYY-MM-DD.");
      return;
    }

    setSaving(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const user = authData.user;
      if (authError || !user) throw authError ?? new Error("You need to be logged in");

      const { error } = await supabase.from("transactions").insert({
        user_id: user.id,
        transaction_type: transactionType,
        amount: Math.round(parsedAmount * 100) / 100,
        currency: "MYR",
        occurred_on: date,
        merchant_name: merchant.trim() || null,
        category,
        notes: notes.trim() || null,
        account_id: accountId,
        source: "manual",
        status: "posted",
      });
      if (error) throw error;

      router.back();
    } catch (error) {
      console.error("Manual transaction save failed", error);
      Alert.alert("Could not save", "Please check the details and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="close" size={26} color="#093030" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Transaction</Text>
          <View style={styles.iconButton} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.label}>Type</Text>
          <View style={styles.segmentedRow}>
            {TYPES.map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.segmentButton,
                  transactionType === item && styles.segmentButtonActive,
                ]}
                onPress={() => selectType(item)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    transactionType === item && styles.segmentTextActive,
                  ]}
                >
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Amount (MYR)</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <Text style={styles.label}>Date</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            style={styles.input}
          />

          <Text style={styles.label}>
            {transactionType === "income" ? "Source" : "Merchant"}
          </Text>
          <TextInput
            value={merchant}
            onChangeText={setMerchant}
            placeholder={transactionType === "income" ? "Salary, freelance…" : "Optional"}
            style={styles.input}
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.chipRow}>
            {categoryOptions.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.chip, category === item && styles.chipActive]}
                onPress={() => setCategory(item)}
              >
                <Text style={[styles.chipText, category === item && styles.chipTextActive]}>
                  {formatCategory(item)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Account</Text>
          <AccountPicker
            accounts={accounts}
            selectedId={accountId}
            onSelect={setAccountId}
          />

          <Text style={styles.label}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional"
            multiline
            textAlignVertical="top"
            style={[styles.input, styles.notesInput]}
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={saveTransaction}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#093030" />
            ) : (
              <Text style={styles.saveText}>Save Transaction</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F7FAF9" },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#D7E4DF",
  },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#093030" },
  content: { padding: 22, paddingBottom: 44 },
  label: { fontSize: 13, fontWeight: "700", color: "#31504D", marginTop: 18, marginBottom: 8 },
  segmentedRow: { flexDirection: "row", gap: 8 },
  segmentButton: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#E7EFEC",
  },
  segmentButtonActive: { backgroundColor: "#093030" },
  segmentText: { color: "#31504D", fontWeight: "700" },
  segmentTextActive: { color: "#FFFFFF" },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#C9DAD4",
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    color: "#093030",
    fontSize: 15,
  },
  notesInput: { minHeight: 96, paddingTop: 14 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, backgroundColor: "#E7EFEC" },
  chipActive: { backgroundColor: PRIMARY },
  chipText: { color: "#31504D", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#052224" },
  saveButton: {
    marginTop: 28,
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PRIMARY,
  },
  buttonDisabled: { opacity: 0.6 },
  saveText: { color: "#052224", fontSize: 15, fontWeight: "800" },
});
