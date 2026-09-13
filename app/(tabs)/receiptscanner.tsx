import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router/react-navigation";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useState } from "react";
import {
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authenticatedApiFetch } from "../../utils/api";

export default function ReceiptScanner() {
  const [loading, setLoading] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentReceipts, setRecentReceipts] = useState<any[]>([]);
  const [allReceipts, setAllReceipts] = useState<any[]>([]);
  const [viewAllVisible, setViewAllVisible] = useState(false);
  const [allLoading, setAllLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecentReceipts = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from("receipts")
      .select(
        "id, merchant_name, total_amount, receipt_date, category, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(2);

    if (!error) setRecentReceipts(data || []);
  }, []);

  const loadAllReceipts = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return;

    setAllLoading(true);
    const { data, error } = await supabase
      .from("receipts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error) setAllReceipts(data || []);
    setAllLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRecentReceipts();
    }, [loadRecentReceipts]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadRecentReceipts();
      if (viewAllVisible) await loadAllReceipts();
    } finally {
      setRefreshing(false);
    }
  }, [loadAllReceipts, loadRecentReceipts, viewAllVisible]);

  const pickImage = async () => {
    setError(null);

    // 1. Ask for camera permission first
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (permissionResult.granted === false) {
      setError("Camera permission is required to scan receipts.");
      return;
    }

    // 2. Launch the camera instead of the gallery
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true, // Still highly recommended to let them crop the receipt!
      base64: true,
      quality: 0.5, // Keeps your payload small for the backend
    });

    if (!result.canceled && result.assets[0].base64) {
      await scanReceipt(result.assets[0].base64);
    }
  };

  const scanReceipt = async (base64: string) => {
    setLoading(true);
    setReceiptData(null);
    setError(null);

    try {
      const res = await authenticatedApiFetch("/api/ocr", {
        method: "POST",
        body: JSON.stringify({ imageBase64: base64 }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("Response is not valid JSON:", text);
        setError("Invalid response from server");
        return;
      }

      if (!data.success) {
        console.error("OCR fetch failed:", data.error);
        setError(data.error || "OCR failed");
        return;
      }

      setReceiptData(data.data);
      await loadRecentReceipts();
    } catch (err: unknown) {
      console.error("Fetch error:", err);
      if (err instanceof Error) setError(err.message);
      else setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Receipt{"\n"}Scanner</Text>
      </View>

      <ScrollView
        style={styles.innerContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.innerContainer}>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>
              Upload A Receipt To Automatically{"\n"}Track Your Spending
            </Text>
            <View style={styles.receiptPreview}>
              <Image
                source={require("../../assets/images/receipt-check.png")}
                style={styles.receiptImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.helperText}>Clear image works the best.</Text>
            <TouchableOpacity style={styles.scanButton} onPress={pickImage}>
              <Ionicons name="scan-outline" size={20} color="#093030" />
              <Text style={styles.scanButtonText}>
                {loading ? "Scanning..." : "Scan Receipt"}
              </Text>
            </TouchableOpacity>
            {error && <Text style={styles.errorText}>{error}</Text>}
            {receiptData && (
              <ScrollView
                style={styles.resultScroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
              >
                <View style={styles.resultCard}>
                  <Text style={styles.resultTitle}>Last Scanned Receipt</Text>
                  <Text style={styles.resultLabel}>Merchant</Text>
                  <Text style={styles.resultValue}>
                    {receiptData.merchant_name || "Unknown"}
                  </Text>
                  <Text style={styles.resultLabel}>Date</Text>
                  <Text style={styles.resultValue}>
                    {receiptData.receipt_date || "—"}
                  </Text>
                  <Text style={styles.resultLabel}>Total Amount</Text>
                  <Text style={styles.resultValue}>
                    RM {Number(receiptData.total_amount || 0).toFixed(2)}
                  </Text>
                  {/* Category */}
                  <Text style={styles.resultLabel}>Category</Text>
                  <Text style={styles.resultValue}>
                    {receiptData.category
                      ? receiptData.category
                          .replace(/_/g, " ")
                          .toLowerCase()
                          .replace(/\b\w/g, (c: string) => c.toUpperCase())
                      : "Not categorized"}
                  </Text>
                  {/* Items */}
                  {Array.isArray(receiptData.items) &&
                    receiptData.items.length > 0 && (
                      <>
                        <Text style={[styles.resultLabel, { marginTop: 10 }]}>
                          Items
                        </Text>
                        {receiptData.items.map((item: any, idx: number) => (
                          <Text key={idx} style={styles.itemText}>
                            • {item.name || "Item"} – RM{" "}
                            {Number(item.price || 0).toFixed(2)}
                          </Text>
                        ))}
                      </>
                    )}
                </View>
              </ScrollView>
            )}
            {recentReceipts.length > 0 && (
              <View style={styles.recentSection}>
                <View style={styles.recentHeader}>
                  <Text style={styles.recentTitle}>Recent Scans</Text>
                  <TouchableOpacity
                    onPress={async () => {
                      setViewAllVisible(true);
                      await loadAllReceipts();
                    }}
                  >
                    <Text style={styles.viewAllText}>View all</Text>
                  </TouchableOpacity>
                </View>
                {recentReceipts.map((r) => (
                  <View key={r.id} style={styles.recentCard}>
                    <Text style={styles.recentMerchant}>
                      {r.merchant_name || "Unknown merchant"}
                    </Text>
                    <Text style={styles.recentMeta}>
                      {r.receipt_date || "—"} • RM
                      {Number(r.total_amount || 0).toFixed(2)}
                    </Text>
                    <Text style={styles.recentCategory}>
                      {r.category
                        ? r.category
                            .replace(/_/g, " ")
                            .toLowerCase()
                            .replace(/\b\w/g, (c: string) => c.toUpperCase())
                        : "Not categorized"}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      <Modal visible={viewAllVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>All Receipts</Text>

              <TouchableOpacity onPress={() => setViewAllVisible(false)}>
                <Ionicons name="close" size={22} color="#093030" />
              </TouchableOpacity>
            </View>

            {allLoading ? (
              <Text style={{ marginTop: 10 }}>Loading...</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {allReceipts.map((r) => (
                  <View key={r.id} style={styles.allReceiptCard}>
                    <Text style={styles.recentMerchant}>
                      {r.merchant_name || "Unknown merchant"}
                    </Text>

                    <Text style={styles.recentMeta}>
                      {r.receipt_date || "—"} • RM
                      {Number(r.total_amount || 0).toFixed(2)}
                    </Text>

                    <Text style={styles.recentCategory}>
                      {r.category
                        ? r.category
                            .replace(/_/g, " ")
                            .toLowerCase()
                            .replace(/\b\w/g, (c: string) => c.toUpperCase())
                        : "Not categorized"}
                    </Text>

                    {Array.isArray(r.items) && r.items.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={styles.resultLabel}>Items</Text>

                        {r.items.map((item: any, idx: number) => (
                          <Text key={idx} style={styles.itemText}>
                            • {item.name || "Item"} – RM{" "}
                            {Number(item.price || 0).toFixed(2)}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const PRIMARY = "#00D09E";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY,
  },

  header: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 25,
    paddingTop: 25,
    paddingBottom: 16,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    color: "#052224",
    lineHeight: 22,
  },

  innerContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },

  cardContent: {
    width: "100%",
    alignItems: "center",
  },

  cardTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    color: "#093030",
    marginBottom: 40,
  },

  receiptPreview: {
    width: 120,
    height: 160,
    borderWidth: 1.5,
    borderColor: "#CDEEE1",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  receiptImage: {
    width: 80,
    height: 100,
  },

  helperText: {
    fontSize: 13,
    color: "#093030",
    marginBottom: 20,
  },

  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PRIMARY,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },

  scanButtonText: {
    color: "#093030",
    fontWeight: "700",
    fontSize: 14,
  },
  resultScroll: {
    maxHeight: 300,
    marginTop: 12,
  },
  resultCard: {
    marginTop: 24,
    width: "100%",
    backgroundColor: "#E9FFF4",
    borderRadius: 16,
    padding: 14,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#093030",
    marginBottom: 8,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4A5B5B",
    marginTop: 4,
  },
  resultValue: {
    fontSize: 13,
    color: "#093030",
  },
  itemText: {
    fontSize: 12,
    color: "#093030",
  },
  moreItemsText: {
    fontSize: 12,
    color: "#4A5B5B",
    marginTop: 4,
    fontStyle: "italic",
  },
  errorText: {
    marginTop: 10,
    fontSize: 12,
    color: "#D9534F",
    textAlign: "center",
  },
  recentSection: {
    width: "100%",
    marginTop: 18,
  },

  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  recentTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#093030",
  },

  viewAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: PRIMARY,
  },

  recentCard: {
    backgroundColor: "#E9FFF4",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },

  recentMerchant: {
    fontSize: 14,
    fontWeight: "700",
    color: "#093030",
  },

  recentMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#4A5B5B",
  },

  recentCategory: {
    marginTop: 4,
    fontSize: 12,
    color: "#093030",
    fontWeight: "600",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    maxHeight: "85%",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#093030",
  },

  allReceiptCard: {
    backgroundColor: "#E9FFF4",
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    alignItems: "center",
    paddingBottom: 40,
  },
});
