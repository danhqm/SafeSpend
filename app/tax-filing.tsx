import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../utils/supabase';
import {
  BusinessIncomeStatus, HouseholdRelationship, ResidencyStatus,
  suggestedFilingForm, TaxFilingProfile, TaxHouseholdMember, relationshipLabel,
} from '../types/tax-filing';

const HASIL_FORMS = 'https://www.hasil.gov.my/individu/pengenalan-cukai-pendapatan-individu/';
const HASIL_RESIDENCY = 'https://www.hasil.gov.my/en/individu/taraf-mastautin/';
const relationships: HouseholdRelationship[] = ['spouse', 'child', 'parent', 'grandparent'];
const message = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';

export default function TaxFilingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string }>();
  const [year, setYear] = useState<2025 | 2026>(params.year === '2026' ? 2026 : 2025);
  const [userId, setUserId] = useState('');
  const [residency, setResidency] = useState<ResidencyStatus>('unsure');
  const [businessIncome, setBusinessIncome] = useState<BusinessIncomeStatus>('unsure');
  const [savedProfile, setSavedProfile] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [members, setMembers] = useState<TaxHouseholdMember[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [memberName, setMemberName] = useState('');
  const [relationship, setRelationship] = useState<HouseholdRelationship>('spouse');
  const [showMemberEditor, setShowMemberEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (active: () => boolean) => {
    setLoading(true); setError('');
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error('Please sign in again.');
      const [profileResult, memberResult] = await Promise.all([
        supabase.from('tax_filing_profiles').select('*').eq('user_id', auth.user.id).eq('tax_year', year).maybeSingle(),
        supabase.from('tax_household_members').select('*').eq('user_id', auth.user.id).eq('tax_year', year).order('created_at'),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (memberResult.error) throw memberResult.error;
      if (!active()) return;
      const profile = profileResult.data as TaxFilingProfile | null;
      setUserId(auth.user.id);
      setResidency(profile?.residency_status ?? 'unsure');
      setBusinessIncome(profile?.business_income_status ?? 'unsure');
      setSavedProfile(!!profile);
      setProfileDirty(false);
      setMembers((memberResult.data ?? []) as TaxHouseholdMember[]);
      setShowMemberEditor(false); setEditingId(null); setMemberName('');
    } catch (e) { if (active()) setError(message(e)); }
    finally { if (active()) setLoading(false); }
  }, [year]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]));

  const saveProfile = async () => {
    if (busy || !userId) return;
    setBusy(true);
    try {
      const { error: saveError } = await supabase.from('tax_filing_profiles').upsert({
        user_id: userId, tax_year: year, residency_status: residency,
        business_income_status: businessIncome,
      }, { onConflict: 'user_id,tax_year' });
      if (saveError) throw saveError;
      setSavedProfile(true);
      setProfileDirty(false);
      Alert.alert('Filing details saved', `Your YA ${year} answers are saved. Check the suggested form with HASiL before filing.`);
    } catch (e) { Alert.alert('Could not save filing details', message(e)); }
    finally { setBusy(false); }
  };

  const saveMember = async () => {
    const name = memberName.trim();
    if (!name || name.length > 80) {
      Alert.alert('Check the name', 'Use a name or nickname between 1 and 80 characters.');
      return;
    }
    if (busy || !userId) return;
    setBusy(true);
    try {
      const details = { display_name: name, relationship };
      const result = editingId
        ? await supabase.from('tax_household_members').update(details).eq('id', editingId).eq('user_id', userId).eq('tax_year', year)
        : await supabase.from('tax_household_members').insert({ ...details, user_id: userId, tax_year: year });
      if (result.error) throw result.error;
      const { data, error: reloadError } = await supabase.from('tax_household_members')
        .select('*').eq('user_id', userId).eq('tax_year', year).order('created_at');
      if (reloadError) throw reloadError;
      setMembers((data ?? []) as TaxHouseholdMember[]);
      setShowMemberEditor(false); setEditingId(null); setMemberName('');
    } catch (e) { Alert.alert('Could not save family member', message(e)); }
    finally { setBusy(false); }
  };

  const removeMember = (member: TaxHouseholdMember) => {
    Alert.alert('Remove family nickname?', `Remove ${member.display_name} from YA ${year}? Existing claim beneficiary text will remain unchanged.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          const { error: removeError } = await supabase.from('tax_household_members')
            .delete().eq('id', member.id).eq('user_id', userId).eq('tax_year', year);
          if (removeError) throw removeError;
          setMembers(current => current.filter(item => item.id !== member.id));
          if (editingId === member.id) { setEditingId(null); setShowMemberEditor(false); }
        } catch (e) { Alert.alert('Could not remove family member', message(e)); }
        finally { setBusy(false); }
      } },
    ]);
  };

  const form = suggestedFilingForm(residency, businessIncome);
  const changeYear = (next: 2025 | 2026) => {
    if (next === year) return;
    if (profileDirty || showMemberEditor) {
      Alert.alert('Discard unsaved changes?', 'Switching assessment years will discard changes you have not saved.', [
        { text: 'Stay here', style: 'cancel' },
        { text: 'Switch year', style: 'destructive', onPress: () => setYear(next) },
      ]);
    } else setYear(next);
  };
  const formText = form === 'BE' ? 'Resident with no business income'
    : form === 'B' ? 'Resident with business income'
    : form === 'M' ? 'Non-resident individual'
    : 'Answer both questions to see a form guide.';
  const choice = <T extends string>(label: string, options: { value: T; title: string }[], value: T, onChange: (next: T) => void) => (
    <View style={styles.question}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.options}>{options.map(option => <Pressable key={option.value}
        accessibilityRole="radio" accessibilityState={{ checked: value === option.value }}
        disabled={busy} onPress={() => onChange(option.value)}
        style={[styles.option, value === option.value && styles.optionActive]}>
        <Text style={[styles.optionText, value === option.value && styles.optionTextActive]}>{option.title}</Text>
      </Pressable>)}</View>
    </View>
  );

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </Pressable>
      <Text style={styles.headerText}>Filing profile</Text>
    </View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.yearTabs}>{([2025, 2026] as const).map(item => <Pressable key={item}
          disabled={busy} onPress={() => changeYear(item)} accessibilityRole="button" accessibilityState={{ selected: year === item }}
          style={[styles.yearTab, year === item && styles.yearTabActive]}>
          <Text style={styles.yearTabText}>YA {item}</Text>
        </Pressable>)}</View>
        {error ? <View style={styles.panel}><Text style={styles.error}>Could not load your filing profile: {error}</Text>
          <Pressable onPress={() => void load(() => true)} style={styles.primary}><Text style={styles.primaryText}>Retry</Text></Pressable></View>
          : loading ? <ActivityIndicator accessibilityLabel="Loading filing profile" color="#007F69" /> : <>
          <View style={styles.intro}>
            <Text style={styles.title}>Find your filing starting point</Text>
            <Text style={styles.introBody}>A short guide based on your answers. SafeSpend does not decide your legal tax status or submit a return.</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About your tax year</Text>
            {choice<ResidencyStatus>('What was your Malaysian tax residency status?', [
              { value: 'resident', title: 'Resident' }, { value: 'non_resident', title: 'Non-resident' }, { value: 'unsure', title: 'Not sure' },
            ], residency, next => { setResidency(next); setProfileDirty(true); })}
            <Text style={styles.helper}>Residency is not determined by days alone. Check the official rules if you are unsure.</Text>
            {choice<BusinessIncomeStatus>('Did you have business income?', [
              { value: 'yes', title: 'Yes' }, { value: 'no', title: 'No' }, { value: 'unsure', title: 'Not sure' },
            ], businessIncome, next => { setBusinessIncome(next); setProfileDirty(true); })}
            <Pressable disabled={busy} onPress={() => void saveProfile()} style={[styles.primary, busy && styles.disabled]}>
              <Text style={styles.primaryText}>{savedProfile ? 'Save changes' : 'Save filing details'}</Text>
            </Pressable>
          </View>

          <View style={styles.result}>
            <View style={styles.resultTop}><Ionicons name="document-text-outline" size={25} color="#C8FFE7" />
              <Text style={styles.resultLabel}>Suggested form to check</Text></View>
            <Text style={styles.resultForm}>{form ? `Form ${form}` : 'Not enough information yet'}</Text>
            <Text style={styles.resultDescription}>{formText}</Text>
            {profileDirty && <Text style={styles.resultCaveat}>Save your answers above to keep this guide for YA {year}.</Text>}
            <Text style={styles.resultCaveat}>This is a guide for common individual cases. Special categories may use other forms. Confirm with HASiL or a qualified tax adviser before filing.</Text>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(HASIL_FORMS)} style={styles.linkRow}>
              <Text style={styles.linkText}>Check official HASiL form guidance</Text><Ionicons name="open-outline" size={18} color="#C8FFE7" />
            </Pressable>
          </View>
          {form === 'B' && savedProfile && !profileDirty && <Pressable accessibilityRole="button"
            onPress={() => router.push({ pathname: '/tax-business', params: { year: String(year) } })} style={styles.businessLink}>
            <Ionicons name="briefcase-outline" size={23} color="#006B54" />
            <View style={styles.flex}><Text style={styles.businessTitle}>Business records</Text>
              <Text style={styles.helper}>Keep freelance income and expense notes for review.</Text></View>
            <Ionicons name="chevron-forward" size={20} color="#006B54" />
          </Pressable>}
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(HASIL_RESIDENCY)} style={styles.inlineLink}>
            <Text style={styles.inlineLinkText}>Read HASiL residency rules</Text><Ionicons name="open-outline" size={17} color="#007F69" />
          </Pressable>

          <View style={styles.section}>
            <View style={styles.sectionHeading}><View style={styles.flex}><Text style={styles.sectionTitle}>Family nicknames</Text>
              <Text style={styles.helper}>Optional names to help you identify beneficiaries in claims.</Text></View>
              <Ionicons name="people-outline" size={25} color="#007F69" /></View>
            {members.length ? members.map(member => <View key={member.id} style={styles.memberRow}>
              <View style={styles.flex}><Text style={styles.memberName}>{member.display_name}</Text>
                <Text style={styles.memberType}>{relationshipLabel[member.relationship]}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${member.display_name}`} onPress={() => {
                setEditingId(member.id); setMemberName(member.display_name); setRelationship(member.relationship); setShowMemberEditor(true);
              }} style={styles.iconButton}><Ionicons name="pencil-outline" size={19} color="#006B54" /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${member.display_name}`} onPress={() => removeMember(member)} style={styles.iconButton}>
                <Ionicons name="trash-outline" size={19} color="#A54445" /></Pressable>
            </View>) : <Text style={styles.helper}>No family nicknames saved for YA {year}.</Text>}
            {!showMemberEditor ? <Pressable accessibilityRole="button" onPress={() => {
              setEditingId(null); setMemberName(''); setRelationship('spouse'); setShowMemberEditor(true);
            }} style={styles.addMember}><Ionicons name="add-circle-outline" size={22} color="#006B54" />
              <Text style={styles.addMemberText}>Add family nickname</Text></Pressable> :
              <View style={styles.editor}>
                <Text style={styles.label}>{editingId ? 'Edit nickname' : 'New nickname'}</Text>
                <TextInput accessibilityLabel="Name or nickname" placeholder="Name or nickname" value={memberName}
                  onChangeText={setMemberName} maxLength={80} style={styles.input} editable={!busy} autoCapitalize="words" />
                {choice<HouseholdRelationship>('Relationship', relationships.map(value => ({ value, title: relationshipLabel[value] })), relationship, setRelationship)}
                <View style={styles.editorActions}>
                  <Pressable onPress={() => { setShowMemberEditor(false); setEditingId(null); }} style={styles.cancel}>
                    <Text style={styles.cancelText}>Cancel</Text></Pressable>
                  <Pressable disabled={busy} onPress={() => void saveMember()} style={[styles.primary, styles.flex, busy && styles.disabled]}>
                    <Text style={styles.primaryText}>Save nickname</Text></Pressable>
                </View>
              </View>}
            <Text style={styles.privacy}>Only a name or nickname and relationship are saved here—no identity numbers or birth dates. Adding someone does not confirm that a relief is claimable.</Text>
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
  headerText: { fontSize: 24, fontWeight: '700', color: '#fff' },
  content: { padding: 20, paddingBottom: 48, gap: 18 },
  yearTabs: { flexDirection: 'row', gap: 10 }, yearTab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 18, backgroundColor: '#E5F4ED' },
  yearTabActive: { backgroundColor: '#00DAA4' }, yearTabText: { color: '#073F38', fontSize: 15, fontWeight: '700' },
  intro: { gap: 7, paddingVertical: 5 }, title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: '#073F38' },
  introBody: { color: '#3E6359', fontSize: 14, lineHeight: 21 },
  section: { gap: 15, padding: 18, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D8EEE3' },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, sectionTitle: { fontSize: 18, fontWeight: '700', color: '#073F38' },
  question: { gap: 9 }, label: { color: '#073F38', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 44, paddingHorizontal: 13, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#E9F5EF' },
  optionActive: { backgroundColor: '#00DAA4' }, optionText: { color: '#28564C', fontWeight: '600' }, optionTextActive: { color: '#073F38' },
  helper: { color: '#4A665C', fontSize: 13, lineHeight: 20 },
  primary: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#007F69' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' }, disabled: { opacity: 0.5 },
  result: { padding: 22, borderRadius: 20, backgroundColor: '#073F38', gap: 9 },
  resultTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, resultLabel: { color: '#C8FFE7', fontWeight: '600' },
  resultForm: { color: '#fff', fontSize: 27, fontWeight: '700' }, resultDescription: { color: '#E6FFF3', fontSize: 15, lineHeight: 22 },
  resultCaveat: { color: '#D2F4E7', fontSize: 13, lineHeight: 20 },
  linkRow: { marginTop: 6, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 }, linkText: { color: '#C8FFE7', fontWeight: '700' },
  inlineLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, inlineLinkText: { color: '#006B54', fontWeight: '700' },
  businessLink: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 16, borderWidth: 1, borderColor: '#D8EEE3', backgroundColor: '#fff' },
  businessTitle: { color: '#073F38', fontWeight: '700', fontSize: 16 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E0EEE8' },
  memberName: { fontSize: 15, color: '#073F38', fontWeight: '700' }, memberType: { color: '#4A665C', fontSize: 13 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addMember: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9 }, addMemberText: { color: '#006B54', fontWeight: '700' },
  editor: { gap: 12, paddingTop: 6 }, input: { minHeight: 48, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#B7D1C5', color: '#073F38', fontSize: 16 },
  editorActions: { flexDirection: 'row', gap: 10 }, cancel: { minHeight: 48, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 12, backgroundColor: '#E5F4ED' },
  cancelText: { color: '#073F38', fontWeight: '700' }, privacy: { color: '#4A665C', fontSize: 13, lineHeight: 20 },
  panel: { gap: 14, padding: 18, backgroundColor: '#fff', borderRadius: 16 }, error: { color: '#984040', lineHeight: 21 },
});
