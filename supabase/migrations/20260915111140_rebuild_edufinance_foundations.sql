-- Creates the first research-backed Money Skills curriculum and quiz engine.
alter table public.learning_paths
  add column if not exists slug text,
  add column if not exists estimated_minutes smallint not null default 5,
  add column if not exists outcome text,
  add column if not exists reviewed_at date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_paths_slug_key'
      and conrelid = 'public.learning_paths'::regclass
  ) then
    alter table public.learning_paths
      add constraint learning_paths_slug_key unique (slug);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_paths_estimated_minutes_check'
      and conrelid = 'public.learning_paths'::regclass
  ) then
    alter table public.learning_paths
      add constraint learning_paths_estimated_minutes_check
      check (estimated_minutes between 1 and 120);
  end if;
end
$$;

alter table public.learning_modules
  add column if not exists slug text,
  add column if not exists estimated_minutes smallint not null default 3,
  add column if not exists competency text;

alter table public.learning_modules
  drop constraint if exists learning_modules_module_type_check;

alter table public.learning_modules
  add constraint learning_modules_module_type_check
  check (module_type in ('lesson', 'quiz', 'action'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_modules_path_slug_key'
      and conrelid = 'public.learning_modules'::regclass
  ) then
    alter table public.learning_modules
      add constraint learning_modules_path_slug_key unique (path_id, slug);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'learning_modules_estimated_minutes_check'
      and conrelid = 'public.learning_modules'::regclass
  ) then
    alter table public.learning_modules
      add constraint learning_modules_estimated_minutes_check
      check (estimated_minutes between 1 and 60);
  end if;
end
$$;

create table public.content_sources (
  id bigint generated always as identity primary key,
  source_key text not null unique,
  title text not null,
  authors text,
  publisher text not null,
  publication_year smallint,
  source_type text not null,
  url text not null,
  doi text,
  jurisdiction text not null default 'Global',
  summary text not null,
  limitations text,
  reviewed_at date not null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  constraint content_sources_source_key_check
    check (source_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint content_sources_publication_year_check
    check (publication_year is null or publication_year between 1900 and 2100),
  constraint content_sources_source_type_check
    check (source_type in ('official', 'peer_reviewed', 'meta_analysis')),
  constraint content_sources_url_check
    check (url ~ '^https://')
);

create table public.learning_module_sources (
  module_id uuid not null
    references public.learning_modules(id) on delete cascade,
  source_id bigint not null
    references public.content_sources(id) on delete restrict,
  evidence_note text not null,
  sort_order smallint not null default 0,
  primary key (module_id, source_id),
  constraint learning_module_sources_sort_order_check
    check (sort_order >= 0)
);

create table public.user_quiz_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  module_id uuid not null
    references public.learning_modules(id) on delete cascade,
  score smallint not null,
  total_questions smallint not null,
  passed boolean not null,
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  constraint user_quiz_attempts_score_check
    check (score >= 0 and total_questions > 0 and score <= total_questions),
  constraint user_quiz_attempts_answers_check
    check (jsonb_typeof(answers) = 'object')
);

create index learning_paths_published_order_idx
  on public.learning_paths (sort_order, publish_date)
  where is_published is true;

create index learning_modules_path_order_idx
  on public.learning_modules (path_id, sort_order);

create index learning_module_sources_source_id_idx
  on public.learning_module_sources (source_id);

create index user_quiz_attempts_user_module_completed_idx
  on public.user_quiz_attempts (user_id, module_id, completed_at desc);

alter table public.content_sources enable row level security;
alter table public.learning_module_sources enable row level security;
alter table public.user_quiz_attempts enable row level security;

drop policy if exists "Enable read access for authenticated users"
  on public.learning_paths;
drop policy if exists learning_paths_read_published
  on public.learning_paths;

create policy learning_paths_read_published
on public.learning_paths
for select
to authenticated
using (
  is_published is true
  and (publish_date is null or publish_date <= now())
);

drop policy if exists "Enable read access for authenticated users"
  on public.learning_modules;
drop policy if exists learning_modules_read_published
  on public.learning_modules;

create policy learning_modules_read_published
on public.learning_modules
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_paths path
    where path.id = learning_modules.path_id
      and path.is_published is true
      and (path.publish_date is null or path.publish_date <= now())
  )
);

create policy content_sources_read_published
on public.content_sources
for select
to authenticated
using (is_published is true);

create policy learning_module_sources_read_published
on public.learning_module_sources
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_modules module
    join public.learning_paths path on path.id = module.path_id
    join public.content_sources source on source.id = learning_module_sources.source_id
    where module.id = learning_module_sources.module_id
      and path.is_published is true
      and (path.publish_date is null or path.publish_date <= now())
      and source.is_published is true
  )
);

create policy user_quiz_attempts_select_own
on public.user_quiz_attempts
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.content_sources from public, anon, authenticated;
revoke all on table public.learning_module_sources from public, anon, authenticated;
revoke all on table public.user_quiz_attempts from public, anon, authenticated;

grant select on table public.content_sources to authenticated;
grant select on table public.learning_module_sources to authenticated;
grant select on table public.user_quiz_attempts to authenticated;

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

    insert into public.user_streaks (user_id, date)
    values (v_user_id, current_date)
    on conflict (user_id, date) do nothing;
  end if;

  return query select v_score, v_total, v_passed;
end;
$$;

revoke execute on function public.submit_quiz_attempt(uuid, jsonb)
  from public, anon;
grant execute on function public.submit_quiz_attempt(uuid, jsonb)
  to authenticated;

insert into public.content_sources (
  source_key,
  title,
  authors,
  publisher,
  publication_year,
  source_type,
  url,
  doi,
  jurisdiction,
  summary,
  limitations,
  reviewed_at,
  is_published
)
values
  (
    'fen-national-strategy-2026-2030',
    'Malaysia National Strategy for Financial Literacy 2026-2030',
    'Financial Education Network',
    'Financial Education Network Malaysia',
    2025,
    'official',
    'https://www.fenetwork.my/wp-content/uploads/2025/10/FEN_NS2_ENG_Interactive_FA_LowRes.pdf',
    null,
    'Malaysia',
    'National evidence and priorities covering emergency readiness, saving behaviour, youth debt, BNPL and digital financial risks.',
    'The strategy summarises national indicators and policy priorities; it does not prescribe one budget or debt plan for every individual.',
    date '2026-09-15',
    true
  ),
  (
    'bnm-financial-literacy-symposium-2025',
    'Launch of the Fourth National Financial Literacy Symposium',
    'Adnan Zaylani',
    'Bank Negara Malaysia',
    2025,
    'official',
    'https://www.bnm.gov.my/-/dgaz-nfls4',
    null,
    'Malaysia',
    'Summarises the 2024 national financial capability findings and explains why knowledge must translate into action and resilience.',
    'This is an official speech summarising survey results rather than the complete survey methodology and dataset.',
    date '2026-09-15',
    true
  ),
  (
    'pidm-emergency-savings-calculator',
    'PIDM Emergency Savings Calculator',
    null,
    'Perbadanan Insurans Deposit Malaysia',
    null,
    'official',
    'https://www.pidm.gov.my/finlit/pidm-emergency-savings-calculator',
    null,
    'Malaysia',
    'Official Malaysian guidance for estimating an emergency fund from monthly commitments and a chosen three-to-nine-month horizon.',
    'The calculator provides an estimate and explicitly states that it is not personalised professional financial advice.',
    date '2026-09-15',
    true
  ),
  (
    'pidm-deposit-insurance-system',
    'Deposit Insurance System',
    null,
    'Perbadanan Insurans Deposit Malaysia',
    null,
    'official',
    'https://www.pidm.gov.my/general/faqs/deposit-insurance-system',
    null,
    'Malaysia',
    'Explains which eligible deposits at member banks receive automatic PIDM protection and the current protection limit.',
    'Coverage depends on product eligibility and current Malaysian rules; investment products such as shares and unit trusts are not deposits.',
    date '2026-09-15',
    true
  ),
  (
    'kaiser-financial-education-meta-analysis-2022',
    'Financial Education Affects Financial Knowledge and Downstream Behaviors',
    'Tim Kaiser, Annamaria Lusardi, Lukas Menkhoff and Carly Urban',
    'Journal of Financial Economics',
    2022,
    'meta_analysis',
    'https://doi.org/10.1016/j.jfineco.2021.09.022',
    '10.1016/j.jfineco.2021.09.022',
    'Global',
    'A meta-analysis of 76 randomised experiments involving more than 160,000 participants found positive average effects on knowledge and financial behaviour.',
    'Effects vary across programmes, populations and behaviours, so the result does not guarantee that every lesson format will work equally well.',
    date '2026-09-15',
    true
  ),
  (
    'fernandes-just-in-time-education-2014',
    'Financial Literacy, Financial Education, and Downstream Financial Behaviors',
    'Daniel Fernandes, John G. Lynch Jr. and Richard G. Netemeyer',
    'Management Science',
    2014,
    'meta_analysis',
    'https://doi.org/10.1287/mnsc.2013.1849',
    '10.1287/mnsc.2013.1849',
    'Global',
    'Found that the effects of education may decay and argued for concise, just-in-time education linked to an immediate financial decision.',
    'This earlier meta-analysis estimated smaller effects than later randomised-trial evidence, so SafeSpend treats it as a design caution rather than a final verdict.',
    date '2026-09-15',
    true
  ),
  (
    'drexler-rules-of-thumb-2014',
    'Keeping It Simple: Financial Literacy and Rules of Thumb',
    'Alejandro Drexler, Greg Fischer and Antoinette Schoar',
    'American Economic Journal: Applied Economics',
    2014,
    'peer_reviewed',
    'https://doi.org/10.1257/app.6.2.1',
    '10.1257/app.6.2.1',
    'Dominican Republic',
    'A randomised study found that simplified rules-of-thumb training improved important financial practices for participants with lower initial skills.',
    'Participants were microentrepreneurs in the Dominican Republic, so the findings inform lesson design rather than Malaysian financial rules.',
    date '2026-09-15',
    true
  ),
  (
    'brown-youth-debt-education-2016',
    'Financial Education and the Debt Behavior of the Young',
    'Meta Brown, John Grigsby, Wilbert van der Klaauw, Jaya Wen and Basit Zafar',
    'The Review of Financial Studies',
    2016,
    'peer_reviewed',
    'https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr634.pdf',
    null,
    'United States',
    'Administrative credit data linked some quantitative and financial education to modest reductions in delinquency and collections among young adults.',
    'The setting and credit system are American, and the study found that outcomes depended on programme content and could fade with age.',
    date '2026-09-15',
    true
  )
on conflict (source_key) do update
set
  title = excluded.title,
  authors = excluded.authors,
  publisher = excluded.publisher,
  publication_year = excluded.publication_year,
  source_type = excluded.source_type,
  url = excluded.url,
  doi = excluded.doi,
  jurisdiction = excluded.jurisdiction,
  summary = excluded.summary,
  limitations = excluded.limitations,
  reviewed_at = excluded.reviewed_at,
  is_published = excluded.is_published;

update public.learning_paths
set is_published = false
where is_published is true;

insert into public.learning_paths (
  slug,
  title,
  description,
  outcome,
  estimated_minutes,
  is_published,
  sort_order,
  publish_date,
  reviewed_at
)
values
  (
    'money-basics',
    'Know Where Your Money Goes',
    'Build a realistic money plan from your actual income and spending.',
    'Create a flexible first budget without treating one percentage rule as a pass or fail test.',
    12,
    true,
    1,
    now(),
    date '2026-09-15'
  ),
  (
    'emergency-savings',
    'Build Your Safety Buffer',
    'Prepare for a financial shock one achievable target at a time.',
    'Choose a liquid emergency-fund target and create a practical savings goal.',
    12,
    true,
    2,
    now(),
    date '2026-09-15'
  ),
  (
    'debt-bnpl',
    'Debt Without the Trap',
    'Understand the real cost of credit cards, loans and Buy Now Pay Later.',
    'Compare debt choices using total cost and choose a repayment priority you can sustain.',
    14,
    true,
    3,
    now(),
    date '2026-09-15'
  )
on conflict (slug) do update
set
  title = excluded.title,
  description = excluded.description,
  outcome = excluded.outcome,
  estimated_minutes = excluded.estimated_minutes,
  is_published = excluded.is_published,
  sort_order = excluded.sort_order,
  publish_date = excluded.publish_date,
  reviewed_at = excluded.reviewed_at;

insert into public.learning_modules (
  path_id,
  slug,
  title,
  module_type,
  content_payload,
  action_trigger,
  sort_order,
  estimated_minutes,
  competency
)
select
  path.id,
  'cash-flow-first',
  'Start With Cash Flow',
  'lesson',
  $json${
    "version": 1,
    "slides": [
      {
        "title": "Give every ringgit a job",
        "body": "Begin with take-home income. Subtract essential commitments, then flexible spending. What remains can fund savings, debt repayment and future goals.",
        "takeaway": "A budget is a plan for available money, not a punishment for spending."
      },
      {
        "title": "Percentages are starting points",
        "body": "The 50/30/20 split can help you begin, but rent, family duties and income differ. Adjust the percentages while keeping an affordable future-money line visible.",
        "takeaway": "A realistic plan you follow is better than a perfect ratio you abandon."
      },
      {
        "title": "Use evidence from your own life",
        "body": "Review recent SafeSpend transactions before setting limits. Start with one or two categories you can influence, then check the plan weekly.",
        "takeaway": "Actual transactions make a stronger budget than memory or guesswork."
      }
    ]
  }$json$::jsonb,
  null,
  1,
  4,
  'Explain cash flow and build a flexible budget from actual spending.'
from public.learning_paths path
where path.slug = 'money-basics'
on conflict (path_id, slug) do update
set
  title = excluded.title,
  module_type = excluded.module_type,
  content_payload = excluded.content_payload,
  action_trigger = excluded.action_trigger,
  sort_order = excluded.sort_order,
  estimated_minutes = excluded.estimated_minutes,
  competency = excluded.competency;

insert into public.learning_modules (
  path_id, slug, title, module_type, content_payload,
  action_trigger, sort_order, estimated_minutes, competency
)
select
  path.id,
  'money-basics-check',
  'Make the Plan Work',
  'quiz',
  $json${
    "version": 1,
    "passPercent": 67,
    "questions": [
      {
        "id": "flexible-ratio",
        "prompt": "Your essential costs take 65% of your income, not 50%. What is the best first response?",
        "options": [
          {"id": "a", "label": "Give up because the budget has already failed"},
          {"id": "b", "label": "Adjust the percentages and protect a small affordable amount for future goals"},
          {"id": "c", "label": "Borrow to force every category into the original ratio"}
        ],
        "correctOptionId": "b",
        "explanation": "A ratio is only a template. Your plan must reflect real commitments while keeping a sustainable savings or debt-repayment amount visible."
      },
      {
        "id": "cash-flow-math",
        "prompt": "You take home RM2,400. Essentials are RM1,500 and flexible spending is RM500. How much remains before other goals?",
        "options": [
          {"id": "a", "label": "RM200"},
          {"id": "b", "label": "RM400"},
          {"id": "c", "label": "RM900"}
        ],
        "correctOptionId": "b",
        "explanation": "RM2,400 minus RM1,500 minus RM500 leaves RM400 for savings, debt repayment or other planned goals."
      },
      {
        "id": "budget-data",
        "prompt": "What is the strongest starting point for a realistic first budget?",
        "options": [
          {"id": "a", "label": "A social-media creator's percentages"},
          {"id": "b", "label": "Your recent income, commitments and actual transactions"},
          {"id": "c", "label": "The amount you wish you had earned"}
        ],
        "correctOptionId": "b",
        "explanation": "Your own transaction history reveals the categories and commitments your plan must handle."
      }
    ]
  }$json$::jsonb,
  null,
  2,
  4,
  'Apply cash-flow reasoning to a realistic Malaysian monthly budget.'
from public.learning_paths path
where path.slug = 'money-basics'
on conflict (path_id, slug) do update
set
  title = excluded.title,
  module_type = excluded.module_type,
  content_payload = excluded.content_payload,
  action_trigger = excluded.action_trigger,
  sort_order = excluded.sort_order,
  estimated_minutes = excluded.estimated_minutes,
  competency = excluded.competency;

insert into public.learning_modules (
  path_id, slug, title, module_type, content_payload,
  action_trigger, sort_order, estimated_minutes, competency
)
select
  path.id,
  'set-first-budget',
  'Set Your First Budget',
  'action',
  $json${
    "version": 1,
    "description": "Use what you just learned to set limits for the categories that matter most. You can revise them after a week of real spending.",
    "buttonLabel": "Set my budget"
  }$json$::jsonb,
  'set_budget',
  3,
  4,
  'Turn cash-flow knowledge into a budget inside SafeSpend.'
from public.learning_paths path
where path.slug = 'money-basics'
on conflict (path_id, slug) do update
set
  title = excluded.title,
  module_type = excluded.module_type,
  content_payload = excluded.content_payload,
  action_trigger = excluded.action_trigger,
  sort_order = excluded.sort_order,
  estimated_minutes = excluded.estimated_minutes,
  competency = excluded.competency;

insert into public.learning_modules (
  path_id, slug, title, module_type, content_payload,
  action_trigger, sort_order, estimated_minutes, competency
)
select
  path.id,
  'starter-safety-buffer',
  'Build the First Layer',
  'lesson',
  $json${
    "version": 1,
    "slides": [
      {
        "title": "Why a buffer comes first",
        "body": "Six in ten Malaysians cannot raise RM1,000 for an emergency. A small liquid buffer can prevent a repair, medical bill or income gap from becoming expensive debt.",
        "takeaway": "The first goal is resilience, not investment returns."
      },
      {
        "title": "Build in stages",
        "body": "Start with an achievable RM1,000 checkpoint. Next aim for one month of essential commitments, then work toward a larger three-to-six-month buffer that suits your job and responsibilities.",
        "takeaway": "A staged target makes progress visible without pretending one number fits everyone."
      },
      {
        "title": "Keep it liquid and separate",
        "body": "Emergency money should be accessible when needed and separate from daily spending. Eligible deposits at PIDM member banks receive automatic protection under current limits; investments can fall in value when you need the cash.",
        "takeaway": "Emergency savings and long-term investments have different jobs."
      }
    ]
  }$json$::jsonb,
  null,
  1,
  4,
  'Choose a staged emergency-fund target and an appropriate place to keep it.'
from public.learning_paths path
where path.slug = 'emergency-savings'
on conflict (path_id, slug) do update
set
  title = excluded.title,
  module_type = excluded.module_type,
  content_payload = excluded.content_payload,
  action_trigger = excluded.action_trigger,
  sort_order = excluded.sort_order,
  estimated_minutes = excluded.estimated_minutes,
  competency = excluded.competency;

insert into public.learning_modules (
  path_id, slug, title, module_type, content_payload,
  action_trigger, sort_order, estimated_minutes, competency
)
select
  path.id,
  'emergency-check',
  'Is It Really an Emergency?',
  'quiz',
  $json${
    "version": 1,
    "passPercent": 67,
    "questions": [
      {
        "id": "emergency-example",
        "prompt": "Which is the clearest emergency-fund use?",
        "options": [
          {"id": "a", "label": "A discounted phone upgrade"},
          {"id": "b", "label": "An urgent car repair needed to get to work"},
          {"id": "c", "label": "Concert tickets released today"}
        ],
        "correctOptionId": "b",
        "explanation": "An urgent, necessary and unplanned cost that protects your income or wellbeing is an appropriate emergency use."
      },
      {
        "id": "emergency-gap",
        "prompt": "Your essential monthly commitments are RM1,200 and your emergency savings are RM600. How much more is needed for a one-month checkpoint?",
        "options": [
          {"id": "a", "label": "RM600"},
          {"id": "b", "label": "RM1,200"},
          {"id": "c", "label": "RM1,800"}
        ],
        "correctOptionId": "a",
        "explanation": "The checkpoint is RM1,200. With RM600 already saved, the remaining gap is RM600."
      },
      {
        "id": "emergency-location",
        "prompt": "Which home best matches the job of emergency savings?",
        "options": [
          {"id": "a", "label": "A separate, accessible eligible deposit account"},
          {"id": "b", "label": "A volatile asset that could drop sharply"},
          {"id": "c", "label": "A shopping-wallet balance used every day"}
        ],
        "correctOptionId": "a",
        "explanation": "Emergency money prioritises access and stability. Always check whether a particular deposit product is eligible for PIDM protection."
      }
    ]
  }$json$::jsonb,
  null,
  2,
  4,
  'Recognise genuine emergencies and calculate a simple funding gap.'
from public.learning_paths path
where path.slug = 'emergency-savings'
on conflict (path_id, slug) do update
set
  title = excluded.title,
  module_type = excluded.module_type,
  content_payload = excluded.content_payload,
  action_trigger = excluded.action_trigger,
  sort_order = excluded.sort_order,
  estimated_minutes = excluded.estimated_minutes,
  competency = excluded.competency;

insert into public.learning_modules (
  path_id, slug, title, module_type, content_payload,
  action_trigger, sort_order, estimated_minutes, competency
)
select
  path.id,
  'create-buffer-goal',
  'Create Your Buffer Goal',
  'action',
  $json${
    "version": 1,
    "description": "Choose your next checkpoint: RM1,000 or one month of essential commitments. Create a weekly SafeSpend goal with an amount you can realistically save.",
    "buttonLabel": "Create my savings goal"
  }$json$::jsonb,
  'set_goal',
  3,
  4,
  'Create a concrete and achievable emergency-savings action.'
from public.learning_paths path
where path.slug = 'emergency-savings'
on conflict (path_id, slug) do update
set
  title = excluded.title,
  module_type = excluded.module_type,
  content_payload = excluded.content_payload,
  action_trigger = excluded.action_trigger,
  sort_order = excluded.sort_order,
  estimated_minutes = excluded.estimated_minutes,
  competency = excluded.competency;

insert into public.learning_modules (
  path_id, slug, title, module_type, content_payload,
  action_trigger, sort_order, estimated_minutes, competency
)
select
  path.id,
  'real-cost-of-debt',
  'See the Real Cost',
  'lesson',
  $json${
    "version": 1,
    "slides": [
      {
        "title": "A small payment can hide a large commitment",
        "body": "Credit cards, loans and BNPL all use future income. Compare the total amount payable, effective interest or profit rate, fees, due dates and late-payment consequences—not only the monthly instalment.",
        "takeaway": "Affordable today does not automatically mean affordable across every due date."
      },
      {
        "title": "Minimum is not the target",
        "body": "A minimum payment may keep an account from becoming overdue, but it can leave the balance charging interest for much longer. Pay more when safely possible without emptying essential cash.",
        "takeaway": "Know how much goes to cost and how much actually reduces the balance."
      },
      {
        "title": "Choose a repayment rule",
        "body": "The avalanche method prioritises the highest-cost debt and usually minimises total cost. The snowball method clears the smallest balance first for visible progress. Choose deliberately and keep every required payment current.",
        "takeaway": "The mathematical advantage matters, but so does following the plan consistently."
      },
      {
        "title": "Pause before adding new debt",
        "body": "List every due date and commitment before accepting another offer. If repayments are becoming unmanageable, seek help early rather than using a new expensive debt to hide the old one.",
        "takeaway": "Debt problems become easier to address when they are visible early."
      }
    ]
  }$json$::jsonb,
  null,
  1,
  5,
  'Compare debt using total cost, repayment pressure and a deliberate payoff order.'
from public.learning_paths path
where path.slug = 'debt-bnpl'
on conflict (path_id, slug) do update
set
  title = excluded.title,
  module_type = excluded.module_type,
  content_payload = excluded.content_payload,
  action_trigger = excluded.action_trigger,
  sort_order = excluded.sort_order,
  estimated_minutes = excluded.estimated_minutes,
  competency = excluded.competency;

insert into public.learning_modules (
  path_id, slug, title, module_type, content_payload,
  action_trigger, sort_order, estimated_minutes, competency
)
select
  path.id,
  'debt-check',
  'Choose the Safer Debt Move',
  'quiz',
  $json${
    "version": 1,
    "passPercent": 67,
    "questions": [
      {
        "id": "compare-debt",
        "prompt": "Which information gives the clearest comparison between two financing offers?",
        "options": [
          {"id": "a", "label": "Only the advertised monthly payment"},
          {"id": "b", "label": "Total payable, effective rate, fees, term and late-payment consequences"},
          {"id": "c", "label": "The colour and popularity of the app"}
        ],
        "correctOptionId": "b",
        "explanation": "The monthly amount alone can hide a longer term, fees or a higher overall financing cost."
      },
      {
        "id": "bnpl-meaning",
        "prompt": "A BNPL purchase is split into four small payments. What should you record in your plan?",
        "options": [
          {"id": "a", "label": "Nothing, because it is not debt"},
          {"id": "b", "label": "Only the first payment"},
          {"id": "c", "label": "The full commitment and every future due date"}
        ],
        "correctOptionId": "c",
        "explanation": "Splitting a purchase changes timing, not the total commitment made against future income."
      },
      {
        "id": "repayment-order",
        "prompt": "After all required payments are covered, which method normally minimises total financing cost?",
        "options": [
          {"id": "a", "label": "Pay extra toward the highest-cost debt first"},
          {"id": "b", "label": "Pay extra toward the newest debt regardless of cost"},
          {"id": "c", "label": "Stop checking statements"}
        ],
        "correctOptionId": "a",
        "explanation": "Prioritising the highest effective cost is the avalanche method and generally reduces total cost, provided required payments remain current."
      }
    ]
  }$json$::jsonb,
  null,
  2,
  4,
  'Identify hidden debt costs and choose a reasoned repayment priority.'
from public.learning_paths path
where path.slug = 'debt-bnpl'
on conflict (path_id, slug) do update
set
  title = excluded.title,
  module_type = excluded.module_type,
  content_payload = excluded.content_payload,
  action_trigger = excluded.action_trigger,
  sort_order = excluded.sort_order,
  estimated_minutes = excluded.estimated_minutes,
  competency = excluded.competency;

insert into public.learning_modules (
  path_id, slug, title, module_type, content_payload,
  action_trigger, sort_order, estimated_minutes, competency
)
select
  path.id,
  'choose-debt-goal',
  'Choose Your Repayment Priority',
  'action',
  $json${
    "version": 1,
    "description": "List the balance, effective cost and required payment for each debt. Then create one weekly goal for the balance you will target after required payments.",
    "buttonLabel": "Create my repayment goal"
  }$json$::jsonb,
  'set_goal',
  3,
  5,
  'Commit to one visible and sustainable debt-repayment priority.'
from public.learning_paths path
where path.slug = 'debt-bnpl'
on conflict (path_id, slug) do update
set
  title = excluded.title,
  module_type = excluded.module_type,
  content_payload = excluded.content_payload,
  action_trigger = excluded.action_trigger,
  sort_order = excluded.sort_order,
  estimated_minutes = excluded.estimated_minutes,
  competency = excluded.competency;

insert into public.learning_module_sources (
  module_id,
  source_id,
  evidence_note,
  sort_order
)
select
  module.id,
  source.id,
  mapping.evidence_note,
  mapping.sort_order
from (
  values
    ('money-basics', 'cash-flow-first', 'fen-national-strategy-2026-2030', 'Provides the Malaysian financial-capability context and emphasis on lasting behavioural change.', 1),
    ('money-basics', 'cash-flow-first', 'bnm-financial-literacy-symposium-2025', 'Supports connecting knowledge to an immediate action rather than information alone.', 2),
    ('money-basics', 'cash-flow-first', 'drexler-rules-of-thumb-2014', 'Supports simple, usable rules instead of unnecessarily complex instruction.', 3),
    ('money-basics', 'money-basics-check', 'drexler-rules-of-thumb-2014', 'Informs the scenario-based use of simple cash-flow rules.', 1),
    ('money-basics', 'set-first-budget', 'fernandes-just-in-time-education-2014', 'Supports placing education immediately before the related budgeting decision.', 1),
    ('money-basics', 'set-first-budget', 'kaiser-financial-education-meta-analysis-2022', 'Provides broader causal evidence that well-designed education can improve behaviour.', 2),
    ('emergency-savings', 'starter-safety-buffer', 'fen-national-strategy-2026-2030', 'Source for Malaysian emergency-readiness indicators and staged resilience priorities.', 1),
    ('emergency-savings', 'starter-safety-buffer', 'pidm-emergency-savings-calculator', 'Provides Malaysian guidance for commitment-based emergency-fund targets.', 2),
    ('emergency-savings', 'starter-safety-buffer', 'pidm-deposit-insurance-system', 'Explains eligible protected deposits and the difference between deposits and investments.', 3),
    ('emergency-savings', 'emergency-check', 'pidm-emergency-savings-calculator', 'Supports the commitment-based target and liquidity questions.', 1),
    ('emergency-savings', 'create-buffer-goal', 'fernandes-just-in-time-education-2014', 'Supports immediately converting the lesson into a specific savings action.', 1),
    ('debt-bnpl', 'real-cost-of-debt', 'fen-national-strategy-2026-2030', 'Provides current Malaysian evidence on youth debt, store credit and BNPL risk.', 1),
    ('debt-bnpl', 'real-cost-of-debt', 'brown-youth-debt-education-2016', 'Supports the importance of quantitative debt education while acknowledging content and context matter.', 2),
    ('debt-bnpl', 'debt-check', 'brown-youth-debt-education-2016', 'Informs the focus on applied debt decisions rather than definition recall.', 1),
    ('debt-bnpl', 'choose-debt-goal', 'bnm-financial-literacy-symposium-2025', 'Supports turning debt knowledge into a practical behaviour and resilience step.', 1)
) as mapping(path_slug, module_slug, source_key, evidence_note, sort_order)
join public.learning_paths path on path.slug = mapping.path_slug
join public.learning_modules module
  on module.path_id = path.id and module.slug = mapping.module_slug
join public.content_sources source on source.source_key = mapping.source_key
on conflict (module_id, source_id) do update
set
  evidence_note = excluded.evidence_note,
  sort_order = excluded.sort_order;
