import {EvidenceSection} from '@/components/evidence-section';
import {LearningPracticeForm} from '@/components/learning-practice';
import {isLessonPayload,isQuizAttempt,type LearningModule,type LearningProgress,type QuizAttempt,type QuizResult} from '@/types/learning';
import {supabase} from '@/utils/supabase';
import {screenColors as colors} from '@/utils/screen-theme';
import {submitQuizWithRecovery} from '@/utils/learning-quiz';
import {Stack,useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,KeyboardAvoidingView,Platform,ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';

function ActionButton({label,onPress,busy,secondary=false}:{label:string;onPress:()=>void;busy:boolean;secondary?:boolean}){
 return <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} style={[s.button,secondary&&s.secondary,busy&&s.disabled]} onPress={onPress}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{label}</Text></TouchableOpacity>;
}

export default function LearningPathDetailsScreen(){
  const router=useRouter();
  const params=useLocalSearchParams<{pathId:string;title?:string;reviewedAt?:string;moduleId?:string}>();
  const pathId=Array.isArray(params.pathId)?params.pathId[0]:params.pathId;
  const [modules,setModules]=useState<LearningModule[]>([]);
  const [progress,setProgress]=useState<LearningProgress[]>([]);
  const [userId,setUserId]=useState('');
  const [index,setIndex]=useState(0);
  const [slideIndex,setSlideIndex]=useState(0);
  const [attempt,setAttempt]=useState<QuizAttempt|null>(null);
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [frozenAnswers,setFrozenAnswers]=useState<Record<string,string>|null>(null);
  const [result,setResult]=useState<QuizResult|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const generation=useRef(0);
  const selectionKey=useRef('');
  const inFlight=useRef(false);
  const scroll=useRef<ScrollView>(null);
  const current=modules[index];
  const completed=new Set(progress.map(p=>p.module_id));

  useFocusEffect(useCallback(()=>{
    const n=++generation.current;
    void(async()=>{
      setError(null);setLoading(true);
      try{
        const auth=await supabase.auth.getUser();const owner=auth.data.user?.id;
        if(auth.error||!owner||!pathId) throw new Error('Sign in required');
        const [m,p]=await Promise.all([
          supabase.from('learning_modules').select('id,path_id,slug,title,module_type,content_payload,action_trigger,sort_order,estimated_minutes,competency,learning_module_sources(sort_order,evidence_note,content_sources(*))').eq('path_id',pathId).order('sort_order'),
          supabase.from('user_path_progress').select('module_id,completion_basis').eq('user_id',owner),
        ]);
        if(m.error||p.error) throw m.error||p.error;
        if(n!==generation.current||(await supabase.auth.getUser()).data.user?.id!==owner) return;
        const rows=(m.data||[]) as unknown as LearningModule[];
        setUserId(owner);setModules(rows);setProgress(p.data as LearningProgress[]||[]);
        const key=`${pathId}:${params.moduleId||''}`;
        const selectionChanged=selectionKey.current!==key;
        selectionKey.current=key;
        setIndex(old=>{
          const requested=rows.findIndex(row=>row.id===params.moduleId);
          if(selectionChanged)return requested>=0?requested:Math.max(0,rows.findIndex(row=>!p.data?.some(saved=>saved.module_id===row.id)));
          return old<rows.length?old:0;
        });
      }catch{if(n===generation.current)setError('Could not load this path. Check your connection and try again.');}
      finally{if(n===generation.current)setLoading(false);}
    })();
    return()=>{generation.current++;};
  },[pathId,params.moduleId]));
  useEffect(()=>{
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(userId&&session?.user.id!==userId){generation.current++;setModules([]);setProgress([]);setAttempt(null);setAnswers({});setResult(null);setUserId('');setError('Account changed. Reopen Learn to continue.');}
    });return()=>data.subscription.unsubscribe();
  },[userId]);

  const mark=(id:string,basis:LearningProgress['completion_basis'])=>setProgress(p=>[...p.filter(r=>r.module_id!==id),{module_id:id,completion_basis:basis}]);
  const move=(next:number)=>{setIndex(next);setSlideIndex(0);setError(null);scroll.current?.scrollTo({y:0,animated:true});};
  const next=()=>{if(index<modules.length-1)move(index+1);else router.back();};
  const startQuiz=useCallback(async(moduleId:string)=>{
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError(null);
    const n=generation.current;
    try{
      if((await supabase.auth.getUser()).data.user?.id!==userId)throw new Error('Account changed');
      const response=await supabase.rpc('start_learning_quiz',{p_module_id:moduleId});
      if(response.error)throw response.error;
      if(!isQuizAttempt(response.data))throw new Error('Unsupported quiz');
      if(n!==generation.current)return;
      setAttempt(response.data);setAnswers(response.data.answers||{});setFrozenAnswers(null);setResult(response.data.feedback);
    }catch{if(n===generation.current)setError('Could not open this knowledge check. Update SafeSpend if it persists, or try again.');}
    finally{inFlight.current=false;setBusy(false);}
  },[userId]);
  useEffect(()=>{
    if(current?.module_type!=='quiz'||!userId||attempt?.moduleId===current.id||loading)return;
    const timer=setTimeout(()=>void startQuiz(current.id),0);
    return()=>clearTimeout(timer);
  },[current?.id,current?.module_type,userId,attempt?.moduleId,loading,startQuiz]);

  const submit=async()=>{
    if(!attempt||inFlight.current)return;
    if(attempt.questions.some(q=>!answers[q.id])){setError('Choose an answer for each of the three scenarios.');return;}
    inFlight.current=true;setBusy(true);setError(null);const n=generation.current;
    const submitted=frozenAnswers||{...answers};setFrozenAnswers(submitted);
    try{
      if((await supabase.auth.getUser()).data.user?.id!==userId)throw new Error('Account changed');
      const saved=await submitQuizWithRecovery(attempt.attemptId,submitted,{
        submit:async(id,chosen)=>{const response=await supabase.rpc('submit_learning_quiz',{p_attempt_id:id,p_answers:chosen});if(response.error)throw response.error;return response.data as QuizResult;},
        readSession:async(id)=>{const response=await supabase.from('user_learning_quiz_sessions').select('result,answers').eq('id',id).eq('user_id',userId).single();if(response.error)throw response.error;return response.data as {result:QuizResult|null;answers:Record<string,string>|null};},
      });
      if(n!==generation.current)return;
      const scored=saved.result;
      setAnswers(saved.answers);setResult(scored);if(scored.passed)mark(attempt.moduleId,'quiz_passed');
    }catch{if(n===generation.current)setError('Could not retrieve your result. Tap Check my answers again; the same submission will not be counted twice.');}
    finally{inFlight.current=false;setBusy(false);}
  };
  const acknowledge=async()=>{
    if(!current||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError(null);const n=generation.current;
    try{
      if((await supabase.auth.getUser()).data.user?.id!==userId)throw new Error('Account changed');
      const r=await supabase.rpc('acknowledge_learning_lesson',{p_module_id:current.id});if(r.error)throw r.error;
      if(n!==generation.current)return;
      mark(current.id,'lesson_viewed');next();
    }catch{setError('Could not save lesson progress. Please try again.');}finally{inFlight.current=false;setBusy(false);}
  };
  const askFin=(lesson:LearningModule)=>router.push({pathname:'/chatbot',params:{lessonModuleId:lesson.id,lessonVersion:String(lesson.content_payload?.version||1),lessonPathId:pathId}});
  const lesson=current&&isLessonPayload(current.content_payload)?current.content_payload:null;
  const slide=lesson?.slides[Math.min(slideIndex,lesson.slides.length-1)];


  return <><Stack.Screen options={{headerShown:true,title:params.title||'Money Skills'}}/>
  <KeyboardAvoidingView style={s.container} behavior={Platform.OS==='ios'?'padding':undefined} keyboardVerticalOffset={90}>
  <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
    {loading?<ActivityIndicator color="#087D65" size="large"/>:<>
      {error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {!current?<Text style={s.body}>No published steps are available. Reopen Learn to try again.</Text>:<>
        <View style={s.progress}><Text style={s.progressTitle}>Learn → Decide → Apply</Text><Text style={s.progressText}>{progress.filter(p=>modules.some(m=>m.id===p.module_id)).length} of {modules.length} steps recorded</Text></View>
        <View style={s.steps}>{modules.map((m,i)=><TouchableOpacity key={m.id} accessibilityRole="button" accessibilityState={{selected:i===index,disabled:busy}} disabled={busy} onPress={()=>move(i)} style={[s.step,i===index&&s.stepActive]}><Text style={[s.stepText,i===index&&s.stepTextActive]}>{completed.has(m.id)?'✓ ':''}{m.module_type==='lesson'?'Learn':m.module_type==='quiz'?'Decide':'Apply'}</Text></TouchableOpacity>)}</View>
        <Text accessibilityRole="header" style={s.title}>{current.title}</Text>
        <Text style={s.body}>{current.competency}</Text>
        {current.module_type==='lesson'&&slide&&lesson&&<>
          <View style={s.card}><Text style={s.eyebrow}>POINT {slideIndex+1} OF {lesson.slides.length}</Text><Text style={s.heading}>{slide.title}</Text><Text selectable style={s.body}>{slide.body}</Text>{slide.takeaway&&<Text style={s.takeaway}>{slide.takeaway}</Text>}</View>
          {slideIndex>0&&<ActionButton busy={busy} label={'Previous point'} onPress={()=>setSlideIndex(i=>i-1)} secondary={true}/>}
          {<ActionButton busy={busy} label={slideIndex>=lesson.slides.length-1?'Save lesson and continue':'Next point'} onPress={()=>{if(slideIndex>=lesson.slides.length-1)void acknowledge();else setSlideIndex(i=>i+1);}}/>}
          {<ActionButton busy={busy} label={'Ask Fin about this lesson'} onPress={()=>askFin(current)} secondary={true}/>}
        </>}
        {current.module_type==='quiz'&&<>
          {!attempt||attempt.moduleId!==current.id?<>{busy?<ActivityIndicator color="#087D65"/>:<ActionButton busy={busy} label={'Open knowledge check'} onPress={()=>void startQuiz(current.id)}/>}</>:<>
            <Text style={s.takeaway}>Answer all three scenarios. Two correct answers pass this check.</Text>
            {attempt.repeated&&<Text style={s.note}>You have used this practice set before. The reviewed bank currently has two sets.</Text>}
            {attempt.questions.map((q,i)=>{
              const feedback=result?.feedback.find(f=>f.questionId===q.id);
              return <View key={q.id} style={s.card}><Text style={s.eyebrow}>SCENARIO {i+1}</Text><Text style={s.heading}>{q.prompt}</Text>
              {q.options.map(o=><TouchableOpacity key={o.id} accessibilityRole="radio" aria-checked={answers[q.id]===o.id} accessibilityState={{checked:answers[q.id]===o.id,disabled:!!result||busy||!!frozenAnswers}} disabled={!!result||busy||!!frozenAnswers} style={[s.option,answers[q.id]===o.id&&s.selected,feedback?.correctOptionId===o.id&&s.correct]} onPress={()=>setAnswers(a=>({...a,[q.id]:o.id}))}><Text style={s.body}>{answers[q.id]===o.id?'● ':'○ '}{o.label}</Text></TouchableOpacity>)}
              {feedback&&<><Text selectable style={s.body}>{feedback.explanation}</Text>{feedback.correctOptionId!==answers[q.id]&&<ActionButton busy={busy} label={'Review this idea'} onPress={()=>{const target=modules.findIndex(m=>m.id===feedback.lessonModuleId);if(target>=0){move(target);setSlideIndex(feedback.slideIndex);}}} secondary={true}/>}</>}
              </View>;
            })}
            {result?<><View accessibilityLiveRegion="polite" style={s.card}><Text style={s.heading}>{result.passed?'Knowledge check passed':'A chance to practise'}</Text><Text style={s.body}>{result.score} of {result.totalQuestions} correct. {result.passed?'Your pass is saved.':'Review the explanations, then try another scenario set.'}</Text></View>{result.passed&&<ActionButton busy={busy} label={'Continue to practice'} onPress={next}/>}{<ActionButton busy={busy} label={'Try another practice set'} onPress={()=>void startQuiz(current.id)} secondary={true}/>}{<ActionButton busy={busy} label={'Ask Fin to explain the lesson'} onPress={()=>{const l=modules.find(m=>m.module_type==='lesson');if(l)askFin(l);}} secondary={true}/>}</>:<ActionButton busy={busy} label={'Check my answers'} onPress={()=>void submit()}/>}
          </>}
        </>}
        {current.module_type==='action'&&userId&&<><LearningPracticeForm key={`${userId}:${current.id}`} moduleId={current.id} userId={userId} legacy={progress.some(p=>p.module_id===current.id&&p.completion_basis==='legacy')} onSaved={()=>mark(current.id,'plan_saved')}/>{completed.has(current.id)&&<ActionButton busy={busy} label={'Back to Learn'} onPress={()=>router.back()} secondary={true}/>}</>}
        {busy&&<ActivityIndicator accessibilityLabel="Saving learning progress" color="#087D65"/>}
        <EvidenceSection links={current.learning_module_sources||[]} reviewedAt={params.reviewedAt}/>
        <Text style={s.note}>Educational information. Check original sources and current terms before an important financial decision.</Text>
      </>}
    </>}
  </ScrollView></KeyboardAvoidingView></>;
}

const s=StyleSheet.create({
 container:{flex:1,backgroundColor:colors.canvas},content:{padding:20,paddingTop:28,paddingBottom:60,gap:16,maxWidth:780,width:'100%',alignSelf:'center'},
 title:{fontFamily:'Poppins_700Bold',fontSize:26,lineHeight:36,color:colors.teal},heading:{fontFamily:'Poppins_700Bold',fontSize:18,lineHeight:28,color:colors.teal},
 body:{fontFamily:'Poppins_400Regular',fontSize:15,lineHeight:25,color:colors.ink},note:{fontFamily:'Poppins_400Regular',fontSize:12,lineHeight:20,color:colors.ink},
 eyebrow:{fontFamily:'Poppins_700Bold',fontSize:11,letterSpacing:1,color:'#087D65'},progress:{padding:22,borderRadius:24,backgroundColor:colors.teal,gap:6},progressTitle:{fontFamily:'Poppins_700Bold',fontSize:16,color:colors.mint},progressText:{fontFamily:'Poppins_400Regular',fontSize:14,color:colors.surface},
 steps:{flexDirection:'row',gap:8},step:{flex:1,minHeight:48,padding:12,borderRadius:12,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center'},stepActive:{backgroundColor:colors.teal},stepText:{fontFamily:'Poppins_700Bold',fontSize:12,color:colors.teal},stepTextActive:{color:colors.mint},
 card:{padding:20,gap:14,borderRadius:20,backgroundColor:colors.surface},takeaway:{padding:16,borderRadius:14,backgroundColor:colors.field,fontFamily:'Poppins_400Regular',fontSize:14,lineHeight:23,color:colors.teal},
 button:{minHeight:52,padding:14,justifyContent:'center',alignItems:'center',borderRadius:14,backgroundColor:colors.teal},secondary:{backgroundColor:colors.surface},buttonText:{fontFamily:'Poppins_700Bold',fontSize:14,color:colors.mint},secondaryText:{color:colors.teal},disabled:{opacity:0.5},
 option:{padding:13,minHeight:50,borderWidth:1,borderColor:colors.border,borderRadius:12},selected:{borderColor:'#087D65',backgroundColor:colors.surface},correct:{backgroundColor:colors.field,borderColor:'#087D65'},error:{padding:12,color:'#B42318',fontSize:14,lineHeight:23,backgroundColor:'#FFF0ED',borderRadius:12},
});
