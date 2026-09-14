import {
  formatCategory,
  TRANSACTION_CATEGORIES,
  type LedgerTransaction,
  type ReceiptItem,
  type TransactionCategory,
} from "@/types/finance";
import { authenticatedApiFetch } from "@/utils/api";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Link, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ReceiptDraft = {
  id: string;
  transaction_id: string;
  merchant_name: string;
  total_amount: number | string;
  receipt_date: string;
  category: TransactionCategory;
  items: ReceiptItem[];
  image_url: string | null;
  status: "draft";
};

const PRIMARY = "#00D09E";
const REVIEW_CATEGORIES = TRANSACTION_CATEGORIES.filter(
  (category) => category !== "SALARY" && category !== "SAVINGS",
);

function amountPrefix(transaction: LedgerTransaction) {
  return transaction.transaction_type === "income" ||
    transaction.transaction_type === "refund"
    ? "+"
    : "−";
}

function transactionTitle(transaction: LedgerTransaction) {
  if (transaction.merchant_name) return transaction.merchant_name;
  if (transaction.transaction_type === "income") return "Income";
  if (transaction.transaction_type === "refund") return "Refund";
  return "Expense";
}

export default function ReceiptScanner() {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [viewAllVisible, setViewAllVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadTransactions = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) return;

    const { data, error: queryError } = await supabase
      .from("transactions")
      .select(
        "id, user_id, receipt_id, transaction_type, amount, currency, occurred_on, merchant_name, category, notes, source, status, created_at, receipts(items, image_url)",
      )
      .eq("user_id", userId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });

    if (queryError) {
      console.error("Transaction load failed", queryError);
      setError("Could not load your transactions.");
      return;
    }

    const rows = (data || []) as unknown as LedgerTransaction[];
    setTransactions(rows.filter((row) => row.status === "posted"));

    if (!draft) {
      const pending = rows.find(
        (row) => row.status === "draft" && row.source === "receipt" && row.receipt_id,
      );
      if (pending) {
        setDraft({
          id: pending.receipt_id!,
          transaction_id: pending.id,
          merchant_name: pending.merchant_name ?? "",
          total_amount: pending.amount,
          receipt_date: pending.occurred_on,
          category: pending.category,
          items: pending.receipts?.items ?? [],
          image_url: pending.receipts?.image_url ?? null,
          status: "draft",
        });
      }
    }
  }, [draft]);

  useFocusEffect(
    useCallback(() => {
      void loadTransactions();
    }, [loadTransactions]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadTransactions();
    } finally {
      setRefreshing(false);
    }
  }, [loadTransactions]);

  const pickImage = async () => {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required to scan receipts.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      base64: true,
      quality: 0.5,
    });

    if (!result.canceled && result.assets[0].base64) {
      await scanReceipt(result.assets[0].base64);
    }
  };

  const scanReceipt = async (base64: string) => {
    setScanning(true);
    setDraft(null);
    setError(null);
    try {
      const response = await authenticatedApiFetch("/api/ocr", {
        method: "POST",
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "OCR failed");
      }
      setDraft(payload.data as ReceiptDraft);
    } catch (scanError) {
      console.error("Receipt scan failed", scanError);
      setError(scanError instanceof Error ? scanError.message : "Receipt scan failed");
    } finally {
      setScanning(false);
    }
  };

  const updateDraft = <Key extends keyof ReceiptDraft>(
    key: Key,
    value: ReceiptDraft[Key],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const confirmDraft = async () => {
    if (!draft) return;
    const amount = Number(draft.total_amount);
    if (!draft.merchant_name.trim()) {
      Alert.alert("Check merchant", "Enter the merchant shown on the receipt.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Check amount", "Enter an amount greater than zero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.receipt_date)) {
      Alert.alert("Check date", "Use the date format YYYY-MM-DD.");
      return;
    }

    setConfirming(true);
    try {
      const { error: rpcError } = await supabase.rpc(
        "confirm_receipt_transaction",
        {
          p_transaction_id: draft.transaction_id,
          p_merchant_name: draft.merchant_name.trim(),
          p_amount: amount,
          p_occurred_on: draft.receipt_date,
          p_category: draft.category,
          p_items: draft.items,
          p_notes: null,
        },
      );
      if (rpcError) throw rpcError;

      setDraft(null);
      await loadTransactions();
      Alert.alert("Added", "The receipt is now included in your spending totals.");
    } catch (confirmationError) {
      console.error("Receipt confirmation failed", confirmationError);
      Alert.alert("Could not confirm", "Please check the receipt and try again.");
    } finally {
      setConfirming(false);
    }
  };

  const discardDraft = async () => {
    if (!draft) return;
    try {
      const response = await authenticatedApiFetch(
        `/api/receipts?id=${encodeURIComponent(draft.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Receipt deletion failed");
      setDraft(null);
      await loadTransactions();
    } catch (discardError) {
      console.error("Receipt discard failed", discardError);
      Alert.alert("Could not discard", "Please try again.");
    }
  };

  const renderTransaction = (transaction: LedgerTransaction) => {
    const card = (
      <TouchableOpacity
        style={styles.transactionCard}
        activeOpacity={0.72}
        accessibilityRole="button"
        accessibilityLabel={`View and edit ${transactionTitle(transaction)}`}
      >
        <View style={styles.transactionIcon}>
          <Ionicons
            name={
              transaction.source === "receipt"
                ? "receipt-outline"
                : "create-outline"
            }
            size={18}
            color="#093030"
          />
        </View>
        <View style={styles.transactionDetails}>
          <Text style={styles.transactionMerchant} numberOfLines={1}>
            {transactionTitle(transaction)}
          </Text>
          <Text style={styles.transactionMeta}>
            {transaction.occurred_on} · {formatCategory(transaction.category)}
            {transaction.receipt_id ? " · Receipt attached" : ""}
          </Text>
        </View>
        <Text
          style={[
            styles.transactionAmount,
            transaction.transaction_type !== "expense" && styles.positiveAmount,
          ]}
        >
          {amountPrefix(transaction)}RM{Number(transaction.amount).toFixed(2)}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#6C817D" />
      </TouchableOpacity>
    );

    return (
      <Link
        key={transaction.id}
        href={{
          pathname: "/transaction/[id]",
          params: { id: transaction.id },
        }}
        asChild
      >
        {card}
      </Link>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Transactions</Text>
        <Text style={styles.headerSubtitle}>A ledger you can verify</Text>
      </View>

      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.primaryAction,
              (scanning || Boolean(draft)) && styles.disabled,
            ]}
            onPress={pickImage}
            disabled={scanning || confirming || Boolean(draft)}
          >
            {scanning ? (
              <ActivityIndicator color="#093030" />
            ) : (
              <Ionicons name="scan-outline" size={20} color="#093030" />
            )}
            <Text style={styles.primaryActionText}>
              {scanning ? "Scanning…" : "Scan receipt"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={() => router.push("/add-transaction")}
          >
            <Ionicons name="add" size={22} color="#093030" />
            <Text style={styles.secondaryActionText}>Add manually</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.helperText}>
          Scans stay out of totals until you review and confirm them.
        </Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {draft ? (
          <View style={styles.reviewCard}>
            <View style={styles.reviewTitleRow}>
              <View>
                <Text style={styles.reviewEyebrow}>PENDING REVIEW</Text>
                <Text style={styles.reviewTitle}>Check this receipt</Text>
              </View>
              <Ionicons name="shield-checkmark-outline" size={25} color="#087D65" />
            </View>

            {draft.image_url ? (
              <Link
                href={{ pathname: "/receipt/[id]", params: { id: draft.id } }}
                asChild
              >
                <TouchableOpacity
                  style={styles.viewOriginalButton}
                  accessibilityRole="button"
                  accessibilityLabel="View the original receipt image"
                >
                  <Ionicons name="image-outline" size={18} color="#087D65" />
                  <Text style={styles.viewOriginalText}>View original receipt</Text>
                  <Ionicons name="chevron-forward" size={16} color="#087D65" />
                </TouchableOpacity>
              </Link>
            ) : null}

            <Text style={styles.fieldLabel}>Merchant</Text>
            <TextInput
              value={draft.merchant_name}
              onChangeText={(value) => updateDraft("merchant_name", value)}
              style={styles.input}
            />
            <View style={styles.fieldRow}>
              <View style={styles.fieldColumn}>
                <Text style={styles.fieldLabel}>Date</Text>
                <TextInput
                  value={draft.receipt_date}
                  onChangeText={(value) => updateDraft("receipt_date", value)}
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>
              <View style={styles.fieldColumn}>
                <Text style={styles.fieldLabel}>Amount (RM)</Text>
                <TextInput
                  value={String(draft.total_amount)}
                  onChangeText={(value) => updateDraft("total_amount", value)}
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {REVIEW_CATEGORIES.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[styles.chip, draft.category === category && styles.chipActive]}
                    onPress={() => updateDraft("category", category)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        draft.category === category && styles.chipTextActive,
                      ]}
                    >
                      {formatCategory(category)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {draft.items.length > 0 ? (
              <View style={styles.itemsBox}>
                <Text style={styles.itemsTitle}>Detected items</Text>
                {draft.items.slice(0, 5).map((item, index) => (
                  <View key={`${item.name}-${index}`} style={styles.itemRow}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.name || "Item"}
                    </Text>
                    <Text style={styles.itemPrice}>
                      RM{Number(item.price || 0).toFixed(2)}
                    </Text>
                  </View>
                ))}
                {draft.items.length > 5 ? (
                  <Text style={styles.moreItems}>+{draft.items.length - 5} more items</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.reviewActions}>
              <TouchableOpacity
                style={styles.discardButton}
                onPress={discardDraft}
                disabled={confirming}
              >
                <Text style={styles.discardText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, confirming && styles.disabled]}
                onPress={confirmDraft}
                disabled={confirming}
              >
                {confirming ? (
                  <ActivityIndicator color="#093030" />
                ) : (
                  <Text style={styles.confirmText}>Confirm expense</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent transactions</Text>
          {transactions.length > 3 ? (
            <TouchableOpacity onPress={() => setViewAllVisible(true)}>
              <Text style={styles.viewAllText}>View all</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {transactions.length ? (
          transactions.slice(0, 3).map(renderTransaction)
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={28} color="#6C817D" />
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyText}>
              Scan a receipt or add your first entry manually.
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={viewAllVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>All Transactions</Text>
            <TouchableOpacity
              onPress={() => setViewAllVisible(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color="#093030" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {transactions.map(renderTransaction)}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PRIMARY },
  header: { alignItems: "center", paddingTop: 20, paddingBottom: 20 },
  headerTitle: { color: "#052224", fontSize: 19, fontWeight: "800" },
  headerSubtitle: { color: "#31504D", fontSize: 12, marginTop: 2 },
  sheet: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },
  content: { padding: 22, paddingTop: 28, paddingBottom: 48 },
  actionRow: { flexDirection: "row", gap: 10 },
  primaryAction: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: PRIMARY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BBD8CF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  primaryActionText: { color: "#052224", fontWeight: "800", fontSize: 13 },
  secondaryActionText: { color: "#093030", fontWeight: "700", fontSize: 13 },
  disabled: { opacity: 0.55 },
  helperText: {
    color: "#617470",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 10,
  },
  errorText: { color: "#C23B3B", fontSize: 12, textAlign: "center", marginTop: 10 },
  reviewCard: {
    marginTop: 22,
    padding: 16,
    backgroundColor: "#F0FBF7",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#C5EADF",
  },
  reviewTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  reviewEyebrow: { color: "#087D65", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  reviewTitle: { color: "#093030", fontSize: 17, fontWeight: "800", marginTop: 2 },
  viewOriginalButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: "#DDF4EC",
  },
  viewOriginalText: { flex: 1, color: "#087D65", fontSize: 12, fontWeight: "800" },
  fieldLabel: {
    color: "#31504D",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#C4D9D3",
    borderRadius: 11,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    color: "#093030",
  },
  fieldRow: { flexDirection: "row", gap: 10 },
  fieldColumn: { flex: 1 },
  chipRow: { flexDirection: "row", gap: 7, paddingRight: 10 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#DDEBE7",
  },
  chipActive: { backgroundColor: PRIMARY },
  chipText: { color: "#31504D", fontSize: 11, fontWeight: "600" },
  chipTextActive: { color: "#052224" },
  itemsBox: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "#FFFFFF" },
  itemsTitle: { color: "#31504D", fontSize: 11, fontWeight: "800", marginBottom: 5 },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 3,
  },
  itemName: { flex: 1, color: "#425B57", fontSize: 12 },
  itemPrice: { color: "#093030", fontSize: 12, fontWeight: "600" },
  moreItems: { color: "#6C817D", fontSize: 11, marginTop: 4 },
  reviewActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  discardButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D6A5A5",
    alignItems: "center",
    justifyContent: "center",
  },
  discardText: { color: "#A33D3D", fontWeight: "700" },
  confirmButton: {
    flex: 2,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: { color: "#052224", fontWeight: "800" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 10,
  },
  sectionTitle: { color: "#093030", fontSize: 16, fontWeight: "800" },
  viewAllText: { color: "#087D65", fontSize: 13, fontWeight: "700" },
  transactionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 13,
    backgroundColor: "#F5F9F8",
    borderRadius: 14,
    marginBottom: 9,
  },
  transactionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#DDF4EC",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  transactionDetails: { flex: 1, minWidth: 0 },
  transactionMerchant: { color: "#093030", fontSize: 13, fontWeight: "700" },
  transactionMeta: { color: "#6C817D", fontSize: 10, marginTop: 3 },
  transactionAmount: {
    color: "#C23B3B",
    fontSize: 13,
    fontWeight: "800",
    marginLeft: 8,
  },
  positiveAmount: { color: "#087D65" },
  emptyCard: {
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: "center",
    backgroundColor: "#F5F9F8",
    borderRadius: 16,
  },
  emptyTitle: { color: "#093030", fontWeight: "700", marginTop: 8 },
  emptyText: { color: "#6C817D", fontSize: 12, textAlign: "center", marginTop: 4 },
  modalContainer: { flex: 1, backgroundColor: "#FFFFFF" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#D7E4DF",
  },
  modalTitle: { color: "#093030", fontSize: 18, fontWeight: "800" },
  closeButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  modalContent: { padding: 20, paddingBottom: 40 },
});
