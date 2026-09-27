import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import { formatCategory, monthDisplayName } from "../types/finance";

const INK = "#093030";
const MINT = "#00D09E";
const SIZE = 224;
const CENTER = SIZE / 2;
const RADIUS = 84;
const STROKE = 28;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const CATEGORY_COLORS: Record<string, string> = {
  FOOD_AND_DRINK: "#FF6B6B",
  GROCERIES: "#22C55E",
  TRANSPORT: "#F59E0B",
  SHOPPING: "#3B82F6",
  BILLS: "#8B5CF6",
  ENTERTAINMENT: "#EC4899",
  HEALTHCARE: "#14B8A6",
  EDUCATION: "#6366F1",
  HOUSING: "#A16207",
  OTHER: "#798C8A",
};

type SpendingCategory = { category: string; amount: number };

type Props = {
  month: string;
  categories: SpendingCategory[];
  total: number;
  income: number;
  incomeSource: "recorded" | "profile" | "none";
  loading: boolean;
  error: string | null;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

function percentage(value: number) {
  if (value > 0 && value < 1) return "<1%";
  return `${Math.round(value)}%`;
}

function formatRM(value: number) {
  return `RM${value.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function MonthlySpendingChart({
  month,
  categories,
  total,
  income,
  incomeSource,
  loading,
  error,
  canGoNext,
  onPrevious,
  onNext,
}: Props) {
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 20 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 60) onPrevious();
          if (gesture.dx < -60 && canGoNext) onNext();
        },
      }),
    [canGoNext, onNext, onPrevious],
  );

  const denominator = income > 0 ? Math.max(income, total) : total;
  const arcs = categories.map((item, index) => {
    const ratio = denominator > 0 ? item.amount / denominator : 0;
    const length = ratio * CIRCUMFERENCE;
    const start = denominator > 0
      ? (categories.slice(0, index).reduce((sum, previous) => sum + previous.amount, 0) /
          denominator) * CIRCUMFERENCE
      : 0;
    const angle = -Math.PI / 2 + ((start + length / 2) / CIRCUMFERENCE) * 2 * Math.PI;
    return {
      ...item,
      color: CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.OTHER,
      ratio,
      length,
      start,
      labelX: CENTER + RADIUS * Math.cos(angle),
      labelY: CENTER + RADIUS * Math.sin(angle),
      percent: denominator > 0 ? (item.amount / (income > 0 ? income : total)) * 100 : 0,
    };
  });

  const spendPercent = income > 0 ? (total / income) * 100 : 0;
  const comparisonLabel = income > 0 ? "of monthly income" : "of monthly spending";

  return (
    <View style={styles.card} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>YOUR SPENDING PATTERN</Text>
          <Text style={styles.title}>Monthly expenses</Text>
        </View>
        <View style={styles.monthSelector}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={onPrevious}
            hitSlop={8}
            style={styles.arrow}
          >
            <Ionicons name="chevron-back" size={18} color={INK} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthDisplayName(month)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: !canGoNext }}
            onPress={onNext}
            disabled={!canGoNext}
            hitSlop={8}
            style={[styles.arrow, !canGoNext && styles.disabledArrow]}
          >
            <Ionicons name="chevron-forward" size={18} color={INK} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.placeholder}>
          <ActivityIndicator color={MINT} />
          <Text style={styles.helper}>Loading this month&apos;s spending...</Text>
        </View>
      ) : error ? (
        <View style={styles.placeholder}>
          <Ionicons name="cloud-offline-outline" size={28} color={INK} />
          <Text style={styles.helper}>{error}</Text>
        </View>
      ) : (
        <>
          <View style={styles.chartWrap}>
            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <Circle
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke="#D7E9E1"
                strokeWidth={STROKE}
              />
              {arcs.map((arc) => (
                <Circle
                  key={arc.category}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${Math.max(0, arc.length - 3)} ${CIRCUMFERENCE}`}
                  strokeDashoffset={-arc.start}
                  transform={`rotate(-90 ${CENTER} ${CENTER})`}
                />
              ))}
              {arcs.filter((arc) => arc.ratio >= 0.11 && arc.percent < 100).map((arc) => (
                <SvgText
                  key={`${arc.category}-label`}
                  x={arc.labelX}
                  y={arc.labelY}
                  fill={
                    ["TRANSPORT", "GROCERIES", "HEALTHCARE"].includes(arc.category)
                      ? INK
                      : "#FFFFFF"
                  }
                  fontSize={11}
                  fontWeight="bold"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                >
                  {percentage(arc.percent)}
                </SvgText>
              ))}
            </Svg>
            <View style={styles.centerLabel} pointerEvents="none">
              <Text style={styles.centerEyebrow}>SPENT THIS MONTH</Text>
              <Text style={styles.centerValue} adjustsFontSizeToFit numberOfLines={1}>
                {income > 0 ? percentage(spendPercent) : formatRM(total)}
              </Text>
              <Text style={styles.centerSubtext}>
                {income > 0 ? "of income" : "income not set"}
              </Text>
            </View>
          </View>

          <Text style={styles.totalText}>Total spent: {formatRM(total)}</Text>
          {incomeSource === "recorded" && (
            <Text style={styles.contextText}>Compared with {formatRM(income)} recorded income this month.</Text>
          )}
          {incomeSource === "profile" && (
            <Text style={styles.contextText}>Compared with your {formatRM(income)} profile income estimate.</Text>
          )}
          {incomeSource === "none" && (
            <Text style={styles.contextText}>Add income to see what share of it each category uses.</Text>
          )}
          {income > 0 && spendPercent > 100 && (
            <>
              <Text style={styles.overIncome}>Spending is {percentage(spendPercent - 100)} above this month&apos;s income.</Text>
              <Text style={styles.contextText}>The ring is scaled to total spending; percentages still use income.</Text>
            </>
          )}
          {total === 0 ? (
            <Text style={styles.emptyText}>No expenses recorded for this month yet.</Text>
          ) : (
            <View style={styles.legend}>
              <Text style={styles.legendHeading}>By category · {comparisonLabel}</Text>
              {arcs.map((arc) => (
                <View key={arc.category} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: arc.color }]} />
                  <Text style={styles.legendName}>{formatCategory(arc.category)}</Text>
                  <Text style={styles.legendAmount}>{formatRM(arc.amount)}</Text>
                  <Text style={styles.legendPercent}>{percentage(arc.percent)}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.swipeHint}>Swipe left or right to explore other months</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#E9FFF4",
    borderRadius: 26,
    padding: 18,
    marginBottom: 16,
  },
  header: { gap: 14 },
  eyebrow: { color: "#32816E", fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  title: { color: INK, fontSize: 21, fontWeight: "800", marginTop: 2 },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#D5F4E6",
    borderRadius: 16,
    paddingHorizontal: 7,
    height: 42,
  },
  monthLabel: { color: INK, fontSize: 15, fontWeight: "700" },
  arrow: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  disabledArrow: { opacity: 0.3 },
  placeholder: {
    minHeight: 250,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  helper: { color: "#496C61", fontSize: 13, textAlign: "center" },
  chartWrap: { width: SIZE, height: SIZE, alignSelf: "center", marginTop: 14 },
  centerLabel: {
    position: "absolute",
    left: 44,
    right: 44,
    top: 73,
    bottom: 73,
    alignItems: "center",
    justifyContent: "center",
  },
  centerEyebrow: { color: "#597A70", fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  centerValue: { color: INK, fontSize: 28, fontWeight: "800", fontVariant: ["tabular-nums"] },
  centerSubtext: { color: "#597A70", fontSize: 11 },
  totalText: { color: INK, textAlign: "center", fontSize: 16, fontWeight: "800", marginTop: 8 },
  contextText: { color: "#496C61", textAlign: "center", fontSize: 11, marginTop: 4 },
  overIncome: { color: "#B42318", textAlign: "center", fontSize: 11, fontWeight: "700", marginTop: 5 },
  emptyText: { color: "#496C61", textAlign: "center", fontSize: 12, paddingVertical: 20 },
  legend: { borderTopWidth: 1, borderTopColor: "#C8E8D8", marginTop: 18, paddingTop: 12, gap: 9 },
  legendHeading: { color: "#496C61", fontSize: 11, fontWeight: "700", marginBottom: 2 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { flex: 1, color: INK, fontSize: 12 },
  legendAmount: { color: INK, fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  legendPercent: { width: 42, color: "#007E61", textAlign: "right", fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  swipeHint: { color: "#6B8E82", textAlign: "center", fontSize: 10, marginTop: 16 },
});
