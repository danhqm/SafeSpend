import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authenticatedApiFetch } from "../../utils/api";
import { FeatureGuideHelp, FeatureGuideIntro, FeatureGuideStatus, FeatureGuideTour, prepareFinGuideQuestion } from "../../components/feature-guide";
import { useFeatureGuide } from "../../hooks/use-feature-guide";
import { useGuideTargets } from "../../hooks/use-guide-targets";

type ChatMessage = { role: "user" | "assistant"; text: string };

export default function Chatbot() {
  const guide = useFeatureGuide("fin");
  const guideTargets = useGuideTargets(guide.step);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const sendingRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  const openGuide = () => { Keyboard.dismiss(); guide.open(true); };
  const useGuideExample = (step: 0 | 1 | 2) => {
    setInput((current) => prepareFinGuideQuestion(current, step));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    const showEvent =
      process.env.EXPO_OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      process.env.EXPO_OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true),
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const sendMessage = async () => {
    if (sendingRef.current || !input.trim()) return;
    sendingRef.current = true;

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
        text: "Fin couldn't answer right now. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      sendingRef.current = false;
      setLoading(false);

      setTimeout(
        () => scrollViewRef.current?.scrollToEnd({ animated: true }),
        100,
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Fin</Text>
        <View style={styles.guideHelp}>
          <FeatureGuideHelp name="Fin" onPress={openGuide} disabled={!guide.ready || loading} />
        </View>
      </View>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
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

          <View ref={guideTargets.ref(1)} collapsable={false} onLayout={guideTargets.measure} style={{ flex: 1 }}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatContainer}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => { if (messages.length || loading) scrollViewRef.current?.scrollToEnd({ animated: true }); }}
          >
            {messages.length === 0 && !keyboardVisible && <FeatureGuideIntro feature="fin" guide={guide} />}
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
            {loading && (
              <View
                style={styles.thinkingMessage}
                accessibilityRole="progressbar"
                accessibilityLabel="Fin is thinking"
                accessibilityLiveRegion="polite"
              >
                <ActivityIndicator size="small" color="#007E69" />
                <Text style={styles.thinkingText}>Fin is thinking...</Text>
              </View>
            )}
          </ScrollView>
          </View>

          <FeatureGuideStatus guide={guide} />

          <View
            ref={guideTargets.ref(0)} collapsable={false} onLayout={guideTargets.measure}
            style={[
              styles.inputContainer,
              keyboardVisible && styles.inputContainerKeyboard,
            ]}
          >
            <TextInput
              ref={inputRef}
              accessibilityLabel="Message Fin"
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor="#666"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
            />
            <TouchableOpacity
              ref={guideTargets.ref(2)} onLayout={guideTargets.measure}
              onPress={sendMessage}
              style={[styles.sendButton, loading && styles.sendButtonDisabled]}
              disabled={loading || !input.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send message to Fin"
            >
              <Ionicons name="send" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      <FeatureGuideTour feature="fin" guide={guide} target={guideTargets.target}
        onMeasure={guideTargets.measure} onAction={useGuideExample} />
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
  guideHelp: { position: "absolute", right: 16, top: 12 },
  keyboardAvoiding: {
    flex: 1,
    backgroundColor: "#fff",
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
  thinkingMessage: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#DFF7E2",
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginVertical: 6,
  },
  thinkingText: {
    color: "#093030",
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingBottom: 100,
  },
  inputContainerKeyboard: {
    paddingBottom: 8,
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
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
