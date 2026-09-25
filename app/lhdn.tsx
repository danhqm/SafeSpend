import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
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
  const [picker, setPicker] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
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
  const years = [...new Set([2025,2026,...claims.map(c=>c.tax_year)])].sort((a,b)=>b-a);
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
      setYear(data.tax_year); await openClaim(data);
    } catch(e) { Alert.alert("Could not scan receipt",errorMessage(e)); }
    finally { setBusy(false); }
  };
  const showReceipts = async () => {
    setBusy(true);
    try {
      const list: Receipt[] = [];
      for(let offset=0;;offset+=500) {
        const {data,error:e} = await supabase.from("receipts").select("id,merchant_name,total_amount,receipt_date,image_url,items")
          .eq("user_id",userId).gte("receipt_date",year+"-01-01").lte("receipt_date",year+"-12-31")
          .order("receipt_date",{ascending:false}).order("id").range(offset,offset+499);
        if(e) throw e;
        list.push(...(data||[])); if(!data || data.length<500) break;
      }
      setReceipts(list.filter(r=>!claims.some(c=>c.receipt_id===r.id))); setPicker(true);
    } catch(e) { Alert.alert("Could not load receipts",errorMessage(e)); }
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
  return <SafeAreaView style={s.safe}>
    <View style={s.header}>{button("Back",()=>router.back(),true)}<View><Text style={s.heading}>Tax relief</Text><Text style={s.sub}>Your annual claim tracker</Text></View></View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.row}>{years.map(y=><Pressable key={y} onPress={()=>setYear(y)} style={[s.chip,y===year && s.chipActive]} accessibilityRole="button"><Text>YA {y}</Text></Pressable>)}</View>
      {year!==2025 && <Text style={s.notice}>Draft tracking only. Limits for YA {year} have not been reviewed, so no eligible total is shown.</Text>}
      {error ? <View style={s.card}><Text style={s.notice}>Could not load tax claims: {error}</Text>{button("Retry",()=>void load())}</View> : loading ? <ActivityIndicator/> : <>
        <View style={s.hero}><Text style={s.heroLabel}>Confirmed relief estimate · YA {year}</Text>
          <Text style={s.total}>{calculation.available ? money(calculation.total) : "Awaiting reviewed rules"}</Text>
          <Text style={s.heroLabel}>{pending} claim{pending===1?"":"s"} to review</Text>
          <Text style={s.heroLabel}>Based on your confirmations. This is a reduction in taxable income, not a refund or LHDN approval.</Text></View>
        <View style={s.row}>{button("Add claim",()=>{setDraft(emptyClaim(year));setReceipt(null);setSelectedItems([]);setRulePicker(false);})}{button("Use saved receipt",()=>void showReceipts(),true)}</View>
        <View style={s.row}>{button("Scan receipt",()=>void scan(true),true)}{button("Choose photo",()=>void scan(false),true)}</View>
        {busy && <ActivityIndicator accessibilityLabel="Processing receipt"/>}
        <Text style={s.sub}>Use a manual claim for annual statements or personal reliefs. Keep the original supporting documents. One saved receipt can be linked once; record only qualifying items.</Text>
        <View style={s.row}>{["Claims","Breakdown"].map(t=><Pressable key={t} style={[s.chip,tab===t&&s.chipActive]} onPress={()=>setTab(t)}><Text>{t}</Text></Pressable>)}</View>
        {tab==="Claims" ? visible.length===0 ? <Text style={s.empty}>No claims for YA {year}. Add a claim or review a saved receipt to get started.</Text> :
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
      <SafeAreaView style={s.safe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==="ios"?"padding":undefined}>
        <View style={s.header}><Text style={s.heading}>Review claim</Text>{button("Close",()=>setDraft(null),true)}</View>
        {draft && <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.row}>{[2025,2026,...(![2025,2026].includes(draft.tax_year)?[draft.tax_year]:[])].map(y=><Pressable disabled={busy} key={y} style={[s.chip,draft.tax_year===y&&s.chipActive]} onPress={()=>patch({tax_year:y,rule_version:null})}><Text>YA {y}</Text></Pressable>)}</View>
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
      <Modal visible={!!image} onRequestClose={()=>setImage(null)}><SafeAreaView style={s.safe}>{button("Close image",()=>setImage(null),true)}{image&&<Image source={{uri:image}} style={s.flex} resizeMode="contain"/>}</SafeAreaView></Modal>
    </Modal>
    <Modal visible={picker} animationType="slide" onRequestClose={()=>setPicker(false)}><SafeAreaView style={s.safe}>
      <View style={s.header}><Text style={s.heading}>Receipts · YA {year}</Text>{button("Close",()=>setPicker(false),true)}</View>
      <ScrollView contentContainerStyle={s.content}>{receipts.length===0&&<Text>No unlinked receipts for this year.</Text>}
        {receipts.map(r=><Pressable key={r.id} style={s.card} onPress={()=>{
          setPicker(false);setReceipt(r);setSelectedItems([]);setRulePicker(false);
          setDraft({...emptyClaim(year),receipt_id:r.id,title:r.merchant_name||"Receipt",amountText:String(r.total_amount),eligibleText:"0",dateText:r.receipt_date});
        }}><Text style={s.cardTitle}>{r.merchant_name}</Text><Text>{r.receipt_date} · {money(Number(r.total_amount))}</Text></Pressable>)}
      </ScrollView></SafeAreaView></Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f3f8f6"},flex:{flex:1},header:{padding:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},
  heading:{fontSize:23,fontWeight:"700",color:"#093030"},sub:{fontSize:13,color:"#526b64",lineHeight:20},
  content:{padding:20,gap:14,paddingBottom:48},row:{flexDirection:"row",flexWrap:"wrap",gap:10},
  hero:{backgroundColor:"#093030",padding:24,borderRadius:22,gap:10},heroLabel:{color:"#d5f4e8",lineHeight:21},total:{fontSize:30,fontWeight:"700",color:"#fff"},
  card:{backgroundColor:"#fff",padding:18,borderRadius:16,gap:8,borderWidth:1,borderColor:"#dce9e3"},cardTitle:{fontSize:16,fontWeight:"600",color:"#093030"},
  button:{backgroundColor:"#007e62",padding:14,borderRadius:12,alignItems:"center"},buttonText:{color:"#fff",fontWeight:"600"},
  secondary:{backgroundColor:"#e0eee8"},secondaryText:{color:"#093030"},disabled:{opacity:0.45},
  chip:{paddingHorizontal:18,paddingVertical:12,borderRadius:22,backgroundColor:"#e3eae7"},chipActive:{backgroundColor:"#8ce3c2"},
  notice:{color:"#83520a",lineHeight:21},empty:{paddingVertical:30,color:"#526b64",lineHeight:24},
  status:{color:"#00765b",fontWeight:"600"},field:{gap:7},label:{fontSize:14,fontWeight:"500",color:"#093030"},
  input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#bdcfc7",padding:14,borderRadius:10,color:"#093030",fontSize:16},
  item:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#e0eee8"},
});
