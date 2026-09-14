begin;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  category text not null,
  amount numeric(12,2) not null,
  currency text not null default 'MYR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_month_first_day check (extract(day from month_start) = 1),
  constraint budgets_category_valid check (
    category in (
      'ALL', 'FOOD_AND_DRINK', 'GROCERIES', 'TRANSPORT', 'SHOPPING',
      'BILLS', 'ENTERTAINMENT', 'HEALTHCARE', 'EDUCATION', 'HOUSING', 'OTHER'
    )
  ),
  constraint budgets_amount_valid check (amount > 0 and amount <= 9999999999.99),
  constraint budgets_currency_valid check (currency = 'MYR'),
  constraint budgets_user_month_category_unique unique (user_id, month_start, category)
);

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

alter table public.budgets enable row level security;

create policy budgets_select_own on public.budgets
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy budgets_insert_own on public.budgets
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy budgets_update_own on public.budgets
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy budgets_delete_own on public.budgets
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.budgets from anon, authenticated;
grant select, insert, update, delete on public.budgets to authenticated;

-- Replace one month's plan in a single transaction. This is security invoker,
-- so the table's grants and RLS remain the authority for every row.
create or replace function public.replace_monthly_budgets(
  p_month_start date,
  p_budgets jsonb
)
returns setof public.budgets
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_budgets jsonb := coalesce(p_budgets, '{}'::jsonb);
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_month_start is null
    or extract(day from p_month_start) <> 1
    or jsonb_typeof(v_budgets) <> 'object'
  then
    raise exception 'Invalid monthly budget' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each(v_budgets) entry
    where entry.key not in (
      'ALL', 'FOOD_AND_DRINK', 'GROCERIES', 'TRANSPORT', 'SHOPPING',
      'BILLS', 'ENTERTAINMENT', 'HEALTHCARE', 'EDUCATION', 'HOUSING', 'OTHER'
    )
      or jsonb_typeof(entry.value) <> 'number'
      or (entry.value #>> '{}')::numeric <= 0
      or (entry.value #>> '{}')::numeric > 9999999999.99
  ) then
    raise exception 'Invalid monthly budget values' using errcode = '22023';
  end if;

  delete from public.budgets
  where user_id = v_user_id and month_start = p_month_start;

  insert into public.budgets (user_id, month_start, category, amount)
  select
    v_user_id,
    p_month_start,
    entry.key,
    round((entry.value #>> '{}')::numeric, 2)
  from jsonb_each(v_budgets) entry;

  return query
  select budget.*
  from public.budgets budget
  where budget.user_id = v_user_id and budget.month_start = p_month_start
  order by budget.category;
end
$$;

revoke all on function public.replace_monthly_budgets(date, jsonb)
  from public, anon;
grant execute on function public.replace_monthly_budgets(date, jsonb)
  to authenticated;

-- The same confirmation operation also edits posted receipt transactions,
-- keeping the ledger row and its receipt evidence synchronized atomically.
drop function public.confirm_receipt_transaction(uuid, text, numeric, date, text, jsonb);

create function public.confirm_receipt_transaction(
  p_transaction_id uuid,
  p_merchant_name text,
  p_amount numeric,
  p_occurred_on date,
  p_category text,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_transaction public.transactions;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(btrim(p_merchant_name), '') is null
    or p_amount is null or p_amount <= 0
    or p_amount > 9999999999.99
    or p_occurred_on is null
    or p_category not in (
      'FOOD_AND_DRINK', 'GROCERIES', 'TRANSPORT', 'SHOPPING',
      'BILLS', 'ENTERTAINMENT', 'HEALTHCARE', 'EDUCATION',
      'HOUSING', 'OTHER'
    )
    or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
  then
    raise exception 'Invalid receipt transaction' using errcode = '22023';
  end if;

  select transaction_row.*
  into v_transaction
  from public.transactions transaction_row
  where transaction_row.id = p_transaction_id
    and transaction_row.user_id = v_user_id
    and transaction_row.source = 'receipt'
    and transaction_row.status in ('draft', 'posted')
  for update;

  if not found then
    raise exception 'Receipt transaction not found' using errcode = 'P0002';
  end if;

  update public.receipts
  set merchant_name = btrim(p_merchant_name),
      total_amount = round(p_amount, 2),
      receipt_date = p_occurred_on,
      category = p_category,
      items = coalesce(p_items, '[]'::jsonb)
  where id = v_transaction.receipt_id
    and user_id = v_user_id;

  update public.transactions
  set merchant_name = btrim(p_merchant_name),
      amount = round(p_amount, 2),
      occurred_on = p_occurred_on,
      category = p_category,
      notes = nullif(btrim(p_notes), ''),
      status = 'posted'
  where id = v_transaction.id
  returning * into v_transaction;

  return v_transaction;
end
$$;

revoke all on function public.confirm_receipt_transaction(
  uuid, text, numeric, date, text, text, jsonb
) from public, anon;
grant execute on function public.confirm_receipt_transaction(
  uuid, text, numeric, date, text, text, jsonb
) to authenticated;

comment on table public.budgets is
  'User-owned monthly overall and category spending limits.';
comment on function public.replace_monthly_budgets(date, jsonb) is
  'Atomically replaces the authenticated user monthly budget plan under RLS.';

commit;
