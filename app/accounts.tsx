import {
  calculateAccountBalance,
  formatAccountType,
  localDateString,
  type AccountTransfer,
  type FinancialAccount,
  type LedgerTransaction,
} from "@/types/finance";
import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { Link, Stack } from "expo-router";
import { useFocusEffect } from "expo-router/react-navigation";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const PRIMARY = "#00D09E";

function accountIcon(account: FinancialAccount) {
  if (account.account_type === "cash") return "cash-outline" as const;
  if (account.account_type === "credit_card") return "card-outline" as const;
  if (account.account_type === "e_wallet") return "phone-portrait-outline" as const;
  return "business-outline" as const;
}

export default function AccountsScreen() {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [transfers, setTransfers] = useState<AccountTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setError(null);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (authError || !userId) throw authError ?? new Error("Authentication required");
      const today = localDateString();

      const [accountResult, transactionResult, transferResult] = await Promise.all([
        supabase
          .from("financial_accounts")
          .select("id, user_id, name, account_type, opening_balance, currency, is_archived, created_at")
          .eq("user_id", userId)
          .eq("is_archived", false)
          .order("created_at"),
        supabase
          .from("transactions")
          .select("account_id, transaction_type, amount, status")
          .eq("user_id", userId)
          .eq("status", "posted")
          .lte("occurred_on", today),
        supabase
          .from("account_transfers")
          .select("id, user_id, from_account_id, to_account_id, amount, currency, occurred_on, notes, created_at")
          .eq("user_id", userId)
          .lte("occurred_on", today)
          .order("occurred_on", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      if (accountResult.error) throw accountResult.error;
      if (transactionResult.error) throw transactionResult.error;
      if (transferResult.error) throw transferResult.error;

      setAccounts((accountResult.data || []) as unknown as FinancialAccount[]);
      setTransactions((transactionResult.data || []) as unknown as LedgerTransaction[]);
      setTransfers((transferResult.data || []) as unknown as AccountTransfer[]);
    } catch (loadError) {
      console.error("Account load failed", loadError);
      setError("Could not load your accounts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAccounts();
    }, [loadAccounts]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAccounts();
    setRefreshing(false);
  }, [loadAccounts]);

  const accountRows = useMemo(
    () =>
      accounts.map((account) => ({
        account,
        balance: calculateAccountBalance(account, transactions, transfers),
      })),
    [accounts, transactions, transfers],
  );

  const totals = useMemo(() => {
    let assets = 0;
    let debt = 0;
    for (const row of accountRows) {
      if (row.account.account_type === "credit_card") debt += row.balance;
      else assets += row.balance;
    }
    return { assets, debt, net: assets - debt };
  }, [accountRows]);

  const unassignedCount = transactions.filter((row) => !row.account_id).length;
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));

  return (
    <>
      <Stack.Screen options={{ title: "Accounts" }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.summaryCard}>
          <Text style={styles.summaryEyebrow}>NET POSITION</Text>
          <Text selectable style={styles.netValue}>RM{totals.net.toFixed(2)}</Text>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>Available assets</Text>
              <Text selectable style={styles.assetValue}>RM{totals.assets.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={styles.summaryLabel}>Credit owed</Text>
              <Text selectable style={styles.debtValue}>RM{totals.debt.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Link href="/add-account" asChild>
            <TouchableOpacity style={styles.primaryAction}>
              <Ionicons name="add" size={20} color="#052224" />
              <Text style={styles.primaryActionText}>Add account</Text>
            </TouchableOpacity>
          </Link>
          <Link href="/transfer" asChild>
            <TouchableOpacity style={styles.secondaryAction}>
              <Ionicons name="swap-horizontal" size={20} color="#093030" />
              <Text style={styles.secondaryActionText}>Transfer</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {error ? <Text selectable style={styles.errorText}>{error}</Text> : null}
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={PRIMARY} />
          </View>
        ) : accountRows.length ? (
          <>
            {unassignedCount > 0 ? (
              <View style={styles.noticeCard}>
                <Ionicons name="information-circle-outline" size={20} color="#8A5A00" />
                <Text selectable style={styles.noticeText}>
                  {unassignedCount} existing {unassignedCount === 1 ? "transaction is" : "transactions are"} not included in account balances. Open each transaction to assign it.
                </Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Your accounts</Text>
            {accountRows.map(({ account, balance }) => (
              <Link
                key={account.id}
                href={{ pathname: "/add-account", params: { id: account.id } }}
                asChild
              >
                <TouchableOpacity
                  style={styles.accountCard}
                  accessibilityLabel={`Edit ${account.name}`}
                >
                  <View style={styles.accountIcon}>
                    <Ionicons name={accountIcon(account)} size={21} color="#087D65" />
                  </View>
                  <View style={styles.accountDetails}>
                    <Text selectable style={styles.accountName}>{account.name}</Text>
                    <Text style={styles.accountType}>
                      {formatAccountType(account.account_type)}
                    </Text>
                  </View>
                  <View style={styles.balanceBlock}>
                    <Text style={styles.balanceLabel}>
                      {account.account_type === "credit_card" ? "Amount owed" : "Available"}
                    </Text>
                    <Text selectable style={styles.balanceValue}>
                      RM{balance.toFixed(2)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#91A19D" />
                </TouchableOpacity>
              </Link>
            ))}

            {transfers.length ? (
              <>
                <Text style={styles.sectionTitle}>Recent transfers</Text>
                {transfers.slice(0, 5).map((transfer) => (
                  <View key={transfer.id} style={styles.transferRow}>
                    <View style={styles.transferTextBlock}>
                      <Text selectable style={styles.transferTitle}>
                        {accountNames.get(transfer.from_account_id) || "Archived account"} → {accountNames.get(transfer.to_account_id) || "Archived account"}
                      </Text>
                      <Text selectable style={styles.transferDate}>{transfer.occurred_on}</Text>
                    </View>
                    <Text selectable style={styles.transferAmount}>
                      RM{Number(transfer.amount).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={34} color="#6C817D" />
            <Text style={styles.emptyTitle}>Add your first account</Text>
            <Text selectable style={styles.emptyText}>
              Balances begin from the opening amount you enter. Existing transactions stay unassigned until you review them.
            </Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F8F6" },
  content: { padding: 18, paddingBottom: 48, gap: 12 },
  summaryCard: { padding: 20, borderRadius: 20, backgroundColor: "#093030" },
  summaryEyebrow: { color: "#8CDDC8", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  netValue: { color: "#FFFFFF", fontSize: 30, fontWeight: "800", fontVariant: ["tabular-nums"], marginTop: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 18 },
  summaryRight: { alignItems: "flex-end" },
  summaryLabel: { color: "#BBD3CD", fontSize: 10 },
  assetValue: { color: "#65E0BD", fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"], marginTop: 3 },
  debtValue: { color: "#FF9F9F", fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"], marginTop: 3 },
  actionRow: { flexDirection: "row", gap: 10 },
  primaryAction: { flex: 1, minHeight: 50, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: PRIMARY },
  primaryActionText: { color: "#052224", fontSize: 13, fontWeight: "800" },
  secondaryAction: { flex: 1, minHeight: 50, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#BBD8CF", borderRadius: 14, backgroundColor: "#FFFFFF" },
  secondaryActionText: { color: "#093030", fontSize: 13, fontWeight: "800" },
  errorText: { color: "#A33D3D", fontSize: 12, textAlign: "center" },
  loadingState: { minHeight: 380, alignItems: "center", justifyContent: "center" },
  noticeCard: { flexDirection: "row", gap: 9, padding: 13, borderRadius: 14, backgroundColor: "#FFF4D6" },
  noticeText: { flex: 1, color: "#6C4A0A", fontSize: 11, lineHeight: 17 },
  sectionTitle: { color: "#093030", fontSize: 16, fontWeight: "800", marginTop: 7 },
  accountCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 16, backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(5,34,36,0.07)" },
  accountIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#DDF4EC" },
  accountDetails: { flex: 1, minWidth: 0, paddingHorizontal: 11 },
  accountName: { color: "#093030", fontSize: 14, fontWeight: "800" },
  accountType: { color: "#6C817D", fontSize: 10, marginTop: 2 },
  balanceBlock: { alignItems: "flex-end" },
  balanceLabel: { color: "#6C817D", fontSize: 9 },
  balanceValue: { color: "#093030", fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"], marginTop: 2 },
  transferRow: { flexDirection: "row", alignItems: "center", padding: 13, borderRadius: 14, backgroundColor: "#FFFFFF" },
  transferTextBlock: { flex: 1, minWidth: 0 },
  transferTitle: { color: "#093030", fontSize: 12, fontWeight: "700" },
  transferDate: { color: "#6C817D", fontSize: 10, marginTop: 3 },
  transferAmount: { color: "#087D65", fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
  emptyCard: { minHeight: 300, alignItems: "center", justifyContent: "center", padding: 28, borderRadius: 18, backgroundColor: "#FFFFFF" },
  emptyTitle: { color: "#093030", fontSize: 17, fontWeight: "800", marginTop: 10 },
  emptyText: { color: "#617470", fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 5 },
});
