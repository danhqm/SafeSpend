import { formatAccountType, type FinancialAccount } from "@/types/finance";
import { Link } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type AccountPickerProps = {
  accounts: FinancialAccount[];
  selectedId: string | null;
  onSelect: (accountId: string | null) => void;
  allowUnassigned?: boolean;
};

export function AccountPicker({
  accounts,
  selectedId,
  onSelect,
  allowUnassigned = true,
}: AccountPickerProps) {
  if (!accounts.length) {
    return (
      <View style={styles.emptyCard}>
        <Text selectable style={styles.emptyText}>
          Add an account first if you want this entry included in a live balance.
        </Text>
        <Link href="/add-account" style={styles.addLink}>
          Add account
        </Link>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {allowUnassigned ? (
        <TouchableOpacity
          style={[styles.chip, selectedId === null && styles.chipActive]}
          onPress={() => onSelect(null)}
          accessibilityState={{ selected: selectedId === null }}
        >
          <Text style={[styles.name, selectedId === null && styles.nameActive]}>
            Unassigned
          </Text>
          <Text style={[styles.type, selectedId === null && styles.typeActive]}>
            No balance impact
          </Text>
        </TouchableOpacity>
      ) : null}
      {accounts.map((account) => {
        const selected = account.id === selectedId;
        return (
          <TouchableOpacity
            key={account.id}
            style={[styles.chip, selected && styles.chipActive]}
            onPress={() => onSelect(account.id)}
            accessibilityState={{ selected }}
          >
            <Text style={[styles.name, selected && styles.nameActive]} numberOfLines={1}>
              {account.name}
            </Text>
            <Text style={[styles.type, selected && styles.typeActive]}>
              {formatAccountType(account.account_type)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingRight: 8 },
  chip: {
    minWidth: 124,
    maxWidth: 180,
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#C9DAD4",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  chipActive: { borderColor: "#00D09E", backgroundColor: "#DDF8EF" },
  name: { color: "#093030", fontSize: 13, fontWeight: "800" },
  nameActive: { color: "#075E50" },
  type: { color: "#6C817D", fontSize: 10, marginTop: 3 },
  typeActive: { color: "#087D65" },
  emptyCard: {
    gap: 7,
    padding: 13,
    borderRadius: 13,
    backgroundColor: "#EEF5F2",
  },
  emptyText: { color: "#526965", fontSize: 12, lineHeight: 18 },
  addLink: { color: "#087D65", fontSize: 13, fontWeight: "800" },
});
