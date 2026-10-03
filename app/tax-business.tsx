import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';
import { money, parseAmount, validDate } from '../types/tax';
import type { TaxFilingProfile } from '../types/tax-filing';
import { summarizeBusinessRecords } from '../types/tax-business';
import type { TaxBusinessEntry } from '../types/tax-business';

const HASIL_FORMS = 'https://www.hasil.gov.my/individu/pengenalan-cukai-pendapatan-individu/';
const HASIL_RECORDS = 'https://www.hasil.gov.my/individu/soalan-lazim-individu/';
const HASIL_ACCOUNTS = 'https://www.hasil.gov.my/eduzone/kira-dan-kalkulator-cukai/';
type EntryType = 'income' | 'expense';
type Draft = { id: string | null; updated_at: string | null; entry_type: EntryType; title: string; amount: string; occurred_on: string; evidence_ref: string; notes: string };
const blankDraft = (entry_type: EntryType): Draft => ({ id: null, updated_at: null, entry_type, title: '', amount: '', occurred_on: '', evidence_ref: '', notes: '' });
const message = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';
const sorted = (items: TaxBusinessEntry[]) => [...items].sort((a, b) =>
  b.occurred_on.localeCompare(a.occurred_on) || a.id.localeCompare(b.id));

export default function TaxBusinessScreen() {
  const router = useRouter();
  const pageRef = useRef<ScrollView>(null);
  const focusForm = useRef(false);
  const params = useLocalSearchParams<{ year?: string }>();
  const [year, setYear] = useState<2025 | 2026>(params.year === '2026' ? 2026 : 2025);
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<TaxFilingProfile | null>(null);
  const [entries, setEntries] = useState<TaxBusinessEntry[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (active: () => boolean) => {
    setLoading(true); setError('');
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error('Please sign in again.');
      const profileResult = await supabase.from('tax_filing_profiles').select('*')
        .eq('user_id', auth.user.id).eq('tax_year', year).maybeSingle();
      if (profileResult.error) throw profileResult.error;
      const all: TaxBusinessEntry[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase.from('tax_business_entries').select('*')
          .eq('user_id', auth.user.id).eq('tax_year', year)
          .order('occurred_on', { ascending: false }).order('id').range(offset, offset + 499);
        if (result.error) throw result.error;
        all.push(...((result.data ?? []) as TaxBusinessEntry[]));
        if (!result.data || result.data.length < 500) break;
      }
      if (!active()) return;
      setUserId(auth.user.id);
      setProfile(profileResult.data as TaxFilingProfile | null);
      setEntries(all);
      setDraft(null);
      focusForm.current = false;
      setDirty(false);
    } catch (e) { if (active()) setError(message(e)); }
    finally { if (active()) setLoading(false); }
  }, [year]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]));

  const changeYear = (next: 2025 | 2026) => {
    if (next === year) return;
    const switchYear = () => { setDraft(null); focusForm.current = false; setDirty(false); setYear(next); };
    if (dirty) Alert.alert('Discard unsaved entry?', 'Switching years will discard changes to this entry.', [
      { text: 'Stay here', style: 'cancel' },
      { text: 'Switch year', style: 'destructive', onPress: switchYear },
    ]);
    else switchYear();
  };
  const change = (patch: Partial<Draft>) => { setDraft(current => current ? { ...current, ...patch } : null); setDirty(true); };
  const cancel = () => {
    if (dirty) Alert.alert('Discard unsaved entry?', 'Your changes will not be saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => { setDraft(null); setDirty(false); } },
    ]);
    else setDraft(null);
  };
  const goBack = useCallback(() => {
    if (dirty) Alert.alert('Discard unsaved entry?', 'Your changes will not be saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => router.back() },
    ]);
    else router.back();
  }, [dirty, router]);
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android' || !dirty) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { goBack(); return true; });
    return () => listener.remove();
  }, [dirty, goBack]));
  const openDraft = (next: Draft) => {
    focusForm.current = true;
    setDraft(next);
    setDirty(false);
  };
  const save = async () => {
    if (!draft || busy || !userId) return;
    const title = draft.title.trim();
    const amount = parseAmount(draft.amount);
    if (!title || title.length > 120 || amount === null || amount <= 0 || !validDate(draft.occurred_on, year) ||
      draft.evidence_ref.trim().length > 160 || draft.notes.trim().length > 500) {
      Alert.alert('Check this entry', `Enter a title, an amount greater than zero, and a real date in YA ${year} (YYYY-MM-DD). References and notes must fit their limits.`);
      return;
    }
    setBusy(true);
    try {
      const payload = { entry_type: draft.entry_type, title, amount, occurred_on: draft.occurred_on,
        evidence_ref: draft.evidence_ref.trim(), notes: draft.notes.trim() };
      const query = draft.id
        ? supabase.from('tax_business_entries').update(payload).eq('id', draft.id)
          .eq('user_id', userId).eq('tax_year', year).eq('updated_at', draft.updated_at)
        : supabase.from('tax_business_entries').insert({ ...payload, user_id: userId, tax_year: year });
      const { data, error: saveError } = await query.select('*').single();
      if (saveError || !data) throw saveError || new Error('This entry changed on another device. Reload and review it.');
      setEntries(current => sorted([...current.filter(item => item.id !== data.id), data as TaxBusinessEntry]));
      setDraft(null); setDirty(false);
    } catch (e) { Alert.alert('Could not save business entry', message(e)); }
    finally { setBusy(false); }
  };
  const remove = () => {
    if (!draft?.id || busy) return;
    const target = draft;
    Alert.alert('Delete this business entry?', `Remove “${target.title}” from YA ${year}? Keep the original document if it is needed for your records.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete entry', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          const { data, error: deleteError } = await supabase.from('tax_business_entries').delete()
            .eq('id', target.id).eq('user_id', userId).eq('tax_year', year)
            .eq('updated_at', target.updated_at).select('id').single();
          if (deleteError || !data) throw deleteError || new Error('This entry changed on another device. Reload and review it.');
          setEntries(current => current.filter(item => item.id !== target.id));
          setDraft(null); setDirty(false);
        } catch (e) { Alert.alert('Could not delete entry', message(e)); }
        finally { setBusy(false); }
      } },
    ]);
  };
  const totals = summarizeBusinessRecords(entries, year);
  const formBProfile = profile?.residency_status === 'resident' && profile.business_income_status === 'yes';
  const field = (label: string, value: string, onChange: (value: string) => void, options?: { numeric?: boolean; multiline?: boolean; limit?: number; placeholder?: string }) =>
    <View style={styles.field} key={label}><Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!busy}
        keyboardType={options?.numeric ? 'decimal-pad' : 'default'} multiline={options?.multiline}
        maxLength={options?.limit} placeholder={options?.placeholder} placeholderTextColor="#54746A"
        style={[styles.input, options?.multiline && styles.notesInput]} /></View>;
  const link = (label: string, url: string) => <Pressable key={label} accessibilityRole="link"
    onPress={() => void Linking.openURL(url)} style={styles.link}>
    <Text style={styles.linkText}>{label}</Text><Ionicons name="open-outline" size={17} color="#006B54" />
  </Pressable>;

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <Stack.Screen options={{ gestureEnabled: !dirty }} />
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} style={styles.back}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </Pressable><Text style={styles.headerText}>Business records</Text>
    </View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={pageRef} style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.yearTabs}>{([2025, 2026] as const).map(item => <Pressable key={item}
          accessibilityRole="button" accessibilityState={{ selected: year === item }} disabled={busy}
          onPress={() => changeYear(item)} style={[styles.yearTab, year === item && styles.yearTabActive]}>
          <Text style={styles.yearTabText}>YA {item}</Text>
        </Pressable>)}</View>
        {error ? <View style={styles.section}><Text style={styles.error}>Could not load business records: {error}</Text>
          <Pressable onPress={() => void load(() => true)} style={styles.primary}><Text style={styles.primaryText}>Retry</Text></Pressable></View>
          : loading ? <ActivityIndicator accessibilityLabel="Loading business records" color="#007F69" /> : <>
          <Text style={styles.intro}>Keep your side-hustle or freelance money in and out together for YA {year}. These notes do not become a tax return or determine deductible expenses.</Text>
          <View style={styles.status}>
            <Ionicons name={formBProfile ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={24} color="#B6FFE4" />
            <View style={styles.flex}><Text style={styles.statusTitle}>{formBProfile ? 'Form B starting point' : 'Check your filing profile'}</Text>
              <Text style={styles.statusBody}>{formBProfile ? 'You marked resident with business income. Confirm the correct form with HASiL before filing.' : 'Your saved answers do not yet indicate resident business income. Recording an entry does not change your filing status.'}</Text></View>
          </View>
          <Pressable accessibilityRole="button" disabled={!!draft} onPress={() => router.push({ pathname: '/tax-filing', params: { year: String(year) } })} style={[styles.inlineAction, !!draft && styles.disabled]}>
            <Text style={styles.inlineActionText}>Review filing profile</Text><Ionicons name="arrow-forward" size={17} color="#006B54" />
          </Pressable>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recorded activity</Text>
            <View style={styles.totalsRow}><View style={styles.totalCell}><Text style={styles.totalLabel}>Money in</Text>
              <Text style={styles.totalAmount}>{money(totals.income)}</Text></View>
              <View style={styles.totalCell}><Text style={styles.totalLabel}>Money out</Text>
                <Text style={styles.totalAmount}>{money(totals.expense)}</Text></View></View>
            <View style={styles.difference}><Text style={styles.differenceLabel}>Unadjusted difference</Text>
              <Text style={styles.differenceAmount}>{money(totals.difference)}</Text></View>
            <Text style={styles.helper}>This is only the difference between entries you recorded. It is not taxable business profit: omitted items, stock, capital items, private use and tax adjustments may change it.</Text>
          </View>

          {draft ? <View style={styles.section} onLayout={event => {
            if (!focusForm.current) return;
            focusForm.current = false;
            pageRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: true });
          }}>
            <Text style={styles.sectionTitle}>{draft.id ? 'Edit entry' : 'New entry'}</Text>
            <View style={styles.typeTabs}>{(['income', 'expense'] as const).map(type => <Pressable key={type}
              accessibilityRole="radio" accessibilityState={{ checked: draft.entry_type === type }} disabled={busy}
              onPress={() => change({ entry_type: type })} style={[styles.typeTab, draft.entry_type === type && styles.typeTabActive]}>
              <Text style={styles.typeText}>{type === 'income' ? 'Money in' : 'Money out'}</Text>
            </Pressable>)}</View>
            {field('What was this for?', draft.title, value => change({ title: value }), { limit: 120, placeholder: 'e.g. Client design project' })}
            {field('Document date (YYYY-MM-DD)', draft.occurred_on, value => change({ occurred_on: value }), { placeholder: `${year}-05-01` })}
            {field('Amount (RM)', draft.amount, value => change({ amount: value }), { numeric: true, placeholder: '0.00' })}
            {field('Invoice or receipt reference (optional)', draft.evidence_ref, value => change({ evidence_ref: value }), { limit: 160, placeholder: 'Invoice number or document name' })}
            {field('Notes (optional)', draft.notes, value => change({ notes: value }), { limit: 500, multiline: true, placeholder: 'Details to help you review this later' })}
            <Text style={styles.helper}>Use the amount and date on the source document. Verify which year it belongs in when preparing your accounts. An expense entry is not an approved deduction; retain the original invoice or receipt separately.</Text>
            <View style={styles.formActions}><Pressable accessibilityRole="button" disabled={busy} onPress={cancel} style={styles.secondary}>
              <Text style={styles.secondaryText}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[styles.primary, styles.flex, busy && styles.disabled]}>
                <Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save entry'}</Text></Pressable></View>
            {draft.id && <Pressable accessibilityRole="button" disabled={busy} onPress={remove} style={styles.delete}>
              <Text style={styles.deleteText}>Delete this entry</Text></Pressable>}
          </View> : <View style={styles.addActions}>
            <Pressable accessibilityRole="button" onPress={() => openDraft(blankDraft('income'))} style={styles.addIncome}>
              <Ionicons name="add-circle-outline" size={23} color="#fff" /><Text style={styles.addIncomeText}>Add money in</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => openDraft(blankDraft('expense'))} style={styles.addExpense}>
              <Ionicons name="remove-circle-outline" size={23} color="#006B54" /><Text style={styles.addExpenseText}>Add money out</Text></Pressable>
          </View>}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Entries · {totals.count}</Text>
            {entries.length ? entries.map(entry => <Pressable key={entry.id} accessibilityRole="button" disabled={!!draft || busy}
              accessibilityLabel={`${entry.title}, ${entry.entry_type === 'income' ? 'money in' : 'money out'}, ${money(Number(entry.amount))}, ${entry.occurred_on}${entry.evidence_ref ? `, reference ${entry.evidence_ref}` : ''}. Double tap to edit.`}
              onPress={() => openDraft({ id: entry.id, updated_at: entry.updated_at,
                entry_type: entry.entry_type, title: entry.title, amount: String(entry.amount), occurred_on: entry.occurred_on,
                evidence_ref: entry.evidence_ref, notes: entry.notes })} style={styles.entryRow}>
              <View style={styles.entryIcon}><Ionicons name={entry.entry_type === 'income' ? 'arrow-down' : 'arrow-up'} size={20} color="#006B54" /></View>
              <View style={styles.flex}><Text style={styles.entryTitle}>{entry.title}</Text>
                <Text style={styles.entryMeta}>{entry.occurred_on} · {entry.entry_type === 'income' ? 'Money in' : 'Money out'}</Text>
                {!!entry.evidence_ref && <Text style={styles.entryMeta}>Ref: {entry.evidence_ref}</Text>}</View>
              <Text style={styles.entryAmount}>{money(Number(entry.amount))}</Text>
            </Pressable>) : <Text style={styles.helper}>No entries for YA {year}. Add income from an invoice or an expense from a business receipt to start a reviewable list.</Text>}
          </View>

          <View style={styles.sources}><Text style={styles.sectionTitle}>Check official guidance</Text>
            {link('Who uses Form B?', HASIL_FORMS)}
            {link('Record-keeping requirements', HASIL_RECORDS)}
            {link('Business profit-and-loss template', HASIL_ACCOUNTS)}</View>
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
  yearTabs: { flexDirection: 'row', gap: 10 }, yearTab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 16, backgroundColor: '#E5F4ED' },
  yearTabActive: { backgroundColor: '#00DAA4' }, yearTabText: { color: '#073F38', fontSize: 15, fontWeight: '700' },
  intro: { color: '#3E6359', fontSize: 14, lineHeight: 21 },
  status: { flexDirection: 'row', gap: 12, padding: 18, borderRadius: 16, backgroundColor: '#073F38' },
  statusTitle: { color: '#fff', fontWeight: '700', fontSize: 17 }, statusBody: { color: '#D2F4E7', lineHeight: 20, fontSize: 13, marginTop: 4 },
  inlineAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, inlineActionText: { color: '#006B54', fontWeight: '700' },
  section: { padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#D8EEE3', backgroundColor: '#fff', gap: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#073F38' }, helper: { color: '#4A665C', fontSize: 13, lineHeight: 20 },
  totalsRow: { gap: 10 }, totalCell: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, totalLabel: { color: '#4A665C', fontSize: 13 },
  totalAmount: { color: '#073F38', fontWeight: '700', fontSize: 20, fontVariant: ['tabular-nums'] },
  difference: { paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E0EEE8', flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  differenceLabel: { flex: 1, color: '#28564C', fontWeight: '600' }, differenceAmount: { color: '#073F38', fontWeight: '700', fontVariant: ['tabular-nums'] },
  typeTabs: { flexDirection: 'row', gap: 8 }, typeTab: { flex: 1, minHeight: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: '#E9F5EF' },
  typeTabActive: { backgroundColor: '#00DAA4' }, typeText: { color: '#073F38', fontWeight: '700' },
  field: { gap: 7 }, label: { color: '#073F38', fontSize: 14, fontWeight: '600' },
  input: { minHeight: 50, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#B7D1C5', borderRadius: 11, color: '#073F38', fontSize: 16 },
  notesInput: { minHeight: 85, textAlignVertical: 'top' }, formActions: { flexDirection: 'row', gap: 10 },
  primary: { minHeight: 48, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#007F69' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 }, secondary: { minHeight: 48, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 12, backgroundColor: '#E5F4ED' },
  secondaryText: { color: '#073F38', fontWeight: '700' }, disabled: { opacity: 0.5 },
  delete: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, deleteText: { color: '#9B3038', fontWeight: '700' },
  addActions: { flexDirection: 'row', gap: 10 }, addIncome: { flex: 1, minHeight: 52, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#007F69' },
  addIncomeText: { color: '#fff', fontWeight: '700' }, addExpense: { flex: 1, minHeight: 52, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#DDF6E9' },
  addExpenseText: { color: '#006B54', fontWeight: '700' },
  entryRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#E0EEE8' },
  entryIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#E5F4ED', alignItems: 'center', justifyContent: 'center' },
  entryTitle: { color: '#073F38', fontWeight: '700', fontSize: 15 }, entryMeta: { color: '#4A665C', fontSize: 12, marginTop: 3 },
  entryAmount: { color: '#073F38', fontWeight: '700', fontVariant: ['tabular-nums'] },
  sources: { padding: 18, gap: 3 }, link: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, linkText: { color: '#006B54', fontWeight: '700' },
  error: { color: '#984040', lineHeight: 21 },
});
