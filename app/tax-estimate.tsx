import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';
import { calculateClaims, money, parseAmount, RULE_VERSION, TaxClaim } from '../types/tax';
import type { TaxFilingProfile } from '../types/tax-filing';
import type { TaxAnnualInputs } from '../types/tax-estimate';
import {
  estimateResidentEmploymentTax, YA2025_DONATION_SOURCE,
  YA2025_FORM_SOURCE, YA2025_REBATE_SOURCE, YA2025_TAX_RATE_SOURCE,
} from '../types/tax-estimate';

type AmountKey = 'employment_income' | 'pcb_paid' | 'zakat_paid' | 'approved_donations';
type AmountFields = Record<AmountKey, string>;
const emptyFields: AmountFields = { employment_income: '', pcb_paid: '', zakat_paid: '', approved_donations: '' };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';
const asText = (value: number | null | undefined) => value === null || value === undefined ? '' : String(value);

export default function TaxEstimateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string }>();
  const [year, setYear] = useState<2025 | 2026>(params.year === '2026' ? 2026 : 2025);
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<TaxFilingProfile | null>(null);
  const [savedInputs, setSavedInputs] = useState<TaxAnnualInputs | null>(null);
  const [fields, setFields] = useState<AmountFields>(emptyFields);
  const [scopeConfirmed, setScopeConfirmed] = useState(false);
  const [claims, setClaims] = useState<TaxClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (active: () => boolean) => {
    setLoading(true); setError('');
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error('Please sign in again.');
      const [profileResult, inputsResult] = await Promise.all([
        supabase.from('tax_filing_profiles').select('*').eq('user_id', auth.user.id).eq('tax_year', year).maybeSingle(),
        supabase.from('tax_annual_inputs').select('*').eq('user_id', auth.user.id).eq('tax_year', year).maybeSingle(),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (inputsResult.error) throw inputsResult.error;
      const allClaims: TaxClaim[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: claimsError } = await supabase.from('tax_claims').select('*')
          .eq('user_id', auth.user.id).eq('tax_year', year)
          .order('created_at', { ascending: false }).order('id').range(offset, offset + 499);
        if (claimsError) throw claimsError;
        allClaims.push(...((data ?? []) as TaxClaim[]));
        if (!data || data.length < 500) break;
      }
      if (!active()) return;
      const inputs = inputsResult.data as TaxAnnualInputs | null;
      setUserId(auth.user.id);
      setProfile(profileResult.data as TaxFilingProfile | null);
      setSavedInputs(inputs);
      setFields(inputs ? {
        employment_income: asText(inputs.employment_income), pcb_paid: asText(inputs.pcb_paid),
        zakat_paid: asText(inputs.zakat_paid), approved_donations: asText(inputs.approved_donations),
      } : emptyFields);
      setScopeConfirmed(inputs?.scope_confirmed ?? false);
      setClaims(allClaims);
      setDirty(false);
    } catch (e) { if (active()) setError(errorMessage(e)); }
    finally { if (active()) setLoading(false); }
  }, [year]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]));

  const changeYear = (next: 2025 | 2026) => {
    if (next === year) return;
    if (dirty) Alert.alert('Discard unsaved figures?', 'Switching assessment years will discard changes you have not saved.', [
      { text: 'Stay here', style: 'cancel' },
      { text: 'Switch year', style: 'destructive', onPress: () => setYear(next) },
    ]);
    else setYear(next);
  };
  const changeField = (key: AmountKey, value: string) => {
    setFields(current => ({ ...current, [key]: value }));
    setScopeConfirmed(false);
    setDirty(true);
  };
  const save = async () => {
    if (saving || !userId) return;
    const parsed = {} as Record<AmountKey, number | null>;
    for (const key of Object.keys(fields) as AmountKey[]) {
      const raw = fields[key].trim();
      parsed[key] = raw ? parseAmount(raw) : null;
      if (raw && parsed[key] === null) {
        Alert.alert('Check the amount', 'Use non-negative ringgit amounts with up to two decimal places. Leave unknown figures blank.');
        return;
      }
    }
    if (scopeConfirmed && Object.values(parsed).some(value => value === null)) {
      Alert.alert('Complete the figures', 'Enter each annual figure, including 0 when the true amount is zero, before confirming the estimate scope.');
      return;
    }
    setSaving(true);
    try {
      const payload: TaxAnnualInputs = { user_id: userId, tax_year: year,
        employment_income: parsed.employment_income, pcb_paid: parsed.pcb_paid,
        zakat_paid: parsed.zakat_paid, approved_donations: parsed.approved_donations,
        scope_confirmed: scopeConfirmed,
      };
      const { error: saveError } = await supabase.from('tax_annual_inputs')
        .upsert(payload, { onConflict: 'user_id,tax_year' });
      if (saveError) throw saveError;
      setSavedInputs(payload);
      setDirty(false);
      Alert.alert('Annual figures saved', year === 2025 ? 'Your estimate will update as confirmed relief claims change.' : 'YA 2026 figures are saved as a draft; no YA 2025 rates were applied.');
    } catch (e) { Alert.alert('Could not save annual figures', errorMessage(e)); }
    finally { setSaving(false); }
  };

  const confirmedReliefs = calculateClaims(claims, year);
  const hasIndividualRelief = claims.some(claim => claim.tax_year === 2025 &&
    claim.rule_id === 'individual' && claim.rule_version === RULE_VERSION &&
    claim.status === 'confirmed' && claim.eligibility_confirmed);
  const estimate = dirty || !savedInputs ? null :
    estimateResidentEmploymentTax(savedInputs, profile, confirmedReliefs.total, hasIndividualRelief);
  const readyFor2025 = year === 2025 && profile?.residency_status === 'resident' && profile.business_income_status === 'no';

  const field = (key: AmountKey, label: string, help: string) => <View style={styles.field} key={key}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputRow}><Text style={styles.prefix}>RM</Text><TextInput
      accessibilityLabel={label} keyboardType="decimal-pad" placeholder="0.00"
      placeholderTextColor="#54746A" value={fields[key]} onChangeText={value => changeField(key, value)}
      editable={!saving} style={styles.input} /></View>
    <Text style={styles.help}>{help}</Text>
  </View>;
  const detail = (label: string, amount: number, strong = false) => <View style={styles.detailRow} key={label}>
    <Text style={[styles.detailLabel, strong && styles.detailStrong]}>{label}</Text>
    <Text style={[styles.detailAmount, strong && styles.detailStrong]}>{money(amount)}</Text>
  </View>;
  const link = (label: string, url: string) => <Pressable key={label} accessibilityRole="link"
    onPress={() => void Linking.openURL(url)} style={styles.link}>
    <Text style={styles.linkText}>{label}</Text><Ionicons name="open-outline" size={17} color="#006B54" />
  </Pressable>;

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </Pressable><Text style={styles.headerText}>Tax estimate</Text>
    </View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.yearTabs}>{([2025, 2026] as const).map(item => <Pressable key={item}
          accessibilityRole="button" accessibilityState={{ selected: year === item }}
          onPress={() => changeYear(item)} disabled={saving}
          style={[styles.yearTab, year === item && styles.yearTabActive]}>
          <Text style={styles.yearTabText}>YA {item}</Text>
        </Pressable>)}</View>
        {error ? <View style={styles.section}><Text style={styles.error}>Could not load your tax figures: {error}</Text>
          <Pressable onPress={() => void load(() => true)} style={styles.primary}><Text style={styles.primaryText}>Retry</Text></Pressable></View>
          : loading ? <ActivityIndicator accessibilityLabel="Loading tax estimate" color="#007F69" /> : <>
          <Text style={styles.intro}>Compare your estimated tax with PCB already paid. This is for the common resident, employment-only Form BE case—not a filed return.</Text>
          <View style={styles.summary}>
            <View style={styles.summaryTop}><Ionicons name="calculator-outline" size={24} color="#B6FFE4" />
              <Text style={styles.summaryLabel}>YA {year} indicative balance</Text></View>
            {estimate ? <>
              <Text style={styles.summaryAmount}>{money(Math.abs(estimate.balance))}</Text>
              <Text style={styles.summaryStatus}>{estimate.balance < 0 ? 'Possible overpayment' : estimate.balance > 0 ? 'Possible amount remaining' : 'Estimated tax covered by PCB'}</Text>
              <Text style={styles.summaryHelp}>Check every figure in MyTax. A refund or amount payable is decided by HASiL, not SafeSpend.</Text>
            </> : <>
              <Text style={styles.summaryPending}>{year === 2026 ? 'Draft figures only' : dirty ? 'Save to refresh' : 'Not ready yet'}</Text>
              <Text style={styles.summaryHelp}>{year === 2026 ? 'YA 2026 rates and relief rules are not reviewed here.' : dirty ? 'Your changes are not in the saved estimate.' : 'Complete the steps below before an amount is shown.'}</Text>
            </>}
          </View>

          {year === 2025 && !estimate && <View style={styles.section}>
            <Text style={styles.sectionTitle}>What is needed</Text>
            <View style={styles.readinessRow}><Ionicons name={readyFor2025 ? 'checkmark-circle' : 'ellipse-outline'} size={19} color="#007F69" />
              <Text style={styles.help}>Filing profile says resident, with no business income.</Text></View>
            {!readyFor2025 && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/tax-filing', params: { year: '2025' } })} style={styles.inlineAction}>
              <Text style={styles.inlineActionText}>Review filing profile</Text><Ionicons name="arrow-forward" size={17} color="#006B54" /></Pressable>}
            <View style={styles.readinessRow}><Ionicons name={hasIndividualRelief ? 'checkmark-circle' : 'ellipse-outline'} size={19} color="#007F69" />
              <Text style={styles.help}>Individual relief has been confirmed in Tax Relief.</Text></View>
            {!hasIndividualRelief && <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.inlineAction}>
              <Text style={styles.inlineActionText}>Review claims</Text><Ionicons name="arrow-forward" size={17} color="#006B54" /></Pressable>}
            <View style={styles.readinessRow}><Ionicons name={savedInputs?.scope_confirmed && !dirty ? 'checkmark-circle' : 'ellipse-outline'} size={19} color="#007F69" />
              <Text style={styles.help}>Annual figures and the scope declaration are saved.</Text></View>
          </View>}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Annual figures</Text>
            <Text style={styles.help}>Enter totals for YA {year} from your employment and payment records. Do not use take-home pay or SafeSpend transaction totals.</Text>
            {field('employment_income', 'Statutory employment income', 'Use the annual employment-income figure for Form BE B1, including taxable pay and benefits.')}
            {field('pcb_paid', 'PCB / monthly tax deductions paid', 'Enter the total actually withheld for this assessment year. Use 0 if none.')}
            {field('zakat_paid', 'Zakat / fitrah paid', 'Enter qualifying payments to the relevant religious authority. Use 0 if none.')}
            {field('approved_donations', 'Approved institution donations', 'Only gifts to approved institutions under section 44(6) are modeled; check the approval and keep the receipt. Use 0 if none.')}
            {year === 2025 && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: scopeConfirmed }} disabled={saving}
              onPress={() => { setScopeConfirmed(value => !value); setDirty(true); }} style={styles.checkRow}>
              <Ionicons name={scopeConfirmed ? 'checkbox' : 'square-outline'} size={24} color="#006B54" />
              <Text style={styles.checkText}>I am filing separately with Malaysian employment income only, and all reliefs relevant to this estimate are recorded.</Text>
            </Pressable>}
            <Text style={styles.limit}>This estimate does not cover business, rental or foreign income, joint assessment, child relief, spouse rebate, other donation types, professional-fee deductions, or other tax credits. If any apply, leave the declaration unchecked and use this as a record, not a tax estimate.</Text>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.primary, saving && styles.disabled]}>
              <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save annual figures'}</Text>
            </Pressable>
          </View>

          {estimate && <View style={styles.section}>
            <Text style={styles.sectionTitle}>How it was calculated</Text>
            {detail('Employment income', estimate.employmentIncome)}
            {detail('Less approved donations', -estimate.donationAllowed)}
            {estimate.donationOverLimit > 0 && <Text style={styles.limit}>{money(estimate.donationOverLimit)} of entered donations is over the modeled 10% aggregate-income cap.</Text>}
            {detail('Less confirmed reliefs', -estimate.reliefs)}
            {detail('Chargeable income', estimate.chargeableIncome, true)}
            {detail('Tax at YA 2025 resident rates', estimate.taxBeforeRebates)}
            {detail('Less individual rebate', -estimate.personalRebate)}
            {detail('Less zakat rebate used', -estimate.zakatApplied)}
            {detail('Estimated tax after rebates', estimate.taxAfterRebates, true)}
            {detail('Less PCB paid', -estimate.pcbPaid)}
            {detail('Indicative difference', estimate.balance, true)}
            <Text style={styles.limit}>Negative difference means possible overpayment, not an approved refund. Zakat and the RM400 rebate cannot reduce tax below zero.</Text>
          </View>}

          <View style={styles.sources}>
            <Text style={styles.sectionTitle}>Check the official guidance</Text>
            {link('YA 2025 resident tax rates', YA2025_TAX_RATE_SOURCE)}
            {link('Rebates and zakat', YA2025_REBATE_SOURCE)}
            {link('Approved donations', YA2025_DONATION_SOURCE)}
            {link('Form BE downloads and guidance', YA2025_FORM_SOURCE)}
          </View>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#007F69' }, flex: { flex: 1 }, page: { flex: 1, backgroundColor: '#F7FFFB' },
  header: { minHeight: 72, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', backgroundColor: '#007F69' },
  back: { position: 'absolute', left: 20, width: 44, height: 44, borderRadius: 16, backgroundColor: '#006A56', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  headerText: { fontSize: 24, fontWeight: '700', color: '#fff' }, content: { padding: 20, paddingBottom: 48, gap: 18 },
  yearTabs: { flexDirection: 'row', gap: 10 }, yearTab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 18, backgroundColor: '#E5F4ED' },
  yearTabActive: { backgroundColor: '#00DAA4' }, yearTabText: { color: '#073F38', fontSize: 15, fontWeight: '700' },
  intro: { fontSize: 14, lineHeight: 21, color: '#3E6359' },
  summary: { padding: 22, borderRadius: 20, backgroundColor: '#073F38', gap: 8 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, summaryLabel: { color: '#B6FFE4', fontWeight: '700' },
  summaryAmount: { color: '#fff', fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  summaryStatus: { color: '#fff', fontSize: 18, fontWeight: '700' }, summaryPending: { color: '#fff', fontSize: 23, fontWeight: '700' },
  summaryHelp: { color: '#D2F4E7', fontSize: 13, lineHeight: 20 },
  section: { padding: 18, borderRadius: 18, borderWidth: 1, borderColor: '#D8EEE3', backgroundColor: '#fff', gap: 15 },
  sectionTitle: { color: '#073F38', fontSize: 18, fontWeight: '700' },
  field: { gap: 7 }, label: { color: '#073F38', fontSize: 14, fontWeight: '600' },
  inputRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#B7D1C5', borderRadius: 11, overflow: 'hidden' },
  prefix: { paddingHorizontal: 13, color: '#28564C', fontWeight: '700' }, input: { flex: 1, minHeight: 48, color: '#073F38', fontSize: 16, paddingRight: 12 },
  help: { color: '#4A665C', fontSize: 13, lineHeight: 20 }, limit: { color: '#5E6150', fontSize: 13, lineHeight: 20 },
  checkRow: { minHeight: 52, flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 8 },
  checkText: { flex: 1, color: '#073F38', lineHeight: 21, fontSize: 14 },
  primary: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#007F69' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' }, disabled: { opacity: 0.5 },
  inlineAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, inlineActionText: { color: '#006B54', fontWeight: '700' },
  readinessRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  detailLabel: { flex: 1, color: '#3E6359', lineHeight: 20 }, detailAmount: { color: '#073F38', fontVariant: ['tabular-nums'], fontWeight: '600' },
  detailStrong: { color: '#073F38', fontWeight: '700' }, sources: { gap: 2, padding: 18 },
  link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, linkText: { color: '#006B54', fontWeight: '700' },
  error: { color: '#984040', lineHeight: 21 },
});
