import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const STARTERS = [
  { title: "Think through a purchase", question: "Can you help me work out whether I can afford a purchase?" },
  { title: "Plan a savings goal", question: "Help me plan a savings goal and compare how long it could take." },
  { title: "Compare repayment options", question: "Can you help me compare repayment scenarios for a debt?" },
];

export function FinCoachStarters({ onChoose }: { onChoose: (question: string) => void }) {
  return <View style={styles.starters}>
    <Text style={styles.title}>What would you like to work through?</Text>
    {STARTERS.map(starter => <Pressable key={starter.title} accessibilityRole="button"
      onPress={() => onChoose(starter.question)} style={({ pressed }) => [styles.starter, pressed && styles.pressed]}>
      <Text style={styles.starterText}>{starter.title}</Text>
      <Ionicons name="arrow-forward" size={18} color="#087D65" />
    </Pressable>)}
    <Text style={styles.hint}>Fin can use your saved records and ask about anything missing. Choose a question, then tap Send.</Text>
  </View>;
}

export function FinAiNotice() {
  return <Text style={styles.notice}>
    Fin provides AI-generated guidance and can make mistakes. Use your own judgment and verify important information before making financial decisions.
  </Text>;
}

const styles = StyleSheet.create({
  starters: { gap: 4, paddingTop: 12, paddingBottom: 16 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 15, lineHeight: 23, color: "#093030", marginBottom: 4 },
  starter: { flexDirection: "row", gap: 12, alignItems: "center", justifyContent: "space-between",
    minHeight: 48, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#DCEAE4" },
  pressed: { opacity: 0.65 },
  starterText: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 22, color: "#087D65" },
  hint: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 19, color: "#4A665C", marginTop: 10 },
  notice: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18, color: "#4A665C", marginTop: 10 },
});
