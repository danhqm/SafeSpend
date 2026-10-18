create table public.user_learning_preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,
 focus text check(focus in ('spending','saving','debt')),
 updated_at timestamptz not null default now()
);
alter table public.user_learning_preferences enable row level security;
revoke all on public.user_learning_preferences from public,anon,authenticated;
grant select on public.user_learning_preferences to authenticated;
create policy learning_preferences_own on public.user_learning_preferences for select to authenticated using((select auth.uid())=user_id);
alter table public.user_weekly_missions add column selection_reason text not null default 'existing' check(selection_reason in ('existing','quiz_review','chosen_focus','next_path','rotation'));
create function public.set_learning_focus(p_focus text) returns text language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_focus is not null and p_focus not in ('spending','saving','debt') then raise exception 'Invalid learning focus'; end if;
 insert into public.user_learning_preferences(user_id,focus) values(auth.uid(),p_focus) on conflict(user_id) do update set focus=excluded.focus,updated_at=now();
 return p_focus;
end $$;
revoke all on function public.set_learning_focus(text) from public,anon;
grant execute on function public.set_learning_focus(text) to authenticated;

create function public.get_learning_quiz_status() returns table(module_id uuid,passed boolean,completed_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select distinct on(a.module_id) a.module_id,a.passed,a.completed_at from public.user_quiz_attempts a
 where a.user_id=(select auth.uid()) order by a.module_id,a.completed_at desc,a.id desc
$$;
revoke all on function public.get_learning_quiz_status() from public,anon;
grant execute on function public.get_learning_quiz_status() to authenticated;

create or replace function public.assign_weekly_money_mission() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_week date:=date_trunc('week',now() at time zone 'Asia/Kuala_Lumpur')::date;
 v_assignment uuid; v_mission uuid; v_topic text; v_focus text; v_next text; v_reason text; v_path_slug text;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 perform 1 from auth.users where id=v_user for update;
 select id into v_assignment from public.user_weekly_missions where user_id=v_user and week_start=v_week;
 if found then return v_assignment; end if;
 select p.slug into v_path_slug from public.user_quiz_attempts a
 join public.learning_modules m on m.id=a.module_id join public.learning_paths p on p.id=m.path_id
 where a.user_id=v_user and not a.passed and p.is_published and (p.publish_date is null or p.publish_date<=now())
 and not exists(select 1 from public.user_quiz_attempts newer where newer.user_id=v_user and newer.module_id=a.module_id and (newer.completed_at,newer.id)>(a.completed_at,a.id))
 order by a.completed_at desc,a.id desc limit 1;
 v_topic:=case v_path_slug when 'money-basics' then 'spending' when 'emergency-savings' then 'saving' when 'debt-bnpl' then 'debt' end;
 select focus into v_focus from public.user_learning_preferences where user_id=v_user;
 select case p.slug when 'money-basics' then 'spending' when 'emergency-savings' then 'saving' when 'debt-bnpl' then 'debt' end into v_next
 from public.learning_paths p where p.is_published and (p.publish_date is null or p.publish_date<=now())
 and exists(select 1 from public.learning_modules m where m.path_id=p.id and not exists(select 1 from public.user_path_progress g where g.user_id=v_user and g.module_id=m.id))
 order by p.sort_order,p.id limit 1;
 select m.id,case when m.category=v_topic then 'quiz_review' when m.category=v_focus then 'chosen_focus' when m.category=v_next then 'next_path' else 'rotation' end
 into v_mission,v_reason from public.money_mission_templates m where m.is_published
 order by case when m.category=v_topic then 0 when m.category=v_focus then 1 when m.category=v_next then 2 else 3 end,
 (select max(a.week_start) from public.user_weekly_missions a where a.user_id=v_user and a.mission_id=m.id) nulls first,m.rotation_order,m.id limit 1;
 if v_mission is null then raise exception 'No weekly missions are available'; end if;
 insert into public.user_weekly_missions(user_id,mission_id,week_start,selection_reason) values(v_user,v_mission,v_week,v_reason) returning id into v_assignment;
 return v_assignment;
end $$;

-- Preserve module/source identifiers while making the first-pay context explicit.
update public.learning_paths set description=case slug
 when 'money-basics' then 'Make sense of your first pay: commitments, everyday spending and a realistic budget.'
 when 'emergency-savings' then 'Build an affordable first layer of savings for unexpected essential costs.'
 when 'debt-bnpl' then 'Understand repayment costs and choose a manageable priority, using your own situation or a practice example.' end
where slug in ('money-basics','emergency-savings','debt-bnpl');
update public.learning_modules set content_payload=jsonb_set(content_payload,'{slides,0,body}',to_jsonb(
 'Your first pay is a starting point, not all spendable money. Begin with what you actually receive, list bills and commitments due before the next payday, then plan everyday spending and a manageable next step. Example amounts in this path are hypothetical; use your own take-home pay and costs.'::text))
where module_type='lesson' and path_id=(select id from public.learning_paths where slug='money-basics');
