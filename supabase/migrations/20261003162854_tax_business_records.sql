begin;

-- A working record of business activity, not an adjusted-income or
-- deductibility determination. It is intentionally separate from the
-- ordinary transaction ledger and personal-relief claims.
create table public.tax_business_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year integer not null check (tax_year in (2025, 2026)),
  entry_type text not null check (entry_type in ('income', 'expense')),
  title text not null check (length(btrim(title)) between 1 and 120),
  amount numeric(12,2) not null check (amount > 0 and amount <= 999999999),
  occurred_on date not null,
  evidence_ref text not null default '' check (length(evidence_ref) <= 160),
  notes text not null default '' check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tax_business_entries_year_matches_date
    check (extract(year from occurred_on) = tax_year)
);
create index tax_business_entries_owner_year_date_idx
  on public.tax_business_entries (user_id, tax_year, occurred_on desc, id);

create function private.touch_tax_business_entry() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and
    (new.id, new.user_id, new.tax_year, new.created_at) is distinct from
    (old.id, old.user_id, old.tax_year, old.created_at) then
    raise exception 'Business record identity, ownership and assessment year cannot change';
  end if;
  new.title := btrim(new.title);
  new.evidence_ref := btrim(new.evidence_ref);
  new.notes := btrim(new.notes);
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger tax_business_entries_touch before insert or update
  on public.tax_business_entries for each row execute function private.touch_tax_business_entry();
revoke all on function private.touch_tax_business_entry() from public, anon, authenticated;

alter table public.tax_business_entries enable row level security;
revoke all on public.tax_business_entries from anon, authenticated;
grant select, insert, update, delete on public.tax_business_entries to authenticated;
create policy tax_business_entries_select on public.tax_business_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy tax_business_entries_insert on public.tax_business_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy tax_business_entries_update on public.tax_business_entries
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy tax_business_entries_delete on public.tax_business_entries
  for delete to authenticated using (user_id = (select auth.uid()));

commit;
