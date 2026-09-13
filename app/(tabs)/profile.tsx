import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../utils/supabase";

const MENU_ITEMS = [
  { label: "Edit Profile", icon: "person-outline" as const },
  { label: "Logout", icon: "log-out-outline" as const },
  { label: "LHDN Tax Relief", icon: "document-text-outline" as const },
];

export default function ProfileScreen() {
  const DEFAULT_AVATAR = "https://via.placeholder.com/150x150.png?text=Profile";
  const [avatarUri, setAvatarUri] = useState(DEFAULT_AVATAR);

  const pickAvatar = async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user;

    if (authError || !user) {
      console.log("No logged-in user:", authError);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    const uri = result.assets[0].uri;

    setAvatarUri(uri);

    const { error: updateError } = await supabase
      .from("users")
      .update({ avatar_url: uri })
      .eq("user_id", user.id);

    if (updateError) {
      console.log("Failed to save avatar url:", updateError);
    }
  };

  const router = useRouter();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!user || userError) {
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id, username, email, user_id, avatar_url")
        .eq("user_id", user.id)
        .single();

      if (profile?.username) {
        setDisplayName(profile.username);
        setUserId(String(profile.id));

        if (profile.avatar_url) {
          setAvatarUri(profile.avatar_url);
        }
      }

      setLoading(false);
    };

    loadProfile();
  }, []);

  const nameToShow = displayName ?? "Guest";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={pickAvatar}>
            <Image style={styles.avatar} source={{ uri: avatarUri }} />

            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={18} color="#000" />
            </View>
          </TouchableOpacity>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 16 }} />
          ) : (
            <>
              <Text style={styles.name}>{nameToShow}</Text>
              {userId && (
                <Text style={styles.idText}>
                  <Text style={styles.idLabel}>ID: </Text>
                  <Text style={styles.idValue}>{userId}</Text>
                </Text>
              )}
            </>
          )}

          <View style={styles.menuList}>
            {MENU_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.menuRow}
                activeOpacity={0.7}
                onPress={async () => {
                  if (item.label === "Edit Profile") {
                    router.push("/editprofile");
                  }
                  if (item.label === "Logout") {
                    await supabase.auth.signOut();
                    router.replace("/login");
                  }
                  if (item.label === "LHDN Tax Relief") {
                    router.push("/lhdn");
                  }
                }}
              >
                <View style={styles.menuIconWrapper}>
                  <Ionicons name={item.icon} size={24} color="#2F80ED" />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const PRIMARY = "#00D09E";
const BG_LIGHT = "#E9FFF4";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY,
  },
  header: {
    flexDirection: "column",
    alignItems: "center",
    paddingHorizontal: 25,
    paddingTop: 25,
    justifyContent: "space-between",
  },
  headerTitle: {
    color: "#052224",
    fontSize: 18,
    fontWeight: "700",
  },
  contentContainer: {
    flexGrow: 1,
  },
  card: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    alignItems: "center",
    top: 80,
    paddingTop: 40,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  avatarWrapper: {
    position: "absolute",
    top: -55,
    alignSelf: "center",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: PRIMARY,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 55,
  },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 2,
    backgroundColor: "#00D09E",
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  name: {
    marginTop: 30,
    fontSize: 20,
    fontWeight: "700",
    color: "#0E3E3E",
  },
  idText: {
    marginTop: 4,
    fontSize: 13,
  },
  idLabel: {
    color: "#8B9A9A",
    fontWeight: "600",
  },
  idValue: {
    color: "#05A66B",
    fontWeight: "700",
  },
  menuList: {
    marginTop: 32,
    alignSelf: "stretch",
    padding: 10,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  menuIconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E4F0FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  menuLabel: {
    fontSize: 16,
    color: "#16302A",
    fontWeight: "500",
  },
});
