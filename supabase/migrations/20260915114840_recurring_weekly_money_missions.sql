-- Adds a curated, research-linked money mission per user and Malaysian week.
create table public.money_mission_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null,
  why_it_helps text not null,
  steps jsonb not null,
  category text not null,
  estimated_minutes smallint not null default 10,
  action_label text,
  action_trigger text,
  rotation_order smallint not null unique,
  reviewed_at date not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  constraint money_mission_templates_slug_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint money_mission_templates_steps_check
    check (
      jsonb_typeof(steps) = 'array'
      and jsonb_array_length(steps) between 2 and 6
    ),
  constraint money_mission_templates_category_check
    check (category in ('spending', 'saving', 'debt', 'planning')),
  constraint money_mission_templates_estimated_minutes_check
    check (estimated_minutes between 2 and 60),
  constraint money_mission_templates_action_trigger_check
    check (
      action_trigger is null
      or action_trigger in ('home', 'add_transaction', 'budgets', 'goal')
    ),
  constraint money_mission_templates_rotation_order_check
    check (rotation_order > 0)
);

create table public.money_mission_sources (
  mission_id uuid not null
    references public.money_mission_templates(id) on delete cascade,
  source_id bigint not null
    references public.content_sources(id) on delete restrict,
  evidence_note text not null,
  sort_order smallint not null default 0,
  primary key (mission_id, source_id),
  constraint money_mission_sources_sort_order_check
    check (sort_order >= 0)
);

create table public.user_weekly_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users(id) on delete cascade,
  mission_id uuid not null
    references public.money_mission_templates(id) on delete restrict,
  week_start date not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_weekly_missions_user_week_key unique (user_id, week_start),
  constraint user_weekly_missions_week_start_check
    check (extract(isodow from week_start) = 1)
);

create index money_mission_sources_source_id_idx
  on public.money_mission_sources (source_id);

create index user_weekly_missions_mission_id_idx
  on public.user_weekly_missions (mission_id);

alter table public.money_mission_templates enable row level security;
alter table public.money_mission_sources enable row level security;
alter table public.user_weekly_missions enable row level security;

create policy money_mission_templates_read_available
on public.money_mission_templates
for select
to authenticated
using (
  is_published is true
  or exists (
    select 1
    from public.user_weekly_missions assignment
    where assignment.mission_id = money_mission_templates.id
      and assignment.user_id = (select auth.uid())
  )
);

create policy money_mission_sources_read_available
on public.money_mission_sources
for select
to authenticated
using (
  exists (
    select 1
    from public.money_mission_templates mission
    join public.content_sources source
      on source.id = money_mission_sources.source_id
    where mission.id = money_mission_sources.mission_id
      and source.is_published is true
      and (
        mission.is_published is true
        or exists (
          select 1
          from public.user_weekly_missions assignment
          where assignment.mission_id = mission.id
            and assignment.user_id = (select auth.uid())
        )
      )
  )
);

create policy user_weekly_missions_select_own
on public.user_weekly_missions
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.money_mission_templates
  from public, anon, authenticated;
revoke all on table public.money_mission_sources
  from public, anon, authenticated;
revoke all on table public.user_weekly_missions
  from public, anon, authenticated;

grant select on table public.money_mission_templates to authenticated;
grant select on table public.money_mission_sources to authenticated;
grant select on table public.user_weekly_missions to authenticated;

create or replace function public.assign_weekly_money_mission()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_local_date date;
  v_week_start date;
  v_mission_count integer;
  v_rotation_index integer;
  v_mission_id uuid;
  v_assignment_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_local_date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  v_week_start := v_local_date - (extract(isodow from v_local_date)::integer - 1);

  select count(*)::integer
  into v_mission_count
  from public.money_mission_templates
  where is_published is true;

  if v_mission_count < 1 then
    raise exception 'No weekly money missions are available';
  end if;

  v_rotation_index := mod(
    ((v_week_start - date '2026-09-14') / 7)::integer,
    v_mission_count
  );

  select id
  into v_mission_id
  from public.money_mission_templates
  where is_published is true
  order by rotation_order, id
  offset v_rotation_index
  limit 1;

  insert into public.user_weekly_missions (
    user_id,
    mission_id,
    week_start
  )
  values (
    v_user_id,
    v_mission_id,
    v_week_start
  )
  on conflict (user_id, week_start)
  do update set user_id = excluded.user_id
  returning id into v_assignment_id;

  return v_assignment_id;
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
  v_local_date date;
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

  if p_completed then
    v_local_date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
    insert into public.user_streaks (user_id, date)
    values (v_user_id, v_local_date)
    on conflict (user_id, date) do nothing;
  end if;

  return p_completed;
end;
$$;

revoke execute on function public.assign_weekly_money_mission()
  from public, anon;
grant execute on function public.assign_weekly_money_mission()
  to authenticated;

revoke execute on function public.set_weekly_money_mission_completion(uuid, boolean)
  from public, anon;
grant execute on function public.set_weekly_money_mission_completion(uuid, boolean)
  to authenticated;

insert into public.money_mission_templates (
  slug,
  title,
  summary,
  why_it_helps,
  steps,
  category,
  estimated_minutes,
  action_label,
  action_trigger,
  rotation_order,
  reviewed_at,
  is_published
)
values
  (
    'seven-day-spending-snapshot',
    'Capture a Seven-Day Spending Snapshot',
    'Make one ordinary week visible before trying to change it.',
    'A plan built from recent behaviour is more useful than a perfect-looking budget built from guesses.',
    '["Record every purchase for seven days, including cash, e-wallet and BNPL spending.", "Use honest categories; do not move an expense just to make a category look better.", "At the end of the week, identify the largest flexible category."]'::jsonb,
    'spending',
    10,
    'Record a transaction',
    'add_transaction',
    1,
    date '2026-09-15',
    true
  ),
  (
    'needs-wants-future-sort',
    'Sort Spending Into Needs, Wants and Future You',
    'Review recent spending by the job each ringgit was meant to do.',
    'Simple rules can be easier to apply consistently than a complicated financial plan, especially while a habit is new.',
    '["Choose ten recent transactions.", "Mark each as a need, a want or money for a future goal.", "Find one item you would classify differently next time and write down why."]'::jsonb,
    'spending',
    12,
    'Review recent spending',
    'home',
    2,
    date '2026-09-15',
    true
  ),
  (
    'one-spending-leak',
    'Close One Spending Leak',
    'Choose one repeated expense to reduce, replace or pause for this week.',
    'Turning information into one immediate action makes the lesson more likely to affect behaviour.',
    '["Review your largest flexible spending category.", "Choose one repeated expense—not every expense—to change.", "Decide the replacement action before the usual spending moment arrives."]'::jsonb,
    'spending',
    10,
    'Review my dashboard',
    'home',
    3,
    date '2026-09-15',
    true
  ),
  (
    'starter-buffer-transfer',
    'Make One Safety-Buffer Transfer',
    'Move an amount you can genuinely afford into a separate emergency-savings account.',
    'A small liquid buffer can stop an unplanned cost from immediately becoming expensive debt.',
    '["Check what remains after essential commitments and required debt payments.", "Choose an amount that will not make you borrow again before payday.", "Transfer it to a separate accessible savings account and record the action."]'::jsonb,
    'saving',
    8,
    'Create a savings goal',
    'goal',
    4,
    date '2026-09-15',
    true
  ),
  (
    'one-month-buffer-gap',
    'Calculate Your One-Month Buffer Gap',
    'Turn “save more” into a specific checkpoint based on essential commitments.',
    'A staged, commitment-based target makes emergency readiness measurable without pretending one number fits every household.',
    '["Add up one month of essential commitments.", "Subtract the emergency savings you already have.", "Use the remaining gap to set a realistic next weekly target."]'::jsonb,
    'saving',
    12,
    'Set my buffer goal',
    'goal',
    5,
    date '2026-09-15',
    true
  ),
  (
    'debt-reality-list',
    'Build a Debt Reality List',
    'Put every balance, required payment, due date and financing cost in one place.',
    'Debt decisions improve when the total commitment is visible instead of being reduced to a small advertised instalment.',
    '["List every loan, credit card and BNPL commitment.", "For each one, record its balance, required payment, due date, term, fees and effective cost where available.", "Check that all required payments fit beside essential living costs."]'::jsonb,
    'debt',
    15,
    'Create a repayment goal',
    'goal',
    6,
    date '2026-09-15',
    true
  ),
  (
    'bnpl-cooling-off-week',
    'Try a BNPL Cooling-Off Week',
    'Pause new BNPL purchases for seven days and observe the moments that trigger them.',
    'BNPL still commits future income. A short pause creates space to see whether a purchase fits before adding another due date.',
    '["Do not start a new BNPL plan for seven days.", "When tempted, note the item, full price and reason for wanting it.", "After 24 hours, decide whether the full commitment still fits your plan."]'::jsonb,
    'debt',
    8,
    'Add a reminder goal',
    'goal',
    7,
    date '2026-09-15',
    true
  ),
  (
    'one-budget-guardrail',
    'Set One Budget Guardrail',
    'Choose one flexible category and set a realistic monthly limit using recent spending.',
    'A focused guardrail is easier to monitor and revise than trying to perfect every budget category at once.',
    '["Choose a flexible category that matters to you.", "Review what you actually spent recently and set a realistic limit.", "Check progress mid-month and revise the next month using what you learned."]'::jsonb,
    'planning',
    10,
    'Set a budget',
    'budgets',
    8,
    date '2026-09-15',
    true
  );

insert into public.money_mission_sources (
  mission_id,
  source_id,
  evidence_note,
  sort_order
)
select
  mission.id,
  source.id,
  mapping.evidence_note,
  mapping.sort_order
from (
  values
    ('seven-day-spending-snapshot', 'drexler-rules-of-thumb-2014', 'Supports a simple, usable record-keeping rule while a financial habit is being established.', 1),
    ('seven-day-spending-snapshot', 'fen-national-strategy-2026-2030', 'Provides the Malaysian financial-capability context and focus on behaviour, not knowledge alone.', 2),
    ('needs-wants-future-sort', 'drexler-rules-of-thumb-2014', 'Supports keeping an early financial routine simple enough to apply consistently.', 1),
    ('one-spending-leak', 'fernandes-just-in-time-education-2014', 'Supports providing education near the decision and immediately connecting it to an action.', 1),
    ('one-spending-leak', 'kaiser-financial-education-meta-analysis-2022', 'Provides broader causal evidence that well-designed financial education can improve behaviour.', 2),
    ('starter-buffer-transfer', 'fen-national-strategy-2026-2030', 'Provides Malaysian evidence on emergency readiness and resilience priorities.', 1),
    ('starter-buffer-transfer', 'pidm-deposit-insurance-system', 'Explains eligible protected deposits and the difference between deposits and investments.', 2),
    ('one-month-buffer-gap', 'pidm-emergency-savings-calculator', 'Provides Malaysian guidance for commitment-based emergency-fund targets.', 1),
    ('debt-reality-list', 'fen-national-strategy-2026-2030', 'Provides current Malaysian context on youth debt, store credit and BNPL risks.', 1),
    ('debt-reality-list', 'brown-youth-debt-education-2016', 'Supports applied, quantitative debt education while noting that content and context affect outcomes.', 2),
    ('bnpl-cooling-off-week', 'fen-national-strategy-2026-2030', 'Provides Malaysian evidence on BNPL exposure and the need for informed borrowing decisions.', 1),
    ('one-budget-guardrail', 'drexler-rules-of-thumb-2014', 'Supports using a focused rule rather than unnecessary complexity.', 1),
    ('one-budget-guardrail', 'kaiser-financial-education-meta-analysis-2022', 'Supports the potential behavioural benefit of well-designed financial education.', 2)
) as mapping(mission_slug, source_key, evidence_note, sort_order)
join public.money_mission_templates mission
  on mission.slug = mapping.mission_slug
join public.content_sources source
  on source.source_key = mapping.source_key
on conflict (mission_id, source_id) do update
set
  evidence_note = excluded.evidence_note,
  sort_order = excluded.sort_order;
