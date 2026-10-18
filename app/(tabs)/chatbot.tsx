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
import { authenticatedApiFetch, isAiConsentRequired } from "../../utils/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import {supabase} from '../../utils/supabase';
import {applyFinLessonContext,parseFinLessonSelector,finReplyMatches,type FinLessonContext} from '../../utils/fin-lesson-context';
import { FeatureGuideHelp, FeatureGuideIntro, FeatureGuideStatus, FeatureGuideTour, prepareFinGuideQuestion } from "../../components/feature-guide";
import { useFeatureGuide } from "../../hooks/use-feature-guide";
import { useGuideTargets } from "../../hooks/use-guide-targets";
import { FinAiNotice, FinCoachStarters } from "../../components/fin-coach";
import { FinMessageBody } from "../../components/fin-message-body";

type ChatMessage = { role: "user" | "assistant"; text: string; calculated?: boolean };

export default function Chatbot() {
  const router = useRouter();
  const guide = useFeatureGuide("fin");
  const guideTargets = useGuideTargets(guide.step);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [lessonContext,setLessonContext]=useState<FinLessonContext|null>(null);
  const [pendingLesson,setPendingLesson]=useState<FinLessonContext|null>(null);
  const [lessonNotice,setLessonNotice]=useState<string|null>(null);
  const [historyStart,setHistoryStart]=useState(0);
  const lessonParams=useLocalSearchParams<{lessonModuleId?:string;lessonVersion?:string}>();
  const handledLesson=useRef('');
  const replyGeneration=useRef(0);
  const contextRef=useRef(lessonContext);
  const inputValue=useRef(input);
  const messageCount=useRef(messages.length);
  useEffect(()=>{contextRef.current=lessonContext;inputValue.current=input;messageCount.current=messages.length;},[lessonContext,input,messages.length]);
  const lessonModuleId=lessonParams.lessonModuleId,lessonVersion=lessonParams.lessonVersion;
  const scrollViewRef = useRef<ScrollView>(null);
  const sendingRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  const clearLessonParams=()=>router.setParams({lessonModuleId:'',lessonVersion:'',lessonPathId:''});
  useEffect(()=>{
    if(loading)return;
    const selector=parseFinLessonSelector({lessonModuleId,lessonVersion});
    if(!selector)return;
    const key=`${selector.moduleId}:${selector.version}`;
    if(handledLesson.current===key)return;
    let active=true;
    void(async()=>{
      try{
        const owner=(await supabase.auth.getUser()).data.user?.id;
        if(!owner)throw new Error('Sign in required');
        const response=await supabase.from('learning_modules').select('id,path_id,title,content_payload').eq('id',selector.moduleId).eq('module_type','lesson').maybeSingle();
        if(response.error||!response.data||response.data.content_payload?.version!==selector.version)throw new Error('Lesson changed');
        if(!active||(await supabase.auth.getUser()).data.user?.id!==owner)return;
        handledLesson.current=key;
        const incoming={...selector,pathId:response.data.path_id,title:response.data.title};
        const change=applyFinLessonContext(contextRef.current,inputValue.current,incoming,messageCount.current);
        if(change.needsConfirmation)setPendingLesson(incoming);
        else {replyGeneration.current++;setLessonContext(change.context);setInput(change.draft);if(contextRef.current?.moduleId!==incoming.moduleId)setHistoryStart(messageCount.current);}
        setLessonNotice(null);
      }catch{if(active)setLessonNotice('This lesson is unavailable or has changed. Reopen it in Learn.');}
    })();
    return()=>{active=false;};
  },[lessonModuleId,lessonVersion,loading]);
  useEffect(()=>{
    let owner:string|undefined;
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(owner!==undefined&&session?.user.id!==owner){replyGeneration.current++;setLoading(false);sendingRef.current=false;setMessages([]);setInput('');setLessonContext(null);setPendingLesson(null);setHistoryStart(0);handledLesson.current='';}
      owner=session?.user.id;
    });return()=>data.subscription.unsubscribe();
  },[]);

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

    const requestGeneration=replyGeneration.current;
    const requestedLesson=lessonContext;
    const message = input.trim();
    const userMessage: ChatMessage = { role: "user", text: message };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setAiNotice(null);

    try {
      const response = await authenticatedApiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          ...(lessonContext?{lessonContext:{moduleId:lessonContext.moduleId,version:lessonContext.version}}:{}),
          history: messages.slice(historyStart).slice(-10).map(({ role, text }) => ({
            role,
            content: text,
          })),
        }),
      });

      const data = await response.json();
      if(!finReplyMatches(requestGeneration,replyGeneration.current,requestedLesson,contextRef.current))return;
      if (!response.ok || !data.success) throw new Error(data.error || "Chat failed");
      if(lessonContext&&data.lessonContext?.moduleId===lessonContext.moduleId)setLessonContext(data.lessonContext);
      const botMessage: ChatMessage = { role: "assistant", text: data.text,
        calculated: Number(data.evidence?.calculationCount) > 0 };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      if(!finReplyMatches(requestGeneration,replyGeneration.current,requestedLesson,contextRef.current))return;
      if (isAiConsentRequired(error)) {
        setMessages(prev=>prev.filter(entry=>entry!==userMessage));
        setInput(current=>current || message);
        setAiNotice(error instanceof Error ? error.message : "Enable AI in Privacy & data to use Fin.");
        return;
      }
      const errorMessage: ChatMessage = {
        role: "assistant",
        text: "Fin couldn't answer right now. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      if(requestGeneration!==replyGeneration.current)return;
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
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Your financial coach</Text>
              <Text style={styles.cardDescription}>
                Explore your options, one decision at a time.
              </Text>
            </View>
          </View>

          {lessonNotice&&<Text accessibilityRole="alert" style={styles.lessonNote}>{lessonNotice}</Text>}
          {pendingLesson&&<View style={styles.lessonChip}><Text style={styles.lessonTitle}>Switch lesson help to {pendingLesson.title}?</Text><Text style={styles.lessonNote}>Your draft stays. Earlier messages remain visible; the next reply uses the new lesson.</Text><TouchableOpacity accessibilityRole="button" style={styles.lessonAction} disabled={loading} onPress={()=>{if(sendingRef.current)return;replyGeneration.current++;setLessonContext(pendingLesson);setPendingLesson(null);setHistoryStart(messages.length);setInput(d=>applyFinLessonContext(null,d,pendingLesson).draft);clearLessonParams();}}><Text style={styles.lessonTitle}>Switch lesson</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={styles.lessonAction} disabled={loading} onPress={()=>{if(sendingRef.current)return;setPendingLesson(null);clearLessonParams();}}><Text style={styles.lessonTitle}>Keep current chat</Text></TouchableOpacity></View>}
          {lessonContext&&!pendingLesson&&<View style={styles.lessonChip}><Text style={styles.lessonTitle}>Lesson help · {lessonContext.title}</Text><View style={{flexDirection:'row',gap:12,flexWrap:'wrap'}}><TouchableOpacity accessibilityRole="button" style={styles.lessonAction} disabled={loading} onPress={()=>router.push({pathname:'/learning-path-details',params:{pathId:lessonContext.pathId,moduleId:lessonContext.moduleId}})}><Text style={styles.lessonTitle}>Return to lesson</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={styles.lessonAction} disabled={loading} onPress={()=>{if(sendingRef.current)return;replyGeneration.current++;setLessonContext(null);setHistoryStart(messages.length);handledLesson.current='';clearLessonParams();}}><Text style={styles.lessonTitle}>Clear lesson</Text></TouchableOpacity></View></View>}

          <View ref={guideTargets.ref(1)} collapsable={false} onLayout={guideTargets.measure} style={{ flex: 1 }}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatContainer}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => { if (messages.length || loading) scrollViewRef.current?.scrollToEnd({ animated: true }); }}
          >
            {messages.length === 0 && !keyboardVisible && <FeatureGuideIntro feature="fin" guide={guide} />}
            {messages.length === 0 && !keyboardVisible && <FinCoachStarters onChoose={question => {
              setInput(current => current.trim() ? current : question);
              requestAnimationFrame(() => inputRef.current?.focus());
            }} />}
            {messages.map((msg, i) => (
              <View
                key={i}
                style={[
                  styles.message,
                  msg.role === "user" ? styles.userMessage : styles.finMessage,
                ]}
              >
                {msg.role === "assistant" ? <FinMessageBody text={msg.text} /> : <Text style={styles.messageText}>{msg.text}</Text>}
                {msg.role === "assistant" && msg.calculated && <Text style={styles.calculationNote}>Scenario calculated from stated inputs</Text>}
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
          {aiNotice && <View>
            <Text accessibilityRole="alert" style={{color:"#0E3E3E",padding:12}}>{aiNotice}</Text>
            <TouchableOpacity accessibilityRole="button" onPress={()=>router.push("/privacy")} style={{minHeight:48,justifyContent:"center",paddingHorizontal:12}}>
              <Text style={{color:"#087D65",fontFamily:"Poppins_700Bold"}}>Review Privacy &amp; data</Text>
            </TouchableOpacity>
          </View>}

          <View style={[styles.composer, keyboardVisible && styles.composerKeyboard]}>
          <View
            ref={guideTargets.ref(0)} collapsable={false} onLayout={guideTargets.measure}
            style={styles.inputContainer}
          >
            <TextInput
              ref={inputRef}
              accessibilityLabel="Message Fin"
              style={styles.input}
              placeholder="Ask about a money decision…"
              placeholderTextColor="#666"
              value={input}
              maxLength={2000}
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
          <FinAiNotice />
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
  lessonChip:{padding:12,marginHorizontal:16,borderRadius:14,backgroundColor:'#DFF7E2',gap:6},lessonTitle:{fontFamily:'Poppins_700Bold',fontSize:12,color:'#0E3E3E'},lessonNote:{fontFamily:'Poppins_400Regular',fontSize:12,lineHeight:18,color:'#31504A',paddingHorizontal:12},lessonAction:{minHeight:44,justifyContent:'center'},
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
    maxWidth: "94%",
    padding: 14,
  },
  messageText: {
    color: "#093030",
    fontSize: 15,
    lineHeight: 23,
  },
  calculationNote: { color: "#356356", fontSize: 12, lineHeight: 18, marginTop: 10 },
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
  },
  composer: { paddingBottom: 100 },
  composerKeyboard: { paddingBottom: 8 },
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
