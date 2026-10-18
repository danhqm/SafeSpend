import type { LatestQuizAttempt, LearningFocus, LearningModuleType,LearningProgress } from '../types/learning.ts';

type PathSummary={id:string;slug:string|null;learning_modules:{id:string;module_type:LearningModuleType;sort_order:number}[]};
export const PATH_FOCUS:Record<string,LearningFocus>={'money-basics':'spending','emergency-savings':'saving','debt-bnpl':'debt'};

export function legacyLearningProgressCount(paths:PathSummary[],progress:LearningProgress[]):number {
  const visible=new Set(paths.flatMap(path=>path.learning_modules.map(module=>module.id)));
  return progress.filter(row=>row.completion_basis==='legacy'&&visible.has(row.module_id)).length;
}

export function learningPeriod(now=new Date()):{monthStart:string;weekStart:string} {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=(name:string)=>Number(parts.find(p=>p.type===name)?.value);
  const day=new Date(Date.UTC(part('year'),part('month')-1,part('day')));
  const monthStart=day.toISOString().slice(0,7)+'-01';
  day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));
  return {monthStart,weekStart:day.toISOString().slice(0,10)};
}

export function chooseLearningNextStep(paths:PathSummary[],completedIds:string[],attempts:LatestQuizAttempt[],focus:LearningFocus|null):{pathId:string;moduleId:string;reason:string}|null {
  const completed=new Set(completedIds);
  const latest=new Map<string,LatestQuizAttempt>();
  for(const a of [...attempts].sort((a,b)=>b.completed_at.localeCompare(a.completed_at))) if(!latest.has(a.module_id)) latest.set(a.module_id,a);
  for(const a of latest.values()) {
    const path=paths.find(p=>p.learning_modules.some(m=>m.id===a.module_id && m.module_type==='quiz'));
    if(path && !a.passed) return {pathId:path.id,moduleId:a.module_id,reason:'Revisit a decision you found tricky'};
  }
  const unfinished=(p:PathSummary)=>[...p.learning_modules].sort((a,b)=>a.sort_order-b.sort_order).find(m=>!completed.has(m.id));
  const path=paths.find(p=>PATH_FOCUS[p.slug||'']===focus && unfinished(p)) || paths.find(unfinished);
  if(!path) return null;
  return {pathId:path.id,moduleId:unfinished(path)!.id,reason:focus && PATH_FOCUS[path.slug||'']===focus ? 'Continue your chosen focus' : 'Build your foundations, one step at a time'};
}
