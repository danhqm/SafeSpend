-- Keep answer-bearing content out of API-readable curriculum and attempts.
create table private.learning_quiz_sets (
  module_id uuid not null references public.learning_modules(id) on delete cascade,
  version integer not null check (version > 0),
  set_index smallint not null check (set_index in (0,1)),
  questions jsonb not null check (jsonb_typeof(questions)='array' and jsonb_array_length(questions)=3),
  primary key(module_id,version,set_index)
);
revoke all on private.learning_quiz_sets from public,anon,authenticated;

insert into private.learning_quiz_sets(module_id,version,set_index,questions)
select m.id,1,0,jsonb_agg(q.value || jsonb_build_object('lessonModuleId',l.id,'slideIndex',0) order by q.ordinality)
from public.learning_modules m
join public.learning_modules l on l.path_id=m.path_id and l.module_type='lesson'
cross join lateral jsonb_array_elements(m.content_payload->'questions') with ordinality q
where m.module_type='quiz' and jsonb_array_length(m.content_payload->'questions')=3
group by m.id;

-- Set 1 practises the same concepts with different, explicitly hypothetical situations.
insert into private.learning_quiz_sets(module_id,version,set_index,questions)
select m.id,1,1,
  case p.slug
  when 'money-basics' then '[
    {"id":"payday-left","prompt":"Hypothetical first pay: RM2,800 received, RM1,800 committed and RM600 planned spending. What remains for other goals?","options":[{"id":"a","label":"RM400"},{"id":"b","label":"RM1,000"},{"id":"c","label":"RM2,800"}],"correctOptionId":"a","explanation":"Subtract both commitments and planned spending: RM2,800 − RM1,800 − RM600 = RM400. This does not establish what you can afford personally."},
    {"id":"payday-plan","prompt":"Your first salary is lower than the example budget. What should you do?","options":[{"id":"a","label":"Borrow to match the example"},{"id":"b","label":"Use actual take-home pay and adjust the plan"},{"id":"c","label":"Ignore bills until next month"}],"correctOptionId":"b","explanation":"A budget must fit money actually received and real commitments. Example ratios are flexible starting points."},
    {"id":"missing-cost","prompt":"You tracked meals but forgot transport. What makes next month’s plan more realistic?","options":[{"id":"a","label":"Assume transport is free"},{"id":"b","label":"Copy someone else’s limit"},{"id":"c","label":"Review records and include transport costs"}],"correctOptionId":"c","explanation":"Use recorded expenses and known commitments together. Missing records do not mean a cost is zero."}
  ]'::jsonb
  when 'emergency-savings' then '[
    {"id":"buffer-first","prompt":"You have no emergency buffer and a small amount available after essentials. What is a reasonable starting step?","options":[{"id":"a","label":"Choose a small repeatable contribution"},{"id":"b","label":"Wait until you can save six months at once"},{"id":"c","label":"Borrow to label the money as savings"}],"correctOptionId":"a","explanation":"Start with an affordable first layer and build gradually. The contribution must fit your commitments."},
    {"id":"buffer-use","prompt":"Which is the clearest example of an emergency-buffer use?","options":[{"id":"a","label":"A planned holiday"},{"id":"b","label":"An unexpected essential repair"},{"id":"c","label":"A flash sale"}],"correctOptionId":"b","explanation":"An unexpected essential cost is different from a planned purchase. Keep planned expenses in their own budget."},
    {"id":"buffer-access","prompt":"What matters most for money set aside for a near-term emergency?","options":[{"id":"a","label":"It is hard to access for years"},{"id":"b","label":"It promises the highest return"},{"id":"c","label":"It is accessible when needed and suited to the risk"}],"correctOptionId":"c","explanation":"An emergency buffer prioritises access and stability. This is a principle, not a recommendation for a particular product."}
  ]'::jsonb
  else '[
    {"id":"debt-total","prompt":"A hypothetical instalment looks small. What should you check before agreeing?","options":[{"id":"a","label":"Total repayment, fees, due dates and existing commitments"},{"id":"b","label":"Only the first payment"},{"id":"c","label":"Only whether it is popular"}],"correctOptionId":"a","explanation":"Small instalments can overlap with other commitments. Compare total cost and repayment terms."},
    {"id":"debt-priority","prompt":"You want to reduce interest cost while meeting required payments. Which principle helps compare repayment priorities?","options":[{"id":"a","label":"Ignore all minimum payments"},{"id":"b","label":"Compare actual borrowing costs and consider higher-cost debt first"},{"id":"c","label":"Choose the newest purchase automatically"}],"correctOptionId":"b","explanation":"Higher-cost-first can reduce interest, subject to actual rates, fees and terms. Continue required payments; smaller-balance-first is another motivation-based approach."},
    {"id":"debt-pause","prompt":"A new BNPL purchase would overlap with several upcoming payments. What is the safer next step?","options":[{"id":"a","label":"Assume future pay will cover everything"},{"id":"b","label":"Open another plan to pay the old one"},{"id":"c","label":"Pause and review all due payments before deciding"}],"correctOptionId":"c","explanation":"Review the combined commitments and timing. Approval for borrowing does not establish affordability."}
  ]'::jsonb end
from public.learning_modules m join public.learning_paths p on p.id=m.path_id
where m.module_type='quiz' and p.slug in ('money-basics','emergency-savings','debt-bnpl');
update private.learning_quiz_sets s set questions=(
 select jsonb_agg(q || jsonb_build_object('lessonModuleId',l.id,'slideIndex',0))
 from jsonb_array_elements(s.questions) q
 join public.learning_modules l on l.path_id=m.path_id and l.module_type='lesson'
) from public.learning_modules m where m.id=s.module_id and s.set_index=1;

-- Direct remediation to the point that teaches the missed concept.
update private.learning_quiz_sets s set questions=(
 select jsonb_agg(q || jsonb_build_object('slideIndex',case
 when q->>'id' in ('flexible-ratio','payday-plan','buffer-first','emergency-gap') then 1
 when q->>'id' in ('budget-data','missing-cost','buffer-access','debt-priority','emergency-location','repayment-order') then 2
 when q->>'id'='debt-pause' then 3
 else coalesce((q->>'slideIndex')::integer,0) end) order by n)
 from jsonb_array_elements(s.questions) with ordinality e(q,n)
);

update public.learning_modules m set content_payload='{"version":1,"requiredCorrect":2}'::jsonb
where exists(select 1 from private.learning_quiz_sets s where s.module_id=m.id);

create table public.user_learning_quiz_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 module_id uuid not null,
 version integer not null,
 set_index smallint not null,
 questions jsonb not null,
 repeated boolean not null,
 answers jsonb,
 result jsonb,
 created_at timestamptz not null default now(),
 submitted_at timestamptz,
 foreign key(module_id,version,set_index) references private.learning_quiz_sets(module_id,version,set_index) on delete cascade
);
create unique index learning_quiz_one_active on public.user_learning_quiz_sessions(user_id,module_id) where submitted_at is null;
create index learning_quiz_history on public.user_learning_quiz_sessions(user_id,module_id,created_at desc);
alter table public.user_learning_quiz_sessions enable row level security;
revoke all on public.user_learning_quiz_sessions from public,anon,authenticated;
grant select on public.user_learning_quiz_sessions to authenticated;
create policy learning_quiz_select_own on public.user_learning_quiz_sessions for select to authenticated using ((select auth.uid())=user_id);
alter table public.user_quiz_attempts add column session_id uuid unique references public.user_learning_quiz_sessions(id) on delete cascade;

create function private.quiz_session_payload(s public.user_learning_quiz_sessions) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('attemptId',s.id,'moduleId',s.module_id,'version',s.version,'setIndex',s.set_index,
 'requiredCorrect',2,'repeated',s.repeated,'questions',s.questions,'feedback',s.result,'answers',s.answers)
$$;
revoke all on function private.quiz_session_payload(public.user_learning_quiz_sessions) from public,anon,authenticated;

create function public.start_learning_quiz(p_module_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid(); v_version integer; v_set private.learning_quiz_sets;
 v_session public.user_learning_quiz_sessions; v_questions jsonb; v_seen integer;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 -- Lock the owner row so concurrent start calls cannot reroll an active attempt.
 perform 1 from auth.users where id=v_user for update;
 select (m.content_payload->>'version')::integer into v_version
 from public.learning_modules m join public.learning_paths p on p.id=m.path_id
 where m.id=p_module_id and m.module_type='quiz' and p.is_published and (p.publish_date is null or p.publish_date<=now());
 if v_version is null then raise exception 'Published quiz not found'; end if;
 select * into v_session from public.user_learning_quiz_sessions where user_id=v_user and module_id=p_module_id and submitted_at is null;
 if found then return private.quiz_session_payload(v_session); end if;
 select s.* into v_set from private.learning_quiz_sets s
 where s.module_id=p_module_id and s.version=v_version
 order by (select max(a.created_at) from public.user_learning_quiz_sessions a where a.user_id=v_user and a.module_id=s.module_id and a.version=s.version and a.set_index=s.set_index) nulls first,s.set_index limit 1;
 if not found then raise exception 'Quiz content is not available'; end if;
 select count(distinct set_index) into v_seen from public.user_learning_quiz_sessions where user_id=v_user and module_id=p_module_id and version=v_version;
 select jsonb_agg(jsonb_build_object('id',q->>'id','prompt',q->>'prompt','options',
   (select jsonb_agg(o order by random()) from jsonb_array_elements(q->'options') o))) into v_questions
 from jsonb_array_elements(v_set.questions) q;
 insert into public.user_learning_quiz_sessions(user_id,module_id,version,set_index,questions,repeated)
 values(v_user,p_module_id,v_version,v_set.set_index,v_questions,v_seen>=2) returning * into v_session;
 return private.quiz_session_payload(v_session);
end $$;

create function public.submit_learning_quiz(p_attempt_id uuid,p_answers jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); s public.user_learning_quiz_sessions; v_questions jsonb; v_score integer; v_feedback jsonb; v_result jsonb;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_answers is null or jsonb_typeof(p_answers)<>'object' or octet_length(p_answers::text)>10000 then raise exception 'Invalid quiz answers'; end if;
 select * into s from public.user_learning_quiz_sessions where id=p_attempt_id and user_id=v_user for update;
 if not found then raise exception 'Quiz attempt not found'; end if;
 if s.submitted_at is not null then
  if s.answers<>p_answers then raise exception 'Answers for a submitted attempt cannot change'; end if;
  return s.result;
 end if;
 if not exists(select 1 from public.learning_modules m join public.learning_paths p on p.id=m.path_id where m.id=s.module_id and p.is_published and (p.publish_date is null or p.publish_date<=now())) then raise exception 'Quiz attempt is no longer published'; end if;
 select questions into v_questions from private.learning_quiz_sets where module_id=s.module_id and version=s.version and set_index=s.set_index;
 if (select count(*) from jsonb_object_keys(p_answers))<>3 or exists(
  select 1 from jsonb_array_elements(v_questions) q where not exists(
   select 1 from jsonb_array_elements(q->'options') o where o->>'id'=p_answers->>(q->>'id') and jsonb_typeof(p_answers->(q->>'id'))='string'
  )) then raise exception 'Answer every question with a valid option'; end if;
 select count(*) filter(where p_answers->>(q->>'id')=q->>'correctOptionId'),
 jsonb_agg(jsonb_build_object('questionId',q->>'id','correctOptionId',q->>'correctOptionId','explanation',q->>'explanation','lessonModuleId',q->>'lessonModuleId','slideIndex',(q->>'slideIndex')::integer))
 into v_score,v_feedback from jsonb_array_elements(v_questions) q;
 v_result:=jsonb_build_object('attemptId',s.id,'score',v_score,'totalQuestions',3,'passed',v_score>=2,'feedback',v_feedback);
 update public.user_learning_quiz_sessions set answers=p_answers,result=v_result,submitted_at=now() where id=s.id;
 insert into public.user_quiz_attempts(user_id,module_id,score,total_questions,passed,answers,session_id) values(v_user,s.module_id,v_score,3,v_score>=2,p_answers,s.id);
 if v_score>=2 then insert into public.user_path_progress(user_id,module_id) values(v_user,s.module_id) on conflict do nothing; end if;
 return v_result;
end $$;

create or replace function public.submit_quiz_attempt(p_module_id uuid,p_answers jsonb)
returns table(score integer,total_questions integer,passed boolean)
language plpgsql security definer set search_path='' as $$
begin raise exception 'Update SafeSpend to continue this knowledge check'; end $$;
revoke all on function public.start_learning_quiz(uuid), public.submit_learning_quiz(uuid,jsonb) from public,anon;
grant execute on function public.start_learning_quiz(uuid), public.submit_learning_quiz(uuid,jsonb) to authenticated;
