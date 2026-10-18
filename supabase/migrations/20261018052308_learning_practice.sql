alter table public.user_path_progress add column completion_basis text not null default 'legacy'
 check(completion_basis in ('legacy','lesson_viewed','quiz_passed','plan_saved'));
update public.user_path_progress p set completion_basis=case m.module_type when 'lesson' then 'lesson_viewed' when 'quiz' then 'quiz_passed' else 'legacy' end
from public.learning_modules m where m.id=p.module_id;
revoke insert,update on public.user_path_progress from authenticated;

create function private.progress_basis() returns trigger language plpgsql set search_path='' as $$
begin
 if new.completion_basis='legacy' and exists(select 1 from public.learning_modules where id=new.module_id and module_type='quiz') then new.completion_basis:='quiz_passed'; end if;
 return new;
end $$;
revoke all on function private.progress_basis() from public,anon,authenticated;
create trigger learning_progress_basis before insert on public.user_path_progress for each row execute function private.progress_basis();

create table public.user_learning_practice(
 user_id uuid not null references auth.users(id) on delete cascade,
 module_id uuid not null references public.learning_modules(id) on delete cascade,
 kind text not null check(kind in ('budget','saving','debt')),
 period date not null,
 draft jsonb not null default '{}'::jsonb check(jsonb_typeof(draft)='object' and octet_length(draft::text)<=10000),
 saved_at timestamptz,
 confirmed_draft jsonb,
 goal_id uuid references public.user_goals(id) on delete set null,
 budget_id uuid references public.budgets(id) on delete set null,
 primary key(user_id,module_id)
);
alter table public.user_learning_practice enable row level security;
revoke all on public.user_learning_practice from public,anon,authenticated;
grant select on public.user_learning_practice to authenticated;
create policy learning_practice_select_own on public.user_learning_practice for select to authenticated using((select auth.uid())=user_id);
create index learning_practice_goal on public.user_learning_practice(goal_id);
create index learning_practice_budget on public.user_learning_practice(budget_id);

create function private.practice_payload(p public.user_learning_practice) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('moduleId',p.module_id,'kind',p.kind,'period',p.period,'draft',p.draft,
 'status',case when p.saved_at is null or p.draft is distinct from p.confirmed_draft then 'draft' else 'saved' end,'goalId',p.goal_id,'budgetId',p.budget_id,
 'confirmedDraft',p.confirmed_draft,'confirmedAt',p.saved_at)
$$;
revoke all on function private.practice_payload(public.user_learning_practice) from public,anon,authenticated;

create function public.begin_learning_practice(p_module_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_kind text; v_period date; p public.user_learning_practice;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select case path.slug when 'money-basics' then 'budget' when 'emergency-savings' then 'saving' when 'debt-bnpl' then 'debt' end into v_kind
 from public.learning_modules m join public.learning_paths path on path.id=m.path_id
 where m.id=p_module_id and m.module_type='action' and path.is_published and (path.publish_date is null or path.publish_date<=now());
 if v_kind is null then raise exception 'Published practice not found'; end if;
 v_period:=date_trunc(case when v_kind='budget' then 'month' else 'week' end,now() at time zone 'Asia/Kuala_Lumpur')::date;
 insert into public.user_learning_practice(user_id,module_id,kind,period) values(v_user,p_module_id,v_kind,v_period) on conflict do nothing;
 select * into p from public.user_learning_practice where user_id=v_user and module_id=p_module_id;
 return private.practice_payload(p);
end $$;

create function public.save_learning_practice(p_module_id uuid,p_draft jsonb,p_confirm boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid(); p public.user_learning_practice; v_key text; v_period date;
 v_amount numeric; v_contribution numeric; v_goal uuid; v_budget uuid; v_title text; v_notes text;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_draft is null or jsonb_typeof(p_draft)<>'object' or octet_length(p_draft::text)>10000 or p_confirm is null then raise exception 'Invalid practice plan'; end if;
 perform public.begin_learning_practice(p_module_id);
 select * into p from public.user_learning_practice where user_id=v_user and module_id=p_module_id for update;
 for v_key in select jsonb_object_keys(p_draft) loop
  if not(v_key=any(case p.kind when 'budget' then array['budgetId'] when 'saving' then array['targetAmount','contributionAmount','frequency','firstStep'] else array['priority','strategy','reason','hypothetical'] end)) then raise exception 'Unexpected plan field'; end if;
  if v_key='hypothetical' then
   if jsonb_typeof(p_draft->v_key)<>'boolean' then raise exception 'Invalid hypothetical plan field'; end if;
  elsif jsonb_typeof(p_draft->v_key) not in ('string','number') or length(p_draft->>v_key)>500 then raise exception 'Invalid plan field'; end if;
 end loop;
 -- Drafts may be partial. Final confirmation checks structured, topic-specific evidence.
 v_period:=date_trunc(case when p.kind='budget' then 'month' else 'week' end,now() at time zone 'Asia/Kuala_Lumpur')::date;
 if p_confirm then
  if p.kind='budget' then
   select id into v_budget from public.budgets where id::text=p_draft->>'budgetId' and user_id=v_user and month_start=v_period and amount>0 and currency='MYR';
   if v_budget is null then raise exception 'Select your positive budget for the current month'; end if;
  elsif p.kind='saving' then
   if coalesce(p_draft->>'targetAmount','')!~'^[0-9]+([.][0-9]{1,2})?$' or coalesce(p_draft->>'contributionAmount','')!~'^[0-9]+([.][0-9]{1,2})?$' then raise exception 'Enter positive plan amounts with at most two decimal places'; end if;
   v_amount:=(p_draft->>'targetAmount')::numeric; v_contribution:=(p_draft->>'contributionAmount')::numeric;
   if v_amount<=0 or v_amount>999999999.99 or v_contribution<=0 or v_contribution>999999999.99 then raise exception 'Plan amount is out of range'; end if;
   if coalesce(p_draft->>'frequency','') not in ('weekly','monthly') or length(btrim(coalesce(p_draft->>'firstStep','')))=0 then raise exception 'Choose a frequency and first step'; end if;
   v_title:='Build my safety buffer';
   v_notes:=format('Plan only: target RM%s; contribute RM%s %s. First step: %s',v_amount,v_contribution,p_draft->>'frequency',btrim(p_draft->>'firstStep'));
  else
   if length(btrim(coalesce(p_draft->>'priority','')))=0 or length(btrim(coalesce(p_draft->>'reason','')))=0 or coalesce(p_draft->>'strategy','') not in ('highest_cost','smallest_balance','avoid_new_debt') or not(p_draft ? 'hypothetical') then raise exception 'Complete the repayment priority, strategy and reason in your plan'; end if;
   v_title:=case when (p_draft->>'hypothetical')::boolean then 'Practice example: repayment priority' else 'Review my repayment priority' end;
   v_notes:=format('%s plan only. Priority: %s. Strategy: %s. Reason: %s',case when (p_draft->>'hypothetical')::boolean then 'Hypothetical' else 'Personal' end,btrim(p_draft->>'priority'),p_draft->>'strategy',btrim(p_draft->>'reason'));
  end if;
  if p.kind<>'budget' then
   v_goal:=p.goal_id;
   if v_goal is not null then
    update public.user_goals set title=v_title,notes=v_notes where id=v_goal and user_id=v_user and week_start=v_period;
    if not found then v_goal:=null; end if;
   end if;
   if v_goal is null then insert into public.user_goals(user_id,title,notes,week_start) values(v_user,v_title,v_notes,v_period) returning id into v_goal; end if;
  end if;
  insert into public.user_path_progress(user_id,module_id,completion_basis) values(v_user,p_module_id,'plan_saved') on conflict(user_id,module_id) do update set completion_basis='plan_saved',completed_at=now();
 end if;
 update public.user_learning_practice set draft=p_draft,
 period=case when saved_at is null or p_confirm then v_period else period end,
 saved_at=case when p_confirm then now() else saved_at end,
 confirmed_draft=case when p_confirm then p_draft else confirmed_draft end,
 goal_id=coalesce(v_goal,goal_id),budget_id=coalesce(v_budget,budget_id)
 where user_id=v_user and module_id=p_module_id returning * into p;
 return private.practice_payload(p);
end $$;

create function public.acknowledge_learning_lesson(p_module_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.learning_modules m join public.learning_paths p on p.id=m.path_id where m.id=p_module_id and m.module_type='lesson' and p.is_published and (p.publish_date is null or p.publish_date<=now())) then raise exception 'Published lesson not found'; end if;
 insert into public.user_path_progress(user_id,module_id,completion_basis) values(auth.uid(),p_module_id,'lesson_viewed') on conflict do nothing;
 return true;
end $$;
revoke all on function public.begin_learning_practice(uuid),public.save_learning_practice(uuid,jsonb,boolean),public.acknowledge_learning_lesson(uuid) from public,anon;
grant execute on function public.begin_learning_practice(uuid),public.save_learning_practice(uuid,jsonb,boolean),public.acknowledge_learning_lesson(uuid) to authenticated;
