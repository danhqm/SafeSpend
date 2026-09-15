import { AccountPicker } from "@/components/account-picker";
import { localDateString, type FinancialAccount } from "@/types/finance";
import { supabase } from "@/utils/supabase";
import { Stack, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import React, { useCallback, useState } from "react";
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

export default function TransferScreen() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [fromAccountId, setFromAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDateString());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("id, user_id, name, account_type, opening_balance, currency, is_archived, created_at")
        .eq("is_archived", false)
        .order("created_at");
      if (error) throw error;
      const rows = (data || []) as unknown as FinancialAccount[];
      setAccounts(rows);
      setFromAccountId((current) => current ?? rows[0]?.id ?? null);
      setToAccountId((current) => current ?? rows[1]?.id ?? null);
    } catch (loadError) {
      console.error("Transfer account load failed", loadError);
      Alert.alert("Could not load accounts", "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAccounts();
    }, [loadAccounts]),
  );

  const selectFrom = (accountId: string | null) => {
    if (!accountId) return;
    setFromAccountId(accountId);
    if (accountId === toAccountId) {
      setToAccountId(accounts.find((account) => account.id !== accountId)?.id ?? null);
    }
  };

  const selectTo = (accountId: string | null) => {
    if (!accountId) return;
    setToAccountId(accountId);
    if (accountId === fromAccountId) {
      setFromAccountId(accounts.find((account) => account.id !== accountId)?.id ?? null);
    }
  };

  const saveTransfer = async () => {
    const parsedAmount = Number(amount);
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      Alert.alert("Choose accounts", "Select two different accounts.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 9999999999.99) {
      Alert.alert("Check amount", "Enter an amount greater than zero.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert("Check date", "Use the date format YYYY-MM-DD.");
      return;
    }
    if (notes.trim().length > 500) {
      Alert.alert("Check notes", "Keep notes under 500 characters.");
      return;
    }

    setSaving(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (authError || !userId) throw authError ?? new Error("Authentication required");

      const { error: insertError } = await supabase.from("account_transfers").insert({
        user_id: userId,
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        amount: Math.round(parsedAmount * 100) / 100,
        currency: "MYR",
        occurred_on: date,
        notes: notes.trim() || null,
      });
      if (insertError) throw insertError;
      router.replace("/accounts");
    } catch (saveError) {
      console.error("Transfer save failed", saveError);
      Alert.alert("Could not transfer", "No balances were changed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Record Transfer" }} />
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
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={PRIMARY} />
            </View>
          ) : (
            <>
              {accounts.length < 2 ? (
                <View style={styles.warningCard}>
                  <Text selectable style={styles.warningText}>
                    Add at least two accounts before recording a transfer.
                  </Text>
                </View>
              ) : null}

              <Text style={styles.label}>From</Text>
              <AccountPicker
                accounts={accounts}
                selectedId={fromAccountId}
                onSelect={selectFrom}
                allowUnassigned={false}
              />
              <Text style={styles.label}>To</Text>
              <AccountPicker
                accounts={accounts}
                selectedId={toAccountId}
                onSelect={selectTo}
                allowUnassigned={false}
              />

              <Text style={styles.label}>Amount (MYR)</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
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
              <Text style={styles.label}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                maxLength={500}
                placeholder="Optional"
                multiline
                textAlignVertical="top"
                style={[styles.input, styles.notesInput]}
              />
              <View style={styles.helperCard}>
                <Text selectable style={styles.helperText}>
                  Sending money to a credit card records a card payment and reduces the amount owed. Transfers never count as income or spending.
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (saving || accounts.length < 2) && styles.disabled,
                ]}
                onPress={saveTransfer}
                disabled={saving || accounts.length < 2}
              >
                {saving ? (
                  <ActivityIndicator color="#052224" />
                ) : (
                  <Text style={styles.saveText}>Record transfer</Text>
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
  loadingState: { minHeight: 450, alignItems: "center", justifyContent: "center" },
  warningCard: { padding: 14, borderRadius: 14, backgroundColor: "#FFF4D6" },
  warningText: { color: "#6C4A0A", fontSize: 12, lineHeight: 18 },
  label: { color: "#31504D", fontSize: 13, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  input: { minHeight: 52, paddingHorizontal: 14, borderWidth: 1, borderColor: "#C9DAD4", borderRadius: 13, backgroundColor: "#FFFFFF", color: "#093030", fontSize: 15 },
  notesInput: { minHeight: 96, paddingTop: 14 },
  helperCard: { padding: 13, marginTop: 10, borderRadius: 13, backgroundColor: "#E9F5F1" },
  helperText: { color: "#526965", fontSize: 11, lineHeight: 18 },
  saveButton: { minHeight: 52, marginTop: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: PRIMARY },
  saveText: { color: "#052224", fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.55 },
});
