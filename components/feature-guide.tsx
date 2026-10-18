import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { FeatureGuideController } from "../hooks/use-feature-guide";
import type { FeatureGuideKey } from "../utils/feature-guide-core";
import { GuideButton, GuidedTour, type GuideContent, type GuideTarget } from "./home-guide";

type FeatureStep = GuideContent & { action: string };
type FeatureContent = { name: string; introduction: string; footnote: string; steps: [FeatureStep, FeatureStep, FeatureStep] };

export const FEATURE_GUIDES: Record<FeatureGuideKey, FeatureContent> = {
  learn: {
    name: "Learn", introduction: "Find a short lesson, try a weekly money mission and choose a goal that matters to you.",
    footnote: "Your learning progress updates through the lessons and activities.",
    steps: [
      { title: "Start with a foundation path", icon: "book-outline", body: "Follow Your next step or choose a foundation path. Learn an idea, decide through a scenario and apply it with a saved plan. You can revisit any path.", location: "Find Foundation paths below Your next step.", action: "Explore foundation paths" },
      { title: "Put one idea into practice", icon: "flag-outline", body: "Your weekly mission supports your learning needs. Read its steps and sources, try the activity, then record that you completed it. This is self-reported, not verified financial activity.", location: "Find Weekly money mission below Foundation paths.", action: "Find this week’s mission" },
      { title: "Choose a small money goal", icon: "checkmark-circle-outline", body: "Use Personal money goals to write down a step you want to take this week. Add a short title and optional notes, then check it off when you finish.", location: "Find Personal money goals near the bottom of Learn. Tap Add to create one.", action: "Find personal goals" },
    ],
  },
  fin: {
    name: "Fin", introduction: "Ask about your spending, explore a money question and follow up when you need more detail.",
    footnote: "Example questions fill the message box. Tap Send when you’re ready.",
    steps: [
      { title: "Ask one clear question", icon: "chatbubble-outline", body: "Ask Fin about money habits or your recorded SafeSpend activity. Naming a time period or category helps make a spending question more specific.", location: "Write your question in the message box at the bottom of Fin.", action: "Try a spending question" },
      { title: "Keep the conversation going", icon: "chatbubbles-outline", body: "Ask a follow-up to clarify a reply or turn an idea into smaller steps. Fin receives the recent messages in this conversation to help answer in context.", location: "Replies appear above the message box. Use the same box to follow up.", action: "Write a follow-up" },
      { title: "Check the important details", icon: "shield-checkmark-outline", body: "Use Fin to understand your options. Check important amounts against your records and current rules with official sources before making a financial decision.", location: "You choose what to ask and when to send it using the arrow beside the message box.", action: "Write my own question" },
    ],
  },
  lhdn: {
    name: "Tax Relief", introduction: "Choose an assessment year, add supporting details and review your claims before confirming eligibility.",
    footnote: "You review and save each claim yourself.",
    steps: [
      { title: "Start with the assessment year", icon: "calendar-outline", body: "Choose the year the claim belongs to. Filing profile & family helps you review your form guide and family details. Years without reviewed rules stay in draft tracking.", location: "Find the YA year tabs and Filing profile & family at the top of Tax Relief.", action: "Review filing setup" },
      { title: "Add the supporting details", icon: "document-text-outline", body: "Use Add claim for manual details, or Scan receipt and Choose photo for receipt evidence. Check the extracted information and keep the original supporting documents.", location: "Find Add claim, Scan receipt and Choose photo below the filing tools.", action: "Find claim actions" },
      { title: "Review before confirming", icon: "checkmark-done-outline", body: "Draft claims stay in review. Check eligibility, the beneficiary and supporting evidence before confirming. Breakdown shows reliefs and limits; an estimate is not HASiL approval.", location: "Switch between Claims and Breakdown below the claim actions. Some estimates may be paused for your filing profile or year.", action: "View breakdown" },
    ],
  },
};

export function prepareFinGuideQuestion(current: string, step: 0 | 1 | 2) {
  if (current.trim() || step === 2) return current;
  return step === 0 ? "How much did I spend on groceries this month?" : "Could you explain that in a few smaller steps?";
}

export function FeatureGuideHelp({ name, onPress, disabled, light = false }: {
  name: string; onPress: () => void; disabled: boolean; light?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name} guide`}
    accessibilityHint="Replay the three-step introduction" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.help, focused && styles.focus, focused && light && styles.lightFocus,
      pressed && styles.pressed, disabled && styles.disabled]}>
    <Ionicons name="help-circle-outline" size={25} color={light ? "#F1FFF3" : "#0E3E3E"} accessible={false} />
  </Pressable>;
}

export function FeatureGuideIntro({ feature, guide }: { feature: FeatureGuideKey; guide: FeatureGuideController }) {
  if (!guide.progress || !["new", "started"].includes(guide.progress.status)) return null;
  const content = FEATURE_GUIDES[feature];
  const started = guide.progress.status === "started";
  return <View style={styles.intro}>
    <Text accessibilityRole="header" style={styles.title}>{`A quick guide to ${content.name}`}</Text>
    <Text style={styles.body}>{content.introduction}</Text>
    <View style={styles.actions}>
      <GuideButton label={started ? "Continue guide" : "Show me around"} onPress={() => guide.open()} />
      <GuideButton label="Maybe later" secondary onPress={guide.dismiss} />
    </View>
    <Text style={styles.note}>Use the help button in this section to replay the guide.</Text>
  </View>;
}

export function FeatureGuideStatus({ guide }: { guide: FeatureGuideController }) {
  return guide.progress && guide.notice
    ? <Text accessibilityLiveRegion="polite" style={styles.status}>{guide.notice}</Text> : null;
}

export function FeatureGuideTour({ feature, guide, target, onMeasure, onAction }: {
  feature: FeatureGuideKey; guide: FeatureGuideController; target: GuideTarget | null;
  onMeasure: () => void; onAction: (step: 0 | 1 | 2) => void;
}) {
  const content = FEATURE_GUIDES[feature];
  const step = guide.step;
  return <GuidedTour step={step} content={content.steps[step ?? 0]} target={target}
    onMeasure={onMeasure} onClose={guide.dismiss}
    actions={[{ label: content.steps[step ?? 0].action, onPress: () => {
      if (step === null) return;
      guide.leave();
      onAction(step);
    } }]}
    leadingAction={step !== null && step > 0 ? { label: "Back", secondary: true, onPress: guide.back } : undefined}
    trailingAction={{ label: step === 2 ? "Finish tour" : "Next", secondary: true, onPress: step === 2 ? guide.finish : guide.next }}
    footnote={content.footnote} notice={guide.notice} />;
}

const styles = StyleSheet.create({
  intro: { padding: 20, marginBottom: 20, borderRadius: 16, backgroundColor: "#DFF7E2" },
  title: { fontFamily: "Poppins_700Bold", fontSize: 20, lineHeight: 29, letterSpacing: -0.4, color: "#0E3E3E" },
  body: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 23, color: "#0E3E3E", marginTop: 8 },
  actions: { marginTop: 16, gap: 4 },
  note: { fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 18, color: "#617470", marginTop: 12 },
  help: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  focus: { outlineColor: "#087D65", outlineWidth: 2, outlineOffset: 3 },
  lightFocus: { outlineColor: "#F1FFF3" },
  status: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 20, color: "#0E3E3E", marginBottom: 12 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
});
