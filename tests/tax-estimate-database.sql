-- Run with an administrative SQL connection. All test changes roll back.
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
insert into public.tax_annual_inputs
  (user_id, tax_year, employment_income, pcb_paid, zakat_paid, approved_donations, scope_confirmed)
values (current_setting('test.owner')::uuid, 2025, 50000, 1200, 0, 0, true)
on conflict (user_id, tax_year) do update
set employment_income = excluded.employment_income, pcb_paid = excluded.pcb_paid,
    zakat_paid = excluded.zakat_paid, approved_donations = excluded.approved_donations,
    scope_confirmed = excluded.scope_confirmed;

do $$
declare rejected boolean := false; changed integer;
begin
  begin
    insert into public.tax_annual_inputs (user_id, tax_year, employment_income)
    values (current_setting('test.other')::uuid, 2025, 50000);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Foreign annual figure insert was accepted'; end if;

  rejected := false;
  begin
    insert into public.tax_annual_inputs (user_id, tax_year, scope_confirmed)
    values (current_setting('test.owner')::uuid, 2026, true);
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Incomplete confirmed figures were accepted'; end if;

  rejected := false;
  begin
    update public.tax_annual_inputs set tax_year = 2026
    where user_id = current_setting('test.owner')::uuid and tax_year = 2025;
  exception when raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'Assessment year was mutable'; end if;

  update public.tax_annual_inputs set employment_income = 1
  where user_id = current_setting('test.other')::uuid and tax_year = 2025;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Foreign annual figures were updated'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.other'), true);
do $$
begin
  if exists (select 1 from public.tax_annual_inputs
             where user_id = current_setting('test.owner')::uuid and tax_year = 2025) then
    raise exception 'Annual figures leaked to another account';
  end if;
end $$;
reset role;
select 'PASS: annual-input RLS, complete-confirmation guard, immutable year' as result;
rollback;
