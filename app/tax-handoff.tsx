import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { File, Paths } from 'expo-file-system';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';
import { money, calculateClaims, TaxClaim } from '../types/tax';
import { TaxAnnualInputs } from '../types/tax-estimate';
import { TaxBusinessEntry, summarizeBusinessRecords } from '../types/tax-business';
import { TaxFilingProfile, suggestedFilingForm } from '../types/tax-filing';
import { filingDeadline, filingDateState, FILING_PROGRAMME_2026, HASIL_MYTAX, HASIL_RECORDS, handoffSummary, HandoffData } from '../types/tax-handoff';
import { removeTaxCheckIn, scheduleTaxCheckIn, taxCheckIn } from '../utils/tax-reminders';

type Year = 2025 | 2026;
type Reminder = Awaited<ReturnType<typeof taxCheckIn>>;
const message = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';
const malaysiaToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const readableDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
const reminderDefault = () => { const date = new Date(); date.setDate(date.getDate() + 7); return date; };
const temporaryNote = (year: Year) => new File(Paths.cache, `SafeSpend-YA${year}-filing-notes.txt`);
const clearInterruptedExports = () => {
  if (Platform.OS === 'web') return;
  for (const year of [2025, 2026] as const) {
    try { const file = temporaryNote(year); if (file.exists) file.delete(); } catch { /* App-private cache cleanup is best effort. */ }
  }
};

export default function TaxHandoffScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string }>();
  const [year, setYear] = useState<Year>(params.year === '2026' ? 2026 : 2025);
  const [data, setData] = useState<HandoffData | null>(null);
  const [userId, setUserId] = useState('');
  const [reminder, setReminder] = useState<Reminder>(null);
  const [reminderDate, setReminderDate] = useState(reminderDefault);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reminderError, setReminderError] = useState('');
  useEffect(clearInterruptedExports, []);

  const load = useCallback(async (active: () => boolean) => {
    setLoading(true); setError(''); setReminderError(''); setData(null); setReminder(null);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error('Please sign in again.');
      const id = auth.user.id;
      const [profileResult, annualResult] = await Promise.all([
        supabase.from('tax_filing_profiles').select('*').eq('user_id', id).eq('tax_year', year).maybeSingle(),
        supabase.from('tax_annual_inputs').select('*').eq('user_id', id).eq('tax_year', year).maybeSingle(),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (annualResult.error) throw annualResult.error;
      const claims: TaxClaim[] = [];
      const business: TaxBusinessEntry[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from('tax_claims').select('*').eq('user_id', id).eq('tax_year', year)
          .order('created_at').order('id').range(offset, offset + 499);
        if (result.error) throw result.error;
        claims.push(...((result.data ?? []) as TaxClaim[]));
        if ((result.data?.length ?? 0) < 500) break;
      }
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from('tax_business_entries').select('*').eq('user_id', id).eq('tax_year', year)
          .order('occurred_on').order('id').range(offset, offset + 499);
        if (result.error) throw result.error;
        business.push(...((result.data ?? []) as TaxBusinessEntry[]));
        if ((result.data?.length ?? 0) < 500) break;
      }
      let savedReminder: Reminder = null;
      if (Platform.OS !== 'web') {
        try { savedReminder = await taxCheckIn(id, year); }
        catch (e) { if (active()) setReminderError(`Could not read this device's check-in: ${message(e)}`); }
      }
      if (!active()) return;
      setUserId(id);
      setData({ year, profile: profileResult.data as TaxFilingProfile | null,
        annual: annualResult.data as TaxAnnualInputs | null, claims, business });
      setReminder(savedReminder);
    } catch (e) { if (active()) setError(message(e)); }
    finally { if (active()) setLoading(false); }
  }, [year]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]));

  const form = data?.profile ? suggestedFilingForm(data.profile.residency_status, data.profile.business_income_status) : null;
  const deadline = filingDeadline(year, form);
  const total = data ? calculateClaims(data.claims, year) : null;
  const pending = data?.claims.filter(claim => claim.status === 'needs_review').length ?? 0;
  const business = data ? summarizeBusinessRecords(data.business, year) : null;
  const formChanged = !!reminder && reminder.form !== form;

  const share = () => {
    if (!data || busy) return;
    if (Platform.OS === 'web') {
      Alert.alert('Use the mobile app', 'Filing-note file sharing is available on iOS and Android.');
      return;
    }
    Alert.alert('Share private tax notes?', 'This export includes your entered financial figures, claim details and business references. Only share it with a destination you trust.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', onPress: async () => {
        setBusy(true);
        let file: File | null = null;
        try {
          if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
          const generated = new Date().toISOString();
          file = temporaryNote(year);
          file.create({ overwrite: true });
          file.write(handoffSummary(data, generated));
          await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', UTI: 'public.plain-text', dialogTitle: 'Share filing preparation notes' });
        } catch (e) { Alert.alert('Could not export notes', message(e)); }
        finally {
          try { if (file?.exists) file.delete(); } catch { /* The OS may still own a temporary share copy. */ }
          setBusy(false);
        }
      } },
    ]);
  };
  const saveReminder = async () => {
    if (!userId || !form || busy) return;
    setBusy(true);
    try {
      const saved = await scheduleTaxCheckIn(userId, year, form, reminderDate);
      setReminder(saved);
      setShowPicker(false);
      Alert.alert('Check-in set', 'A personal preparation reminder is scheduled on this device. It is not an official filing deadline.');
    } catch (e) { Alert.alert('Could not set check-in', message(e)); }
    finally { setBusy(false); }
  };
  const clearReminder = async () => {
    if (!userId || busy) return;
    setBusy(true);
    try { await removeTaxCheckIn(userId, year); setReminder(null); }
    catch (e) { Alert.alert('Could not remove check-in', message(e)); }
    finally { setBusy(false); }
  };
  const link = (label: string, url: string) => <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(url)} style={styles.link}>
    <Text style={styles.linkText}>{label}</Text><Ionicons name="open-outline" size={17} color="#006B54" />
  </Pressable>;

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </Pressable><Text style={styles.headerText}>Filing preparation</Text>
    </View>
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.yearTabs}>{([2025, 2026] as const).map(value => <Pressable key={value}
        accessibilityRole="button" accessibilityState={{ selected: year === value }}
        disabled={busy} onPress={() => { if (value === year) return; setShowPicker(false); setData(null); setLoading(true); setYear(value); }}
        style={[styles.yearTab, year === value && styles.yearTabActive, busy && styles.disabled]}>
        <Text style={styles.yearText}>YA {value}</Text>
      </Pressable>)}</View>
      {error ? <View style={styles.section}><Text style={styles.warning}>Could not load filing notes: {error}</Text>
        <Pressable onPress={() => void load(() => true)} style={styles.primary}><Text style={styles.primaryText}>Retry</Text></Pressable></View>
        : loading || data?.year !== year ? <ActivityIndicator accessibilityLabel="Loading filing preparation" color="#007F69" /> : data && <>
        <View style={styles.intro}><Text style={styles.title}>Ready when you are</Text>
          <Text style={styles.body}>Gather your figures and evidence before opening MyTax. SafeSpend does not file or approve a return.</Text></View>
        <View style={styles.hero}>
          <View style={styles.heroRow}><Ionicons name="document-text-outline" size={26} color="#B6FFE4" /><Text style={styles.heroSmall}>Form guide · YA {year}</Text></View>
          <Text style={styles.heroTitle}>{form ? `Form ${form}` : 'Form not determined'}</Text>
          <Text style={styles.heroBody}>{form ? 'Based on your saved residency and business-income answers. Confirm the form with HASiL.' : 'Save your filing profile before relying on a form suggestion.'}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/tax-filing', params: { year: String(year) } })} style={styles.heroAction}>
            <Text style={styles.heroActionText}>Review filing profile</Text><Ionicons name="arrow-forward" size={17} color="#073F38" />
          </Pressable>
        </View>
        <View style={styles.section}>
          <View style={styles.sectionHeader}><Ionicons name="calendar-outline" size={23} color="#007F69" /><Text style={styles.sectionTitle}>Filing dates</Text></View>
          {deadline ? <>
            <View style={styles.dateRow}><Text style={styles.rowLabel}>Statutory due date</Text><Text style={styles.rowValue}>{readableDate(deadline.statutory)}</Text></View>
            <View style={styles.dateRow}><Text style={styles.rowLabel}>e-Filing grace through</Text><Text style={styles.rowValue}>{readableDate(deadline.eFilingGrace)}</Text></View>
            <Text style={styles.body}>{filingDateState(deadline.eFilingGrace, malaysiaToday()) === 'past'
              ? 'These YA 2025 dates have passed. Check MyTax or HASiL promptly if you have not filed.'
              : filingDateState(deadline.statutory, malaysiaToday()) === 'past'
                ? `The statutory due date has passed. The verified e-Filing grace runs through ${readableDate(deadline.eFilingGrace)}; check HASiL before filing.`
                : filingDateState(deadline.statutory, malaysiaToday()) === 'today'
                  ? `The statutory due date is today. The verified e-Filing grace runs through ${readableDate(deadline.eFilingGrace)}.`
                  : 'Use the current official programme to check changes before filing.'}</Text>
          </> : <Text style={styles.body}>{year === 2026 ? 'HASiL has not published the YA 2026 individual filing programme in this app. No 2027 deadline is assumed.' : 'This form needs a case-specific deadline check with HASiL.'}</Text>}
          {link('Open HASiL filing programme', FILING_PROGRAMME_2026)}
        </View>
        <View style={styles.section}>
          <View style={styles.sectionHeader}><Ionicons name="list-outline" size={23} color="#007F69" /><Text style={styles.sectionTitle}>Your preparation snapshot</Text></View>
          <View style={styles.dateRow}><Text style={styles.rowLabel}>Claims to review</Text><Text style={styles.rowValue}>{pending}</Text></View>
          <View style={styles.dateRow}><Text style={styles.rowLabel}>Confirmed reliefs</Text><Text style={styles.rowValue}>{year === 2025 && data.profile?.residency_status === 'resident' && total?.available ? money(total.total) : 'Not calculated'}</Text></View>
          <View style={styles.dateRow}><Text style={styles.rowLabel}>Business records</Text><Text style={styles.rowValue}>{business?.count ?? 0}</Text></View>
          {business && business.count > 0 && <Text style={styles.body}>Business money in {money(business.income)} and out {money(business.expense)} are working records, not statutory profit.</Text>}
          {form === 'BE' && business && business.count > 0 && <Text style={styles.warning}>Business entries exist although your profile suggests Form BE. Recheck the correct form before filing.</Text>}
          <Text style={styles.body}>Unreviewed claims and unsupported reliefs never become confirmed totals. Check each amount against its evidence.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/lhdn' })} style={styles.inlineAction}><Text style={styles.inlineText}>Review relief claims</Text><Ionicons name="arrow-forward" size={17} color="#006B54" /></Pressable>
        </View>
        <View style={styles.section}>
          <View style={styles.sectionHeader}><Ionicons name="notifications-outline" size={23} color="#007F69" /><Text style={styles.sectionTitle}>Personal check-in</Text></View>
          <Text style={styles.body}>Choose your own day to review {form ? `Form ${form}` : 'your filing form'} and documents. This device reminder is separate from the official filing deadline.</Text>
          {!!reminderError && <Text style={styles.warning}>{reminderError} You can still use the filing notes.</Text>}
          {Platform.OS === 'web' ? <Text style={styles.body}>Check-ins are available on iOS and Android.</Text> : form ? <>
            {reminder && <Text style={styles.reminderStatus}>Set for {readableDate(reminder.date)}{formChanged ? ` · previously set for Form ${reminder.form}; update it below` : ''}</Text>}
            <Pressable accessibilityRole="button" onPress={() => setShowPicker(true)} style={styles.dateChoice}>
              <Ionicons name="calendar-outline" size={20} color="#006B54" /><Text style={styles.dateChoiceText}>{reminderDate.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              <Ionicons name="chevron-down" size={18} color="#006B54" />
            </Pressable>
            {showPicker && <DateTimePicker value={reminderDate} minimumDate={new Date()} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
              onChange={(event, selected) => { if (Platform.OS !== 'ios') setShowPicker(false); if (event.type === 'set' && selected) setReminderDate(selected); }} />}
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveReminder()} style={[styles.primary, busy && styles.disabled]}>
              <Text style={styles.primaryText}>{reminder ? 'Update check-in' : 'Set check-in'}</Text>
            </Pressable>
            {reminder && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void clearReminder()} style={styles.inlineAction}><Text style={styles.inlineText}>Remove check-in</Text></Pressable>}
          </> : <Text style={styles.body}>Choose a filing profile first to label your check-in.</Text>}
        </View>
        <View style={styles.section}>
          <View style={styles.sectionHeader}><Ionicons name="share-outline" size={23} color="#007F69" /><Text style={styles.sectionTitle}>Take your notes to MyTax</Text></View>
          <Text style={styles.body}>Export a plain-text working summary of your saved annual figures, business entries, confirmed reliefs and claims needing review. Receipt images are not included.</Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={share} style={[styles.primary, busy && styles.disabled]}>
            <Text style={styles.primaryText}>{busy ? 'Preparing…' : 'Export filing notes'}</Text><Ionicons name="share-outline" size={19} color="#fff" />
          </Pressable>
          <Text style={styles.body}>The export is created only when you choose to share it. Treat any saved copy as private financial data.</Text>
          {link('Open MyTax', HASIL_MYTAX)}
          {link('HASiL record-keeping guidance', HASIL_RECORDS)}
        </View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#007F69' }, page: { flex: 1, backgroundColor: '#F7FFFB' },
  header: { minHeight: 72, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', backgroundColor: '#007F69' },
  back: { position: 'absolute', left: 20, width: 44, height: 44, borderRadius: 16, backgroundColor: '#006A56', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  headerText: { fontSize: 24, fontWeight: '700', color: '#fff' }, content: { padding: 20, paddingBottom: 54, gap: 18 },
  yearTabs: { flexDirection: 'row', gap: 10 }, yearTab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#E5F4ED' },
  yearTabActive: { backgroundColor: '#00DAA4' }, yearText: { color: '#073F38', fontSize: 15, fontWeight: '700' },
  intro: { gap: 7 }, title: { fontSize: 22, fontWeight: '700', color: '#073F38' }, body: { color: '#406157', fontSize: 14, lineHeight: 21 },
  hero: { padding: 21, borderRadius: 18, backgroundColor: '#073F38', gap: 9 }, heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroSmall: { color: '#B6FFE4', fontSize: 14, fontWeight: '700' }, heroTitle: { color: '#fff', fontSize: 27, fontWeight: '700' },
  heroBody: { color: '#E5FFF2', fontSize: 14, lineHeight: 21 }, heroAction: { minHeight: 44, marginTop: 7, paddingHorizontal: 13, borderRadius: 12, backgroundColor: '#B6FFE4', flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start' },
  heroActionText: { color: '#073F38', fontWeight: '700' }, section: { padding: 18, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D8EEE3', gap: 13 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, sectionTitle: { color: '#073F38', fontSize: 18, fontWeight: '700', flexShrink: 1 },
  dateRow: { minHeight: 36, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  rowLabel: { color: '#42665A', fontSize: 14, flexShrink: 1 }, rowValue: { color: '#073F38', fontSize: 15, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, linkText: { color: '#006B54', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  inlineAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, inlineText: { color: '#006B54', fontSize: 14, fontWeight: '700' },
  reminderStatus: { color: '#006B54', fontSize: 14, fontWeight: '700', lineHeight: 20 }, dateChoice: { minHeight: 48, borderRadius: 12, backgroundColor: '#E5F4ED', paddingHorizontal: 14, flexDirection: 'row', gap: 10, alignItems: 'center' },
  dateChoiceText: { flex: 1, color: '#073F38', fontSize: 16, fontWeight: '600' },
  primary: { minHeight: 48, borderRadius: 12, backgroundColor: '#007F69', paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 }, disabled: { opacity: 0.5 }, warning: { color: '#974242', lineHeight: 21 },
});
