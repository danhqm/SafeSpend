import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteAccountAndClearDevice } from "../utils/account-lifecycle";
import { getAiConsent, setAiConsent } from "../utils/ai-consent";
import { supabase } from "../utils/supabase";

type Identity = { id: string; email?: string };

export default function PrivacyScreen() {
  const router = useRouter();
  const [user, setUser] = useState<Identity | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const identity = useRef<string | null>(null);
  const request = useRef(0);
  const active = useRef(true);
  const operation = useRef(false);

  useEffect(() => {
    active.current = true;
    let authVersion = 0;
    const load = (next: Identity | null) => {
      const ticket = ++request.current;
      identity.current = next?.id ?? null;
      setUser(next);
      setAllowed(false);
      setPassword("");
      setConfirmation("");
      setLoading(Boolean(next));
      if (!next) return;
      void getAiConsent(next.id).then(value => {
        if (active.current && ticket === request.current && identity.current === next.id) setAllowed(value);
      }).catch(() => {
        if (active.current && ticket === request.current) setNotice("Could not read your device preference. AI remains off.");
      }).finally(() => {
        if (active.current && ticket === request.current) setLoading(false);
      });
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authVersion += 1;
      if (active.current) load(session?.user ?? null);
    });
    const version = authVersion;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active.current || version !== authVersion) return;
      load(error ? null : data.session?.user ?? null);
      if (error) setNotice("Sign in again to change your account settings. This notice is available without signing in.");
    }).catch(() => {
      if (active.current && version === authVersion) { load(null); setNotice("Account settings are unavailable. You can still read this notice."); }
    });
    return () => { active.current = false; request.current += 1; subscription.unsubscribe(); };
  }, []);

  const changeConsent = async (value: boolean) => {
    const userId = user?.id;
    if (!userId || operation.current || loading) return;
    operation.current = true;
    setSaving(true);
    setNotice("");
    try {
      const current = await supabase.auth.getSession();
      if (current.error || current.data.session?.user.id !== userId) throw new Error("Your session changed. Sign in again to update this setting.");
      await setAiConsent(userId, value);
      if (active.current && identity.current === userId) {
        setAllowed(value);
        setNotice(value ? "AI sharing is enabled for your account on this device." : "AI sharing is off. Your saved records are still available.");
      }
    } catch (error) {
      if (active.current && identity.current === userId) {
        setAllowed(false);
        setNotice(error instanceof Error ? `${error.message} AI is off for this app session. Try saving again before reopening.` : "Could not save the setting. AI is off for this app session. Try again before reopening.");
      }
    } finally {
      operation.current = false;
      if (active.current) setSaving(false);
    }
  };

  const removeAccount = () => {
    if (!user || operation.current || confirmation !== "DELETE" || !password) return;
    const userId = user.id;
    const suppliedPassword = password;
    Alert.alert("Permanently delete your account?", "Your SafeSpend records and uploaded receipt/avatar files will be deleted. Keep any records you need before continuing. This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete account", style: "destructive", onPress: () => {
        if (operation.current) return;
        operation.current = true;
        setDeleting(true);
        setPassword("");
        setNotice("");
        void deleteAccountAndClearDevice(userId, suppliedPassword, "DELETE").then(({ localCleanupErrors }) => {
          if (!active.current) return;
          router.replace("/login");
          Alert.alert("Account deleted", localCleanupErrors.length
            ? `Your server account was deleted. Some device cleanup could not finish (${localCleanupErrors.join(", ")}). Clear SafeSpend app data and review device reminders before sharing this device.`
            : "Your account and app records were deleted. Any files you exported or shared remain outside SafeSpend.");
        }).catch(error => {
          if (active.current) setNotice(error instanceof Error ? error.message : "Deletion did not finish. Your account may still exist; try again. If sign-in no longer works, the server deletion may have completed.");
        }).finally(() => {
          operation.current = false;
          if (active.current) setDeleting(false);
        });
      } },
    ]);
  };

  const openProvider = (url: string) => {
    void Linking.openURL(url).catch(() => Alert.alert("Link unavailable", "Please try again when you are online."));
  };

  return <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.back} disabled={deleting}
        onPress={() => router.canGoBack() ? router.back() : router.replace("/login")}>
        <Ionicons name="arrow-back" size={24} color="#F1FFF3" />
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>Privacy & data</Text>
    </View>
    <ScrollView style={styles.sheet} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>Understand what you save, where AI processing happens, and the choices available to you.</Text>
      <Text accessibilityRole="header" style={styles.heading}>Your records</Text>
      <Text style={styles.body}>Supabase provides sign-in, the app database and uploaded-file storage. SafeSpend saves the profile details you provide, receipts and images, transactions, accounts, budgets, goals, learning progress and tax preparation records. Manual records remain available when AI is off.</Text>
      <Text style={styles.body}>This device can retain compact financial summaries for offline viewing, your AI choice and guide preferences. On mobile, saved summaries and sign-in data use device secure storage. Web summaries are kept in memory; browser storage holds sign-in and preferences. Face ID unlocks the app using your device; SafeSpend does not receive your biometric template.</Text>

      <Text accessibilityRole="header" style={styles.heading}>What goes to OpenAI</Text>
      <Text style={styles.body}>If you choose lesson help in Fin and send a message, Fin also receives the selected lesson’s reviewed teaching text and source titles. Choosing lesson help does not send a message automatically. Lessons, knowledge checks and saved practice plans work without AI.</Text>
      <Text style={styles.body}>When you enable AI, the SafeSpend backend sends uploaded receipt images to OpenAI for extraction. Fin chat sends your message, up to 10 earlier chat messages and financial lookup results relevant to the request. Fin insights send a calculated overview of your financial activity, which can include spending, income, budgets, account types and goal titles.</Text>
      <Text style={styles.body}>Once enabled, Home may refresh Fin insights automatically. You do not get a separate consent prompt for each request. Avoid putting unnecessary sensitive information in images, chat or record notes. AI output can be wrong; review extracted fields and financial suggestions before relying on them.</Text>
      <Text style={styles.body}>Your AI choice applies to this account on this device only. Disabling it stops new AI requests from this app on this device. It does not undo processing already sent or delete saved records. Requests already in progress may finish. Provider handling and backups follow their own policies; this app does not promise an immediate purge from provider systems.</Text>
      <Pressable accessibilityRole="link" onPress={() => openProvider("https://supabase.com/privacy")} style={styles.linkTarget}><Text style={styles.link}>Read Supabase’s privacy notice</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => openProvider("https://openai.com/policies/privacy-policy/")} style={styles.linkTarget}><Text style={styles.link}>Read OpenAI’s privacy policy</Text></Pressable>

      <Text accessibilityRole="header" style={styles.heading}>Tax records and exports</Text>
      <Text style={styles.body}>Tax labels, calculations and preparation checklists are aids to review, not a determination of eligibility. Check current HASiL guidance and keep your original evidence. SafeSpend does not submit a tax return for you.</Text>
      <Text style={styles.body}>Exported, downloaded or shared files leave the app. Account deletion cannot remove those copies from your device, other apps or their recipients.</Text>

      {user ? <>
        <Text accessibilityRole="header" style={styles.heading}>Your AI choice</Text>
        <Text style={styles.body}>Allow the data sharing described above for receipt scanning, Fin chat and automatic Fin insights. This is optional and starts off on each device.</Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}><Text style={styles.label}>Allow AI processing</Text><Text style={styles.caption}>{loading ? "Reading this device’s setting…" : allowed ? "Enabled on this device" : "Off on this device"}</Text></View>
          {saving || loading ? <ActivityIndicator color="#087D65" /> : <Switch accessibilityLabel="Allow AI processing on this device" value={allowed} onValueChange={value => void changeConsent(value)} disabled={deleting} trackColor={{ false: "#C9DAD4", true: "#00D09E" }} thumbColor="#FFFFFF" />}
        </View>
        <Text accessibilityRole="header" style={[styles.heading, styles.danger]}>Delete your account</Text>
        <Text style={styles.body}>Deletion removes your sign-in, app database records and files from your receipt/avatar folders. Save any evidence you need first. If file cleanup fails, the account is kept so you can retry; some files may already have been removed.</Text>
        <Text style={styles.label}>Current password</Text>
        <TextInput accessibilityLabel="Current password for account deletion" style={styles.input} secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} editable={!deleting} maxLength={1024} textContentType="password" />
        <Text style={styles.label}>Type DELETE to confirm</Text>
        <TextInput accessibilityLabel="Type DELETE to confirm account deletion" style={styles.input} autoCapitalize="characters" autoCorrect={false} value={confirmation} onChangeText={setConfirmation} editable={!deleting} maxLength={6} />
        <Pressable accessibilityRole="button" style={[styles.deleteButton, (confirmation !== "DELETE" || !password || saving || deleting) && styles.disabled]} disabled={confirmation !== "DELETE" || !password || saving || deleting} onPress={removeAccount}>
          {deleting ? <ActivityIndicator color="#B42318" /> : <Text style={styles.deleteText}>Permanently delete account</Text>}
        </Pressable>
      </> : !loading && <Text style={styles.body}>Sign in to manage your device’s AI choice or delete your account. Reading this notice does not enable AI.</Text>}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0E3E3E" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 8, width: "100%", maxWidth: 640, alignSelf: "center" },
  back: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" },
  title: { color: "#F1FFF3", fontFamily: "Poppins_700Bold", fontSize: 24, flexShrink: 1 },
  sheet: { flex: 1, backgroundColor: "#F1FFF3", borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  content: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 24, paddingBottom: 60 },
  intro: { fontFamily: "Poppins_400Regular", color: "#405E54", fontSize: 15, lineHeight: 24 },
  heading: { fontFamily: "Poppins_700Bold", color: "#0E3E3E", fontSize: 18, marginTop: 28, marginBottom: 10 },
  body: { fontFamily: "Poppins_400Regular", color: "#405E54", fontSize: 14, lineHeight: 23, marginBottom: 12 },
  label: { fontFamily: "Poppins_700Bold", color: "#0E3E3E", fontSize: 14, marginBottom: 6 },
  caption: { fontFamily: "Poppins_400Regular", color: "#617470", fontSize: 12, lineHeight: 20 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#D6E8DE" },
  toggleCopy: { flex: 1 },
  input: { backgroundColor: "#DFF7E2", borderRadius: 12, borderWidth: 1, borderColor: "#93B6A7", padding: 14, marginBottom: 16, color: "#0E3E3E", fontFamily: "Poppins_400Regular" },
  linkTarget: { minHeight: 44, justifyContent: "center" },
  link: { fontFamily: "Poppins_700Bold", color: "#087D65", fontSize: 14, textDecorationLine: "underline" },
  danger: { color: "#B42318" },
  deleteButton: { backgroundColor: "#FEECE8", borderRadius: 12, minHeight: 52, alignItems: "center", justifyContent: "center", padding: 12 },
  deleteText: { fontFamily: "Poppins_700Bold", color: "#B42318", fontSize: 14, textAlign: "center" },
  disabled: { opacity: 0.45 },
  notice: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 23, color: "#0E3E3E", backgroundColor: "#DFF7E2", padding: 16, marginTop: 20, borderRadius: 12 },
});
