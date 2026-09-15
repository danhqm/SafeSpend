import { ExternalLink } from "@/components/external-link";
import {
  formatSourceType,
  sourceFromLink,
  type ModuleSourceLink,
} from "@/types/learning";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type EvidenceSectionProps = {
  links: ModuleSourceLink[];
  reviewedAt?: string | null;
};

export function EvidenceSection({
  links,
  reviewedAt,
}: EvidenceSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const sources = useMemo(
    () =>
      [...links]
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((link) => ({ link, source: sourceFromLink(link) }))
        .filter((entry) => Boolean(entry.source)),
    [links],
  );

  if (!sources.length) return null;

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={styles.headerIcon}>
          <Ionicons name="library-outline" size={19} color="#087D65" />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Evidence and sources</Text>
          <Text selectable style={styles.subtitle}>
            {sources.length} source{sources.length === 1 ? "" : "s"}
            {reviewedAt ? ` · reviewed ${reviewedAt}` : ""}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color="#526C66"
        />
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.list}>
          {sources.map(({ link, source }) => {
            if (!source) return null;
            const year = source.publication_year
              ? ` · ${source.publication_year}`
              : "";
            return (
              <View key={source.id} style={styles.sourceCard}>
                <Text style={styles.sourceType}>
                  {formatSourceType(source)} · {source.jurisdiction}
                </Text>
                <Text selectable style={styles.sourceTitle}>
                  {source.title}
                </Text>
                <Text selectable style={styles.publisher}>
                  {source.publisher}
                  {year}
                </Text>
                <Text selectable style={styles.evidenceNote}>
                  {link.evidence_note}
                </Text>
                <Text selectable style={styles.summary}>
                  {source.summary}
                </Text>
                {source.limitations ? (
                  <View style={styles.limitationBox}>
                    <Text style={styles.limitationLabel}>LIMITATION</Text>
                    <Text selectable style={styles.limitationText}>
                      {source.limitations}
                    </Text>
                  </View>
                ) : null}
                <ExternalLink href={source.url as `https://${string}`} asChild>
                  <TouchableOpacity style={styles.sourceLink}>
                    <Text style={styles.sourceLinkText}>Open original source</Text>
                    <Ionicons name="open-outline" size={15} color="#087D65" />
                  </TouchableOpacity>
                </ExternalLink>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { borderRadius: 17, backgroundColor: "#E8F5F1", overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  headerIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#D3EEE6" },
  headerText: { flex: 1 },
  title: { color: "#093030", fontSize: 13, fontWeight: "800" },
  subtitle: { color: "#5F7872", fontSize: 9, paddingTop: 2 },
  list: { gap: 10, paddingHorizontal: 10, paddingBottom: 10 },
  sourceCard: { padding: 13, borderRadius: 14, backgroundColor: "#FFFFFF" },
  sourceType: { color: "#087D65", fontSize: 8, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
  sourceTitle: { color: "#093030", fontSize: 13, lineHeight: 18, fontWeight: "800", paddingTop: 4 },
  publisher: { color: "#71847F", fontSize: 9, paddingTop: 2 },
  evidenceNote: { color: "#385E56", fontSize: 10, lineHeight: 16, fontWeight: "700", paddingTop: 10 },
  summary: { color: "#526C66", fontSize: 10, lineHeight: 16, paddingTop: 6 },
  limitationBox: { padding: 10, borderRadius: 11, backgroundColor: "#FFF5E6", marginTop: 10 },
  limitationLabel: { color: "#955B16", fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  limitationText: { color: "#6E532F", fontSize: 9, lineHeight: 15, paddingTop: 3 },
  sourceLink: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 11, borderRadius: 11, backgroundColor: "#E2F5EF", marginTop: 10 },
  sourceLinkText: { color: "#087D65", fontSize: 10, fontWeight: "800" },
});
