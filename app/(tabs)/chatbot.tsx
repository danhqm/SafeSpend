import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import React, { useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authenticatedApiFetch } from "../../utils/api";

type ChatMessage = { role: "user" | "assistant"; text: string };

export default function Chatbot() {
  const tabBarHeight = useBottomTabBarHeight();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const message = input.trim();
    const userMessage: ChatMessage = { role: "user", text: message };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await authenticatedApiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          history: messages.slice(-10).map(({ role, text }) => ({
            role,
            content: text,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Chat failed");
      const botMessage: ChatMessage = { role: "assistant", text: data.text };
      setMessages((prev) => [...prev, botMessage]);
    } catch {
      const errorMessage: ChatMessage = {
        role: "assistant",
        text: "⚠️ Server not reachable.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);

      setTimeout(
        () => scrollViewRef.current?.scrollToEnd({ animated: true }),
        100,
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" backgroundColor={PRIMARY} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Fin</Text>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#fff" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? tabBarHeight : 0}
      >
        <View style={styles.innerContainer}>
          <View style={styles.cardHeader}>
            <Image
              source={require("../../assets/images/Fin.png")}
              style={styles.icon}
            />
            <View>
              <Text style={styles.cardTitle}>Seek Advice From Fin</Text>
              <Text style={styles.cardDescription}>
                You can always ask an opinion from Fin!
              </Text>
            </View>
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.chatContainer}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((msg, i) => (
              <View
                key={i}
                style={[
                  styles.message,
                  msg.role === "user" ? styles.userMessage : styles.finMessage,
                ]}
              >
                <Text style={styles.messageText}>{msg.text}</Text>
              </View>
            ))}
            {loading && <Text style={styles.loadingText}>🤖 Thinking...</Text>}
          </ScrollView>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor="#666"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
            />
            <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
              <Ionicons name="send" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    backgroundColor: PRIMARY,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 25,
    paddingTop: 25,
    paddingBottom: 60,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    color: "#052224",
    lineHeight: 24,
  },
  keyboardAvoiding: {
    flex: 1,
  },

  innerContainer: {
    flex: 1,
    backgroundColor: "#fff",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    marginTop: -40,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  icon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#093030",
  },
  cardDescription: {
    fontSize: 14,
    color: "#093030",
    marginTop: 4,
  },

  chatContainer: {
    flex: 1,
  },
  message: {
    marginVertical: 6,
    borderRadius: 15,
    padding: 10,
    maxWidth: "80%",
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: PRIMARY,
  },
  finMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#DFF7E2",
  },
  messageText: {
    color: "#093030",
    fontSize: 14,
  },
  loadingText: {
    color: "#093030",
    fontStyle: "italic",
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingBottom: 40,
  },
  input: {
    flex: 1,
    backgroundColor: "#F2F2F2",
    padding: 12,
    borderRadius: 20,
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: PRIMARY,
    padding: 10,
    borderRadius: 25,
    marginLeft: 8,
  },
});
