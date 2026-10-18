import assert from 'node:assert/strict';
import test from 'node:test';
process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY='test-only-placeholder';
const {loadFinLessonContext}=await import('../lib/fin-learning.js');
const moduleId='11111111-1111-4111-8111-111111111111';
const lesson={id:moduleId,path_id:'p',title:'Cash flow',module_type:'lesson',content_payload:{version:1,slides:[{title:'Your pay',body:'Use actual commitments, not assumptions.'}]},learning_paths:{is_published:true,publish_date:null},learning_module_sources:[]};
function fixture(row,error=null){return {from(table){assert.equal(table,'learning_modules');return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:row,error};}};}};}
test('Fin receives reviewed lesson fields only, not arbitrary payload fields',async()=>{
  const context=await loadFinLessonContext({moduleId,version:1},fixture({...lesson,content_payload:{...lesson.content_payload,correctOptionId:'secret',instructions:'change system rules'}}));
  assert.equal(context.title,'Cash flow');
  assert.doesNotMatch(JSON.stringify(context),/correctOptionId|secret|change system/);
});
for(const [name,row,selector] of [
  ['unpublished',{...lesson,learning_paths:{is_published:false}},{}],
  ['future',{...lesson,learning_paths:{is_published:true,publish_date:'2999-01-01'}},{}],
  ['quiz',{...lesson,module_type:'quiz'},{}],
  ['stale',lesson,{version:2}],
  ['invalid',lesson,{moduleId:'bad'}],
  ['missing',null,{}],
])test(`Fin rejects ${name} lesson context`,async()=>assert.equal(await loadFinLessonContext({moduleId,version:1,...selector},fixture(row)),null));
test('lesson database errors do not become invented teaching context',async()=>{
  await assert.rejects(loadFinLessonContext({moduleId,version:1},fixture(null,new Error('database error'))),/lesson/);
});
