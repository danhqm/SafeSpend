import React, {useCallback,useRef,useState} from 'react';
import {ActivityIndicator,Alert,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native';
import {useFocusEffect,useRouter} from 'expo-router';
import type {LearningPractice,PracticeDraft} from '@/types/learning';
import {validatePracticeDraft} from '@/utils/learning-action';
import {learningPeriod} from '@/utils/learning-journey';
import {supabase} from '@/utils/supabase';
import {homeCache} from '@/utils/home-cache';

export function LearningPracticeForm({moduleId,userId,legacy,onSaved}:{moduleId:string;userId:string;legacy:boolean;onSaved:()=>void}) {
  const router=useRouter();
  const [practice,setPractice]=useState<LearningPractice|null>(null);
  const [draft,setDraft]=useState<PracticeDraft>({});
  const [budgets,setBudgets]=useState<{id:string;category:string;amount:number}[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [editing,setEditing]=useState(false);
  const [saveNotice,setSaveNotice]=useState<string|null>(null);
  const generation=useRef(0);
  const saving=useRef(false);
  const editDraft:React.Dispatch<React.SetStateAction<PracticeDraft>>=(next)=>{setSaveNotice(null);setDraft(next);};

  const load=useCallback(async()=>{
    const n=++generation.current;
    setError(null);
    try {
      const auth=await supabase.auth.getUser();
      if(auth.data.user?.id!==userId) throw new Error('Sign in again to continue.');
      const result=await supabase.rpc('begin_learning_practice',{p_module_id:moduleId});
      if(result.error) throw result.error;
      const p=result.data as LearningPractice;
      const rows=p.kind==='budget' ? await supabase.from('budgets').select('id,category,amount').eq('user_id',userId).eq('month_start',learningPeriod().monthStart) : null;
      if(rows?.error) throw rows.error;
      if(n!==generation.current || (await supabase.auth.getUser()).data.user?.id!==userId) return;
      setPractice(p);setDraft(p.draft);setBudgets(rows?.data||[]);
    } catch { if(n===generation.current) setError('Could not load your practice. Please try again.'); }
  },[moduleId,userId]);
  useFocusEffect(useCallback(()=>{void load();return()=>{generation.current++;};},[load]));

  const save=async(confirm:boolean)=>{
    if(!practice || saving.current) return false;
    const invalid=validatePracticeDraft(practice.kind,draft,confirm);
    if(invalid){setError(invalid);return false;}
    saving.current=true;setBusy(true);setError(null);
    try {
      if((await supabase.auth.getUser()).data.user?.id!==userId) throw new Error('Account changed');
      const result=await supabase.rpc('save_learning_practice',{p_module_id:moduleId,p_draft:draft,p_confirm:confirm});
      if(result.error) throw result.error;
      if((await supabase.auth.getUser()).data.user?.id!==userId) return false;
      setPractice(result.data as LearningPractice);setEditing(false);setSaveNotice(confirm?null:'Draft saved. You can return to this path later.');
      if(confirm){onSaved();void homeCache.invalidateFin(userId).catch(()=>{});}
      return true;
    } catch {setError(confirm?'Could not confirm your plan. Check the fields and current-month budget, then try again.':'Could not save your draft. Please try again.');return false;}
    finally {saving.current=false;setBusy(false);}
  };

  return <View style={s.card}>
    <Text style={s.eyebrow}>APPLY · YOUR NEXT STEP</Text>
    {legacy && <Text style={s.note}>Earlier progress is saved. This updated exercise checks a specific plan; the earlier goal was not verified.</Text>}
    {practice?.confirmedAt&&practice.status==='draft'&&<Text style={s.note}>Your earlier confirmed plan is retained while you edit this draft.</Text>}
    {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {saveNotice&&<Text accessibilityLiveRegion="polite" style={s.note}>{saveNotice}</Text>}
    {!practice ? <TouchableOpacity accessibilityRole="button" onPress={()=>void load()} style={s.choice}><Text style={s.body}>{error?'Reload practice':'Loading your practice…'}</Text></TouchableOpacity> : practice.status==='saved' && !editing ? <>
      <Text accessibilityRole="header" style={s.title}>Plan saved</Text>
      <Text style={s.body}>{practice.kind==='saving'?`Target RM${practice.draft.targetAmount} · RM${practice.draft.contributionAmount} ${practice.draft.frequency}. ${practice.draft.firstStep}`:practice.kind==='debt'?`${practice.draft.hypothetical?'Hypothetical practice. ':''}${practice.draft.priority}: ${practice.draft.reason}`:'Your selected monthly budget is linked to this exercise.'}</Text>
      <Text style={s.note}>This records a plan, not proof of a savings transfer or debt repayment.</Text>
      <TouchableOpacity accessibilityRole="button" style={s.choice} onPress={()=>setEditing(true)}><Text style={s.body}>Review or update plan</Text></TouchableOpacity>
    </> : <>
      <Text accessibilityRole="header" style={s.title}>{practice.kind==='budget'?'Choose your monthly budget':practice.kind==='saving'?'Build your first safety buffer':'Choose a repayment priority'}</Text>
      <Text style={s.body}>Save a draft to continue later. Confirm when your plan is ready.</Text>
      <LearningPracticeFields kind={practice.kind} draft={draft} setDraft={editDraft} budgets={budgets} busy={busy} onOpenBudgets={()=>{void save(false).then(saved=>{if(saved) router.push('/budgets');});}}/>
      <TouchableOpacity accessibilityRole="button" style={s.primary} disabled={busy} onPress={()=>void save(true)}>{busy?<ActivityIndicator color="#0E3E3E"/>:<Text style={s.label}>Confirm and save plan</Text>}</TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={s.choice} disabled={busy} onPress={()=>void save(false)}><Text style={s.body}>Save draft for later</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={s.choice} disabled={busy} onPress={()=>Alert.alert('Discard unsaved edits?','Return to your last saved draft.',[{text:'Keep editing',style:'cancel'},{text:'Discard',style:'destructive',onPress:()=>{setDraft(practice.draft);setEditing(false);}}])}><Text style={s.body}>Discard unsaved edits</Text></TouchableOpacity>
    </>}
  </View>;
}

export function LearningPracticeFields({kind,draft,setDraft,budgets,busy,onOpenBudgets}:{kind:LearningPractice['kind'];draft:PracticeDraft;setDraft:React.Dispatch<React.SetStateAction<PracticeDraft>>;budgets:{id:string;category:string;amount:number}[];busy:boolean;onOpenBudgets:()=>void}){
  const field=(label:string,key:keyof PracticeDraft,numeric=false)=><View key={key} style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} style={s.input} value={String(draft[key]??'')} onChangeText={v=>setDraft(d=>({...d,[key]:v}))} maxLength={numeric?20:500} keyboardType={numeric?'decimal-pad':'default'} multiline={!numeric} editable={!busy}/></View>;
  const choice=(label:string,selected:boolean,onPress:()=>void)=><TouchableOpacity key={label} accessibilityRole="radio" aria-checked={selected} accessibilityState={{checked:selected,disabled:busy}} disabled={busy} style={[s.choice,selected&&s.selected]} onPress={onPress}><Text style={s.body}>{selected?'● ':'○ '}{label}</Text></TouchableOpacity>;

 return <View style={{gap:14}}>
      {kind==='budget'?<>
        <Text style={s.note}>Select a positive budget for this month. Opening Budgets alone does not complete this step.</Text>
        {budgets.map(b=>choice(`${b.category==='ALL'?'Overall budget':b.category.replaceAll('_',' ')} · RM${Number(b.amount).toFixed(2)}`,draft.budgetId===b.id,()=>setDraft({budgetId:b.id})))}
        {!budgets.length&&<Text style={s.body}>No budget saved for this month yet.</Text>}
        <TouchableOpacity accessibilityRole="button" disabled={busy} style={s.choice} onPress={onOpenBudgets}><Text style={s.body}>Open Budgets</Text></TouchableOpacity>
      </>:kind==='saving'?<>
        {field('Buffer target (RM)','targetAmount',true)}{field('Planned contribution (RM)','contributionAmount',true)}
        <Text style={s.label}>Contribution frequency</Text>
        {(['weekly','monthly'] as const).map(f=>choice(f==='weekly'?'Every week':'Every month',draft.frequency===f,()=>setDraft(d=>({...d,frequency:f}))))}
        {field('What is your first practical step?','firstStep')}
      </>:<>
        {choice('Use a hypothetical example',draft.hypothetical===true,()=>setDraft(d=>({...d,hypothetical:true})))}
        {choice('Use my own situation',draft.hypothetical===false,()=>setDraft(d=>({...d,hypothetical:false})))}
        <Text style={s.note}>No debt? Use an example. You do not need to enter a real creditor name or balance.</Text>
        {field('Repayment priority or example','priority')}
        {([['highest_cost','Compare higher-cost debt first'],['smallest_balance','Start with a smaller balance'],['avoid_new_debt','Avoid taking on new debt']] as const).map(([value,label])=>choice(label,draft.strategy===value,()=>setDraft(d=>({...d,strategy:value}))))}
        {field('Why does this approach fit?','reason')}
      </>}
 </View>;
}

const s=StyleSheet.create({
  card:{backgroundColor:'#FFFFFF',borderRadius:22,padding:20,gap:14},eyebrow:{fontFamily:'Poppins_700Bold',fontSize:11,color:'#087D65',letterSpacing:1},
  title:{fontFamily:'Poppins_700Bold',fontSize:21,color:'#0E3E3E'},body:{fontFamily:'Poppins_400Regular',fontSize:14,lineHeight:23,color:'#31504A'},
  label:{fontFamily:'Poppins_700Bold',fontSize:14,color:'#0E3E3E'},note:{fontFamily:'Poppins_400Regular',fontSize:12,lineHeight:20,color:'#617470'},
  field:{gap:7},input:{minHeight:50,borderWidth:1,borderColor:'#C9DAD4',borderRadius:12,padding:12,color:'#0E3E3E',fontFamily:'Poppins_400Regular',fontSize:15},
  choice:{minHeight:48,padding:12,borderRadius:12,backgroundColor:'#F1F7F3',borderWidth:1,borderColor:'#D9E6DF',justifyContent:'center'},selected:{borderColor:'#087D65',backgroundColor:'#DFF7E2'},
  primary:{minHeight:52,padding:14,borderRadius:14,backgroundColor:'#00D09E',alignItems:'center',justifyContent:'center'},error:{color:'#B42318',fontSize:14,lineHeight:22},
});
