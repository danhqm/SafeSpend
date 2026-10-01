-- Run with an administrative SQL connection. All test records roll back.
begin;
do $$
declare owner_id uuid; other_id uuid;
begin
  select id into owner_id from auth.users order by created_at limit 1;
  select id into other_id from auth.users where id <> owner_id order by created_at limit 1;
  if owner_id is null or other_id is null then raise exception 'Two accounts required'; end if;
  perform set_config('test.owner', owner_id::text, true);
  perform set_config('test.other', other_id::text, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.owner'), true);
insert into public.tax_filing_profiles(user_id, tax_year, residency_status, business_income_status)
values (current_setting('test.owner')::uuid, 2025, 'resident', 'no')
on conflict (user_id, tax_year) do update
set residency_status = excluded.residency_status,
    business_income_status = excluded.business_income_status;
insert into public.tax_household_members(user_id, tax_year, relationship, display_name)
values (current_setting('test.owner')::uuid, 2025, 'child', 'Filing test child')
returning id;

do $$
declare rejected boolean := false;
begin
  begin
    insert into public.tax_household_members(user_id, tax_year, relationship, display_name)
    values (current_setting('test.other')::uuid, 2025, 'child', 'Should be rejected');
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Foreign member insert was accepted'; end if;
  rejected := false;
  begin
    update public.tax_filing_profiles set tax_year = 2026
    where user_id = current_setting('test.owner')::uuid and tax_year = 2025;
  exception when raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'Filing assessment year was mutable'; end if;
  update public.tax_filing_profiles set residency_status = 'non_resident'
  where user_id = current_setting('test.owner')::uuid and tax_year = 2025;
  rejected := false;
  begin
    insert into public.tax_claims(user_id, tax_year, rule_id, rule_version, title,
      amount, eligible_amount, status, beneficiary, eligibility_confirmed, occurred_on, evidence_note)
    values(current_setting('test.owner')::uuid, 2025, 'lifestyle', '2025.1',
      'Filing test claim', 10, 10, 'confirmed', 'Self', true, '2025-06-01', 'Test evidence');
  exception when raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'Non-resident profile accepted confirmed personal relief'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.other'), true);
do $$
begin
  if exists (select 1 from public.tax_filing_profiles
             where user_id = current_setting('test.owner')::uuid and tax_year = 2025) then
    raise exception 'Filing profile leaked to another account';
  end if;
  if exists (select 1 from public.tax_household_members
             where user_id = current_setting('test.owner')::uuid and display_name = 'Filing test child') then
    raise exception 'Household member leaked to another account';
  end if;
end $$;
reset role;
select 'PASS: filing and household RLS, immutable year, non-resident claim guard' as result;
rollback;
