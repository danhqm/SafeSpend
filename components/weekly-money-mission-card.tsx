import { EvidenceSection } from "@/components/evidence-section";
import type {
  MoneyMissionCategory,
  MoneyMissionTemplate,
  WeeklyMoneyMission,
} from "@/types/learning";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const PRIMARY = "#00D09E";
const INK = "#093030";

const CATEGORY_META: Record<
  MoneyMissionCategory,
  {
    label: string;
    icon: React.ComponentProps<typeof Ionicons>["name"];
    color: string;
    background: string;
  }
> = {
  spending: {
    label: "Spending",
    icon: "receipt-outline",
    color: "#8A5A12",
    background: "#FFF0D9",
  },
  saving: {
    label: "Saving",
    icon: "shield-checkmark-outline",
    color: "#17689A",
    background: "#E2F0FA",
  },
  debt: {
    label: "Debt",
    icon: "card-outline",
    color: "#9B463D",
    background: "#FBE7E4",
  },
  planning: {
    label: "Planning",
    icon: "calendar-outline",
    color: "#126B5A",
    background: "#DDF5ED",
  },
};

type WeeklyMoneyMissionCardProps = {
  assignment: WeeklyMoneyMission;
  mission: MoneyMissionTemplate;
  busy: boolean;
  onAction: (mission: MoneyMissionTemplate) => void;
  onToggleComplete: (assignment: WeeklyMoneyMission) => void;
};

export function WeeklyMoneyMissionCard({
  assignment,
  mission,
  busy,
  onAction,
  onToggleComplete,
}: WeeklyMoneyMissionCardProps) {
  const completed = Boolean(assignment.completed_at);
  const category = CATEGORY_META[mission.category];

  return (
    <View style={[styles.card, completed && styles.cardCompleted]}>
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: category.background }]}>
          <Ionicons name={category.icon} size={23} color={category.color} />
        </View>
        <View style={styles.metaBlock}>
          <Text style={styles.eyebrow}>{category.label.toUpperCase()} MISSION</Text>
          <Text selectable style={styles.metaText}>
            {mission.estimated_minutes} min · week of {assignment.week_start}
          </Text>
        </View>
        {completed ? (
          <View style={styles.completedPill}>
            <Ionicons name="checkmark" size={13} color="#087D65" />
            <Text style={styles.completedPillText}>DONE</Text>
          </View>
        ) : null}
      </View>

      <Text selectable style={styles.title}>
        {mission.title}
      </Text>
      <Text selectable style={styles.summary}>
        {mission.summary}
      </Text>

      <View style={styles.steps}>
        {mission.steps.map((step, index) => (
          <View key={`${mission.id}-${index}`} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text selectable style={styles.stepNumberText}>
                {index + 1}
              </Text>
            </View>
            <Text selectable style={styles.stepText}>
              {step}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.whyBox}>
        <Text style={styles.whyLabel}>WHY THIS HELPS</Text>
        <Text selectable style={styles.whyText}>
          {mission.why_it_helps}
        </Text>
      </View>

      <EvidenceSection
        links={mission.money_mission_sources || []}
        reviewedAt={mission.reviewed_at}
      />

      <View style={styles.actions}>
        {mission.action_label && mission.action_trigger ? (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => onAction(mission)}
            disabled={busy}
            accessibilityRole="button"
          >
            <Ionicons name="open-outline" size={16} color="#087D65" />
            <Text style={styles.secondaryButtonText}>{mission.action_label}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[
            styles.completeButton,
            completed && styles.undoButton,
            busy && styles.disabled,
          ]}
          onPress={() => onToggleComplete(assignment)}
          disabled={busy}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed, disabled: busy }}
        >
          {busy ? (
            <ActivityIndicator color={completed ? INK : "#052224"} />
          ) : (
            <>
              <Ionicons
                name={completed ? "refresh-outline" : "checkmark-circle-outline"}
                size={17}
                color="#052224"
              />
              <Text style={styles.completeButtonText}>
                {completed ? "Mark unfinished" : "Mission complete"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text selectable style={styles.rotationNote}>
        A new curated mission appears every Monday. This one stays in your history.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 17, borderRadius: 20, backgroundColor: "#FFFFFF", borderCurve: "continuous", boxShadow: "0 2px 10px rgba(5, 34, 36, 0.07)" },
  cardCompleted: { backgroundColor: "#F1FBF7", borderWidth: 1, borderColor: "#B7E5D7" },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBox: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 14, borderCurve: "continuous" },
  metaBlock: { flex: 1 },
  eyebrow: { color: "#42675F", fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  metaText: { color: "#7A8E89", fontSize: 9, paddingTop: 2, fontVariant: ["tabular-nums"] },
  completedPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, backgroundColor: "#D6F3E9" },
  completedPillText: { color: "#087D65", fontSize: 8, fontWeight: "900", letterSpacing: 0.5 },
  title: { color: INK, fontSize: 19, lineHeight: 25, fontWeight: "800" },
  summary: { color: "#526C66", fontSize: 11, lineHeight: 18 },
  steps: { gap: 10 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNumber: { width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: 999, backgroundColor: "#DFF7EF" },
  stepNumberText: { color: "#087D65", fontSize: 10, fontWeight: "900", fontVariant: ["tabular-nums"] },
  stepText: { flex: 1, color: "#34534D", fontSize: 11, lineHeight: 17, paddingTop: 3 },
  whyBox: { padding: 12, borderRadius: 13, backgroundColor: "#F3F7F5", borderCurve: "continuous" },
  whyLabel: { color: "#527069", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  whyText: { color: "#405E58", fontSize: 10, lineHeight: 16, paddingTop: 4 },
  actions: { flexDirection: "row", gap: 8 },
  secondaryButton: { flex: 1, minHeight: 47, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10, borderRadius: 13, backgroundColor: "#E4F5EF" },
  secondaryButtonText: { color: "#087D65", fontSize: 10, fontWeight: "800", textAlign: "center" },
  completeButton: { flex: 1, minHeight: 47, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10, borderRadius: 13, backgroundColor: PRIMARY },
  undoButton: { backgroundColor: "#CFE8DF" },
  completeButtonText: { color: "#052224", fontSize: 10, fontWeight: "900", textAlign: "center" },
  rotationNote: { color: "#758983", fontSize: 9, lineHeight: 14, textAlign: "center" },
  disabled: { opacity: 0.55 },
});
