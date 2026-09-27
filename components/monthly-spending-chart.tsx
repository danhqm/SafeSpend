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
import Animated, {
  LinearTransition,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
} from "react-native-reanimated";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import { formatCategory, monthDisplayName } from "../types/finance";

const INK = "#093030";
const MINT = "#00D09E";
const SIZE = 248;
const CENTER = SIZE / 2;
const RADIUS = 92;
const STROKE = 32;
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
  pendingMonth: string;
  direction: "previous" | "next";
  categories: SpendingCategory[];
  total: number;
  budget: number;
  budgetUnavailable: boolean;
  income: number;
  incomeSource: "recorded" | "profile" | "none";
  hasData: boolean;
  loading: boolean;
  error: string | null;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onRetry: () => void | Promise<void>;
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
  pendingMonth,
  direction,
  categories,
  total,
  budget,
  budgetUnavailable,
  income,
  incomeSource,
  hasData,
  loading,
  error,
  canGoNext,
  onPrevious,
  onNext,
  onRetry,
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

  const arcs = categories.map((item, index) => {
    const ratio = total > 0 ? item.amount / total : 0;
    const length = ratio * CIRCUMFERENCE;
    const start = total > 0
      ? (categories.slice(0, index).reduce((sum, previous) => sum + previous.amount, 0) /
          total) * CIRCUMFERENCE
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
    };
  });

  const budgetPercent = budget > 0 ? (total / budget) * 100 : 0;
  const incomePercent = income > 0 ? (total / income) * 100 : 0;
  const entering = direction === "next"
    ? SlideInRight.duration(270)
    : SlideInLeft.duration(270);
  const exiting = direction === "next"
    ? SlideOutLeft.duration(270)
    : SlideOutRight.duration(270);

  return (
    <View style={styles.card} {...panResponder.panHandlers}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>YOUR SPENDING PATTERN</Text>
        <Text style={styles.title}>Monthly expenses</Text>
        <View style={styles.monthSelector}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            accessibilityState={{ disabled: false }}
            onPress={onPrevious}
            hitSlop={8}
            style={styles.arrow}
          >
            <Ionicons name="chevron-back" size={22} color={INK} />
          </Pressable>
          <View style={styles.monthLabelWindow}>
            <Animated.Text
              key={month}
              entering={entering}
              exiting={exiting}
              style={styles.monthLabel}
              numberOfLines={1}
            >
              {monthDisplayName(month)}
            </Animated.Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: !canGoNext }}
            onPress={onNext}
            disabled={!canGoNext}
            hitSlop={8}
            style={[styles.arrow, !canGoNext && styles.disabledArrow]}
          >
            <Ionicons name="chevron-forward" size={22} color={INK} />
          </Pressable>
        </View>
      </View>

      {loading && hasData && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#007E61" />
          <Text style={styles.loadingText}>Loading {monthDisplayName(pendingMonth)}...</Text>
        </View>
      )}
      {error && (
        <Pressable accessibilityRole="button" onPress={() => void onRetry()} style={styles.errorBanner}>
          <Ionicons name="refresh-outline" size={18} color="#9F2F1E" />
          <Text style={styles.errorText}>{error} Tap to retry.</Text>
        </Pressable>
      )}

      {!hasData ? (
        <View style={styles.placeholder}>
          {loading && <ActivityIndicator size="large" color={MINT} />}
          <Text style={styles.helper}>
            {loading ? "Loading this month’s spending..." : "No monthly data loaded yet."}
          </Text>
        </View>
      ) : (
        <Animated.View style={styles.slideWindow} layout={LinearTransition.duration(270)}>
          <Animated.View
            key={month}
            entering={entering}
            exiting={exiting}
            layout={LinearTransition.duration(270)}
          >
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
                    strokeDasharray={`${Math.max(0, arc.length - 4)} ${CIRCUMFERENCE}`}
                    strokeDashoffset={-arc.start}
                    transform={`rotate(-90 ${CENTER} ${CENTER})`}
                  />
                ))}
                {arcs.filter((arc) => arc.ratio >= 0.11).map((arc) => (
                  <SvgText
                    key={`${arc.category}-label`}
                    x={arc.labelX}
                    y={arc.labelY}
                    fill={
                      ["FOOD_AND_DRINK", "GROCERIES", "TRANSPORT", "ENTERTAINMENT", "HEALTHCARE"].includes(arc.category)
                        ? INK
                        : "#FFFFFF"
                    }
                    fontSize={13}
                    fontWeight="bold"
                    textAnchor="middle"
                    alignmentBaseline="middle"
                  >
                    {percentage(arc.ratio * 100)}
                  </SvgText>
                ))}
              </Svg>
              <View style={styles.centerLabel} pointerEvents="none">
                <Text style={styles.centerEyebrow}>TOTAL SPENT</Text>
                <Text style={styles.centerValue} adjustsFontSizeToFit numberOfLines={1} selectable>
                  {formatRM(total)}
                </Text>
                <Text style={styles.centerSubtext}>this month</Text>
              </View>
            </View>

            <Text style={styles.breakdownLabel}>Where your money went</Text>
            {total === 0 ? (
              <Text style={styles.emptyText}>No expenses recorded for this month yet.</Text>
            ) : (
              <View style={styles.legend}>
                {arcs.map((arc) => (
                  <View key={arc.category} style={styles.legendRow}>
                    <View style={styles.legendTop}>
                      <View style={[styles.legendDot, { backgroundColor: arc.color }]} />
                      <Text style={styles.legendName}>{formatCategory(arc.category)}</Text>
                      <Text style={styles.legendPercent} selectable>{percentage(arc.ratio * 100)}</Text>
                    </View>
                    <Text style={styles.legendAmount} selectable>{formatRM(arc.amount)} spent</Text>
                  </View>
                ))}
              </View>
            )}
            <Text style={styles.shareCaption}>Percentages show each category’s share of total spending.</Text>

            {budgetUnavailable ? (
              <View style={styles.noBudgetCard}>
                <Ionicons name="cloud-offline-outline" size={21} color="#007E61" />
                <Text style={styles.noBudgetText}>Budget comparison is temporarily unavailable.</Text>
              </View>
            ) : budget > 0 ? (
              <View style={styles.budgetCard}>
                <View style={styles.budgetHeader}>
                  <Text style={styles.budgetEyebrow}>MONTHLY BUDGET</Text>
                  <Text style={[styles.budgetPercent, budgetPercent > 100 && styles.budgetOver]}>
                    {percentage(budgetPercent)} used
                  </Text>
                </View>
                <Text style={styles.budgetAmount} selectable>
                  {formatRM(total)} <Text style={styles.budgetTarget}>/ {formatRM(budget)}</Text>
                </Text>
                <View style={styles.budgetTrack}>
                  <View
                    style={[
                      styles.budgetFill,
                      { width: `${Math.min(100, budgetPercent)}%` },
                      budgetPercent > 100 && styles.budgetFillOver,
                    ]}
                  />
                </View>
                {budgetPercent > 100 && (
                  <Text style={styles.budgetWarning}>
                    {formatRM(total - budget)} over this month’s budget
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.noBudgetCard}>
                <Ionicons name="wallet-outline" size={21} color="#007E61" />
                <Text style={styles.noBudgetText}>No monthly budget set for this month.</Text>
              </View>
            )}

            {incomeSource === "none" ? (
              <Text style={styles.incomeContext}>Add income to compare spending with earnings.</Text>
            ) : (
              <Text style={styles.incomeContext} selectable>
                Also {percentage(incomePercent)} of {incomeSource === "recorded" ? "recorded" : "estimated"} monthly income ({formatRM(income)}).
              </Text>
            )}
          </Animated.View>
        </Animated.View>
      )}
      <Text style={styles.swipeHint}>Swipe left or right to explore other months</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#E9FFF4", borderRadius: 26, padding: 18, marginBottom: 16 },
  header: { gap: 4 },
  eyebrow: { color: "#007E61", fontSize: 12, fontWeight: "800", letterSpacing: 1.1 },
  title: { color: INK, fontSize: 24, fontWeight: "800", marginBottom: 12 },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#D5F4E6",
    borderRadius: 16,
    paddingHorizontal: 7,
    height: 48,
    overflow: "hidden",
  },
  monthLabelWindow: { flex: 1, alignItems: "center", overflow: "hidden" },
  monthLabel: { color: INK, fontSize: 17, fontWeight: "800" },
  arrow: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  disabledArrow: { opacity: 0.3 },
  loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  loadingText: { color: "#007E61", fontSize: 14, fontWeight: "700" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFE4DD", padding: 11, borderRadius: 12, marginTop: 12 },
  errorText: { flex: 1, color: "#9F2F1E", fontSize: 13, fontWeight: "700" },
  placeholder: { minHeight: 250, alignItems: "center", justifyContent: "center", gap: 12 },
  helper: { color: "#496C61", fontSize: 14, textAlign: "center" },
  slideWindow: { overflow: "hidden" },
  chartWrap: { width: SIZE, height: SIZE, alignSelf: "center", marginTop: 14 },
  centerLabel: { position: "absolute", left: 52, right: 52, top: 78, bottom: 78, alignItems: "center", justifyContent: "center" },
  centerEyebrow: { color: "#597A70", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  centerValue: { color: INK, fontSize: 27, fontWeight: "800", fontVariant: ["tabular-nums"] },
  centerSubtext: { color: "#597A70", fontSize: 13 },
  breakdownLabel: { color: INK, fontSize: 17, fontWeight: "800", marginTop: 14, marginBottom: 10 },
  emptyText: { color: "#496C61", fontSize: 14, paddingVertical: 16 },
  legend: { gap: 9 },
  legendRow: { gap: 5, backgroundColor: "#FFFFFF", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
  legendTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendName: { flex: 1, color: INK, fontSize: 15, fontWeight: "700" },
  legendAmount: { color: "#496C61", fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"], paddingLeft: 21 },
  legendPercent: { width: 46, color: "#007E61", textAlign: "right", fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  shareCaption: { color: "#496C61", fontSize: 13, lineHeight: 18, marginTop: 11 },
  budgetCard: { backgroundColor: INK, borderRadius: 18, padding: 16, marginTop: 18 },
  budgetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  budgetEyebrow: { color: "#B5EBD3", fontSize: 12, fontWeight: "800", letterSpacing: 0.6 },
  budgetPercent: { color: MINT, fontSize: 15, fontWeight: "800" },
  budgetOver: { color: "#FF9F7D" },
  budgetAmount: { color: "#FFFFFF", fontSize: 19, fontWeight: "800", marginTop: 9, fontVariant: ["tabular-nums"] },
  budgetTarget: { color: "#B5EBD3", fontSize: 15, fontWeight: "600" },
  budgetTrack: { height: 10, borderRadius: 5, backgroundColor: "#3A6560", overflow: "hidden", marginTop: 12 },
  budgetFill: { height: "100%", borderRadius: 5, backgroundColor: MINT },
  budgetFillOver: { backgroundColor: "#FF9F7D" },
  budgetWarning: { color: "#FFB49A", fontSize: 13, fontWeight: "700", marginTop: 8 },
  noBudgetCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#D5F4E6", borderRadius: 14, padding: 14, marginTop: 18 },
  noBudgetText: { flex: 1, color: INK, fontSize: 14, fontWeight: "600" },
  incomeContext: { color: "#496C61", fontSize: 14, lineHeight: 20, marginTop: 12 },
  swipeHint: { color: "#52796D", textAlign: "center", fontSize: 12, fontWeight: "600", marginTop: 14 },
});
