import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { type ComponentProps, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type IconName = ComponentProps<typeof Ionicons>["name"];

export type ProfileIdentity = {
  name: string;
  email: string | null;
  memberId: string | null;
  avatarUri: string | null;
};

type ProfileOverviewProps = {
  identity: ProfileIdentity;
  loading: boolean;
  loadError: string | null;
  photoBusy: boolean;
  signingOut: boolean;
  faceIdAvailable: boolean;
  faceIdEnabled: boolean;
  faceIdBusy: boolean;
  onEdit: () => void;
  onPhoto: () => void;
  onAccounts: () => void;
  onTaxRelief: () => void;
  onToggleFaceId: () => void;
  onLogout: () => void;
  onRetry: () => void;
  onGuide?: () => void;
};

function Avatar({ identity, busy, disabled, onPress }: {
  identity: ProfileIdentity;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [focused, setFocused] = useState(false);
  const initials = identity.name.trim().split(/\s+/).slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "").join("").toUpperCase() || "SS";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? "Saving profile photo" : "Change profile photo"}
      accessibilityHint="Choose a photo from your library"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.avatarTarget, focused && styles.heroFocus, pressed && styles.pressed]}
    >
      <View style={styles.avatarCircle}>
        {identity.avatarUri && !imageFailed ? (
          <Image source={{ uri: identity.avatarUri }} style={styles.avatarImage}
            contentFit="cover" accessible={false} onError={() => setImageFailed(true)} />
        ) : identity.name === "Your profile"
          ? <Ionicons name="person-outline" size={30} color="#0E3E3E" accessible={false} />
          : <Text allowFontScaling={false} style={styles.initials}>{initials}</Text>}
      </View>
      <View style={styles.cameraBadge}>
        {busy ? <ActivityIndicator size="small" color="#0E3E3E" />
          : <Ionicons name="camera-outline" size={18} color="#0E3E3E" accessible={false} />}
      </View>
    </Pressable>
  );
}

function ActionRow({ icon, title, description, onPress, danger = false, busy = false, disabled = false }: {
  icon: IconName;
  title: string;
  description?: string;
  onPress: () => void;
  danger?: boolean;
  busy?: boolean;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title}
      accessibilityHint={description} accessibilityState={{ disabled: busy || disabled, busy }}
      disabled={busy || disabled} onPress={onPress}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.actionRow, focused && styles.focus,
        pressed && styles.rowPressed, (busy || disabled) && styles.disabled]}>
      <View style={[styles.iconTile, danger && styles.dangerTile]}>
        <Ionicons name={icon} size={24} color={danger ? "#B42318" : "#0E3E3E"} accessible={false} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, danger && styles.dangerText]}>{title}</Text>
        {description && <Text style={styles.rowDescription}>{description}</Text>}
      </View>
      {busy ? <ActivityIndicator size="small" color={danger ? "#B42318" : "#087D65"} />
        : !danger && <Ionicons name="chevron-forward" size={20} color="#617470" accessible={false} />}
    </Pressable>
  );
}

export function ProfileOverview(props: ProfileOverviewProps) {
  const { width, fontScale } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const [editFocused, setEditFocused] = useState(false);
  const [retryFocused, setRetryFocused] = useState(false);
  const stackedIdentity = (width < 350 && fontScale > 1.2) || fontScale > 1.5;
  const identityDisabled = props.loading || props.photoBusy || props.signingOut || props.faceIdBusy;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar style="light" />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.column}>
          <View style={styles.hero}>
            <View style={styles.topbar}>
              <Text accessibilityRole="header" style={styles.title}>Profile</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Edit profile"
                accessibilityHint="Update your personal details"
                accessibilityState={{ disabled: identityDisabled }}
                disabled={identityDisabled} onPress={props.onEdit}
                onFocus={() => setEditFocused(true)} onBlur={() => setEditFocused(false)}
                style={({ pressed }) => [styles.editTarget, editFocused && styles.heroFocus,
                  pressed && styles.pressed, identityDisabled && styles.disabled]}>
                <Text style={styles.editText}>Edit</Text>
              </Pressable>
            </View>
            <View style={[styles.identity, stackedIdentity && styles.stackedIdentity]}>
              <Avatar key={props.identity.avatarUri ?? "initials"} identity={props.identity}
                busy={props.photoBusy} disabled={identityDisabled} onPress={props.onPhoto} />
              <View style={[styles.identityCopy, stackedIdentity && styles.stackedCopy]} accessibilityLiveRegion="polite">
                {props.loading ? (
                  <View accessible accessibilityLabel="Loading profile" accessibilityState={{ busy: true }}>
                    <View style={styles.nameSkeleton} />
                    <View style={styles.detailSkeleton} />
                    <View style={styles.idSkeleton} />
                  </View>
                ) : (
                  <>
                    <Text style={styles.name}>{props.identity.name}</Text>
                    {props.identity.email && <Text selectable style={styles.email}>{props.identity.email}</Text>}
                    {props.identity.memberId && <Text selectable style={styles.memberId}>
                      Member ID <Text style={styles.memberIdValue}>{props.identity.memberId}</Text>
                    </Text>}
                  </>
                )}
              </View>
            </View>
            {props.loadError && !props.loading && (
              <View style={styles.errorBlock} accessibilityLiveRegion="polite">
                <Text style={styles.errorText}>{props.loadError}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Retry loading profile"
                  accessibilityState={{ disabled: identityDisabled }} disabled={identityDisabled}
                  onPress={props.onRetry} onFocus={() => setRetryFocused(true)}
                  onBlur={() => setRetryFocused(false)}
                  style={({ pressed }) => [styles.retryTarget, retryFocused && styles.heroFocus,
                    pressed && styles.pressed]}>
                  <Ionicons name="refresh-outline" size={16} color="#00D09E" accessible={false} />
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={[styles.sheet, { paddingBottom: Math.max(bottom, 16) + 100 }]}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Money tools</Text>
            <View style={styles.actionGroup}>
              <ActionRow icon="wallet-outline" title="Accounts"
                description="Cash, bank, cards and e-wallets." onPress={props.onAccounts} disabled={props.signingOut} />
              <View style={styles.divider} />
              <ActionRow icon="document-text-outline" title="LHDN Tax Relief"
                description="Organize and review your claims." onPress={props.onTaxRelief} disabled={props.signingOut} />
              <View style={styles.divider} />
            </View>

            {props.faceIdAvailable && (
              <View style={styles.securitySection}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Device security</Text>
                <View style={styles.securityRow}>
                  <View style={styles.iconTile}>
                    <Ionicons name="scan-outline" size={24} color="#0E3E3E" accessible={false} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>Face ID</Text>
                    <Text style={styles.rowDescription}>Unlock SafeSpend on this iPhone.</Text>
                  </View>
                  <View style={styles.switchTarget}>
                    {props.faceIdBusy ? (
                      <ActivityIndicator accessibilityLabel="Updating Face ID" color="#087D65" />
                    ) : <Switch accessibilityLabel="Face ID"
                      accessibilityHint="Unlock SafeSpend on this iPhone"
                      value={props.faceIdEnabled} onValueChange={props.onToggleFaceId}
                      disabled={props.signingOut || props.loading || props.photoBusy}
                      trackColor={{ false: "#C9DAD4", true: "#00D09E" }}
                      thumbColor="#FFFFFF" ios_backgroundColor="#C9DAD4" />}
                  </View>
                </View>
                <View style={styles.divider} />
              </View>
            )}

            {props.onGuide && <View style={styles.securitySection}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Getting started</Text>
              <ActionRow icon="compass-outline" title="SafeSpend guide"
                description="Replay the tour and pick up your first steps." onPress={props.onGuide}
                disabled={identityDisabled} />
              <View style={styles.divider} />
            </View>}
            <View style={styles.logoutSection}>
              <ActionRow icon="log-out-outline" title={props.signingOut ? "Logging out…" : "Log out"}
                danger busy={props.signingOut} disabled={props.photoBusy || props.faceIdBusy} onPress={props.onLogout} />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0E3E3E" },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  column: { flexGrow: 1, width: "100%", maxWidth: 640, alignSelf: "center" },
  hero: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 32 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  title: { flexShrink: 1, fontFamily: "Poppins_700Bold", fontSize: 32, lineHeight: 44,
    letterSpacing: -0.8, color: "#F1FFF3" },
  editTarget: { minHeight: 48, minWidth: 48, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  editText: { fontFamily: "Poppins_700Bold", fontSize: 14, lineHeight: 22, color: "#00D09E" },
  identity: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 26 },
  stackedIdentity: { flexDirection: "column", alignItems: "flex-start", gap: 14 },
  avatarTarget: { width: 88, height: 88, borderRadius: 44 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#DFF7E2",
    overflow: "hidden", alignItems: "center", justifyContent: "center" },
  avatarImage: { width: "100%", height: "100%" },
  initials: { fontFamily: "Poppins_700Bold", fontSize: 28, lineHeight: 40, color: "#0E3E3E" },
  cameraBadge: { position: "absolute", right: 0, bottom: 3, width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#00D09E", borderWidth: 3, borderColor: "#0E3E3E",
    alignItems: "center", justifyContent: "center" },
  identityCopy: { flex: 1, minWidth: 0 },
  stackedCopy: { flex: 0, width: "100%" },
  name: { fontFamily: "Poppins_700Bold", fontSize: 26, lineHeight: 36,
    letterSpacing: -0.6, color: "#F1FFF3" },
  email: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 22, color: "#A9C9BE", marginTop: 3 },
  memberId: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 20, color: "#A9C9BE", marginTop: 3 },
  memberIdValue: { color: "#F1FFF3", fontVariant: ["tabular-nums"] },
  nameSkeleton: { height: 30, width: "80%", backgroundColor: "#315C58", borderRadius: 6 },
  detailSkeleton: { height: 13, width: "100%", backgroundColor: "#315C58", borderRadius: 4, marginTop: 12 },
  idSkeleton: { height: 12, width: "55%", backgroundColor: "#315C58", borderRadius: 4, marginTop: 10 },
  errorBlock: { marginTop: 20, gap: 4 },
  errorText: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 22, color: "#DFF7E2" },
  retryTarget: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8,
    alignSelf: "flex-start", paddingHorizontal: 8, borderRadius: 12 },
  retryText: { fontFamily: "Poppins_700Bold", fontSize: 13, color: "#00D09E" },
  sheet: { flexGrow: 1, backgroundColor: "#F1FFF3", borderTopLeftRadius: 40,
    borderTopRightRadius: 40, paddingHorizontal: 24, paddingTop: 28 },
  sectionTitle: { fontFamily: "Poppins_700Bold", fontSize: 20, lineHeight: 30,
    letterSpacing: -0.4, color: "#0E3E3E" },
  actionGroup: { marginTop: 8 },
  actionRow: { minHeight: 76, paddingVertical: 14, flexDirection: "row",
    alignItems: "center", gap: 14, borderRadius: 12 },
  iconTile: { width: 44, height: 44, borderRadius: 12, backgroundColor: "#DFF7E2",
    alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { fontFamily: "Poppins_700Bold", fontSize: 16, lineHeight: 24, color: "#0E3E3E" },
  rowDescription: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 21, color: "#617470" },
  divider: { height: 1, backgroundColor: "#C9DAD4" },
  securitySection: { marginTop: 24 },
  securityRow: { minHeight: 80, paddingVertical: 14, marginTop: 8, flexDirection: "row",
    alignItems: "center", gap: 14 },
  switchTarget: { minWidth: 52, minHeight: 48, alignItems: "center", justifyContent: "center" },
  logoutSection: { marginTop: 12 },
  dangerTile: { backgroundColor: "#FCECE8" },
  dangerText: { color: "#B42318" },
  focus: { outlineWidth: 2, outlineOffset: 3, outlineColor: "#087D65" },
  heroFocus: { outlineWidth: 2, outlineOffset: 3, outlineColor: "#00D09E" },
  rowPressed: { backgroundColor: "#DFF7E2" },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
});
