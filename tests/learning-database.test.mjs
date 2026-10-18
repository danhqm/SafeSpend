import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import { createTestDatabase, OWNER_ID, OTHER_ID } from './helpers/local-database.mjs';
import {readFile,readdir} from 'node:fs/promises';

let db;
before(async () => { db = await createTestDatabase(); });
after(async () => { await db?.close(); });
async function asUser(id = OWNER_ID) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`);
}
async function rpc(name, values = [], casts = []) {
  return (await db.query(`select public.${name}(${values.map((_, i) => `$${i + 1}${casts[i] || ''}`).join(',')}) as value`, values)).rows[0].value;
}
async function moduleId(kind, slug = 'money-basics') {
  await db.exec('reset role');
  return (await db.query(`select m.id from public.learning_modules m join public.learning_paths p on p.id=m.path_id where m.module_type=$1 and p.slug=$2`, [kind, slug])).rows[0].id;
}
async function correctAnswers(attempt) {
  await db.exec('reset role');
  const { rows } = await db.query('select questions from private.learning_quiz_sets where module_id=$1 and version=$2 and set_index=$3', [attempt.moduleId, attempt.version, attempt.setIndex]);
  await asUser();
  return Object.fromEntries(rows[0].questions.map(q => [q.id, q.correctOptionId]));
}
function isolated(name, run) {
  test(name, async () => {
    await db.exec('begin');
    try { await run(); } finally { await db.exec('rollback; reset role'); }
  });
}

isolated('quiz attempts resume with private keys and stable option order', async () => {
  const id = await moduleId('quiz');
  await asUser();
  const first = await rpc('start_learning_quiz', [id]);
  const again = await rpc('start_learning_quiz', [id]);
  assert.deepEqual(first, again);
  assert.equal(first.questions.length, 3);
  assert.equal(first.requiredCorrect, 2);
  assert.equal(first.repeated, false);
  assert.doesNotMatch(JSON.stringify(first), /correctOptionId|explanation/);
  const publicPayload = (await db.query('select content_payload from public.learning_modules where id=$1', [id])).rows[0];
  assert.doesNotMatch(JSON.stringify(publicPayload), /correctOptionId|explanation/);
  await db.exec('reset role');
  assert.equal((await db.query(`select has_table_privilege('authenticated','private.learning_quiz_sets','select') as allowed`)).rows[0].allowed, false);
});

isolated('quiz scoring is idempotent and new retries use another reviewed set', async () => {
  const id = await moduleId('quiz');
  await asUser();
  const first = await rpc('start_learning_quiz', [id]);
  const answers = await correctAnswers(first);
  const result = await rpc('submit_learning_quiz', [first.attemptId, JSON.stringify(answers)], ['', '::jsonb']);
  assert.equal(result.score, 3);
  assert.equal(result.passed, true);
  assert.equal(result.feedback.length, 3);
  assert.deepEqual(await rpc('submit_learning_quiz', [first.attemptId, JSON.stringify(answers)], ['', '::jsonb']), result);
  const counts = await db.query('select count(*)::int n from public.user_quiz_attempts where session_id=$1', [first.attemptId]);
  assert.equal(counts.rows[0].n, 1);
  const next = await rpc('start_learning_quiz', [id]);
  assert.notEqual(next.setIndex, first.setIndex);
  assert.equal(next.repeated, false);
  const nextAnswers = await correctAnswers(next);
  await rpc('submit_learning_quiz', [next.attemptId, JSON.stringify(nextAnswers)], ['', '::jsonb']);
  assert.equal((await rpc('start_learning_quiz', [id])).repeated, true);
});

isolated('quiz two-of-three rule and a failed retry preserve an earlier pass', async () => {
  const id = await moduleId('quiz');
  await asUser();
  const first = await rpc('start_learning_quiz', [id]);
  const answers = await correctAnswers(first);
  const q = first.questions[0];
  answers[q.id] = q.options.find(o => o.id !== answers[q.id]).id;
  assert.equal((await rpc('submit_learning_quiz', [first.attemptId, JSON.stringify(answers)], ['', '::jsonb'])).passed, true);
  const next = await rpc('start_learning_quiz', [id]);
  const wrong = await correctAnswers(next);
  for (const q of next.questions.slice(0, 2)) wrong[q.id] = q.options.find(o => o.id !== wrong[q.id]).id;
  assert.equal((await rpc('submit_learning_quiz', [next.attemptId, JSON.stringify(wrong)], ['', '::jsonb'])).passed, false);
  assert.equal((await db.query('select count(*)::int n from public.user_path_progress where module_id=$1', [id])).rows[0].n, 1);
});

isolated('content updates do not change the answer key of an already open quiz', async () => {
  const id = await moduleId('quiz');
  await asUser();
  const attempt = await rpc('start_learning_quiz', [id]);
  const answers = await correctAnswers(attempt);
  await db.exec('reset role');
  await db.query(`update public.learning_modules set content_payload='{"version":2,"requiredCorrect":2}' where id=$1`, [id]);
  await asUser();
  assert.equal((await rpc('submit_learning_quiz', [attempt.attemptId, JSON.stringify(answers)], ['', '::jsonb'])).score, 3);
});

isolated('other users cannot see quiz sessions', async () => {
  const id = await moduleId('quiz');
  await asUser();
  const attempt = await rpc('start_learning_quiz', [id]);
  await asUser(OTHER_ID);
  assert.equal((await db.query('select count(*)::int n from public.user_learning_quiz_sessions where id=$1', [attempt.attemptId])).rows[0].n, 0);
});

for (const scenario of ['missing', 'extra', 'unknown option', 'other owner', 'changed replay', 'legacy']) {
  isolated(`quiz rejects ${scenario}`, async () => {
    const id = await moduleId('quiz');
    await asUser();
    const attempt = await rpc('start_learning_quiz', [id]);
    const answers = await correctAnswers(attempt);
    if (scenario === 'missing') delete answers[Object.keys(answers)[0]];
    if (scenario === 'extra') answers.unexpected = 'a';
    if (scenario === 'unknown option') answers[Object.keys(answers)[0]] = 'invented';
    if (scenario === 'other owner') await asUser(OTHER_ID);
    if (scenario === 'changed replay') {
      await rpc('submit_learning_quiz', [attempt.attemptId, JSON.stringify(answers)], ['', '::jsonb']);
      answers[Object.keys(answers)[0]] = 'changed';
    }
    const operation = scenario === 'legacy'
      ? rpc('submit_quiz_attempt', [id, JSON.stringify(answers)], ['', '::jsonb'])
      : rpc('submit_learning_quiz', [attempt.attemptId, JSON.stringify(answers)], ['', '::jsonb']);
    await assert.rejects(operation, scenario === 'legacy' ? /update safespend/i : /answers|attempt|option/i);
  });
}

isolated('savings practice cannot be satisfied by an unrelated grocery goal', async () => {
  const id = await moduleId('action', 'emergency-savings');
  await asUser();
  await db.query(`insert into public.user_goals(user_id,title,week_start) values($1,'Plan groceries',date_trunc('week',now() at time zone 'Asia/Kuala_Lumpur')::date)`, [OWNER_ID]);
  const draft = await rpc('begin_learning_practice', [id]);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.goalId, null);
  assert.equal((await db.query('select count(*)::int n from public.user_path_progress where module_id=$1', [id])).rows[0].n, 0);
});

isolated('structured savings drafts resume and final save creates one linked goal', async () => {
  const id = await moduleId('action', 'emergency-savings');
  await asUser();
  await rpc('begin_learning_practice', [id]);
  const partial = { targetAmount:'1000', firstStep:'Start after payday' };
  await rpc('save_learning_practice', [id,JSON.stringify(partial),false], ['', '::jsonb']);
  assert.deepEqual((await rpc('begin_learning_practice', [id])).draft, partial);
  const full = {...partial,contributionAmount:'50',frequency:'weekly'};
  const saved = await rpc('save_learning_practice', [id,JSON.stringify(full),true], ['', '::jsonb']);
  assert.equal(saved.status, 'saved');
  assert.ok(saved.goalId);
  assert.equal((await rpc('save_learning_practice', [id,JSON.stringify(full),true], ['', '::jsonb'])).goalId,saved.goalId);
  assert.equal((await db.query('select completion_basis from public.user_path_progress where module_id=$1', [id])).rows[0].completion_basis,'plan_saved');
});

isolated('hypothetical debt practice is explicitly labelled without requiring real debt', async () => {
  const id = await moduleId('action','debt-bnpl');
  await asUser();
  await rpc('begin_learning_practice',[id]);
  const result = await rpc('save_learning_practice',[id,JSON.stringify({priority:'Example card',strategy:'highest_cost',reason:'Compare costs before choosing',hypothetical:true}),true],['','::jsonb']);
  const goal = (await db.query('select title,notes from public.user_goals where id=$1',[result.goalId])).rows[0];
  assert.match(goal.title,/practice example/i);
  assert.match(goal.notes,/hypothetical/i);
});

for(const draft of [{targetAmount:'0'},{targetAmount:'NaN'},{targetAmount:'10.123'},{targetAmount:'1',contributionAmount:'-2'}, {title:'Plan groceries'},{targetAmount:'1',firstStep:'x'.repeat(501)}]) {
  isolated(`practice rejects invalid final evidence ${JSON.stringify(draft).slice(0,65)}`,async()=>{
    const id=await moduleId('action','emergency-savings'); await asUser();
    await rpc('begin_learning_practice',[id]);
    await assert.rejects(rpc('save_learning_practice',[id,JSON.stringify(draft),true],['','::jsonb']),/plan|field|amount|step|frequency/i);
  });
}

isolated('practice evidence cannot use another owner or a previous-month budget',async()=>{
  const id=await moduleId('action');
  const {rows}=await db.query(`insert into public.budgets(user_id,month_start,category,amount) values($1,(date_trunc('month',now())-interval '1 month')::date,'ALL',100) returning id`,[OTHER_ID]);
  await asUser(); await rpc('begin_learning_practice',[id]);
  await assert.rejects(rpc('save_learning_practice',[id,JSON.stringify({budgetId:rows[0].id}),true],['','::jsonb']),/budget/i);
});

isolated('clients cannot directly award action completion',async()=>{
  const id=await moduleId('action'); await asUser();
  await assert.rejects(db.query('insert into public.user_path_progress(user_id,module_id) values($1,$2)',[OWNER_ID,id]),/permission|policy/i);
});

isolated('missions follow focus, explain selection and stay stable after focus changes',async()=>{
  await asUser();
  await rpc('set_learning_focus',['saving']);
  const first=await rpc('assign_weekly_money_mission');
  const assignment=(await db.query(`select a.selection_reason,m.category from public.user_weekly_missions a join public.money_mission_templates m on m.id=a.mission_id where a.id=$1`,[first])).rows[0];
  assert.deepEqual(assignment,{selection_reason:'chosen_focus',category:'saving'});
  await rpc('set_learning_focus',['debt']);
  assert.equal(await rpc('assign_weekly_money_mission'),first);
});

isolated('an unresolved failed check takes priority over a chosen mission focus',async()=>{
  const id=await moduleId('quiz'); await asUser();
  const attempt=await rpc('start_learning_quiz',[id]); const answers=await correctAnswers(attempt);
  for(const q of attempt.questions) answers[q.id]=q.options.find(o=>o.id!==answers[q.id]).id;
  await rpc('submit_learning_quiz',[attempt.attemptId,JSON.stringify(answers)],['','::jsonb']);
  await rpc('set_learning_focus',['saving']);
  const assignmentId=await rpc('assign_weekly_money_mission');
  const a=(await db.query(`select a.selection_reason,m.category from public.user_weekly_missions a join public.money_mission_templates m on m.id=a.mission_id where a.id=$1`,[assignmentId])).rows[0];
  assert.deepEqual(a,{selection_reason:'quiz_review',category:'spending'});
});

isolated('learner preferences are owner scoped',async()=>{
  await asUser(); await rpc('set_learning_focus',['debt']); await asUser(OTHER_ID);
  assert.equal((await db.query('select count(*)::int n from public.user_learning_preferences')).rows[0].n,0);
});

isolated('dashboard quiz status returns only the latest owned result per module',async()=>{
  const id=await moduleId('quiz');
  await db.query(`insert into public.user_quiz_attempts(user_id,module_id,score,total_questions,passed,answers,completed_at) values($1,$2,0,3,false,'{}','2026-10-01'),($1,$2,3,3,true,'{}','2026-10-02'),($3,$2,0,3,false,'{}','2026-10-03')`,[OWNER_ID,id,OTHER_ID]);
  await asUser();
  const rows=(await db.query('select * from public.get_learning_quiz_status()')).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].module_id,id);assert.equal(rows[0].passed,true);
});

isolated('practice drafts are private and account deletion cascades without touching another learner',async()=>{
  const action=await moduleId('action','emergency-savings');const quiz=await moduleId('quiz');
  await asUser();await rpc('begin_learning_practice',[action]);await rpc('set_learning_focus',['saving']);await rpc('start_learning_quiz',[quiz]);
  await asUser(OTHER_ID);assert.equal((await db.query('select count(*)::int n from public.user_learning_practice')).rows[0].n,0);
  await rpc('begin_learning_practice',[action]);await rpc('set_learning_focus',['debt']);await rpc('start_learning_quiz',[quiz]);
  await db.exec('reset role');await db.query('delete from auth.users where id=$1',[OWNER_ID]);
  for(const table of ['user_learning_practice','user_learning_preferences','user_learning_quiz_sessions']){
    const rows=(await db.query(`select user_id from public.${table}`)).rows;assert.deepEqual(rows.map(r=>r.user_id),[OTHER_ID]);
  }
});

isolated('unpublished quiz content cannot start an attempt',async()=>{
  const id=await moduleId('quiz');await db.query('update public.learning_paths set is_published=false where id=(select path_id from public.learning_modules where id=$1)',[id]);await asUser();
  await assert.rejects(rpc('start_learning_quiz',[id]),/published/i);
});

isolated('an authenticated API role cannot read the private answer bank',async()=>{
  await asUser();await assert.rejects(db.query('select * from private.learning_quiz_sets'),/permission denied/i);
});

test('learning migration preserves historical action progress, goals and quiz history',async()=>{
  const legacy=await createTestDatabase({through:'20261016161905_global_ai_quota.sql'});
  try{
    const action=(await legacy.query(`select id from public.learning_modules where module_type='action' limit 1`)).rows[0].id;
    const quiz=(await legacy.query(`select id from public.learning_modules where module_type='quiz' limit 1`)).rows[0].id;
    await legacy.query('insert into public.user_path_progress(user_id,module_id) values($1,$2)',[OWNER_ID,action]);
    await legacy.query(`insert into public.user_goals(user_id,title,week_start) values($1,'Existing goal','2026-10-12')`,[OWNER_ID]);
    await legacy.query(`insert into public.user_quiz_attempts(user_id,module_id,score,total_questions,passed,answers) values($1,$2,2,3,true,'{}')`,[OWNER_ID,quiz]);
    const dir=new URL('../supabase/migrations/',import.meta.url);
    for(const name of (await readdir(dir)).filter(n=>n.startsWith('20261018')&&n.endsWith('.sql')).sort())await legacy.exec(await readFile(new URL(name,dir),'utf8'));
    assert.equal((await legacy.query('select completion_basis from public.user_path_progress where module_id=$1',[action])).rows[0].completion_basis,'legacy');
    assert.equal((await legacy.query('select title from public.user_goals')).rows[0].title,'Existing goal');
    assert.equal((await legacy.query('select score from public.user_quiz_attempts')).rows[0].score,2);
  }finally{await legacy.close();}
});

isolated('editing a saved plan preserves the last confirmed evidence and timestamp',async()=>{
  const id=await moduleId('action','emergency-savings');await asUser();await rpc('begin_learning_practice',[id]);
  const confirmed={targetAmount:'1000',contributionAmount:'50',frequency:'weekly',firstStep:'Payday transfer'};
  const saved=await rpc('save_learning_practice',[id,JSON.stringify(confirmed),true],['','::jsonb']);
  const edited=await rpc('save_learning_practice',[id,JSON.stringify({targetAmount:'0'}),false],['','::jsonb']);
  assert.deepEqual(edited.confirmedDraft,confirmed);assert.equal(edited.confirmedAt,saved.confirmedAt);assert.ok(edited.confirmedAt);
  assert.equal(edited.status,'draft');assert.equal(edited.goalId,saved.goalId);
  const reopened=await rpc('begin_learning_practice',[id]);assert.deepEqual(reopened.draft,{targetAmount:'0'});assert.deepEqual(reopened.confirmedDraft,confirmed);
});

isolated('misconception feedback links to the relevant lesson point',async()=>{
  await db.exec('reset role');
  for(const [questionId,slide] of [['buffer-access',2],['debt-priority',2],['debt-pause',3],['flexible-ratio',1],['budget-data',2]]){
    const row=(await db.query(`select (q->>'slideIndex')::int slide from private.learning_quiz_sets s cross join lateral jsonb_array_elements(s.questions) q where q->>'id'=$1`,[questionId])).rows[0];
    assert.equal(row?.slide,slide,questionId);
  }
});

isolated('updating a plan in a later week preserves the old weekly goal',async()=>{
  const id=await moduleId('action','emergency-savings');await asUser();await rpc('begin_learning_practice',[id]);
  const plan={targetAmount:'1000',contributionAmount:'50',frequency:'weekly',firstStep:'Payday transfer'};
  const first=await rpc('save_learning_practice',[id,JSON.stringify(plan),true],['','::jsonb']);
  await db.exec('reset role');await db.query("update public.user_goals set week_start=week_start-7 where id=$1",[first.goalId]);await asUser();
  const next=await rpc('save_learning_practice',[id,JSON.stringify({...plan,firstStep:'New week plan'}),true],['','::jsonb']);
  assert.notEqual(next.goalId,first.goalId);
  assert.equal((await db.query('select count(*)::int n from public.user_goals where id in($1,$2)',[first.goalId,next.goalId])).rows[0].n,2);
});

isolated('budget practice records completion only after explicit current-month confirmation',async()=>{
  const id=await moduleId('action');
  const budget=(await db.query(`insert into public.budgets(user_id,month_start,category,amount) values($1,date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date,'ALL',2000) returning id`,[OWNER_ID])).rows[0].id;
  await asUser();await rpc('begin_learning_practice',[id]);
  await rpc('save_learning_practice',[id,JSON.stringify({budgetId:budget}),false],['','::jsonb']);
  assert.equal((await db.query('select count(*)::int n from public.user_path_progress where module_id=$1',[id])).rows[0].n,0);
  const saved=await rpc('save_learning_practice',[id,JSON.stringify({budgetId:budget}),true],['','::jsonb']);
  assert.equal(saved.budgetId,budget);assert.equal(saved.status,'saved');
});

for(const seen of ['one','both'])isolated(`mission recency chooses ${seen==='one'?'an unseen mission':'the least recently used mission'}`,async()=>{
  const missions=(await db.query("select id from public.money_mission_templates where category='saving' order by rotation_order,id limit 2")).rows;
  assert.equal(missions.length,2);
  await db.query(`insert into public.user_weekly_missions(user_id,mission_id,week_start) values($1,$2,date_trunc('week',now() at time zone 'Asia/Kuala_Lumpur')::date-14)`,[OWNER_ID,missions[0].id]);
  if(seen==='both')await db.query(`insert into public.user_weekly_missions(user_id,mission_id,week_start) values($1,$2,date_trunc('week',now() at time zone 'Asia/Kuala_Lumpur')::date-7)`,[OWNER_ID,missions[1].id]);
  await asUser();await rpc('set_learning_focus',['saving']);const assignment=await rpc('assign_weekly_money_mission');
  assert.equal((await db.query('select mission_id from public.user_weekly_missions where id=$1',[assignment])).rows[0].mission_id,missions[seen==='one'?1:0].id);
});

isolated('unavailable focus missions fall through to the next unfinished path',async()=>{
  await db.query("update public.money_mission_templates set is_published=false where category='saving'");
  await asUser();await rpc('set_learning_focus',['saving']);const assignment=await rpc('assign_weekly_money_mission');
  assert.equal((await db.query('select selection_reason from public.user_weekly_missions where id=$1',[assignment])).rows[0].selection_reason,'next_path');
});

isolated('finished learners receive a rotation mission without fabricated unfinished lessons',async()=>{
  await db.query('insert into public.user_path_progress(user_id,module_id) select $1,id from public.learning_modules',[OWNER_ID]);
  await asUser();const assignment=await rpc('assign_weekly_money_mission');
  assert.equal((await db.query('select selection_reason from public.user_weekly_missions where id=$1',[assignment])).rows[0].selection_reason,'rotation');
});
