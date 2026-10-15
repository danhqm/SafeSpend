import { Ionicons } from "@expo/vector-icons";
import { useState, type ComponentProps } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { guideComplete, type GuideProgress, type GuideStep } from "../utils/home-guide-core";

export type IconName = ComponentProps<typeof Ionicons>["name"];
export type GuideTarget = { x: number; y: number; width: number; height: number };
export type GuideContent = { title: string; icon: IconName; body: string; location: string };
export type GuideAction = { label: string; onPress: () => void; secondary?: boolean };

export function GuideButton({ label, onPress, secondary = false }: {
  label: string; onPress: () => void; secondary?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.button, secondary && styles.secondary,
      focused && styles.focus, pressed && styles.pressed]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
  </Pressable>;
}

export function HomeGuideCard({ progress, notice, onOpen, onDismiss }: {
  progress: GuideProgress | null; notice: string | null;
  onOpen: (step?: GuideStep) => void; onDismiss: () => void;
}) {
  if (!progress || progress.visibility === "hidden") return null;
  const welcome = progress.visibility === "new";
  const complete = guideComplete(progress);
  const completed = [progress.expenseRecorded, progress.summaryViewed, progress.budgetSet].filter(Boolean).length;
  const rows: { title: string; detail: string; done: boolean; icon: IconName }[] = [
    { title: "Record an expense", detail: "Scan a receipt or enter it yourself.", done: progress.expenseRecorded, icon: "receipt-outline" },
    { title: "Understand your overview", detail: "See how your spending adds up.", done: progress.summaryViewed, icon: "pie-chart-outline" },
    { title: "Set a monthly budget", detail: "Give your spending a limit.", done: progress.budgetSet, icon: "calendar-outline" },
  ];
  return <View style={styles.card}>
    <View style={styles.headingRow}>
      <Text accessibilityRole="header" style={styles.cardTitle}>
        {welcome ? "A little help getting started" : complete ? "You’re ready to go" : "Your first steps"}
      </Text>
      {!welcome && <Pressable accessibilityRole="button" accessibilityLabel="Hide getting started guide"
        onPress={onDismiss} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <Ionicons name="close-outline" size={23} color="#0E3E3E" accessible={false} />
      </Pressable>}
    </View>
    {welcome ? <>
      <Text style={styles.body}>Record an expense, understand your overview and set a budget. We’ll show you where to start.</Text>
      <View style={styles.welcomeActions}>
        <GuideButton label="Show me around" onPress={() => onOpen(0)} />
        <GuideButton label="Maybe later" secondary onPress={onDismiss} />
      </View>
      <Text style={styles.footnote}>You can open this guide anytime from Profile.</Text>
    </> : <>
      <Text style={styles.body}>{complete ? "Keep adding expenses to build a clearer picture of your money." : "A few small steps to make SafeSpend yours."}</Text>
      <View style={styles.progressRow} accessibilityLiveRegion="polite">
        <Text style={styles.progressText}>{completed} of 3 complete</Text>
        <Pressable accessibilityRole="button" onPress={() => onOpen(progress.tourFinished ? 0 : undefined)}
          style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
          <Text style={styles.link}>{progress.tourFinished ? "Replay tour" : "Continue tour"}</Text>
        </Pressable>
      </View>
      {rows.map((row, index) => <Pressable key={row.title} accessibilityRole="button"
        accessibilityLabel={`${row.title}${row.done ? ", completed. Review this step" : ""}`}
        onPress={() => onOpen(index as GuideStep)}
        style={({ pressed }) => [styles.checklistRow, pressed && styles.rowPressed]}>
        <View style={[styles.checkIcon, row.done && styles.checked]}>
          <Ionicons name={row.done ? "checkmark" : row.icon} size={20} color={row.done ? "#0E3E3E" : "#087D65"} accessible={false} />
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>{row.title}</Text>
          <Text style={styles.rowDetail}>{row.done ? "Completed" : row.detail}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#617470" accessible={false} />
      </Pressable>)}
    </>}
    {notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
  </View>;
}

const steps = [
  { title: "Start with one expense", icon: "receipt-outline" as const,
    body: "Use Scan Receipt to capture a receipt, then check the details and confirm it. No receipt handy? You can enter an expense yourself.",
    location: "Find Scan Receipt beside Ask Fin on Home." },
  { title: "See where your money goes", icon: "pie-chart-outline" as const,
    body: "Total Expense shows this month’s spending after refunds. Your monthly chart below groups it by category. Only confirmed expenses count.",
    location: "Find Total Expense at the top of Home." },
  { title: "Give your spending a limit", icon: "calendar-outline" as const,
    body: "Tap Monthly Budget and set your Overall monthly limit. Once saved, Home compares your spending with that limit. You can change it anytime.",
    location: "Find Monthly Budget at the top of Home." },
];

export function HomeGuideTour({ step, target, onMeasure, onNext, onBack, onClose, onScan, onManual, onBudget }: {
  step: GuideStep | null; target: GuideTarget | null; onMeasure: () => void;
  onNext: () => void; onBack: () => void; onClose: () => void;
  onScan: () => void; onManual: () => void; onBudget: () => void;
}) {
  return <GuidedTour step={step} target={target} onMeasure={onMeasure} onClose={onClose}
    content={steps[step ?? 0]}
    actions={step === 0 ? [{ label: "Scan a receipt", onPress: onScan }, { label: "Enter manually", secondary: true, onPress: onManual }]
      : step === 1 ? [{ label: "Got it, next", onPress: onNext }] : [{ label: "Set monthly budget", onPress: onBudget }]}
    leadingAction={step !== null && step > 0 ? { label: "Back", secondary: true, onPress: onBack } : undefined}
    trailingAction={step !== 1 ? { label: step === 2 ? "Finish tour" : "Next", secondary: true, onPress: step === 2 ? onClose : onNext } : undefined}
    footnote="Your checklist updates after you save. Explore at your own pace." />;
}

export function GuidedTour({ step, content, target, onMeasure, onClose, actions, leadingAction, trailingAction, footnote, notice }: {
  step: GuideStep | null; content: GuideContent; target: GuideTarget | null;
  onMeasure: () => void; onClose: () => void; actions: GuideAction[];
  leadingAction?: GuideAction; trailingAction?: GuideAction; footnote: string; notice?: string | null;
}) {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [cardHeight, setCardHeight] = useState(400);
  if (step === null) return null;
  const margin = 16;
  const maxHeight = height - insets.top - insets.bottom - margin * 2;
  const small = maxHeight < 540 || fontScale > 1.4;
  const hole = !small && target && target.y >= insets.top && target.y + target.height < height - insets.bottom
    ? { x: Math.max(6, target.x - 6), y: Math.max(insets.top, target.y - 6),
      width: Math.min(width - 12, target.width + 12), height: target.height + 12 } : null;
  const panelHeight = Math.min(cardHeight, maxHeight);
  const below = hole ? hole.y + hole.height + 16 : 0;
  const above = hole ? hole.y - panelHeight - 16 : 0;
  const top = hole && below + panelHeight <= height - insets.bottom - margin ? below
    : hole && above >= insets.top + margin ? above
      : Math.max(insets.top + margin, (height - panelHeight) / 2);
  const panelWidth = Math.min(width - margin * 2, 420);
  // Fall back to a readable centered sheet when the target and text cannot both fit.
  const showHole = hole && (top >= hole.y + hole.height || top + panelHeight <= hole.y);
  return <Modal transparent visible animationType="none" statusBarTranslucent onShow={onMeasure} onRequestClose={onClose}>
    <View style={styles.modal} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      {showHole ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.dim, { top: 0, left: 0, right: 0, height: hole.y }]} />
        <View style={[styles.dim, { top: hole.y + hole.height, bottom: 0, left: 0, right: 0 }]} />
        <View style={[styles.dim, { top: hole.y, height: hole.height, left: 0, width: hole.x }]} />
        <View style={[styles.dim, { top: hole.y, height: hole.height, left: hole.x + hole.width, right: 0 }]} />
        <View style={[styles.spotlight, { top: hole.y, left: hole.x, width: hole.width, height: hole.height }]} />
      </View> : <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim]} />}
      <ScrollView style={[styles.tourPanel, { top, left: (width - panelWidth) / 2, width: panelWidth, maxHeight }]}
        contentContainerStyle={styles.tourContent} onContentSizeChange={(_, h) => setCardHeight(h)}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
        <View style={styles.tourTop}>
          <View style={styles.tourIcon}><Ionicons name={content.icon} size={25} color="#0E3E3E" accessible={false} /></View>
          <Text style={styles.stepCount} accessibilityLiveRegion="polite">{step + 1} of 3</Text>
          <Pressable accessibilityRole="button" onPress={onClose}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
            <Text style={styles.link}>Skip tour</Text>
          </Pressable>
        </View>
        <Text accessibilityRole="header" style={styles.tourTitle}>{content.title}</Text>
        <Text style={styles.tourBody}>{content.body}</Text>
        {!showHole && <Text style={styles.location}>{content.location}</Text>}
        <View style={styles.tourActions}>
          {actions.map((action) => <GuideButton key={action.label} {...action} />)}
        </View>
        <View style={styles.tourFooter}>
          {leadingAction ? <GuideButton {...leadingAction} /> : <View />}
          {trailingAction && <GuideButton {...trailingAction} />}
        </View>
        <Text style={styles.footnote}>{footnote}</Text>
        {notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  card: { padding: 20, marginBottom: 20, borderRadius: 16, backgroundColor: "#DFF7E2" },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { flex: 1, fontFamily: "Poppins_700Bold", fontSize: 20, lineHeight: 29, letterSpacing: -0.4, color: "#0E3E3E" },
  body: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 23, color: "#0E3E3E", marginTop: 8 },
  welcomeActions: { marginTop: 16, gap: 4 },
  button: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#00D09E", alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: "Poppins_700Bold", fontSize: 14, lineHeight: 23, color: "#0E3E3E", textAlign: "center" },
  secondary: { backgroundColor: "transparent" },
  secondaryText: { color: "#087D65" },
  focus: { outlineColor: "#087D65", outlineWidth: 2, outlineOffset: 3 },
  pressed: { opacity: 0.7 },
  rowPressed: { backgroundColor: "#F1FFF3" },
  iconButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  progressRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4, marginTop: 10 },
  progressText: { fontFamily: "Poppins_700Bold", fontSize: 12, lineHeight: 20, color: "#0E3E3E" },
  textButton: { minHeight: 48, justifyContent: "center", paddingHorizontal: 6, borderRadius: 8 },
  link: { fontFamily: "Poppins_700Bold", fontSize: 12, lineHeight: 20, color: "#087D65" },
  checklistRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderColor: "#C9DAD4", borderRadius: 8 },
  checkIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#F1FFF3" },
  checked: { backgroundColor: "#00D09E" },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: "Poppins_700Bold", fontSize: 13, lineHeight: 21, color: "#0E3E3E" },
  rowDetail: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 20, color: "#0E3E3E", marginTop: 2 },
  notice: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 20, color: "#0E3E3E", marginTop: 12 },
  modal: { flex: 1 },
  dim: { position: "absolute", backgroundColor: "rgba(9, 48, 48, 0.72)" },
  spotlight: { position: "absolute", borderRadius: 16, borderWidth: 3, borderColor: "#00D09E" },
  tourPanel: { position: "absolute", backgroundColor: "#F1FFF3", borderRadius: 20 },
  tourContent: { padding: 24 },
  tourTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  tourIcon: { width: 44, height: 44, backgroundColor: "#DFF7E2", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stepCount: { flex: 1, fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 21, color: "#617470" },
  tourTitle: { fontFamily: "Poppins_700Bold", fontSize: 24, lineHeight: 33, letterSpacing: -0.5, color: "#0E3E3E" },
  tourBody: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 24, color: "#0E3E3E", marginTop: 12 },
  location: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 21, color: "#617470", marginTop: 12 },
  tourActions: { marginTop: 20, gap: 4 },
  tourFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, gap: 12 },
  footnote: { fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 18, color: "#617470", marginTop: 12 },
});
