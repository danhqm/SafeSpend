-- Run with an administrative SQL connection. Every test change is rolled back.
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
do $$
declare probe_id uuid; rejected boolean := false;
begin
  insert into public.tax_business_entries
    (user_id, tax_year, entry_type, title, amount, occurred_on, evidence_ref)
  values (current_setting('test.owner')::uuid, 2025, 'income', 'RLS business probe', 100, '2025-05-01', 'Invoice 1')
  returning id into probe_id;
  perform set_config('test.entry', probe_id::text, true);

  begin
    insert into public.tax_business_entries
      (user_id, tax_year, entry_type, title, amount, occurred_on)
    values (current_setting('test.other')::uuid, 2025, 'income', 'Foreign probe', 10, '2025-05-01');
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Foreign business entry insert was accepted'; end if;

  rejected := false;
  begin
    insert into public.tax_business_entries
      (user_id, tax_year, entry_type, title, amount, occurred_on)
    values (current_setting('test.owner')::uuid, 2025, 'expense', 'Wrong year', 10, '2026-05-01');
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Mismatched entry date/year was accepted'; end if;

  rejected := false;
  begin
    insert into public.tax_business_entries
      (user_id, tax_year, entry_type, title, amount, occurred_on)
    values (current_setting('test.owner')::uuid, 2025, 'expense', 'Zero amount', 0, '2025-05-01');
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'Zero-amount business entry was accepted'; end if;

  rejected := false;
  begin
    update public.tax_business_entries set tax_year = 2026
    where id = probe_id;
  exception when raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'Business entry assessment year was mutable'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.other'), true);
do $$
declare changed integer;
begin
  if exists (select 1 from public.tax_business_entries
             where id = current_setting('test.entry')::uuid) then
    raise exception 'Business entry leaked to another account';
  end if;
  update public.tax_business_entries set amount = 1
  where id = current_setting('test.entry')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Foreign business entry was updated'; end if;
  delete from public.tax_business_entries where id = current_setting('test.entry')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Foreign business entry was deleted'; end if;
end $$;
reset role;
select 'PASS: business-entry RLS, immutable year, date and positive amount' as result;
rollback;
