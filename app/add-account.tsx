import {
  ACCOUNT_TYPES,
  formatAccountType,
  type AccountType,
} from "@/types/finance";
import { supabase } from "@/utils/supabase";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
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

export default function AddAccountScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const accountId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("bank");
  const [openingBalance, setOpeningBalance] = useState("0.00");
  const [loading, setLoading] = useState(Boolean(accountId));
  const [saving, setSaving] = useState(false);

  const loadAccount = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("name, account_type, opening_balance")
        .eq("id", accountId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Account not found");
      setName(data.name);
      setAccountType(data.account_type as AccountType);
      setOpeningBalance(Number(data.opening_balance).toFixed(2));
    } catch (loadError) {
      console.error("Account load failed", loadError);
      Alert.alert("Account unavailable", "This account could not be loaded.", [
        { text: "Go back", onPress: () => router.back() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [accountId, router]);

  useFocusEffect(
    useCallback(() => {
      void loadAccount();
    }, [loadAccount]),
  );

  const saveAccount = async () => {
    const cleanName = name.trim();
    const opening = Number(openingBalance);
    if (!cleanName || cleanName.length > 80) {
      Alert.alert("Check name", "Enter an account name between 1 and 80 characters.");
      return;
    }
    if (!Number.isFinite(opening) || Math.abs(opening) > 9999999999.99) {
      Alert.alert("Check opening amount", "Enter a valid opening amount.");
      return;
    }
    if (accountType === "credit_card" && opening < 0) {
      Alert.alert("Check amount owed", "A credit card’s opening amount owed cannot be negative.");
      return;
    }

    setSaving(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (authError || !userId) throw authError ?? new Error("Authentication required");

      const accountValues = {
        name: cleanName,
        account_type: accountType,
        opening_balance: Math.round(opening * 100) / 100,
      };
      if (accountId) {
        const { error: updateError } = await supabase
          .from("financial_accounts")
          .update(accountValues)
          .eq("id", accountId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("financial_accounts").insert({
          user_id: userId,
          ...accountValues,
          currency: "MYR",
          is_archived: false,
        });
        if (insertError) throw insertError;
      }
      router.back();
    } catch (saveError: any) {
      console.error("Account save failed", saveError);
      Alert.alert(
        accountId ? "Could not update account" : "Could not add account",
        saveError?.code === "23505"
          ? "You already have an account with this name."
          : "Please check the details and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: accountId ? "Edit Account" : "Add Account" }} />
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
              <Text style={styles.label}>Account name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Maybank, Cash wallet…"
                autoCapitalize="words"
                maxLength={80}
                style={styles.input}
              />

              <Text style={styles.label}>Account type</Text>
              <View style={styles.typeGrid}>
                {ACCOUNT_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeChip,
                      accountType === type && styles.typeChipActive,
                    ]}
                    onPress={() => setAccountType(type)}
                    accessibilityState={{ selected: accountType === type }}
                  >
                    <Text
                      style={[
                        styles.typeText,
                        accountType === type && styles.typeTextActive,
                      ]}
                    >
                      {formatAccountType(type)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>
                {accountType === "credit_card"
                  ? "Opening amount owed (MYR)"
                  : "Opening balance (MYR)"}
              </Text>
              <TextInput
                value={openingBalance}
                onChangeText={setOpeningBalance}
                keyboardType="numbers-and-punctuation"
                placeholder="0.00"
                style={styles.input}
              />
              <View style={styles.helperCard}>
                <Text selectable style={styles.helperText}>
                  {accountType === "credit_card"
                    ? accountId
                      ? "Changing the opening amount adjusts current card debt without rewriting transaction history."
                      : "Enter what you currently owe as the starting amount. Purchases increase it; refunds and card payments reduce it."
                    : accountId
                      ? "Changing the opening balance adjusts the current balance without rewriting transaction history."
                      : "Enter the funds available before you begin assigning SafeSpend transactions. A negative bank balance is allowed for an overdraft."}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.disabled]}
                onPress={saveAccount}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#052224" />
                ) : (
                  <Text style={styles.saveText}>
                    {accountId ? "Save account" : "Add account"}
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
  loadingState: { minHeight: 420, alignItems: "center", justifyContent: "center" },
  label: { color: "#31504D", fontSize: 13, fontWeight: "700", marginTop: 18, marginBottom: 8 },
  input: { minHeight: 52, paddingHorizontal: 14, borderWidth: 1, borderColor: "#C9DAD4", borderRadius: 13, backgroundColor: "#FFFFFF", color: "#093030", fontSize: 15 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { minWidth: "47%", flexGrow: 1, alignItems: "center", paddingVertical: 12, borderRadius: 13, backgroundColor: "#E7EFEC" },
  typeChipActive: { backgroundColor: PRIMARY },
  typeText: { color: "#31504D", fontSize: 13, fontWeight: "700" },
  typeTextActive: { color: "#052224" },
  helperCard: { padding: 13, marginTop: 10, borderRadius: 13, backgroundColor: "#E9F5F1" },
  helperText: { color: "#526965", fontSize: 11, lineHeight: 18 },
  saveButton: { minHeight: 52, marginTop: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: PRIMARY },
  saveText: { color: "#052224", fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.55 },
});
