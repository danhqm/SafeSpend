export type FinLessonSelector={moduleId:string;version:number};
export type FinLessonContext=FinLessonSelector&{pathId:string;title:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseFinLessonSelector(params:{lessonModuleId?:string|string[];lessonVersion?:string|string[]}):FinLessonSelector|null {
  const id=params.lessonModuleId,version=Number(params.lessonVersion);
  return typeof id==='string'&&UUID.test(id)&&Number.isSafeInteger(version)&&version>0 ? {moduleId:id,version} : null;
}
export function applyFinLessonContext(current:FinLessonContext|null,draft:string,incoming:FinLessonContext|null,historyCount=0):{context:FinLessonContext|null;draft:string;needsConfirmation:boolean} {
  const needsConfirmation=!!incoming&&(current?current.moduleId!==incoming.moduleId||current.version!==incoming.version:!!draft.trim()||historyCount>0);
  return {context:needsConfirmation?current:incoming,draft:draft.trim()?draft:incoming?`Help me understand ${incoming.title}. Explain one practical example.`:'',needsConfirmation};
}
export function finReplyMatches(requestGeneration:number,currentGeneration:number,requested:FinLessonContext|null,current:FinLessonContext|null):boolean {
  return requestGeneration===currentGeneration&&requested?.moduleId===current?.moduleId&&requested?.version===current?.version;
}
