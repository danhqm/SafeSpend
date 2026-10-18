import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../utils/supabase";
import { authenticatedApiFetch } from "../utils/api";
import { addSignedReceiptImage } from "../utils/receipt-images";
import { calculateClaims, money, parseAmount, TAX_RULES, TaxClaim } from "../types/tax";
import { TaxFilingProfile, TaxHouseholdMember } from "../types/tax-filing";
import { FeatureGuideHelp, FeatureGuideIntro, FeatureGuideStatus, FeatureGuideTour } from "../components/feature-guide";
import { useFeatureGuide } from "../hooks/use-feature-guide";
import { useGuideTargets } from "../hooks/use-guide-targets";
import { fetchAllPages } from "../utils/pagination-core";
import { checkClaimDate } from "../utils/tax-claim-date";
import { getErrorMessage } from "../utils/error-message";
import { scanReceiptImage } from "../utils/receipt-scan";
import { prepareReceiptUpload } from "../utils/prepare-receipt-image";

type Receipt = { id: string; merchant_name: string; total_amount: number; receipt_date: string; image_url: string | null; items: {name: string; price: number}[] | null };
type Draft = TaxClaim & { amountText: string; eligibleText: string; dateText: string };
const emptyClaim = (year: number): Draft => ({
  id: "", tax_year: year, rule_id: null, rule_version: null, receipt_id: null,
  title: "", amount: 0, eligible_amount: 0, status: "needs_review", beneficiary: "Self",
  evidence_note: "", eligibility_confirmed: false, occurred_on: null,
  amountText: "", eligibleText: "", dateText: "",
});
const errorMessage = getErrorMessage;

export default function LHDNClaimScreen() {
  const router = useRouter();
  const guide = useFeatureGuide("lhdn");
  const guideScroll = useRef<ScrollView>(null);
  const guideTargets = useGuideTargets(guide.step, guideScroll);
  const [year, setYear] = useState(2025);
  const [claims, setClaims] = useState<TaxClaim[]>([]);
  const [filingProfiles, setFilingProfiles] = useState<TaxFilingProfile[]>([]);
  const [householdMembers, setHouseholdMembers] = useState<TaxHouseholdMember[]>([]);
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
  const [receiptPicker, setReceiptPicker] = useState(false);
  const [savedReceipts, setSavedReceipts] = useState<Receipt[]>([]);
  const [receiptOffset, setReceiptOffset] = useState(0);
  const [moreReceipts, setMoreReceipts] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const {data: auth, error: authError} = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error("Please sign in again.");
      setUserId(auth.user.id);
      const all = await fetchAllPages<TaxClaim>(() => supabase.from("tax_claims").select("*", {count:"exact"})
        .eq("user_id", auth.user!.id).order("created_at", {ascending:false}));
      setClaims(all);
      const [profilesResult, membersResult] = await Promise.all([
        supabase.from("tax_filing_profiles").select("*").eq("user_id", auth.user.id),
        supabase.from("tax_household_members").select("*").eq("user_id", auth.user.id),
      ]);
      if (profilesResult.error) throw profilesResult.error;
      if (membersResult.error) throw membersResult.error;
      setFilingProfiles((profilesResult.data || []) as TaxFilingProfile[]);
      setHouseholdMembers((membersResult.data || []) as TaxHouseholdMember[]);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const visible = claims.filter(c=>c.tax_year === year);
  const calculation = calculateClaims(claims, year);
  const filingProfile = filingProfiles.find(profile => profile.tax_year === year);
  const isNonResident = filingProfile?.residency_status === "non_resident";
  const pending = visible.filter(c=>c.status !== "confirmed" && c.status !== "rejected").length;
  const rule = TAX_RULES.find(r=>r.id === draft?.rule_id);
  const years = [2025, 2026];
  const showPaymentDate = rule?.mode !== "fixed" || !!draft?.receipt_id;
  const dateCheck = draft && showPaymentDate ? checkClaimDate(draft.dateText, draft.tax_year) : null;
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
    const paymentDate = checkClaimDate(showPaymentDate ? draft.dateText : "", draft.tax_year);
    if (paymentDate.message) {
      Alert.alert(paymentDate.receiptYear ? "Assessment year does not match" : "Check the payment date", paymentDate.message); return;
    }
    if(status==="confirmed") {
      if (filingProfiles.find(profile => profile.tax_year === draft.tax_year)?.residency_status === "non_resident") {
        Alert.alert("Review your filing status", "Your filing profile says non-resident. Personal relief estimates are paused for this year. Check HASiL guidance before confirming a claim."); return;
      }
      if(!rule || draft.tax_year!==rule.year) { Alert.alert("Rules not reviewed","You can save this as a draft. Confirmed estimates are currently available for YA2025."); return; }
      if(!draft.eligibility_confirmed || !draft.beneficiary.trim()) { Alert.alert("Review eligibility","Check the eligibility statement and enter the beneficiary."); return; }
      if(rule.mode!=="fixed" && (!paymentDate.date || eligible<=0 || (!draft.receipt_id && !draft.evidence_note.trim()))) {
        Alert.alert("Add supporting details","Enter the payment date, eligible amount and a reference to your supporting document."); return;
      }
    }
    setBusy(true);
    try {
      const payload = {user_id:userId,tax_year:draft.tax_year,rule_id:draft.rule_id,
        rule_version:rule && draft.tax_year===rule.year ? rule.version:null,receipt_id:draft.receipt_id,
        title:draft.title.trim(),amount,eligible_amount:eligible,status,beneficiary:draft.beneficiary.trim(),
        evidence_note:draft.evidence_note.trim(),eligibility_confirmed:status==="confirmed",
        occurred_on:paymentDate.date,eligible_items:selectedItems};
      const query = draft.id
        ? supabase.from("tax_claims").update(payload).eq("id",draft.id).eq("user_id",userId).eq("updated_at",draft.updated_at)
        : supabase.from("tax_claims").insert(payload);
      const {data,error:e} = await query.select("id").single();
      if(e || !data) throw e || new Error("This claim changed on another device. Reload and review it again.");
      setDraft(null); setReceipt(null); await load();
    } catch(e) { Alert.alert("Could not save claim",errorMessage(e)); }
    finally { setBusy(false); }
  };
  const attachSavedReceipt = async (receiptId: string) => {
    setBusy(true);
    try {
      const {data,error:e} = await supabase.rpc("attach_receipt_tax_claim", {p_receipt_id:receiptId});
      if(e || !data) throw e || new Error("Could not attach this receipt.");
      setReceiptPicker(false);
      await load();
      setYear(data.tax_year);
      await openClaim(data as TaxClaim);
    } catch(e) { Alert.alert("Could not attach receipt",errorMessage(e)); }
    finally {setBusy(false);}
  };
  const loadSavedReceipts = async (reset = true) => {
    setBusy(true);
    try {
      const offset = reset ? 0 : receiptOffset;
      const {data,error:e,count} = await supabase.from("receipts")
        .select("id,merchant_name,total_amount,receipt_date,image_url,items",{count:"exact"})
        .eq("user_id",userId).gte("receipt_date",`${year}-01-01`).lt("receipt_date",`${year+1}-01-01`)
        .order("created_at",{ascending:false}).order("id").range(offset,offset+19);
      if(e) throw e;
      const next = data || [];
      setSavedReceipts(current=>reset ? next : [...current,...next]);
      setReceiptOffset(offset+next.length);
      setMoreReceipts(count !== null && offset+next.length<count);
      setReceiptPicker(true);
    } catch(e) {Alert.alert("Could not load receipts",errorMessage(e));}
    finally {setBusy(false);}
  };
  const processTaxImage = async (base64: string, allowDuplicate = false) => {
    const result = await scanReceiptImage(authenticatedApiFetch, base64, {taxReview:true,allowDuplicate});
    if(result.kind === "duplicate") {
      Alert.alert("Possible duplicate", "A saved receipt has the same merchant, date and amount. Reuse its evidence to avoid recording the purchase twice.",[
        {text:"Cancel",style:"cancel"},
        {text:"Use saved receipt",onPress:()=>void attachSavedReceipt(result.receiptId)},
        {text:"Different purchase",onPress:()=>{
          setBusy(true);
          void processTaxImage(base64,true).catch(e=>Alert.alert("Could not scan receipt",errorMessage(e))).finally(()=>setBusy(false));
        }},
      ]);
      return;
    }
    await load();
    const {data,error:e} = await supabase.from("tax_claims").select("*").eq("receipt_id",result.receipt.id).eq("user_id",userId).single();
    if(e) throw e;
    if (!years.includes(data.tax_year)) {
      Alert.alert("Receipt outside selected years", `This receipt is from YA ${data.tax_year}. Tax Relief currently shows YA 2025 and YA 2026 only.`);
      return;
    }
    setYear(data.tax_year); await openClaim(data);
  };
  const scan = async (camera: boolean) => {
    setBusy(true);
    try {
      if(camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if(!permission.granted) throw new Error("Camera permission is needed to scan a receipt.");
      }
      const options = {quality:1,mediaTypes:["images"] as ImagePicker.MediaType[]};
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if(result.canceled) return;
      const base64 = await prepareReceiptUpload(result.assets[0]);
      await processTaxImage(base64);
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
      <View style={s.guideHelp}><FeatureGuideHelp name="Tax Relief" light
        disabled={!guide.ready || loading || !!error || busy || !!draft || !!image || receiptPicker} onPress={() => guide.open(true)} /></View>
    </View>
    <ScrollView ref={guideScroll} onScroll={guideTargets.measure} scrollEventThrottle={16}
      style={s.page} contentContainerStyle={[s.content, { paddingBottom: 48 + guideTargets.bottomSpace }]} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      {!loading && !error && !busy && <FeatureGuideIntro feature="lhdn" guide={guide} />}
      <FeatureGuideStatus guide={guide} />
      <View ref={guideTargets.ref(0)} collapsable={false} onLayout={(event) => guideTargets.layout(0, event)} style={s.yearTabs}>{years.map(y=><Pressable key={y} onPress={()=>setYear(y)} style={[s.yearTab,y===year && s.yearTabActive]} accessibilityRole="button" accessibilityState={{selected:year===y}}><Text style={[s.yearText,y===year && s.yearTextActive]}>YA {y}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="button" onPress={()=>router.push({pathname:"/tax-filing",params:{year:String(year)}})} style={s.profileEntry}>
        <View style={s.profileIcon}><Ionicons name="document-text-outline" size={24} color="#006B54" /></View>
        <View style={s.actionText}><Text style={s.cardTitle}>Filing profile & family</Text>
          <Text style={s.sub}>{filingProfile ? "Review form guide and family nicknames" : "Check your form and save family nicknames"}</Text></View>
        <Ionicons name="chevron-forward" size={20} color="#006B54" />
      </Pressable>
      {year!==2025 && <Text style={s.notice}>Draft tracking only. Limits for YA {year} have not been reviewed, so no eligible total is shown.</Text>}
      {error ? <View style={s.card}><Text style={s.notice}>Could not load tax claims: {error}</Text>{button("Retry",()=>void load())}</View> : loading ? <ActivityIndicator/> : <>
        <View style={s.hero}><View style={s.heroAccent}/><Text style={s.heroLabel}>Confirmed relief estimate · YA {year}</Text>
          <Text style={s.total}>{isNonResident ? "Estimate paused" : calculation.available ? money(calculation.total) : "Awaiting reviewed rules"}</Text>
          <Text style={s.heroLabel}>{pending} claim{pending===1?"":"s"} to review</Text>
          <Text style={s.heroLabel}>{isNonResident ? "Your filing profile says non-resident. Personal relief may not apply; check HASiL before claiming." : "Based on your confirmations. This is a reduction in taxable income, not a refund or LHDN approval."}</Text></View>
        <Pressable accessibilityRole="button" onPress={()=>router.push({pathname:"/tax-estimate",params:{year:String(year)}})} style={s.profileEntry}>
          <View style={s.profileIcon}><Ionicons name="calculator-outline" size={24} color="#006B54" /></View>
          <View style={s.actionText}><Text style={s.cardTitle}>Annual tax estimate</Text>
            <Text style={s.sub}>{year===2025 ? filingProfile?.business_income_status === "yes" ? "Employment-only estimate paused for business income" : "Compare tax with PCB, zakat and donations" : "Save annual figures as drafts"}</Text></View>
          <Ionicons name="chevron-forward" size={20} color="#006B54" />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={()=>router.push({pathname:"/tax-business",params:{year:String(year)}})} style={s.profileEntry}>
          <View style={s.profileIcon}><Ionicons name="briefcase-outline" size={24} color="#006B54" /></View>
          <View style={s.actionText}><Text style={s.cardTitle}>Business records</Text>
            <Text style={s.sub}>Track freelance or side-hustle money for Form B review</Text></View>
          <Ionicons name="chevron-forward" size={20} color="#006B54" />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={()=>router.push({pathname:"/tax-handoff",params:{year:String(year)}})} style={s.profileEntry}>
          <View style={s.profileIcon}><Ionicons name="file-tray-full-outline" size={24} color="#006B54" /></View>
          <View style={s.actionText}><Text style={s.cardTitle}>Filing preparation</Text>
            <Text style={s.sub}>Review dates, set a check-in and export your notes</Text></View>
          <Ionicons name="chevron-forward" size={20} color="#006B54" />
        </Pressable>
        <View ref={guideTargets.ref(1)} collapsable={false} onLayout={(event) => guideTargets.layout(1, event)} style={s.actions}>
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
        {button("Use a saved receipt",()=>void loadSavedReceipts(),true)}
        <Text style={s.sub}>Reuse a saved receipt to avoid recording the same purchase twice. New scans wait for spending review in Scan. Tax confirmation is separate. Keep original supporting documents.</Text>
        <View ref={guideTargets.ref(2)} collapsable={false} onLayout={(event) => guideTargets.layout(2, event)} style={s.tabBar}>{["Claims","Breakdown"].map(t=><Pressable key={t} style={[s.tab,tab===t&&s.tabActive]} onPress={()=>setTab(t)} accessibilityRole="button" accessibilityState={{selected:tab===t}}><Text style={[s.tabText,tab===t&&s.tabTextActive]}>{t}</Text></Pressable>)}</View>
        {tab==="Breakdown" && isNonResident ? <Text style={s.notice}>The personal-relief breakdown is paused because your filing profile says non-resident. Your claims are still saved.</Text> : tab==="Claims" ? visible.length===0 ? <Text style={s.empty}>No claims for YA {year}. Add a claim or scan a receipt to get started.</Text> :
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
        <Text style={s.sub}>YA2025 relief sources reviewed 25 September 2026. Child/dependent calculations are not yet supported. Filing preparation is a working summary, not a submitted return.</Text>
        {button("Official HASiL relief guidance",()=>void Linking.openURL("https://www.hasil.gov.my/individu/pelepasan-cukai/"),true)}
      </>}
    </ScrollView>
    <Modal visible={!!draft} animationType="slide" onRequestClose={()=>{if(!busy)setDraft(null);}}>
      <SafeAreaView style={s.modalSafe}><KeyboardAvoidingView style={s.flex} behavior={Platform.OS==="ios"?"padding":undefined}>
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            disabled={busy}
            onPress={()=>setDraft(null)}
            style={[s.backButton,busy&&s.disabled]}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text style={s.heading}>Review claim</Text>
        </View>
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
          {householdMembers.some(member=>member.tax_year===draft.tax_year) && <View style={s.field}>
            <Text style={s.label}>Use a saved family nickname</Text>
            <View style={s.row}>{householdMembers.filter(member=>member.tax_year===draft.tax_year).map(member=><Pressable
              key={member.id} disabled={busy} accessibilityRole="button" onPress={()=>patch({beneficiary:member.display_name})}
              style={s.chip}><Text style={s.chipText}>{member.display_name}</Text></Pressable>)}</View>
            <Text style={s.sub}>Choosing a nickname only fills the beneficiary field. You still need to check eligibility.</Text>
          </View>}
          {field("Beneficiary (for example Self or parent’s name)",draft.beneficiary,v=>patch({beneficiary:v}))}
          {showPaymentDate && field("Payment date (YYYY-MM-DD)",draft.dateText,v=>patch({dateText:v}))}
          {dateCheck?.message && <View>
            <Text accessibilityLiveRegion="polite" style={s.notice}>{dateCheck.message}</Text>
            {dateCheck.receiptYear && years.includes(dateCheck.receiptYear) && button(`Use YA${dateCheck.receiptYear}`,()=>patch({tax_year:dateCheck.receiptYear!,rule_version:null}),true)}
          </View>}
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
    <Modal visible={receiptPicker} onRequestClose={()=>{if(!busy)setReceiptPicker(false);}} animationType="slide">
      <SafeAreaView style={s.modalSafe}>
        <ScrollView contentContainerStyle={s.content}>
          <Text accessibilityRole="header" style={s.cardTitle}>Saved receipts · YA {year}</Text>
          <Text style={s.sub}>Choose evidence already in SafeSpend. This does not create or post an expense.</Text>
          {savedReceipts.length===0 && <Text style={s.sub}>No saved receipts for this year yet.</Text>}
          {savedReceipts.map(saved=><Pressable key={saved.id} accessibilityRole="button" disabled={busy}
            onPress={()=>void attachSavedReceipt(saved.id)} style={s.card}>
            <Text style={s.cardTitle}>{saved.merchant_name}</Text>
            <Text style={s.sub}>{saved.receipt_date} · {money(Number(saved.total_amount))}</Text>
          </Pressable>)}
          {busy && <ActivityIndicator accessibilityLabel="Loading receipts"/>}
          {moreReceipts && button("Load more receipts",()=>void loadSavedReceipts(false),true)}
          {button("Close",()=>setReceiptPicker(false),true)}
        </ScrollView>
      </SafeAreaView>
    </Modal>
    {!loading && !error && !busy && !receiptPicker && <FeatureGuideTour feature="lhdn" guide={guide} target={guideTargets.target}
      onMeasure={guideTargets.measure} onAction={(step) => {
        if (step === 0) router.push({ pathname: "/tax-filing", params: { year: String(year) } });
        else {
          if (step === 2) setTab("Breakdown");
          requestAnimationFrame(() => guideTargets.scrollTo(step));
        }
      }} />}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#007F69"},modalSafe:{flex:1,backgroundColor:"#f7fffb"},flex:{flex:1},
  page:{flex:1,backgroundColor:"#f7fffb"},
  header:{minHeight:72,paddingHorizontal:20,alignItems:"center",justifyContent:"center",flexDirection:"row",backgroundColor:"#007F69"},
  guideHelp:{position:"absolute",right:12},
  backButton:{position:"absolute",left:20,width:44,height:44,alignItems:"center",justifyContent:"center",borderRadius:16,backgroundColor:"#006A56",zIndex:1},
  heading:{fontSize:24,fontWeight:"700",color:"#fff",textAlign:"center"},sub:{fontSize:13,color:"#4A665C",lineHeight:20},
  content:{padding:20,gap:18,paddingBottom:48},row:{flexDirection:"row",flexWrap:"wrap",gap:10},
  yearTabs:{flexDirection:"row",gap:10},yearTab:{flex:1,alignItems:"center",paddingVertical:14,backgroundColor:"#E5F4ED",borderRadius:18},
  yearTabActive:{backgroundColor:"#00DAA4"},yearText:{fontSize:15,fontWeight:"600",color:"#23584A"},yearTextActive:{color:"#073F38"},
  hero:{backgroundColor:"#073F38",padding:24,borderRadius:24,gap:10,overflow:"hidden"},
  heroAccent:{position:"absolute",top:-76,right:-56,width:190,height:190,borderRadius:95,backgroundColor:"#087C67"},
  heroLabel:{color:"#DDFBF1",lineHeight:21},total:{fontSize:34,fontWeight:"700",color:"#fff",fontVariant:["tabular-nums"]},
  actions:{gap:12},addAction:{minHeight:74,paddingHorizontal:18,flexDirection:"row",alignItems:"center",gap:14,borderRadius:20,backgroundColor:"#00DAA4"},
  profileEntry:{minHeight:72,paddingHorizontal:16,flexDirection:"row",alignItems:"center",gap:12,borderRadius:18,backgroundColor:"#fff",borderWidth:1,borderColor:"#D8EEE3"},
  profileIcon:{width:42,height:42,alignItems:"center",justifyContent:"center",borderRadius:14,backgroundColor:"#E5F4ED"},
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
  chipText:{color:"#073F38",fontWeight:"600"},
  notice:{color:"#83520a",lineHeight:21},empty:{paddingVertical:30,color:"#526b64",lineHeight:24},
  status:{color:"#00765b",fontWeight:"600"},field:{gap:7},label:{fontSize:14,fontWeight:"500",color:"#093030"},
  input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#bdcfc7",padding:14,borderRadius:10,color:"#093030",fontSize:16},
  item:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#e0eee8"},
});
