import { supabase } from "@/utils/supabase";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authenticatedApiFetch } from "../utils/api";
import { addSignedReceiptImage } from "../utils/receipt-images";

const TABS = [
  "Summary",
  "Personal",
  "Medical & Care",
  "Education & Childcare",
  "Lifestyle",
  "Insurance",
  "Others",
];

const LHDN_LIMITS: Record<string, number> = {
  Lifestyle: 2500,
  "Medical & Care": 10000,
  "Education & Childcare": 7000,
  Insurance: 7000,
  Personal: 9000,
  Others: 2500,
};

const LHDN_CONTENT: Record<string, any[]> = {
  Personal: [
    {
      id: "asas_individu",
      text: "Pelepasan asas untuk individu dan saudara tanggungan adalah sebanyak RM9,000.",
    },
    {
      id: "pasangan_alimoni",
      text: "Pelepasan untuk suami / isteri / bayaran alimoni kepada bekas isteri dihadkan kepada RM4,000.",
    },
    {
      id: "pasangan_oku",
      text: "Pelepasan tambahan sebanyak RM6,000 sahaja diberikan jika suami / isteri adalah orang kurang upaya.",
    },
    {
      id: "anak_tanggungan",
      text: "Pelepasan anak di bawah umur 18 tahun, 18 tahun dan ke atas yang masih belajar, dan anak kurang upaya.",
    },
  ],
  "Medical & Care": [
    {
      id: "med_ibubapa",
      text: "Perbelanjaan rawatan perubatan, keperluan khas atau penjaga untuk ibu bapa (Terhad RM8,000).",
    },
    {
      id: "med_sokongan",
      text: "Peralatan sokongan asas untuk kegunaan sendiri, pasangan, anak, atau ibu bapa yang kurang upaya (Terhad RM6,000).",
    },
    {
      id: "med_oku",
      text: "Pelepasan tambahan untuk individu yang kurang upaya (RM7,000 sahaja).",
    },
    {
      id: "med_gabungan",
      text: "Perbelanjaan perubatan penyakit serius, rawatan kesuburan, pemvaksinan, dan pemeriksaan penuh (Had gabungan terhad RM10,000).",
    },
  ],
  "Education & Childcare": [
    {
      id: "edu_sendiri",
      text: "Yuran pengajian (Sendiri) selain sarjana/PhD, atau sarjana/PhD, dan kursus peningkatan kemahiran (Terhad RM7,000).",
    },
    {
      id: "edu_tadika",
      text: "Yuran penghantaran anak berumur 6 tahun dan ke bawah ke taman asuhan / tadika berdaftar (Terhad RM3,000).",
      info: "Syarat tuntutan:\n(i) Pusat Asuhan Kanak-kanak yang berdaftar\n(ii) Pra-Sekolah yang berdaftar\n(iii) Yuran untuk anak berumur 6 tahun dan ke bawah\n(iv) Hanya boleh dituntut oleh sama ada suami atau isteri",
    },
    {
      id: "edu_sspn",
      text: "Tabungan bersih dalam Skim Simpanan Pendidikan Nasional (SSPN) (Terhad RM8,000).",
      info: "Syarat:\n(i) Suami isteri yang memilih taksiran berasingan, potongan hanya boleh dituntut oleh yang membuat simpanan.\n(ii) Pengeluaran tabung SSPN untuk pembiayaan kos pendidikan anak peringkat tinggi tidak diambilkira dalam pengiraan.\n(iii) Had maksimum RM8,000 terpakai walaupun mempunyai lebih daripada seorang anak.",
    },
  ],
  Lifestyle: [
    {
      id: "life_asas",
      text: "Gaya hidup asas – Perbelanjaan bahan bacaan, komputer peribadi, telefon pintar, tablet, dan bil internet (Terhad RM2,500).",
      info: "Syarat kelayakan:\n(i) Pembelian buku/jurnal/majalah/surat khabar (Bukan bahan bacaan terlarang)\n(ii) Pembelian komputer peribadi, telefon pintar atau tablet (Bukan untuk kegunaan perniagaan)\n(iii) Bayaran bil bulanan untuk langganan internet (Atas nama sendiri)\n(iv) Bayaran yuran bagi apa-apa kursus peningkatan kemahiran",
    },
    {
      id: "life_sukan",
      text: "Gaya hidup tambahan – Pembelian peralatan sukan, sewa fasiliti, dan keahlian gimnasium (Terhad RM1,000).",
      info: "Syarat kelayakan:\n(i) Pembelian peralatan sukan mengikut Akta Pembangunan Sukan 1997\n(ii) Bayaran sewa atau fi kemasukan ke fasiliti sukan\n(iii) Bayaran fi pendaftaran pertandingan sukan\n(iv) Bayaran fi keahlian gimnasium",
    },
    {
      id: "life_susu",
      text: "Pembelian peralatan penyusuan ibu untuk kegunaan sendiri bagi anak berumur 2 tahun dan ke bawah (Terhad RM1,000 setiap 2 tahun).",
      info: "Syarat tuntutan:\n(i) Pembayar cukai wanita sahaja\n(ii) Mempunyai anak berumur sehingga 2 tahun\n(iii) Peralatan penyusuan yang layak: breast pump kit, ice pack, collection & storage equipment, cooler set/bag\n(iv) Sekali setiap 2 tahun taksiran",
    },
  ],
  Insurance: [
    {
      id: "ins_nyawa_kwsp",
      text: "Premium insurans nyawa & KWSP sukarela (Terhad RM3,000) serta caruman KWSP wajib (Terhad RM4,000). Jumlah: RM7,000.",
    },
    {
      id: "ins_med_edu",
      text: "Insurans pendidikan dan perubatan untuk diri sendiri, pasangan, atau anak (Terhad RM4,000).",
    },
    {
      id: "ins_prs",
      text: "Skim persaraan swasta dan anuiti tertangguh (Terhad RM3,000).",
      info: "Pelepasan tidak melebihi RM3,000 dibenarkan bagi caruman yang dibuat kepada skim persaraan swasta yang diluluskan oleh Suruhanjaya Sekuriti dan jumlah pembayaran anuiti tertangguh. Berkuatkuasa mulai tahun taksiran 2012 hingga tahun taksiran 2025.",
    },
    {
      id: "ins_perkeso",
      text: "Caruman kepada Pertubuhan Keselamatan Sosial (PERKESO) (Terhad RM350).",
    },
  ],
  Others: [
    {
      id: "lain_ev",
      text: "Pemasangan, sewaan, atau pembelian kemudahan pengecasan kenderaan elektrik (EV) (Terhad RM2,500).",
    },
    {
      id: "lain_rumah",
      text: "Bayaran faedah pinjaman rumah kediaman pertama (Berdasarkan kelayakan harga rumah).",
      info: "Perjanjian jual beli hendaklah disempurnakan dalam tempoh 1 Januari 2025 hingga 31 Disember 2027.",
    },
    {
      id: "lain_umrah",
      text: "Levi pelepasan bagi perjalanan umrah / tujuan keagamaan lain.",
      info: "Terhad 2 kali perjalanan seumur hidup.",
    },
  ],
};

export default function LHDNClaimScreen() {
  const router = useRouter();
  const [fullImage, setFullImage] = useState<
    { id: string; image_url: string } | any | null
  >(null);
  const [activeTab, setActiveTab] = useState(TABS[0]); // Starts on "Summary"
  const [loading, setLoading] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);

  const [viewingModal, setViewingModal] = useState(false);
  const [savedReceipts, setSavedReceipts] = useState<any[]>([]);
  const [fetchingReceipts, setFetchingReceipts] = useState(false);

  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [currentInfoText, setCurrentInfoText] = useState("");

  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [totalRelief, setTotalRelief] = useState(0);
  const [categoryTotals, setCategoryTotals] = useState<
    Record<string, { spent: number; eligible: number; limit: number }>
  >({});

  useEffect(() => {
    if (activeTab === "Summary") {
      calculateTaxRelief();
    }
  }, [activeTab]);

  const showInfo = (infoText: string) => {
    setCurrentInfoText(infoText);
    setInfoModalVisible(true);
  };

  const calculateTaxRelief = async () => {
    setDashboardLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;

      const { data: receipts, error } = await supabase
        .from("receipts")
        .select("total_amount, lhdn_category, ai_validation_passed")
        .eq("user_id", userId)
        .eq("tax_year", new Date().getFullYear())
        .not("lhdn_category", "is", null);

      if (error) throw error;

      let newTotalRelief = 0;
      let newCategoryTotals: Record<
        string,
        { spent: number; eligible: number; limit: number }
      > = {};

      Object.keys(LHDN_LIMITS).forEach((cat) => {
        newCategoryTotals[cat] = {
          spent: 0,
          eligible: 0,
          limit: LHDN_LIMITS[cat],
        };
      });

      if (receipts) {
        receipts.forEach((receipt) => {
          if (
            receipt.ai_validation_passed !== false &&
            receipt.lhdn_category &&
            newCategoryTotals[receipt.lhdn_category]
          ) {
            newCategoryTotals[receipt.lhdn_category].spent +=
              Number(receipt.total_amount) || 0;
          }
        });

        Object.keys(newCategoryTotals).forEach((cat) => {
          const catData = newCategoryTotals[cat];
          catData.eligible = Math.min(catData.spent, catData.limit);
          newTotalRelief += catData.eligible;
        });
      }

      setCategoryTotals(newCategoryTotals);
      setTotalRelief(newTotalRelief);
    } catch (err) {
      console.error("Dashboard calculation error:", err);
    } finally {
      setDashboardLoading(false);
    }
  };

  const pickImageForCategory = async (subCategoryItem: any) => {
    try {
      const permissionResult =
        await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          "Permission Required",
          "Camera access is needed to scan receipts.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        base64: true,
        quality: 0.2,
      });
      if (!result.canceled && result.assets[0].base64) {
        await uploadLHDNReceipt(result.assets[0].base64, subCategoryItem);
      }
    } catch (error) {
      console.error("Camera error:", error);
      Alert.alert("Error", "Could not open camera.");
    }
  };

  const uploadLHDNReceipt = async (base64: string, subCategoryItem: any) => {
    setLoading(true);
    setScanningId(subCategoryItem.id);
    try {
      const res = await authenticatedApiFetch("/api/ocr", {
        method: "POST",
        body: JSON.stringify({
          imageBase64: base64,
          lhdnCategory: activeTab,
          lhdnSubcategory: subCategoryItem.id,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        Alert.alert("Scan Failed", data.error || "Could not process receipt.");
      } else {
        if (data.data.ai_validation_passed === false) {
          Alert.alert(
            "⚠️ Potential Mismatch",
            "Receipt saved, but our AI flagged that the items might not qualify for this specific LHDN category. Please double-check your claim!",
            [{ text: "I'll review it" }],
          );
        } else {
          Alert.alert("Success!", "Receipt saved to your LHDN claims.");
          if (activeTab === "Summary") calculateTaxRelief();
        }
      }
    } catch (err) {
      console.error("Upload error:", err);
      Alert.alert("Error", "Server connection failed.");
    } finally {
      setLoading(false);
      setScanningId(null);
    }
  };

  const fetchReceiptsForTab = async () => {
    setViewingModal(true);
    setFetchingReceipts(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (!userId) return;
      const { data, error } = await supabase
        .from("receipts")
        .select("*")
        .eq("user_id", userId)
        .eq("lhdn_category", activeTab)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const receiptsWithSignedImages = await Promise.all(
        (data || []).map(addSignedReceiptImage),
      );
      setSavedReceipts(receiptsWithSignedImages);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setFetchingReceipts(false);
    }
  };

  const deleteReceipt = async (receiptId: string) => {
    Alert.alert(
      "Delete Receipt",
      "Are you sure you want to delete this receipt? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const response = await authenticatedApiFetch(
                `/api/receipts?id=${encodeURIComponent(receiptId)}`,
                { method: "DELETE" },
              );
              if (!response.ok) throw new Error("Receipt deletion failed");

              setSavedReceipts((prev) =>
                prev.filter((r) => r.id !== receiptId),
              );

              setFullImage(null);
            } catch (err) {
              console.error("Delete error:", err);
              Alert.alert("Error", "Could not delete the receipt.");
            }
          },
        },
      ],
    );
  };

  const renderSummaryDashboard = () => {
    if (dashboardLoading)
      return (
        <ActivityIndicator
          size="large"
          color="#00D09C"
          style={{ marginTop: 50 }}
        />
      );

    return (
      <View style={styles.dashboardContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Estimated Tax Relief</Text>
          <Text style={styles.summaryAmount}>
            RM{" "}
            {totalRelief.toLocaleString("en-MY", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
          <Text style={styles.summarySubtitle}>
            Based on your scanned receipts
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Relief Breakdown</Text>

        {Object.keys(LHDN_LIMITS).map((category) => {
          const data = categoryTotals[category] || {
            spent: 0,
            eligible: 0,
            limit: LHDN_LIMITS[category],
          };
          const progressPercent =
            data.limit > 0
              ? Math.min((data.eligible / data.limit) * 100, 100)
              : 0;
          const isMaxed = data.eligible === data.limit && data.limit > 0;

          return (
            <View key={category} style={styles.categoryProgressRow}>
              <View style={styles.categoryProgressHeader}>
                <Text style={styles.categoryProgressName}>{category}</Text>
                <Text style={styles.categoryProgressValues}>
                  <Text
                    style={[styles.eligibleText, isMaxed && styles.maxedText]}
                  >
                    RM{" "}
                    {data.eligible.toLocaleString("en-MY", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </Text>
                  <Text style={styles.limitText}>
                    {" "}
                    / RM {data.limit.toLocaleString()}
                  </Text>
                </Text>
              </View>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${progressPercent}%` },
                    isMaxed && styles.progressBarMaxed,
                  ]}
                />
              </View>
              {data.spent > data.limit && (
                <Text style={styles.overSpentText}>
                  <Ionicons name="information-circle" size={12} /> Spent RM{" "}
                  {data.spent.toLocaleString()}, but limit is RM{" "}
                  {data.limit.toLocaleString()}.
                </Text>
              )}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconButton}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.headerTitle}>LHDN</Text>
          <Text style={styles.headerSubtitle}>Tax Relief</Text>
        </View>
        <TouchableOpacity style={styles.iconButton}>
          <Ionicons
            name="notifications-outline"
            size={22}
            color="#093030"
            style={styles.bellIcon}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.whiteContainer}>
        <View style={styles.tabWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabScrollContent}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tabButton, isActive && styles.activeTabButton]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text
                    style={[styles.tabText, isActive && styles.activeTabText]}
                  >
                    {tab}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <ScrollView
          style={styles.contentScroll}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === "Summary" ? (
            renderSummaryDashboard()
          ) : (
            <>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{activeTab}</Text>
              </View>

              {LHDN_CONTENT[activeTab]?.map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardText}>{item.text}</Text>
                    {item.info && (
                      <TouchableOpacity
                        style={styles.infoBadge}
                        onPress={() => showInfo(item.info)}
                      >
                        <Ionicons
                          name="information-circle"
                          size={18}
                          color="#4caf50"
                        />
                        <Text style={styles.infoBadgeText}>Info</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.scanActionButton}
                    onPress={() => pickImageForCategory(item)}
                    disabled={loading}
                  >
                    {scanningId === item.id ? (
                      <>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.scanActionText}>Analyzing...</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="camera" size={18} color="#fff" />
                        <Text style={styles.scanActionText}>Scan</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={styles.viewButton}
                onPress={fetchReceiptsForTab}
              >
                <Ionicons name="receipt-outline" size={20} color="#fff" />
                <Text style={styles.viewButtonText}>View Claimed Receipts</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </>
          )}
        </ScrollView>
      </View>

      <Modal
        visible={viewingModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{activeTab} Claims</Text>
            <TouchableOpacity onPress={() => setViewingModal(false)}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          {fetchingReceipts ? (
            <ActivityIndicator
              size="large"
              color="#00D09C"
              style={{ marginTop: 40 }}
            />
          ) : savedReceipts.length === 0 ? (
            <Text style={styles.emptyText}>
              No receipts claimed for this category yet.
            </Text>
          ) : (
            <ScrollView style={styles.modalScroll}>
              {savedReceipts.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.receiptCard}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (r.image_url) setFullImage(r);
                  }}
                >
                  {r.image_url && (
                    <Image
                      source={{ uri: r.image_url }}
                      style={styles.receiptImage}
                      resizeMode="cover"
                    />
                  )}
                  <View style={styles.receiptDetails}>
                    <Text style={styles.receiptMerchant}>
                      {r.merchant_name || "Unknown Merchant"}
                    </Text>
                    <Text style={styles.receiptAmount}>
                      RM {Number(r.total_amount || 0).toFixed(2)}
                    </Text>
                    <Text style={styles.receiptDate}>
                      {r.receipt_date || "Unknown Date"}
                    </Text>
                    {r.ai_validation_passed === false && (
                      <Text style={styles.warningText}>
                        ⚠️ AI Flag: May not match category
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity
                    style={{ padding: 10, justifyContent: "center" }}
                    onPress={() => deleteReceipt(r.id)}
                  >
                    <Ionicons name="trash-outline" size={24} color="#FF6B6B" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {fullImage && (
            <View style={styles.fullImageOverlay}>
              <TouchableOpacity
                style={styles.fullImageCloseButton}
                onPress={() => setFullImage(null)}
              >
                <Ionicons name="close-circle" size={40} color="#fff" />
              </TouchableOpacity>
              <Image
                source={{ uri: fullImage.image_url }}
                style={styles.fullImage}
                resizeMode="contain"
              />

              <TouchableOpacity
                style={{
                  position: "absolute",
                  bottom: 50,
                  backgroundColor: "#FF6B6B",
                  paddingHorizontal: 30,
                  paddingVertical: 15,
                  borderRadius: 30,
                  flexDirection: "row",
                  alignItems: "center",
                }}
                onPress={() => deleteReceipt(fullImage.id)}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{ color: "#fff", fontSize: 16, fontWeight: "bold" }}
                >
                  Delete Receipt
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={infoModalVisible} transparent={true} animationType="fade">
        <View style={styles.infoModalOverlay}>
          <View style={styles.infoModalCard}>
            <View style={styles.infoModalHeader}>
              <Ionicons name="information-circle" size={24} color="#4caf50" />
              <Text style={styles.infoModalTitle}>Syarat Kelayakan</Text>
            </View>

            <ScrollView
              style={{ maxHeight: 300 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.infoModalBody}>{currentInfoText}</Text>
            </ScrollView>

            <TouchableOpacity
              style={styles.infoModalButton}
              onPress={() => setInfoModalVisible(false)}
            >
              <Text style={styles.infoModalButtonText}>Faham (Understood)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#00D09C",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingBottom: 40,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  bellIcon: {
    backgroundColor: "#fff",
    padding: 6,
    borderRadius: 20,
    overflow: "hidden",
  },
  titleContainer: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#000",
  },
  headerSubtitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#000",
  },
  whiteContainer: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingTop: 20,
    marginTop: -20,
  },
  tabWrapper: {
    marginHorizontal: 20,
    backgroundColor: "#E8F5E9",
    borderRadius: 30,
    padding: 5,
    marginBottom: 20,
  },
  tabScrollContent: {
    alignItems: "center",
  },
  tabButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  activeTabButton: {
    backgroundColor: "#00D09C",
  },
  tabText: {
    fontSize: 14,
    color: "#093030",
    fontWeight: "500",
  },
  activeTabText: {
    color: "#fff",
    fontWeight: "600",
  },
  contentScroll: {
    flex: 1,
    paddingHorizontal: 25,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#093030",
  },

  card: {
    marginBottom: 20,
    backgroundColor: "#f9f9f9",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 15,
  },
  cardText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
    lineHeight: 22,
    paddingRight: 10,
  },

  // Noticeable Info Badge
  infoBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e8f5e9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#4caf50",
    marginTop: 5,
  },
  infoBadgeText: {
    fontSize: 12,
    color: "#2e7d32",
    fontWeight: "600",
    marginLeft: 4,
  },

  scanActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#00D09C",
    paddingVertical: 10,
    borderRadius: 8,
  },
  scanActionText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "600",
    marginLeft: 8,
  },
  viewButton: {
    backgroundColor: "#093030",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    padding: 15,
    borderRadius: 12,
    marginTop: 10,
  },
  viewButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },

  modalContainer: {
    flex: 1,
    backgroundColor: "#F5F7F8",
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    marginTop: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#093030",
  },
  closeText: {
    fontSize: 16,
    color: "#00D09C",
    fontWeight: "600",
  },
  emptyText: {
    textAlign: "center",
    marginTop: 40,
    color: "#666",
    fontSize: 16,
  },
  modalScroll: { flex: 1 },
  receiptCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  receiptImage: {
    width: 70,
    height: 70,
    borderRadius: 8,
    marginRight: 15,
  },
  receiptDetails: {
    flex: 1,
    justifyContent: "center",
  },
  receiptMerchant: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  receiptAmount: {
    fontSize: 15,
    color: "#00D09C",
    fontWeight: "600",
    marginBottom: 4,
  },
  receiptDate: { fontSize: 12, color: "#888" },
  warningText: {
    fontSize: 12,
    color: "#d9534f",
    marginTop: 5,
    fontWeight: "500",
  },

  infoModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  infoModalCard: {
    backgroundColor: "#fff",
    width: "100%",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  infoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  infoModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginLeft: 8,
  },
  infoModalBody: {
    fontSize: 14,
    color: "#555",
    lineHeight: 22,
    marginBottom: 25,
  },
  infoModalButton: {
    backgroundColor: "#00D09C",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  infoModalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },

  // DASHBOARD STYLES
  dashboardContainer: {
    paddingBottom: 20,
  },
  summaryCard: {
    backgroundColor: "#00D09C",
    padding: 25,
    alignItems: "center",
    borderRadius: 20,
    marginBottom: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  summaryTitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "600",
    marginBottom: 5,
  },
  summaryAmount: {
    fontSize: 36,
    color: "#fff",
    fontWeight: "bold",
    marginBottom: 5,
  },
  summarySubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.9)",
    fontStyle: "italic",
  },
  categoryProgressRow: {
    backgroundColor: "#f9f9f9",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#eee",
  },
  categoryProgressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 10,
  },
  categoryProgressName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  categoryProgressValues: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  eligibleText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#00D09C",
  },
  maxedText: {
    color: "#FF9800",
  },
  limitText: {
    fontSize: 11,
    color: "#888",
    fontWeight: "500",
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: "#E8F5E9",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#00D09C",
    borderRadius: 4,
  },
  progressBarMaxed: {
    backgroundColor: "#FF9800",
  },
  overSpentText: {
    fontSize: 11,
    color: "#666",
    marginTop: 8,
    fontStyle: "italic",
  },
  fullImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  fullImageCloseButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 101,
    padding: 10,
  },
  fullImage: { width: "100%", height: "80%" },
});
