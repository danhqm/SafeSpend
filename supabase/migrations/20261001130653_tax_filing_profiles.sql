begin;

create table public.tax_filing_profiles (
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year integer not null check (tax_year in (2025, 2026)),
  residency_status text not null default 'unsure'
    check (residency_status in ('resident', 'non_resident', 'unsure')),
  business_income_status text not null default 'unsure'
    check (business_income_status in ('yes', 'no', 'unsure')),
  updated_at timestamptz not null default now(),
  primary key (user_id, tax_year)
);

create table public.tax_household_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year integer not null check (tax_year in (2025, 2026)),
  relationship text not null check (relationship in ('spouse', 'child', 'parent', 'grandparent')),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tax_household_members_owner_year_idx
  on public.tax_household_members (user_id, tax_year);

create function private.touch_tax_filing_profile() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.user_id, new.tax_year) is distinct from (old.user_id, old.tax_year) then
    raise exception 'Filing profile ownership and assessment year cannot change';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger tax_filing_profiles_touch before insert or update
  on public.tax_filing_profiles for each row execute function private.touch_tax_filing_profile();

create function private.touch_tax_household_member() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.user_id, new.tax_year) is distinct from (old.user_id, old.tax_year) then
    raise exception 'Household member ownership and assessment year cannot change';
  end if;
  new.display_name := btrim(new.display_name);
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger tax_household_members_touch before insert or update
  on public.tax_household_members for each row execute function private.touch_tax_household_member();

-- Do not let an API client confirm a personal-relief claim that contradicts
-- an explicit non-resident filing profile. Existing claims remain intact if
-- the user later changes their self-declaration; the app hides that estimate.
create function private.validate_tax_claim_filing_profile() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'confirmed' and exists (
    select 1 from public.tax_filing_profiles profile
    where profile.user_id = new.user_id and profile.tax_year = new.tax_year
      and profile.residency_status = 'non_resident'
  ) then
    raise exception 'Review residency status before confirming personal relief';
  end if;
  return new;
end $$;
create trigger tax_claims_validate_filing_profile before insert or update
  on public.tax_claims for each row execute function private.validate_tax_claim_filing_profile();

alter table public.tax_filing_profiles enable row level security;
alter table public.tax_household_members enable row level security;
revoke all on public.tax_filing_profiles from anon, authenticated;
revoke all on public.tax_household_members from anon, authenticated;
grant select, insert, update, delete on public.tax_filing_profiles to authenticated;
grant select, insert, update, delete on public.tax_household_members to authenticated;

create policy tax_filing_profiles_select on public.tax_filing_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy tax_filing_profiles_insert on public.tax_filing_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy tax_filing_profiles_update on public.tax_filing_profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy tax_filing_profiles_delete on public.tax_filing_profiles
  for delete to authenticated using (user_id = (select auth.uid()));

create policy tax_household_members_select on public.tax_household_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy tax_household_members_insert on public.tax_household_members
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy tax_household_members_update on public.tax_household_members
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy tax_household_members_delete on public.tax_household_members
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on function private.touch_tax_filing_profile() from public, anon, authenticated;
revoke all on function private.touch_tax_household_member() from public, anon, authenticated;
revoke all on function private.validate_tax_claim_filing_profile() from public, anon, authenticated;
commit;
