import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../utils/supabase";
import { authenticatedApiFetch } from "../utils/api";
import { addSignedReceiptImage } from "../utils/receipt-images";
import { calculateClaims, money, parseAmount, TAX_RULES, TaxClaim, validDate } from "../types/tax";

type Receipt = { id: string; merchant_name: string; total_amount: number; receipt_date: string; image_url: string | null; items: {name: string; price: number}[] | null };
type Draft = TaxClaim & { amountText: string; eligibleText: string; dateText: string };
const emptyClaim = (year: number): Draft => ({
  id: "", tax_year: year, rule_id: null, rule_version: null, receipt_id: null,
  title: "", amount: 0, eligible_amount: 0, status: "needs_review", beneficiary: "Self",
  evidence_note: "", eligibility_confirmed: false, occurred_on: null,
  amountText: "", eligibleText: "", dateText: "",
});
const errorMessage = (e: unknown) => e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : "Please try again.";

export default function LHDNClaimScreen() {
  const router = useRouter();
  const [year, setYear] = useState(2025);
  const [claims, setClaims] = useState<TaxClaim[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [tab, setTab] = useState("Claims");
  const [rulePicker, setRulePicker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const {data: auth, error: authError} = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Please sign in again.");
      setUserId(auth.user.id);
      const all: TaxClaim[] = [];
      for (let offset = 0; ; offset += 500) {
        const {data, error: queryError} = await supabase.from("tax_claims").select("*")
          .eq("user_id", auth.user.id).order("created_at", {ascending:false}).order("id").range(offset,offset+499);
        if (queryError) throw queryError;
        all.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      setClaims(all);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const visible = claims.filter(c=>c.tax_year === year);
  const calculation = calculateClaims(claims, year);
  const pending = visible.filter(c=>c.status !== "confirmed" && c.status !== "rejected").length;
  const rule = TAX_RULES.find(r=>r.id === draft?.rule_id);
  const years = [2025, 2026];
  const patch = (values: Partial<Draft>) => setDraft(d=>d ? {...d,...values,eligibility_confirmed:false} : null);

  const openClaim = async (claim: TaxClaim) => {
    setReceipt(null); setImage(null); setSelectedItems(claim.eligible_items || []); setRulePicker(false);
    setDraft({...claim, amountText:String(claim.amount), eligibleText:String(claim.eligible_amount),dateText:claim.occurred_on || ""});
    if (claim.receipt_id) {
      setBusy(true);
      try {
        const {data,error: e} = await supabase.from("receipts").select("*").eq("id",claim.receipt_id).eq("user_id",userId).single();
        if(e) throw e;
        setReceipt(data);
      } catch(e) { Alert.alert("Could not load evidence",errorMessage(e)); }
      finally { setBusy(false); }
    }
  };
  const chooseRule = (id: string) => {
    const selected = TAX_RULES.find(r=>r.id===id)!;
    patch({rule_id:id,rule_version:draft?.tax_year===selected.year ? selected.version:null,
      ...(!draft?.title.trim() ? {title:selected.title}:{}),
      ...(selected.mode==="fixed" ? {amountText:String(selected.cap),eligibleText:String(selected.cap)} : {}),
    });
    setRulePicker(false);
  };
  const save = async (status: string) => {
    if(!draft || busy) return;
    const amount = parseAmount(draft.amountText);
    const eligible = parseAmount(draft.eligibleText || "0");
    if(!draft.title.trim() || amount===null || eligible===null || eligible>amount) {
      Alert.alert("Check the amounts","Enter a title and valid amounts with up to two decimal places. Eligible amount cannot exceed the recorded amount."); return;
    }
    if (draft.dateText && !validDate(draft.dateText,draft.tax_year)) {
      Alert.alert("Check the date","Use a real date in the selected assessment year, in YYYY-MM-DD format."); return;
    }
    if(status==="confirmed") {
      if(!rule || draft.tax_year!==rule.year) { Alert.alert("Rules not reviewed","You can save this as a draft. Confirmed estimates are currently available for YA2025."); return; }
      if(!draft.eligibility_confirmed || !draft.beneficiary.trim()) { Alert.alert("Review eligibility","Check the eligibility statement and enter the beneficiary."); return; }
      if(rule.mode!=="fixed" && (!draft.dateText || eligible<=0 || (!draft.receipt_id && !draft.evidence_note.trim()))) {
        Alert.alert("Add supporting details","Enter the payment date, eligible amount and a reference to your supporting document."); return;
      }
    }
    setBusy(true);
    try {
      const payload = {user_id:userId,tax_year:draft.tax_year,rule_id:draft.rule_id,
        rule_version:rule && draft.tax_year===rule.year ? rule.version:null,receipt_id:draft.receipt_id,
        title:draft.title.trim(),amount,eligible_amount:eligible,status,beneficiary:draft.beneficiary.trim(),
        evidence_note:draft.evidence_note.trim(),eligibility_confirmed:status==="confirmed",
        occurred_on:draft.dateText || null,eligible_items:selectedItems};
      const query = draft.id
        ? supabase.from("tax_claims").update(payload).eq("id",draft.id).eq("user_id",userId).eq("updated_at",draft.updated_at)
        : supabase.from("tax_claims").insert(payload);
      const {data,error:e} = await query.select("id").single();
      if(e || !data) throw e || new Error("This claim changed on another device. Reload and review it again.");
      setDraft(null); setReceipt(null); await load();
    } catch(e) { Alert.alert("Could not save claim",errorMessage(e)); }
    finally { setBusy(false); }
  };
  const scan = async (camera: boolean) => {
    setBusy(true);
    try {
      if(camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if(!permission.granted) throw new Error("Camera permission is needed to scan a receipt.");
      }
      const options = {base64:true,quality:0.8,mediaTypes:["images"] as ImagePicker.MediaType[]};
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if(result.canceled) return;
      const base64 = result.assets[0].base64;
      if(!base64) throw new Error("Could not read this image.");
      const response = await authenticatedApiFetch("/api/ocr", {method:"POST",body:JSON.stringify({imageBase64:base64,lhdnCategory:"Tax review"})});
      const body = await response.json();
      if(!response.ok || !body.success) throw new Error(body.error || "Receipt scan failed.");
      await load();
      const {data,error:e} = await supabase.from("tax_claims").select("*").eq("receipt_id",body.data.id).eq("user_id",userId).single();
      if(e) throw e;
      if (!years.includes(data.tax_year)) {
        Alert.alert("Receipt outside selected years", `This receipt is from YA ${data.tax_year}. Tax Relief currently shows YA 2025 and YA 2026 only.`);
        return;
      }
      setYear(data.tax_year); await openClaim(data);
    } catch(e) { Alert.alert("Could not scan receipt",errorMessage(e)); }
    finally { setBusy(false); }
  };
  const viewImage = async () => {
    if(!receipt) return;
    setBusy(true);
    try { const signed = await addSignedReceiptImage(receipt); setImage(signed.image_url); }
    catch(e) { Alert.alert("Could not open receipt",errorMessage(e)); }
    finally {setBusy(false);}
  };
  const button = (label:string,onPress:()=>void,secondary=false,disabled=busy) => (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button,secondary && s.secondary,disabled && s.disabled]}>
      <Text style={[s.buttonText,secondary && s.secondaryText]}>{label}</Text>
    </Pressable>
  );
  const field = (label:string,value:string,onChangeText:(v:string)=>void,numeric=false) => (
    <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value}
      onChangeText={onChangeText} style={s.input} keyboardType={numeric ? "decimal-pad":"default"} editable={!busy}/></View>
  );
  return <SafeAreaView style={s.safe} edges={["top","left","right"]}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()} style={s.backButton}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </Pressable>
      <Text style={s.heading}>Tax Relief</Text>
    </View>
    <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      <View style={s.yearTabs}>{years.map(y=><Pressable key={y} onPress={()=>setYear(y)} style={[s.yearTab,y===year && s.yearTabActive]} accessibilityRole="button" accessibilityState={{selected:year===y}}><Text style={[s.yearText,y===year && s.yearTextActive]}>YA {y}</Text></Pressable>)}</View>
      {year!==2025 && <Text style={s.notice}>Draft tracking only. Limits for YA {year} have not been reviewed, so no eligible total is shown.</Text>}
      {error ? <View style={s.card}><Text style={s.notice}>Could not load tax claims: {error}</Text>{button("Retry",()=>void load())}</View> : loading ? <ActivityIndicator/> : <>
        <View style={s.hero}><View style={s.heroAccent}/><Text style={s.heroLabel}>Confirmed relief estimate · YA {year}</Text>
          <Text style={s.total}>{calculation.available ? money(calculation.total) : "Awaiting reviewed rules"}</Text>
          <Text style={s.heroLabel}>{pending} claim{pending===1?"":"s"} to review</Text>
          <Text style={s.heroLabel}>Based on your confirmations. This is a reduction in taxable income, not a refund or LHDN approval.</Text></View>
        <View style={s.actions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setDraft(emptyClaim(year));setReceipt(null);setSelectedItems([]);setRulePicker(false);}} style={[s.addAction,busy&&s.disabled]}>
            <View style={s.actionIcon}><Ionicons name="add" size={24} color="#006B54"/></View>
            <View style={s.actionText}><Text style={s.addTitle}>Add claim</Text><Text style={s.actionSubtitle}>Enter relief details yourself</Text></View>
            <Ionicons name="arrow-forward" size={20} color="#073F38"/>
          </Pressable>
          <View style={s.actionGrid}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void scan(true)} style={[s.scanAction,busy&&s.disabled]}>
              <Ionicons name="camera-outline" size={26} color="#fff"/>
              <Text style={s.actionTitle}>Scan receipt</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void scan(false)} style={[s.photoAction,busy&&s.disabled]}>
              <Ionicons name="images-outline" size={26} color="#fff"/>
              <Text style={s.actionTitle}>Choose photo</Text>
            </Pressable>
          </View>
        </View>
        {busy && <ActivityIndicator accessibilityLabel="Processing receipt"/>}
        <Text style={s.sub}>Use Add claim for annual statements or personal reliefs. Keep the original supporting documents and record only qualifying items.</Text>
        <View style={s.tabBar}>{["Claims","Breakdown"].map(t=><Pressable key={t} style={[s.tab,tab===t&&s.tabActive]} onPress={()=>setTab(t)} accessibilityRole="button" accessibilityState={{selected:tab===t}}><Text style={[s.tabText,tab===t&&s.tabTextActive]}>{t}</Text></Pressable>)}</View>
        {tab==="Claims" ? visible.length===0 ? <Text style={s.empty}>No claims for YA {year}. Add a claim or scan a receipt to get started.</Text> :
          visible.map(c=><Pressable key={c.id} style={s.card} onPress={()=>void openClaim(c)} disabled={busy} accessibilityRole="button">
            <Text style={s.cardTitle}>{c.title}</Text><Text style={s.sub}>{TAX_RULES.find(r=>r.id===c.rule_id)?.title || "Choose a relief"}</Text>
            <Text style={s.status}>{c.status==="confirmed"?"Confirmed by you":c.status==="rejected"?"Excluded":"Needs review"} · {money(Number(c.eligible_amount))} requested</Text>
            <Text style={s.sub}>{c.occurred_on || "Personal declaration"} · Tap to review</Text>
          </Pressable>) :
          calculation.rows.map(r=><View key={r.rule.id} style={s.card}><Text style={s.cardTitle}>{r.rule.title}</Text>
            <Text>{money(r.allowed)} eligible / {money(r.rule.cap)} limit</Text>
            <Text style={s.sub}>{money(r.remaining)} remaining after individual and shared limits</Text>
            {r.excluded>0 && <Text style={s.notice}>{money(r.excluded)} excluded by individual or shared limit.</Text>}
            {r.rule.group && <Text style={s.sub}>Shared cap: {money(r.rule.groupCap!)}. Allocation follows the order shown.</Text>}
          </View>)}
        <Text style={s.sub}>YA2025 sources reviewed 25 September 2026. Child/dependent calculations, rebates and a full tax-payable estimate will be added in later milestones.</Text>
        {button("Official HASiL relief guidance",()=>void Linking.openURL("https://www.hasil.gov.my/individu/pelepasan-cukai/"),true)}
      </>}
    </ScrollView>
    <Modal visible={!!draft} animationType="slide" onRequestClose={()=>{if(!busy)setDraft(null);}}>
      <SafeAreaView style={s.modalSafe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==="ios"?"padding":undefined}>
        <View style={s.header}><Text style={s.heading}>Review claim</Text>{button("Close",()=>setDraft(null),true)}</View>
        {draft && <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.row}>{years.map(y=><Pressable disabled={busy} key={y} style={[s.chip,draft.tax_year===y&&s.chipActive]} onPress={()=>patch({tax_year:y,rule_version:null})}><Text>YA {y}</Text></Pressable>)}</View>
          {draft.tax_year!==2025 && <Text style={s.notice}>Save a draft for this year. YA2025 limits must not be used to estimate YA {draft.tax_year}.</Text>}
          {button(rule?.title || "Choose the exact relief",()=>setRulePicker(true),true)}
          {rulePicker && TAX_RULES.map(r=><Pressable key={r.id} style={s.card} onPress={()=>chooseRule(r.id)} disabled={busy}><Text>{r.category} · {r.title}</Text></Pressable>)}
          {rule && <View style={s.card}><Text style={s.cardTitle}>{rule.title}</Text>
            <Text>{draft.tax_year===2025 ? money(rule.cap)+" annual limit" : "YA2025 reference category only"}</Text>
            <Text style={s.sub}>Evidence: {rule.documents}</Text>
            {button("Read eligibility at HASiL",()=>void Linking.openURL(rule.source),true)}
            <Text style={s.sub}>Reviewed {rule.reviewed} · YA{rule.year}</Text></View>}
          {field("Claim title",draft.title,v=>patch({title:v}))}
          {field("Beneficiary (for example Self or parent’s name)",draft.beneficiary,v=>patch({beneficiary:v}))}
          {rule?.mode!=="fixed" && field("Payment date (YYYY-MM-DD)",draft.dateText,v=>patch({dateText:v}))}
          {field(rule?.mode==="fixed"?"Personal relief amount":"Recorded amount (RM)",draft.amountText,v=>patch({amountText:v}),true)}
          {field("Eligible amount requested (RM)",draft.eligibleText,v=>patch({eligibleText:v}),true)}
          {receipt && <View style={s.card}><Text style={s.cardTitle}>Original receipt</Text><Text>{receipt.merchant_name} · {money(Number(receipt.total_amount))}</Text>
            <Text style={s.sub}>Receipt date: {receipt.receipt_date}. Correct receipt details in Transactions if needed.</Text>
            {receipt.image_url && button("View receipt image",()=>void viewImage(),true)}
            <Text style={s.sub}>Select qualifying items to fill the eligible amount, or enter a corrected amount above. Check discounts and refunds yourself.</Text>
            {(receipt.items||[]).map((item,i)=><Pressable key={i} disabled={busy} style={s.item} onPress={()=>{
              const ids=selectedItems.includes(i)?selectedItems.filter(n=>n!==i):[...selectedItems,i];setSelectedItems(ids);
              patch({eligibleText:(ids.reduce((sum,n)=>sum+Math.round(Number(receipt.items![n].price)*100),0)/100).toFixed(2)});
            }}><Text>{selectedItems.includes(i)?"☑":"☐"} {item.name} · {money(Number(item.price))}</Text></Pressable>)}
          </View>}
          {field("Supporting document reference / notes",draft.evidence_note,v=>patch({evidence_note:v}))}
          <Text style={s.sub}>For a statement, record its issuer and year here and retain your copy. Enter only amounts you paid and have not claimed elsewhere.</Text>
          {rule && draft.tax_year===2025 && <Pressable disabled={busy} accessibilityRole="checkbox" accessibilityState={{checked:draft.eligibility_confirmed}} style={s.card}
            onPress={()=>setDraft({...draft,eligibility_confirmed:!draft.eligibility_confirmed})}>
            <Text>{draft.eligibility_confirmed?"☑":"☐"} I was a Malaysian tax resident for this year. {rule.condition} I checked the original evidence and have not claimed the same expense twice.</Text>
          </Pressable>}
          {busy && <ActivityIndicator/>}
          {button("Save draft",()=>void save("needs_review"),true)}
          {button("Confirm eligible claim",()=>void save("confirmed"),false,busy||draft.tax_year!==2025||!rule||!draft.eligibility_confirmed)}
          {draft.id && button("Exclude from estimate",()=>void save("rejected"),true)}
          <Text style={s.sub}>Excluding a claim keeps its receipt and transaction. Confirmed claims are still subject to annual limits.</Text>
        </ScrollView>}
      </KeyboardAvoidingView></SafeAreaView>
      <Modal visible={!!image} onRequestClose={()=>setImage(null)}><SafeAreaView style={s.modalSafe}>{button("Close image",()=>setImage(null),true)}{image&&<Image source={{uri:image}} style={s.flex} resizeMode="contain"/>}</SafeAreaView></Modal>
    </Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#007F69"},modalSafe:{flex:1,backgroundColor:"#f7fffb"},flex:{flex:1},
  page:{flex:1,backgroundColor:"#f7fffb"},
  header:{minHeight:72,paddingHorizontal:20,alignItems:"center",justifyContent:"center",flexDirection:"row",backgroundColor:"#007F69"},
  backButton:{position:"absolute",left:20,width:44,height:44,alignItems:"center",justifyContent:"center",borderRadius:16,backgroundColor:"#006A56",zIndex:1},
  heading:{fontSize:24,fontWeight:"700",color:"#fff",textAlign:"center"},sub:{fontSize:13,color:"#4A665C",lineHeight:20},
  content:{padding:20,gap:18,paddingBottom:48},row:{flexDirection:"row",flexWrap:"wrap",gap:10},
  yearTabs:{flexDirection:"row",gap:10},yearTab:{flex:1,alignItems:"center",paddingVertical:14,backgroundColor:"#E5F4ED",borderRadius:18},
  yearTabActive:{backgroundColor:"#00DAA4"},yearText:{fontSize:15,fontWeight:"600",color:"#23584A"},yearTextActive:{color:"#073F38"},
  hero:{backgroundColor:"#073F38",padding:24,borderRadius:24,gap:10,overflow:"hidden"},
  heroAccent:{position:"absolute",top:-76,right:-56,width:190,height:190,borderRadius:95,backgroundColor:"#087C67"},
  heroLabel:{color:"#DDFBF1",lineHeight:21},total:{fontSize:34,fontWeight:"700",color:"#fff",fontVariant:["tabular-nums"]},
  actions:{gap:12},addAction:{minHeight:74,paddingHorizontal:18,flexDirection:"row",alignItems:"center",gap:14,borderRadius:20,backgroundColor:"#00DAA4"},
  actionGrid:{flexDirection:"row",gap:12},scanAction:{flex:1,minHeight:100,padding:16,justifyContent:"space-between",borderRadius:20,backgroundColor:"#1578D4"},
  photoAction:{flex:1,minHeight:100,padding:16,justifyContent:"space-between",borderRadius:20,backgroundColor:"#7250D6"},
  actionIcon:{width:42,height:42,alignItems:"center",justifyContent:"center",borderRadius:14,backgroundColor:"#E5FFF5"},
  actionText:{flex:1,gap:3},actionTitle:{fontSize:16,fontWeight:"700",color:"#fff"},addTitle:{fontSize:16,fontWeight:"700",color:"#073F38"},actionSubtitle:{fontSize:12,color:"#175344"},
  tabBar:{flexDirection:"row",padding:4,borderRadius:18,backgroundColor:"#E5F4ED"},tab:{flex:1,alignItems:"center",paddingVertical:11,borderRadius:15},
  tabActive:{backgroundColor:"#00DAA4"},tabText:{fontWeight:"600",color:"#23584A"},tabTextActive:{color:"#073F38"},
  card:{backgroundColor:"#fff",padding:18,borderRadius:18,gap:8,borderWidth:1,borderColor:"#D8EEE3"},cardTitle:{fontSize:16,fontWeight:"600",color:"#073F38"},
  button:{backgroundColor:"#007F69",padding:14,borderRadius:12,alignItems:"center"},buttonText:{color:"#fff",fontWeight:"600"},
  secondary:{backgroundColor:"#e0eee8"},secondaryText:{color:"#093030"},disabled:{opacity:0.45},
  chip:{paddingHorizontal:18,paddingVertical:12,borderRadius:22,backgroundColor:"#e3eae7"},chipActive:{backgroundColor:"#8ce3c2"},
  notice:{color:"#83520a",lineHeight:21},empty:{paddingVertical:30,color:"#526b64",lineHeight:24},
  status:{color:"#00765b",fontWeight:"600"},field:{gap:7},label:{fontSize:14,fontWeight:"500",color:"#093030"},
  input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#bdcfc7",padding:14,borderRadius:10,color:"#093030",fontSize:16},
  item:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#e0eee8"},
});
