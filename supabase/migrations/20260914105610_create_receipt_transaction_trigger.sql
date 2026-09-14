begin;

create or replace function private.create_receipt_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
  values (
    new.user_id,
    new.id,
    'expense',
    greatest(coalesce(new.total_amount, 0), 0),
    'MYR',
    coalesce(new.receipt_date, new.created_at::date, current_date),
    new.merchant_name,
    case
      when new.category in (
        'FOOD_AND_DRINK', 'GROCERIES', 'TRANSPORT', 'SHOPPING',
        'BILLS', 'ENTERTAINMENT', 'HEALTHCARE', 'EDUCATION', 'HOUSING'
      ) then new.category
      else 'OTHER'
    end,
    'receipt',
    case
      when new.lhdn_category is not null and coalesce(new.total_amount, 0) > 0
        then 'posted'
      else 'draft'
    end,
    coalesce(new.created_at, now()),
    coalesce(new.created_at, now())
  )
  on conflict (receipt_id) do nothing;

  return new;
end
$$;

revoke all on function private.create_receipt_transaction() from public, anon, authenticated;

create trigger receipts_create_transaction
  after insert on public.receipts
  for each row execute function private.create_receipt_transaction();

comment on function private.create_receipt_transaction() is
  'Creates the canonical ledger row atomically whenever receipt evidence is stored.';

commit;
