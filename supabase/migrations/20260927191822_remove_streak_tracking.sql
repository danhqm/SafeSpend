-- Keep lesson and mission progress, but stop recording daily activity streaks.
create or replace function public.submit_quiz_attempt(
  p_module_id uuid,
  p_answers jsonb
)
returns table (
  score integer,
  total_questions integer,
  passed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_payload jsonb;
  v_score integer;
  v_total integer;
  v_pass_percent integer;
  v_passed boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_answers is null
     or jsonb_typeof(p_answers) <> 'object'
     or octet_length(p_answers::text) > 10000 then
    raise exception 'Quiz answers must be a small JSON object';
  end if;

  select module.content_payload
  into v_payload
  from public.learning_modules module
  join public.learning_paths path on path.id = module.path_id
  where module.id = p_module_id
    and module.module_type = 'quiz'
    and path.is_published is true
    and (path.publish_date is null or path.publish_date <= now());

  if v_payload is null
     or jsonb_typeof(v_payload -> 'questions') <> 'array' then
    raise exception 'Published quiz not found';
  end if;

  v_total := jsonb_array_length(v_payload -> 'questions');
  if v_total < 1 or v_total > 20 then
    raise exception 'Quiz question count is invalid';
  end if;

  select count(*)::integer
  into v_score
  from jsonb_array_elements(v_payload -> 'questions') question
  where p_answers ->> (question ->> 'id') = question ->> 'correctOptionId';

  v_pass_percent := coalesce((v_payload ->> 'passPercent')::integer, 70);
  v_passed := round((v_score * 100.0) / v_total)::integer >= v_pass_percent;

  insert into public.user_quiz_attempts (
    user_id,
    module_id,
    score,
    total_questions,
    passed,
    answers
  )
  values (
    v_user_id,
    p_module_id,
    v_score,
    v_total,
    v_passed,
    p_answers
  );

  if v_passed then
    insert into public.user_path_progress (user_id, module_id)
    values (v_user_id, p_module_id)
    on conflict (user_id, module_id) do nothing;
  end if;

  return query select v_score, v_total, v_passed;
end;
$$;

create or replace function public.set_weekly_money_mission_completion(
  p_assignment_id uuid,
  p_completed boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_assignment_id is null or p_completed is null then
    raise exception 'Assignment and completion state are required';
  end if;

  update public.user_weekly_missions
  set completed_at = case when p_completed then now() else null end
  where id = p_assignment_id
    and user_id = v_user_id;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Weekly money mission not found';
  end if;

  return p_completed;
end;
$$;

revoke execute on function public.submit_quiz_attempt(uuid, jsonb)
  from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, jsonb)
  to authenticated;

revoke execute on function public.set_weekly_money_mission_completion(uuid, boolean)
  from public, anon;
grant execute on function public.set_weekly_money_mission_completion(uuid, boolean)
  to authenticated;

-- The user requested permanent removal of all historical streak records.
drop table if exists public.user_streaks;
