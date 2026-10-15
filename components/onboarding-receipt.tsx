import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

/** The illustrative receipt from the MagicPath Receipt Focus reference. */
export function OnboardingReceipt({ compact }: { compact: boolean }) {
  const { fontScale } = useWindowDimensions();
  // At larger reading sizes the artwork stays in flow so its caption can grow.
  const compactArtwork = compact && fontScale <= 1.2;
  return (
    <View style={[styles.stage, compactArtwork && styles.compactStage]}>
      <View style={styles.backdrop} />
      <View style={[styles.scanner, compactArtwork && styles.compactScanner]} pointerEvents="none">
        <View style={[styles.corner, styles.topLeft]} />
        <View style={[styles.corner, styles.topRight]} />
        <View style={[styles.corner, styles.bottomLeft]} />
        <View style={[styles.corner, styles.bottomRight]} />
      </View>
      <View style={[styles.paper, compactArtwork && styles.compactPaper]} accessible
        accessibilityLabel="Example receipt from Lime Café: iced latte RM 11.50, butter croissant RM 7.00. Total RM 18.50.">
        <Feather name="coffee" size={26} color="#087D65" style={styles.paperMark} />
        <Text allowFontScaling={false} style={styles.merchant}>Lime Café</Text>
        <Text allowFontScaling={false} style={styles.date}>12 Oct 2026 · 10:24 AM</Text>
        <View style={styles.rule} />
        <View style={styles.line}><Text allowFontScaling={false} style={styles.item}>Iced latte</Text><Text allowFontScaling={false} style={styles.item}>RM 11.50</Text></View>
        <View style={styles.line}><Text allowFontScaling={false} style={styles.item}>Butter croissant</Text><Text allowFontScaling={false} style={styles.item}>RM 7.00</Text></View>
        <View style={styles.rule} />
        <View style={styles.line}><Text allowFontScaling={false} style={styles.totalLabel}>Total</Text><Text allowFontScaling={false} style={styles.total}>RM 18.50</Text></View>
        <Text allowFontScaling={false} style={styles.category}>Example receipt</Text>
      </View>
      <View style={[styles.caption, compactArtwork && styles.compactCaption]}>
        <View style={styles.check}><Feather name="check" size={15} color="#087D65" /></View>
        <Text style={styles.captionText}>Your receipt, organized</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flexGrow: 1, minHeight: 290, marginTop: 18, paddingBottom: 24,
    alignItems: "center", justifyContent: "center" },
  compactStage: { minHeight: 250, marginTop: 12, paddingBottom: 20 },
  backdrop: { position: "absolute", top: 13, left: 0, right: 0, bottom: 8,
    backgroundColor: "#DFF7E2", borderRadius: 32 },
  scanner: { position: "absolute", top: 30, left: 22, right: 22, bottom: 61, zIndex: 2 },
  compactScanner: { top: 16, bottom: 36 },
  corner: { position: "absolute", width: 27, height: 27, borderColor: "#087D65" },
  topLeft: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 9 },
  topRight: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 9 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 9 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 9 },
  paper: { width: 225, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 13,
    borderRadius: 8, backgroundColor: "#FFFFFF", transform: [{ rotate: "-5deg" }],
    boxShadow: "0 8px 22px rgba(4, 42, 38, 0.14)" },
  compactPaper: { position: "absolute", top: 3, transformOrigin: "center top",
    transform: [{ rotate: "-5deg" }, { scale: 0.86 }] },
  paperMark: { alignSelf: "center", marginBottom: 4 },
  merchant: { fontFamily: "Poppins_700Bold", fontSize: 18, lineHeight: 29,
    textAlign: "center", letterSpacing: -0.4, color: "#093030" },
  date: { fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 15,
    color: "#617470", textAlign: "center", marginTop: 1 },
  rule: { borderTopWidth: 1, borderStyle: "dashed", borderColor: "#C9DAD4", marginVertical: 13 },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7 },
  item: { fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 19,
    color: "#093030", fontVariant: ["tabular-nums"] },
  totalLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#093030" },
  total: { fontFamily: "Poppins_700Bold", fontSize: 17, lineHeight: 28,
    letterSpacing: -0.4, color: "#093030", fontVariant: ["tabular-nums"] },
  category: { fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 15,
    color: "#617470", textAlign: "center", marginTop: 13, paddingTop: 9,
    borderTopWidth: 1, borderColor: "#C9DAD4" },
  caption: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 24 },
  compactCaption: { position: "absolute", bottom: 4, marginTop: 0 },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: "#00D09E",
    alignItems: "center", justifyContent: "center" },
  captionText: { fontFamily: "Poppins_700Bold", fontSize: 11, lineHeight: 18, color: "#087D65" },
});
