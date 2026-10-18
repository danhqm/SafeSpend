import {z} from 'zod';
import {supabaseAdmin} from './supabase.js';

export const lessonSelectorSchema=z.object({moduleId:z.string().uuid(),version:z.number().int().positive()}).strict();
const contentSchema=z.object({version:z.number().int().positive(),slides:z.array(z.object({title:z.string().max(200),body:z.string().max(5000),takeaway:z.string().max(1000).optional()})).min(1).max(20)});

export async function loadFinLessonContext(selector,db=supabaseAdmin){
  const parsed=lessonSelectorSchema.safeParse(selector);
  if(!parsed.success)return null;
  const {data,error}=await db.from('learning_modules')
    .select('id,path_id,title,module_type,content_payload,learning_paths!inner(is_published,publish_date),learning_module_sources(content_sources(title))')
    .eq('id',parsed.data.moduleId).eq('module_type','lesson').maybeSingle();
  if(error)throw new Error('Could not load reviewed lesson');
  const path=Array.isArray(data?.learning_paths)?data.learning_paths[0]:data?.learning_paths;
  const published=path?.publish_date==null || Number.isFinite(Date.parse(path.publish_date))&&Date.parse(path.publish_date)<=Date.now();
  if(!data||data.module_type!=='lesson'||!path?.is_published||!published)return null;
  const content=contentSchema.safeParse(data.content_payload);
  if(!content.success||content.data.version!==parsed.data.version||JSON.stringify(content.data).length>16000||typeof data.title!=='string'||data.title.length>200)return null;
  const sourceTitles=(data.learning_module_sources||[]).flatMap(link=>Array.isArray(link.content_sources)?link.content_sources:[link.content_sources]).filter(s=>typeof s?.title==='string').slice(0,10).map(s=>s.title.slice(0,200));
  return {moduleId:data.id,version:content.data.version,pathId:data.path_id,title:data.title,slides:content.data.slides,sourceTitles};
}
