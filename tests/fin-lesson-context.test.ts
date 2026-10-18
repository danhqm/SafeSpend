import assert from 'node:assert/strict';
import test from 'node:test';
import {applyFinLessonContext,parseFinLessonSelector,finReplyMatches} from '../utils/fin-lesson-context.ts';

const a={moduleId:'11111111-1111-4111-8111-111111111111',version:1,pathId:'22222222-2222-4222-8222-222222222222',title:'Cash flow'};
const b={...a,moduleId:'33333333-3333-4333-8333-333333333333',title:'Savings'};
test('lesson help fills only an empty draft and never implies sending',()=>{
  assert.match(applyFinLessonContext(null,'',a).draft,/Cash flow/);
  assert.equal(applyFinLessonContext(null,'My question',a).draft,'My question');
  assert.equal(applyFinLessonContext(null,'My question',a).needsConfirmation,true);
  assert.equal(applyFinLessonContext(null,'',a,3).needsConfirmation,true);
  assert.equal(applyFinLessonContext(a,'Draft',a).needsConfirmation,false);
});
test('late Fin replies cannot cross a lesson switch or account-generation change',()=>{
  assert.equal(finReplyMatches(1,2,a,a),false);
  assert.equal(finReplyMatches(1,1,a,b),false);
  assert.equal(finReplyMatches(1,1,a,a),true);
});
test('switching context requires a decision and clearing keeps the draft',()=>{
  assert.equal(applyFinLessonContext(a,'Draft',b).needsConfirmation,true);
  assert.deepEqual(applyFinLessonContext(a,'Draft',null),{context:null,draft:'Draft',needsConfirmation:false});
});
test('invalid navigation selectors never become lesson context',()=>{
  assert.equal(parseFinLessonSelector({lessonModuleId:'../../secret',lessonVersion:'1'}),null);
  assert.equal(parseFinLessonSelector({lessonModuleId:a.moduleId,lessonVersion:'NaN'}),null);
  assert.deepEqual(parseFinLessonSelector({lessonModuleId:a.moduleId,lessonVersion:'1'}),{moduleId:a.moduleId,version:1});
});
