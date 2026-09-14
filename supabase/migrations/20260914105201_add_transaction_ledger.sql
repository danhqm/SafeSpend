begin;

alter table public.receipts drop constraint receipts_category_valid;
alter table public.receipts add constraint receipts_category_valid check (
  category is null or category in (
    'FOOD_AND_DRINK', 'GROCERIES', 'TRANSPORT', 'SHOPPING',
    'BILLS', 'ENTERTAINMENT', 'HEALTHCARE', 'EDUCATION',
    'HOUSING', 'OTHER', 'TAX_RELIEF'
  )
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid unique references public.receipts(id) on delete cascade,
  transaction_type text not null,
  amount numeric(12,2) not null,
  currency text not null default 'MYR',
  occurred_on date not null,
  merchant_name text,
  category text not null default 'OTHER',
  notes text,
  source text not null default 'manual',
  status text not null default 'posted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_type_valid check (
    transaction_type in ('expense', 'income', 'refund')
  ),
  constraint transactions_amount_nonnegative check (amount >= 0),
  constraint transactions_currency_valid check (currency ~ '^[A-Z]{3}$'),
  constraint transactions_category_valid check (
    category in (
      'FOOD_AND_DRINK', 'GROCERIES', 'TRANSPORT', 'SHOPPING',
      'BILLS', 'ENTERTAINMENT', 'HEALTHCARE', 'EDUCATION',
      'HOUSING', 'SAVINGS', 'SALARY', 'OTHER'
    )
  ),
  constraint transactions_source_valid check (source in ('manual', 'receipt')),
  constraint transactions_status_valid check (status in ('draft', 'posted')),
  constraint transactions_receipt_source_valid check (
    (source = 'receipt' and receipt_id is not null)
    or (source = 'manual' and receipt_id is null)
  ),
  constraint transactions_posted_amount_positive check (
    status = 'draft' or amount > 0
  )
);

create index transactions_user_status_type_date_idx
  on public.transactions (user_id, status, transaction_type, occurred_on desc);
create index transactions_user_created_idx
  on public.transactions (user_id, created_at desc);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;

create policy transactions_select_own on public.transactions
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy transactions_insert_manual_own on public.transactions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and source = 'manual'
    and status = 'posted'
    and receipt_id is null
  );
create policy transactions_update_manual_own on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id and source = 'manual')
  with check (
    (select auth.uid()) = user_id
    and source = 'manual'
    and receipt_id is null
  );
create policy transactions_delete_manual_own on public.transactions
  for delete to authenticated
  using ((select auth.uid()) = user_id and source = 'manual');

revoke all on public.transactions from anon, authenticated;
grant select on public.transactions to authenticated;
grant insert (
  user_id, transaction_type, amount, currency, occurred_on,
  merchant_name, category, notes, source, status
) on public.transactions to authenticated;
grant update (
  transaction_type, amount, currency, occurred_on,
  merchant_name, category, notes, status
) on public.transactions to authenticated;
grant delete on public.transactions to authenticated;

-- Atomically confirm an OCR draft and keep its receipt and transaction aligned.
create or replace function public.confirm_receipt_transaction(
  p_transaction_id uuid,
  p_merchant_name text,
  p_amount numeric,
  p_occurred_on date,
  p_category text,
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
    or p_occurred_on is null
    or p_category not in (
      'FOOD_AND_DRINK', 'GROCERIES', 'TRANSPORT', 'SHOPPING',
      'BILLS', 'ENTERTAINMENT', 'HEALTHCARE', 'EDUCATION',
      'HOUSING', 'SAVINGS', 'OTHER'
    )
    or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
  then
    raise exception 'Invalid receipt confirmation' using errcode = '22023';
  end if;

  select transaction_row.*
  into v_transaction
  from public.transactions transaction_row
  where transaction_row.id = p_transaction_id
    and transaction_row.user_id = v_user_id
    and transaction_row.source = 'receipt'
    and transaction_row.status = 'draft'
  for update;

  if not found then
    raise exception 'Receipt draft not found' using errcode = 'P0002';
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
      status = 'posted'
  where id = v_transaction.id
  returning * into v_transaction;

  return v_transaction;
end
$$;

revoke all on function public.confirm_receipt_transaction(
  uuid, text, numeric, date, text, jsonb
) from public, anon;
grant execute on function public.confirm_receipt_transaction(
  uuid, text, numeric, date, text, jsonb
) to authenticated;

-- Backfill every legacy receipt exactly once. Invalid legacy amounts are
-- quarantined as drafts and therefore do not affect financial totals.
insert into public.transactions (
  user_id,
  receipt_id,
  transaction_type,
  amount,
  currency,
  occurred_on,
  merchant_name,
  category,
  source,
  status,
  created_at,
  updated_at
)
select
  receipt.user_id,
  receipt.id,
  'expense',
  greatest(coalesce(receipt.total_amount, 0), 0),
  'MYR',
  coalesce(receipt.receipt_date, receipt.created_at::date, current_date),
  receipt.merchant_name,
  case
    when receipt.category in (
      'FOOD_AND_DRINK', 'GROCERIES', 'TRANSPORT', 'SHOPPING',
      'BILLS', 'ENTERTAINMENT'
    ) then receipt.category
    else 'OTHER'
  end,
  'receipt',
  case when coalesce(receipt.total_amount, 0) > 0 then 'posted' else 'draft' end,
  coalesce(receipt.created_at, now()),
  coalesce(receipt.created_at, now())
from public.receipts receipt
on conflict (receipt_id) do nothing;

comment on table public.transactions is
  'Canonical user-owned ledger. Receipts are optional evidence attached to transactions.';
comment on column public.transactions.occurred_on is
  'The financial event date used for reports; never substitute created_at.';
comment on column public.transactions.status is
  'Draft OCR results do not affect reports until the user confirms them.';

commit;
