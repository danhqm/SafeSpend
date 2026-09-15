begin;

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  account_type text not null,
  opening_balance numeric(12,2) not null default 0,
  currency text not null default 'MYR',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_accounts_name_valid check (
    name = btrim(name) and char_length(name) between 1 and 80
  ),
  constraint financial_accounts_type_valid check (
    account_type in ('cash', 'bank', 'e_wallet', 'credit_card')
  ),
  constraint financial_accounts_opening_balance_valid check (
    opening_balance between -9999999999.99 and 9999999999.99
  ),
  constraint financial_accounts_currency_valid check (currency = 'MYR')
);

create unique index financial_accounts_user_name_key
  on public.financial_accounts (user_id, lower(name));
create index financial_accounts_user_active_idx
  on public.financial_accounts (user_id, is_archived, created_at);

create trigger financial_accounts_set_updated_at
  before update on public.financial_accounts
  for each row execute function public.set_updated_at();

alter table public.financial_accounts enable row level security;
create policy financial_accounts_select_own on public.financial_accounts
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy financial_accounts_insert_own on public.financial_accounts
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy financial_accounts_update_own on public.financial_accounts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.financial_accounts from anon, authenticated;
grant select on public.financial_accounts to authenticated;
grant insert (user_id, name, account_type, opening_balance, currency, is_archived)
  on public.financial_accounts to authenticated;
grant update (name, account_type, opening_balance, is_archived)
  on public.financial_accounts to authenticated;

alter table public.transactions
  add column account_id uuid references public.financial_accounts(id) on delete set null;
create index transactions_account_id_idx on public.transactions (account_id);
create index transactions_user_account_date_idx
  on public.transactions (user_id, account_id, occurred_on desc);

drop policy transactions_insert_manual_own on public.transactions;
drop policy transactions_update_manual_own on public.transactions;

create policy transactions_insert_manual_own on public.transactions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and source = 'manual'
    and status = 'posted'
    and receipt_id is null
    and (
      account_id is null
      or exists (
        select 1 from public.financial_accounts account
        where account.id = account_id
          and account.user_id = (select auth.uid())
          and not account.is_archived
      )
    )
  );
create policy transactions_update_manual_own on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id and source = 'manual')
  with check (
    (select auth.uid()) = user_id
    and source = 'manual'
    and receipt_id is null
    and (
      account_id is null
      or exists (
        select 1 from public.financial_accounts account
        where account.id = account_id
          and account.user_id = (select auth.uid())
          and not account.is_archived
      )
    )
  );

grant insert (account_id) on public.transactions to authenticated;
grant update (account_id) on public.transactions to authenticated;

create table public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid not null references public.financial_accounts(id),
  to_account_id uuid not null references public.financial_accounts(id),
  amount numeric(12,2) not null,
  currency text not null default 'MYR',
  occurred_on date not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint account_transfers_different_accounts check (
    from_account_id <> to_account_id
  ),
  constraint account_transfers_amount_valid check (
    amount > 0 and amount <= 9999999999.99
  ),
  constraint account_transfers_currency_valid check (currency = 'MYR'),
  constraint account_transfers_notes_valid check (
    notes is null or char_length(notes) <= 500
  )
);

create index account_transfers_user_date_idx
  on public.account_transfers (user_id, occurred_on desc, created_at desc);
create index account_transfers_from_date_idx
  on public.account_transfers (from_account_id, occurred_on desc);
create index account_transfers_to_date_idx
  on public.account_transfers (to_account_id, occurred_on desc);

alter table public.account_transfers enable row level security;
create policy account_transfers_select_own on public.account_transfers
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy account_transfers_insert_own on public.account_transfers
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.financial_accounts source_account
      where source_account.id = from_account_id
        and source_account.user_id = (select auth.uid())
        and not source_account.is_archived
    )
    and exists (
      select 1 from public.financial_accounts destination_account
      where destination_account.id = to_account_id
        and destination_account.user_id = (select auth.uid())
        and not destination_account.is_archived
    )
  );

revoke all on public.account_transfers from anon, authenticated;
grant select on public.account_transfers to authenticated;
grant insert (
  user_id, from_account_id, to_account_id, amount, currency, occurred_on, notes
) on public.account_transfers to authenticated;

drop function public.confirm_receipt_transaction(
  uuid, text, numeric, date, text, text, jsonb
);

create function public.confirm_receipt_transaction(
  p_transaction_id uuid,
  p_merchant_name text,
  p_amount numeric,
  p_occurred_on date,
  p_category text,
  p_account_id uuid default null,
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
    or (
      p_account_id is not null
      and not exists (
        select 1 from public.financial_accounts account
        where account.id = p_account_id
          and account.user_id = v_user_id
          and not account.is_archived
      )
    )
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
      account_id = p_account_id,
      notes = nullif(btrim(p_notes), ''),
      status = 'posted'
  where id = v_transaction.id
  returning * into v_transaction;

  return v_transaction;
end
$$;

revoke all on function public.confirm_receipt_transaction(
  uuid, text, numeric, date, text, uuid, text, jsonb
) from public, anon;
grant execute on function public.confirm_receipt_transaction(
  uuid, text, numeric, date, text, uuid, text, jsonb
) to authenticated;

comment on table public.financial_accounts is
  'User-owned asset accounts and credit cards with an explicit opening position.';
comment on table public.account_transfers is
  'User-owned movements between financial accounts; excluded from income and spending totals.';
comment on column public.financial_accounts.opening_balance is
  'Starting available funds for assets, or starting amount owed for credit cards.';

commit;
