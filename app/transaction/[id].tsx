import {
  EXPENSE_CATEGORIES,
  formatCategory,
  type LedgerTransaction,
  type ReceiptItem,
  type TransactionCategory,
  type TransactionType,
} from "@/types/finance";
import { authenticatedApiFetch } from "@/utils/api";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Link, Stack, useLocalSearchParams, useRouter } from "expo-router";
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
const TYPES: TransactionType[] = ["expense", "income", "refund"];

type EditableTransaction = LedgerTransaction & {
  receipts?: { items: ReceiptItem[] | null; image_url: string | null } | null;
};

export default function TransactionDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const transactionId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const [transaction, setTransaction] = useState<EditableTransaction | null>(null);
  const [transactionType, setTransactionType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState<TransactionCategory>("OTHER");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReceipt = transaction?.source === "receipt";
  const categoryOptions = useMemo(
    () =>
      transactionType === "income"
        ? (["SALARY", "SAVINGS", "OTHER"] as TransactionCategory[])
        : EXPENSE_CATEGORIES,
    [transactionType],
  );

  const loadTransaction = useCallback(async () => {
    if (!transactionId) {
      setError("This transaction link is invalid.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: loadError } = await supabase
        .from("transactions")
        .select(
          "id, user_id, receipt_id, transaction_type, amount, currency, occurred_on, merchant_name, category, notes, source, status, created_at, receipts(items, image_url)",
        )
        .eq("id", transactionId)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!data) throw new Error("Transaction not found");

      const row = data as unknown as EditableTransaction;
      setTransaction(row);
      setTransactionType(row.transaction_type);
      setAmount(Number(row.amount).toFixed(2));
      setDate(row.occurred_on);
      setMerchant(row.merchant_name ?? "");
      setCategory(row.category);
      setNotes(row.notes ?? "");
    } catch (loadError) {
      console.error("Transaction load failed", loadError);
      setError("This transaction is unavailable or does not belong to your account.");
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useFocusEffect(
    useCallback(() => {
      void loadTransaction();
    }, [loadTransaction]),
  );

  const selectType = (nextType: TransactionType) => {
    if (isReceipt) return;
    setTransactionType(nextType);
    if (nextType === "income" && !["SALARY", "SAVINGS", "OTHER"].includes(category)) {
      setCategory("SALARY");
    } else if (nextType !== "income" && ["SALARY", "SAVINGS"].includes(category)) {
      setCategory("OTHER");
    }
  };

  const saveTransaction = async () => {
    if (!transaction) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Check amount", "Enter an amount greater than zero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert("Check date", "Use the date format YYYY-MM-DD.");
      return;
    }
    if (isReceipt && !merchant.trim()) {
      Alert.alert("Check merchant", "Receipt transactions need a merchant name.");
      return;
    }

    setSaving(true);
    try {
      if (isReceipt) {
        const { error: saveError } = await supabase.rpc("confirm_receipt_transaction", {
          p_transaction_id: transaction.id,
          p_merchant_name: merchant.trim(),
          p_amount: Math.round(parsedAmount * 100) / 100,
          p_occurred_on: date,
          p_category: category,
          p_items: transaction.receipts?.items ?? [],
          p_notes: notes.trim() || null,
        });
        if (saveError) throw saveError;
      } else {
        const { error: saveError } = await supabase
          .from("transactions")
          .update({
            transaction_type: transactionType,
            amount: Math.round(parsedAmount * 100) / 100,
            occurred_on: date,
            merchant_name: merchant.trim() || null,
            category,
            notes: notes.trim() || null,
          })
          .eq("id", transaction.id);
        if (saveError) throw saveError;
      }

      await loadTransaction();
      Alert.alert("Transaction saved", "Your totals now use the updated details.");
    } catch (saveError) {
      console.error("Transaction update failed", saveError);
      Alert.alert("Could not save", "Your transaction was not changed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async () => {
    if (!transaction) return;
    setDeleting(true);
    try {
      if (isReceipt && transaction.receipt_id) {
        const response = await authenticatedApiFetch(
          `/api/receipts?id=${encodeURIComponent(transaction.receipt_id)}`,
          { method: "DELETE" },
        );
        if (!response.ok) throw new Error("Receipt deletion failed");
      } else {
        const { error: deleteError } = await supabase
          .from("transactions")
          .delete()
          .eq("id", transaction.id);
        if (deleteError) throw deleteError;
      }
      router.replace("/receiptscanner");
    } catch (deleteError) {
      console.error("Transaction deletion failed", deleteError);
      Alert.alert("Could not delete", "Nothing was removed. Please try again.");
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      isReceipt ? "Delete transaction and receipt?" : "Delete transaction?",
      isReceipt
        ? "This permanently removes the ledger entry and its stored receipt image."
        : "This permanently removes the ledger entry.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void performDelete() },
      ],
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: "Transaction Details" }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          ) : error || !transaction ? (
            <View style={styles.centerState}>
              <Text style={styles.errorTitle}>Transaction unavailable</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadTransaction}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {isReceipt ? (
                <View style={styles.evidenceCard}>
                  <Ionicons name="shield-checkmark-outline" size={23} color="#087D65" />
                  <View style={styles.evidenceTextBlock}>
                    <Text style={styles.evidenceTitle}>Receipt-backed expense</Text>
                    <Text style={styles.evidenceText}>
                      Changes update both this transaction and its receipt record.
                    </Text>
                  </View>
                </View>
              ) : null}

              {isReceipt && transaction.receipt_id && transaction.receipts?.image_url ? (
                <Link
                  href={{ pathname: "/receipt/[id]", params: { id: transaction.receipt_id } }}
                  asChild
                >
                  <TouchableOpacity style={styles.receiptButton}>
                    <Ionicons name="image-outline" size={19} color="#087D65" />
                    <Text style={styles.receiptButtonText}>View original receipt</Text>
                    <Ionicons name="chevron-forward" size={17} color="#087D65" />
                  </TouchableOpacity>
                </Link>
              ) : null}

              <Text style={styles.label}>Type</Text>
              <View style={styles.segmentedRow}>
                {TYPES.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.segmentButton,
                      transactionType === item && styles.segmentButtonActive,
                      isReceipt && transactionType !== item && styles.segmentButtonDisabled,
                    ]}
                    onPress={() => selectType(item)}
                    disabled={isReceipt}
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
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <Text style={styles.label}>Date</Text>
              <TextInput
                value={date}
                onChangeText={setDate}
                autoCapitalize="none"
                placeholder="YYYY-MM-DD"
                style={styles.input}
              />
              <Text style={styles.label}>
                {transactionType === "income" ? "Source" : "Merchant"}
              </Text>
              <TextInput
                value={merchant}
                onChangeText={setMerchant}
                placeholder="Optional"
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
                style={[styles.saveButton, (saving || deleting) && styles.disabled]}
                onPress={saveTransaction}
                disabled={saving || deleting}
              >
                {saving ? (
                  <ActivityIndicator color="#052224" />
                ) : (
                  <Text style={styles.saveText}>Save changes</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deleteButton, (saving || deleting) && styles.disabled]}
                onPress={confirmDelete}
                disabled={saving || deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#B42318" />
                ) : (
                  <Text style={styles.deleteText}>
                    {isReceipt ? "Delete transaction and receipt" : "Delete transaction"}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F8F6" },
  content: { padding: 20, paddingBottom: 48 },
  centerState: { minHeight: 480, alignItems: "center", justifyContent: "center", gap: 12 },
  errorTitle: { color: "#093030", fontSize: 18, fontWeight: "800" },
  errorText: { color: "#617470", fontSize: 13, textAlign: "center", lineHeight: 20 },
  retryButton: {
    minHeight: 46,
    minWidth: 130,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: PRIMARY,
  },
  retryText: { color: "#052224", fontWeight: "800" },
  evidenceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderRadius: 15,
    backgroundColor: "#DFF6EE",
  },
  evidenceTextBlock: { flex: 1 },
  evidenceTitle: { color: "#093030", fontSize: 13, fontWeight: "800" },
  evidenceText: { color: "#42625C", fontSize: 11, lineHeight: 17, marginTop: 2 },
  receiptButton: {
    minHeight: 48,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  receiptButtonText: { flex: 1, color: "#087D65", fontSize: 13, fontWeight: "800" },
  label: { color: "#31504D", fontSize: 13, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  segmentedRow: { flexDirection: "row", gap: 8 },
  segmentButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#E7EFEC",
  },
  segmentButtonActive: { backgroundColor: "#093030" },
  segmentButtonDisabled: { opacity: 0.45 },
  segmentText: { color: "#31504D", fontWeight: "700" },
  segmentTextActive: { color: "#FFFFFF" },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#C9DAD4",
    borderRadius: 12,
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
    minHeight: 52,
    marginTop: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: PRIMARY,
  },
  saveText: { color: "#052224", fontSize: 15, fontWeight: "800" },
  deleteButton: {
    minHeight: 50,
    marginTop: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E3B5B2",
    borderRadius: 14,
    backgroundColor: "#FFF8F7",
  },
  deleteText: { color: "#B42318", fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.55 },
});
