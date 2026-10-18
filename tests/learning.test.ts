import assert from 'node:assert/strict';
import test from 'node:test';
import {validatePracticeDraft} from '../utils/learning-action.ts';
import {isQuizAttempt,isQuizPayload} from '../types/learning.ts';

test('partial drafts can be saved but generic goals cannot qualify as a savings plan',()=>{
  assert.equal(validatePracticeDraft('saving',{targetAmount:'1000'}),null);
  assert.ok(validatePracticeDraft('saving',{targetAmount:'1000'},true));
  assert.ok(validatePracticeDraft('saving',{title:'Groceries'} as never,true));
  assert.equal(validatePracticeDraft('saving',{targetAmount:'1000',contributionAmount:'50',frequency:'weekly',firstStep:'Start after payday'},true),null);
});
for(const amount of ['0','NaN','Infinity','-1','1.234','1e3','1000000000',' 10']) test(`practice rejects invalid amount ${amount}`,()=>{
  assert.ok(validatePracticeDraft('saving',{targetAmount:amount,contributionAmount:'10',frequency:'monthly',firstStep:'Start'},true));
});
test('debt practice supports explicit hypotheticals and enforces a reason',()=>{
  assert.ok(validatePracticeDraft('debt',{priority:'Card'},true));
  assert.equal(validatePracticeDraft('debt',{priority:'Example card',strategy:'highest_cost',reason:'Compare actual costs',hypothetical:true},true),null);
  assert.ok(validatePracticeDraft('debt',{reason:'x'.repeat(501)}));
  assert.ok(validatePracticeDraft('budget',{},true));
});
test('public quiz metadata and attempts do not require or accept answer keys',()=>{
  assert.equal(isQuizPayload({version:1,requiredCorrect:2}),true);
  assert.equal(isQuizPayload({version:1,passPercent:67}),false);
  const attempt={attemptId:'a',moduleId:'m',version:1,requiredCorrect:2,questions:[1,2,3].map(n=>({id:String(n),prompt:'Choose',options:[{id:'a',label:'A'},{id:'b',label:'B'}]}))};
  assert.equal(isQuizAttempt(attempt),true);
  assert.equal(isQuizAttempt({...attempt,questions:[]}),false);
  assert.equal(isQuizAttempt({...attempt,questions:[null,...attempt.questions.slice(1)]}),false);
  assert.equal(isQuizAttempt({...attempt,questions:attempt.questions.map(q=>({...q,options:[null]}))}),false);
  assert.equal(isQuizAttempt({...attempt,questions:attempt.questions.map(q=>({...q,correctOptionId:'a'}))}),false);
});
