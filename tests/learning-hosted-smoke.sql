-- Hosted integration smoke test. All fixture rows and activity roll back.
-- Run as the project's database administrator, never through a client app.
begin;
select set_config('safespend_test.owner',gen_random_uuid()::text,true);
select set_config('safespend_test.other',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select id, 'learning-release-'||id::text||'@example.invalid',jsonb_build_object('username','learn-'||left(id::text,8))
from (select current_setting('safespend_test.owner')::uuid id union all select current_setting('safespend_test.other')::uuid) fixtures;

select set_config('safespend_test.quiz',m.id::text,true)
from public.learning_modules m join public.learning_paths p on p.id=m.path_id where p.slug='money-basics' and m.module_type='quiz';
select set_config('safespend_test.correct',jsonb_object_agg(q->>'id',q->>'correctOptionId')::text,true)
from private.learning_quiz_sets s cross join lateral jsonb_array_elements(s.questions) q
where s.module_id=current_setting('safespend_test.quiz')::uuid and s.version=1 and s.set_index=0;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('safespend_test.owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('safespend_test.owner'),'role','authenticated')::text,true);
do $$
declare first_attempt jsonb; again jsonb; result jsonb; retry jsonb; savings uuid; budget_action uuid;
 plan jsonb; saved jsonb; draft jsonb; assignment uuid; selected_reason text; denied boolean; owned_budget uuid;
begin
 first_attempt:=public.start_learning_quiz(current_setting('safespend_test.quiz')::uuid);
 again:=public.start_learning_quiz(current_setting('safespend_test.quiz')::uuid);
 if first_attempt<>again then raise exception 'FAIL: active quiz did not resume'; end if;
 if first_attempt::text like '%correctOptionId%' then raise exception 'FAIL: public answer key'; end if;
 result:=public.submit_learning_quiz((first_attempt->>'attemptId')::uuid,current_setting('safespend_test.correct')::jsonb);
 if not(result->>'passed')::boolean or (result->>'score')::integer<>3 then raise exception 'FAIL: quiz scoring'; end if;
 if result<>public.submit_learning_quiz((first_attempt->>'attemptId')::uuid,current_setting('safespend_test.correct')::jsonb) then raise exception 'FAIL: score replay'; end if;
 if (select count(*) from public.user_quiz_attempts where session_id=(first_attempt->>'attemptId')::uuid)<>1 then raise exception 'FAIL: duplicate history'; end if;
 retry:=public.start_learning_quiz(current_setting('safespend_test.quiz')::uuid);
 if retry->>'setIndex'=first_attempt->>'setIndex' then raise exception 'FAIL: quiz variant'; end if;
 denied:=false;
 begin
  insert into public.user_path_progress(user_id,module_id) values(auth.uid(),current_setting('safespend_test.quiz')::uuid);
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'FAIL: direct completion accepted'; end if;
 denied:=false;
 begin perform public.submit_quiz_attempt(current_setting('safespend_test.quiz')::uuid,'{}');
 exception when others then
  if sqlerrm not like '%Update SafeSpend%' then raise; end if; denied:=true;
 end;
 if not denied then raise exception 'FAIL: legacy client was silently scored'; end if;

 select m.id into savings from public.learning_modules m join public.learning_paths p on p.id=m.path_id where p.slug='emergency-savings' and m.module_type='action';
 perform public.begin_learning_practice(savings);
 plan:='{"targetAmount":"1000","contributionAmount":"50","frequency":"weekly","firstStep":"Release test only"}'::jsonb;
 perform public.save_learning_practice(savings,'{"targetAmount":"1000"}',false);
 if public.begin_learning_practice(savings)->'draft'<>'{"targetAmount":"1000"}'::jsonb then raise exception 'FAIL: draft recovery'; end if;
 saved:=public.save_learning_practice(savings,plan,true);
 if saved->>'status'<>'saved' then raise exception 'FAIL: practice confirmation'; end if;
 again:=public.save_learning_practice(savings,plan,true);
 if again->>'goalId'<>saved->>'goalId' then raise exception 'FAIL: duplicated linked goal'; end if;
 draft:=public.save_learning_practice(savings,'{"targetAmount":"0"}',false);
 if draft->'confirmedDraft'<>plan or draft->>'confirmedAt'<>saved->>'confirmedAt' then raise exception 'FAIL: confirmed evidence lost'; end if;

 select m.id into budget_action from public.learning_modules m join public.learning_paths p on p.id=m.path_id where p.slug='money-basics' and m.module_type='action';
 perform public.begin_learning_practice(budget_action);
 insert into public.budgets(user_id,month_start,category,amount)
 values(auth.uid(),date_trunc('month',now() at time zone 'Asia/Kuala_Lumpur')::date,'ALL',1000) returning id into owned_budget;
 result:=public.save_learning_practice(budget_action,jsonb_build_object('budgetId',owned_budget),true);
 if result->>'status'<>'saved' then raise exception 'FAIL: explicit budget confirmation'; end if;
 perform public.set_learning_focus('saving');
 assignment:=public.assign_weekly_money_mission();
 select selection_reason into selected_reason from public.user_weekly_missions where id=assignment;
 if selected_reason<>'chosen_focus' then raise exception 'FAIL: mission focus'; end if;
 perform public.set_learning_focus('debt');
 if public.assign_weekly_money_mission()<>assignment then raise exception 'FAIL: unstable weekly assignment'; end if;

 perform set_config('request.jwt.claim.sub',current_setting('safespend_test.other'),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('safespend_test.other'),'role','authenticated')::text,true);
 if exists(select 1 from public.user_learning_quiz_sessions where id=(first_attempt->>'attemptId')::uuid) then raise exception 'FAIL: cross-user quiz read'; end if;
 if exists(select 1 from public.user_learning_practice where module_id=savings) then raise exception 'FAIL: cross-user practice read'; end if;
 denied:=false;
 begin perform public.submit_learning_quiz((first_attempt->>'attemptId')::uuid,current_setting('safespend_test.correct')::jsonb);
 exception when others then
  if sqlerrm not like '%attempt not found%' then raise; end if; denied:=true;
 end;
 if not denied then raise exception 'FAIL: cross-user quiz submission'; end if;
 denied:=false;
 begin perform public.save_learning_practice(budget_action,jsonb_build_object('budgetId',owned_budget),true);
 exception when others then
  if sqlerrm not like '%current month%' then raise; end if; denied:=true;
 end;
 if not denied then raise exception 'FAIL: cross-user budget evidence'; end if;
end $$;
reset role;
rollback;
select jsonb_build_object('hosted_learning_smoke','passed','test_writes','rolled_back','coverage',jsonb_build_array('active quiz resume','private answer keys','scoring and replay','varied retry','direct-write denial','legacy client message','draft recovery','confirmed evidence retention','idempotent goal','explicit budget confirmation','focus mission','stable assignment','cross-user reads and writes')) as verification;
