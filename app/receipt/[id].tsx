import { formatCategory, type StoredReceipt } from "@/types/finance";
import { addSignedReceiptImage } from "@/utils/receipt-images";
import { supabase } from "@/utils/supabase";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

const PRIMARY = "#00D09E";

export default function StoredReceiptScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const receiptId = Array.isArray(id) ? id[0] : id;
  const { height } = useWindowDimensions();
  const [receipt, setReceipt] = useState<StoredReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReceipt = useCallback(async () => {
    if (!receiptId) {
      setError("This receipt link is invalid.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: receiptError } = await supabase
        .from("receipts")
        .select(
          "id, merchant_name, total_amount, receipt_date, category, items, image_url",
        )
        .eq("id", receiptId)
        .maybeSingle();

      if (receiptError) throw receiptError;
      if (!data) throw new Error("Receipt not found");

      const signedReceipt = await addSignedReceiptImage(
        data as unknown as StoredReceipt,
      );
      setReceipt(signedReceipt);
    } catch (loadError) {
      console.error("Stored receipt load failed", loadError);
      setReceipt(null);
      setError(
        loadError instanceof Error && loadError.message === "Receipt not found"
          ? "This receipt is unavailable or does not belong to your account."
          : "Could not securely load this receipt. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [receiptId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadReceipt();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadReceipt]);

  return (
    <>
      <Stack.Screen options={{ title: receipt?.merchant_name || "Stored Receipt" }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        {loading ? (
          <View style={[styles.centerState, { minHeight: height * 0.65 }]}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={styles.stateText}>Opening your private receipt…</Text>
          </View>
        ) : error ? (
          <View style={[styles.centerState, { minHeight: height * 0.65 }]}>
            <Text selectable style={styles.errorTitle}>Receipt unavailable</Text>
            <Text selectable style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadReceipt}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : receipt ? (
          <>
            <View style={[styles.imageCard, { height: Math.max(360, height * 0.58) }]}>
              {receipt.image_url ? (
                <Image
                  source={{ uri: receipt.image_url }}
                  style={styles.receiptImage}
                  contentFit="contain"
                  transition={180}
                  accessibilityLabel={`Receipt from ${receipt.merchant_name || "unknown merchant"}`}
                />
              ) : (
                <Text selectable style={styles.missingImageText}>
                  No original image was stored for this receipt.
                </Text>
              )}
            </View>

            <Text selectable style={styles.privateNote}>
              Private image · access link expires after five minutes
            </Text>

            <View style={styles.detailsCard}>
              <Text selectable style={styles.merchant}>
                {receipt.merchant_name || "Unknown merchant"}
              </Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Date</Text>
                <Text selectable style={styles.detailValue}>
                  {receipt.receipt_date || "Unknown"}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Category</Text>
                <Text selectable style={styles.detailValue}>
                  {formatCategory(receipt.category)}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Total</Text>
                <Text selectable style={styles.totalValue}>
                  RM{Number(receipt.total_amount || 0).toFixed(2)}
                </Text>
              </View>

              {receipt.items?.length ? (
                <View style={styles.itemsSection}>
                  <Text style={styles.itemsTitle}>Detected items</Text>
                  {receipt.items.map((item, index) => (
                    <View key={`${item.name}-${index}`} style={styles.itemRow}>
                      <Text selectable style={styles.itemName}>{item.name || "Item"}</Text>
                      <Text selectable style={styles.itemPrice}>
                        RM{Number(item.price || 0).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F8F6" },
  content: { padding: 18, paddingBottom: 44, gap: 12 },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    gap: 12,
  },
  stateText: { color: "#617470", fontSize: 13 },
  errorTitle: { color: "#093030", fontSize: 18, fontWeight: "800" },
  errorText: { color: "#617470", fontSize: 13, lineHeight: 20, textAlign: "center" },
  retryButton: {
    minHeight: 46,
    minWidth: 130,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: PRIMARY,
  },
  retryText: { color: "#052224", fontWeight: "800" },
  imageCard: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#17211F",
  },
  receiptImage: { width: "100%", height: "100%" },
  missingImageText: {
    padding: 30,
    color: "#D2DEDA",
    fontSize: 13,
    textAlign: "center",
  },
  privateNote: { color: "#617470", fontSize: 11, textAlign: "center" },
  detailsCard: {
    padding: 18,
    gap: 10,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    boxShadow: "0 1px 3px rgba(5, 34, 36, 0.08)",
  },
  merchant: { color: "#093030", fontSize: 18, fontWeight: "800", paddingBottom: 5 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  detailLabel: { color: "#617470", fontSize: 13 },
  detailValue: { color: "#093030", fontSize: 13, fontWeight: "600", textAlign: "right" },
  totalValue: {
    color: "#087D65",
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  itemsSection: { paddingTop: 8, gap: 7, borderTopWidth: 1, borderTopColor: "#E4ECE9" },
  itemsTitle: { color: "#31504D", fontSize: 12, fontWeight: "800" },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  itemName: { flex: 1, color: "#425B57", fontSize: 12 },
  itemPrice: { color: "#093030", fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
