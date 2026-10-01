begin;

-- Manual annual figures only. No value is inferred from ordinary banking
-- transactions or OCR, and a missing figure is different from a true zero.
create table public.tax_annual_inputs (
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year integer not null check (tax_year in (2025, 2026)),
  employment_income numeric(12,2) check (employment_income >= 0),
  pcb_paid numeric(12,2) check (pcb_paid >= 0),
  zakat_paid numeric(12,2) check (zakat_paid >= 0),
  approved_donations numeric(12,2) check (approved_donations >= 0),
  scope_confirmed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, tax_year),
  constraint tax_annual_inputs_complete_if_confirmed check (
    not scope_confirmed or (
      employment_income is not null and pcb_paid is not null and
      zakat_paid is not null and approved_donations is not null
    )
  )
);

create function private.touch_tax_annual_inputs() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.user_id, new.tax_year) is distinct from (old.user_id, old.tax_year) then
    raise exception 'Tax summary ownership and assessment year cannot change';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger tax_annual_inputs_touch before insert or update
  on public.tax_annual_inputs for each row execute function private.touch_tax_annual_inputs();
revoke all on function private.touch_tax_annual_inputs() from public, anon, authenticated;

alter table public.tax_annual_inputs enable row level security;
revoke all on public.tax_annual_inputs from anon, authenticated;
grant select, insert, update, delete on public.tax_annual_inputs to authenticated;
create policy tax_annual_inputs_select on public.tax_annual_inputs
  for select to authenticated using (user_id = (select auth.uid()));
create policy tax_annual_inputs_insert on public.tax_annual_inputs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy tax_annual_inputs_update on public.tax_annual_inputs
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy tax_annual_inputs_delete on public.tax_annual_inputs
  for delete to authenticated using (user_id = (select auth.uid()));

commit;
