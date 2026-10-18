import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatFinMessage } from "../utils/fin-message-format";

export function FinMessageBody({ text }: { text: string }) {
  return <View style={styles.body}>
    {formatFinMessage(text).map((block, index) => {
      const content = <Text selectable accessibilityRole={block.kind === "heading" ? "header" : undefined}
        style={[styles.text, block.kind === "heading" && styles.heading]}>
        {block.spans.map((span, spanIndex) => <Text key={spanIndex} style={span.emphasis && styles.emphasis}>{span.text}</Text>)}
      </Text>;
      if (block.kind === "bullet" || block.kind === "numbered") {
        return <View key={index} style={styles.item}>
          <Text style={styles.marker}>{block.kind === "numbered" ? `${block.number}.` : "•"}</Text>
          <View style={styles.itemContent}>{content}</View>
        </View>;
      }
      return <View key={index} style={block.kind === "heading" && index > 0 ? styles.section : undefined}>{content}</View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  body: { gap: 10, flexShrink: 1 },
  text: { color: "#093030", fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 23 },
  heading: { fontFamily: "Poppins_700Bold", fontSize: 14, lineHeight: 23, color: "#0E3E3E" },
  emphasis: { fontFamily: "Poppins_700Bold" },
  section: { marginTop: 4 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  marker: { minWidth: 14, color: "#087D65", fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 23 },
  itemContent: { flex: 1, minWidth: 0 },
});
