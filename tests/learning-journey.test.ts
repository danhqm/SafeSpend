import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseLearningNextStep, learningPeriod,legacyLearningProgressCount } from '../utils/learning-journey.ts';

const paths = [
  {id:'cash',slug:'money-basics',learning_modules:[{id:'lesson',module_type:'lesson' as const,sort_order:1},{id:'check',module_type:'quiz' as const,sort_order:2}]},
  {id:'buffer',slug:'emergency-savings',learning_modules:[{id:'save',module_type:'action' as const,sort_order:1}]},
];
test('new learners start with cash flow, focus recommends saving without locking paths',()=>{
  assert.equal(chooseLearningNextStep(paths,[],[],null)?.moduleId,'lesson');
  assert.equal(chooseLearningNextStep(paths,[],[],'saving')?.moduleId,'save');
});
test('unresolved failed check takes priority and a later pass resolves it',()=>{
  const attempts=[{module_id:'check',passed:false,completed_at:'2026-10-18T00:00:00Z'}];
  assert.equal(chooseLearningNextStep(paths,[],attempts,'saving')?.moduleId,'check');
  attempts.push({module_id:'check',passed:true,completed_at:'2026-10-18T01:00:00Z'});
  assert.equal(chooseLearningNextStep(paths,[],attempts,'saving')?.moduleId,'save');
});
test('all complete shows no fabricated next action and unknown attempts are ignored',()=>{
  assert.equal(chooseLearningNextStep(paths,['lesson','check','save'],[],null),null);
  assert.equal(chooseLearningNextStep(paths,[],[{module_id:'removed',passed:false,completed_at:'2026-10-18'}],null)?.moduleId,'lesson');
});
test('Malaysia periods work across Sunday midnight and month boundaries regardless of device zone',()=>{
  assert.deepEqual(learningPeriod(new Date('2026-10-18T15:59:00Z')),{monthStart:'2026-10-01',weekStart:'2026-10-12'});
  assert.deepEqual(learningPeriod(new Date('2026-10-18T16:01:00Z')),{monthStart:'2026-10-01',weekStart:'2026-10-19'});
  assert.equal(learningPeriod(new Date('2026-10-31T16:01:00Z')).monthStart,'2026-11-01');
});
test('legacy progress count excludes archived modules that are not in the current paths',()=>{
  assert.equal(legacyLearningProgressCount(paths,[{module_id:'save',completion_basis:'legacy'},{module_id:'archived-action',completion_basis:'legacy'},{module_id:'lesson',completion_basis:'lesson_viewed'}]),1);
});
