begin;
do $$
declare owner_id uuid; other_id uuid; receipt_id uuid; other_receipt uuid;
begin
 select id into owner_id from auth.users order by created_at limit 1;
 select id into other_id from auth.users where id<>owner_id order by created_at limit 1;
 if owner_id is null or other_id is null then raise exception 'Two accounts required for isolation test'; end if;
 perform set_config('test.owner',owner_id::text,true);
 perform set_config('test.other',other_id::text,true);
 insert into public.receipts(user_id,merchant_name,total_amount,receipt_date,items,category,lhdn_category,tax_year)
 values(owner_id,'Tax test - rolled back',100,'2025-06-01','[]','OTHER','Tax review',2025) returning id into receipt_id;
 perform set_config('test.receipt',receipt_id::text,true);
 insert into public.receipts(user_id,merchant_name,total_amount,receipt_date,items,category)
 values(other_id,'Tax test other - rolled back',100,'2025-06-01','[]','OTHER') returning id into other_receipt;
 perform set_config('test.other_receipt',other_receipt::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $$
declare c public.tax_claims; rejected boolean:=false;
begin
 select * into c from public.tax_claims where receipt_id=current_setting('test.receipt')::uuid;
 if not found or c.status<>'needs_review' or c.eligible_amount<>0 then raise exception 'Scan must create unconfirmed draft'; end if;
 perform set_config('test.claim',c.id::text,true);
 update public.tax_claims set rule_id='lifestyle',rule_version='2025.1',eligible_amount=40,status='confirmed',beneficiary='Self',eligibility_confirmed=true where id=c.id;
 begin
 update public.tax_claims set tax_year=2026 where id=c.id;
 exception when raise_exception then rejected:=true;
 end;
 if not rejected then raise exception 'Unreviewed year was accepted'; end if;
 rejected:=false;
 begin
 update public.tax_claims set receipt_id=current_setting('test.other_receipt')::uuid where id=c.id;
 exception when raise_exception then rejected:=true;
 end;
 if not rejected then raise exception 'Foreign evidence was accepted'; end if;
 if not exists(select 1 from public.tax_claim_history where claim_id=c.id and action='UPDATE') then raise exception 'Missing audit history'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 if exists(select 1 from public.tax_claims where id=current_setting('test.claim')::uuid) then raise exception 'RLS leaked claim'; end if;
 if exists(select 1 from public.tax_claim_history where claim_id=current_setting('test.claim')::uuid) then raise exception 'RLS leaked history'; end if;
end $$;
reset role;
update public.receipts set total_amount=30 where id=current_setting('test.receipt')::uuid;
do $$ declare c public.tax_claims; begin
 select * into c from public.tax_claims where id=current_setting('test.claim')::uuid;
 if c.status<>'needs_review' or c.eligibility_confirmed or c.eligible_amount<>30 then raise exception 'Changed receipt did not invalidate confirmation'; end if;
end $$;
select 'PASS: draft creation, confirmation, year validation, evidence ownership, RLS, audit and receipt invalidation' as result;
rollback;
