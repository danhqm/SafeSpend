import assert from 'node:assert/strict';
import test from 'node:test';
import {submitQuizWithRecovery} from '../utils/learning-quiz.ts';
const result={attemptId:'attempt',score:2,totalQuestions:3,passed:true,feedback:[]};
test('a committed score is recovered after a lost response with its original answers',async()=>{
  const saved={q1:'a',q2:'b',q3:'c'};
  const recovered=await submitQuizWithRecovery('attempt',{q1:'changed'},{submit:async()=>{throw new Error('immutable or lost response');},readSession:async()=>({result,answers:saved})});
  assert.deepEqual(recovered,{result,answers:saved});
});
test('unconfirmed submission cannot invent a score and retries use the same answers',async()=>{
  const sent:unknown[]=[];const frozen={q1:'a'};
  await assert.rejects(submitQuizWithRecovery('attempt',frozen,{submit:async(_id,answers)=>{sent.push(answers);throw new Error('offline');},readSession:async()=>({result:null,answers:null})}),/result|confirm/i);
  const recovered=await submitQuizWithRecovery('attempt',frozen,{submit:async(_id,answers)=>{sent.push(answers);return result;},readSession:async()=>{throw new Error('should not read');}});
  assert.deepEqual(sent,[frozen,frozen]);assert.equal(recovered.result.score,2);
});
