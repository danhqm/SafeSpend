begin;

alter table public.receipts add column image_sha256 text
  check (image_sha256 is null or image_sha256 ~ '^[a-f0-9]{64}$');
create unique index receipts_owner_image_sha256_key on public.receipts(user_id,image_sha256)
  where image_sha256 is not null;
create index receipts_owner_duplicate_review_idx on public.receipts(user_id,receipt_date,total_amount);

-- Receipt evidence never authorizes posting, including older app tax scans.
create or replace function private.create_receipt_transaction()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.transactions(user_id,receipt_id,transaction_type,amount,currency,occurred_on,
   merchant_name,category,source,status,created_at,updated_at)
 values(new.user_id,new.id,'expense',greatest(coalesce(new.total_amount,0),0),'MYR',
   coalesce(new.receipt_date,new.created_at::date,current_date),new.merchant_name,
   case when new.category in ('FOOD_AND_DRINK','GROCERIES','TRANSPORT','SHOPPING','BILLS',
    'ENTERTAINMENT','HEALTHCARE','EDUCATION','HOUSING') then new.category else 'OTHER' end,
   'receipt','draft',coalesce(new.created_at,now()),coalesce(new.created_at,now()))
 on conflict(receipt_id) do nothing;
 return new;
end $$;
revoke all on function private.create_receipt_transaction() from public,anon,authenticated;

create function private.ensure_receipt_tax_claim(p_receipt public.receipts)
returns public.tax_claims language plpgsql security invoker set search_path='' as $$
declare result public.tax_claims;
begin
 insert into public.tax_claims(user_id,tax_year,receipt_id,title,amount,eligible_amount,occurred_on)
 values(p_receipt.user_id,extract(year from p_receipt.receipt_date)::integer,p_receipt.id,
  left(coalesce(nullif(p_receipt.merchant_name,''),'Receipt to review'),250),p_receipt.total_amount,0,p_receipt.receipt_date)
 on conflict(receipt_id) do nothing;
 select * into strict result from public.tax_claims where receipt_id=p_receipt.id and user_id=p_receipt.user_id;
 return result;
end $$;
revoke all on function private.ensure_receipt_tax_claim(public.receipts) from public,anon,authenticated;
grant execute on function private.ensure_receipt_tax_claim(public.receipts) to service_role;

create function public.attach_receipt_tax_claim(p_receipt_id uuid)
returns public.tax_claims language plpgsql security definer set search_path='' as $$
declare evidence public.receipts; result public.tax_claims; owner_id uuid := auth.uid();
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into evidence from public.receipts where id=p_receipt_id and user_id=owner_id for update;
 if not found then raise exception 'Receipt not available' using errcode='42501'; end if;
 if evidence.receipt_date is null or evidence.total_amount is null then
  raise exception 'Review the receipt date and amount first' using errcode='22023';
 end if;
 result := private.ensure_receipt_tax_claim(evidence);
 return result;
end $$;
revoke all on function public.attach_receipt_tax_claim(uuid) from public,anon;
grant execute on function public.attach_receipt_tax_claim(uuid) to authenticated;

-- Only the authenticated server invokes ingestion. The transaction lock and
-- unique owner/hash index make duplicate retries and cross-feature scans reuse
-- one receipt. Similar purchases require explicit review; they are never merged.
create function public.ingest_scanned_receipt(p_user_id uuid,p_receipt jsonb,p_hash text,
 p_image_path text,p_tax_review boolean default false,p_allow_duplicate boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare evidence public.receipts; ledger public.transactions; existing_id uuid; reused boolean := false;
 merchant text; amount numeric; purchased date; category text;
begin
 if current_user <> 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_user_id is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then
  raise exception 'Invalid receipt identity' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_hash,0));
 select * into evidence from public.receipts where user_id=p_user_id and image_sha256=p_hash for update;
 if found then reused:=true;
 else
  if p_receipt is null or p_receipt->>'currency' is distinct from 'MYR'
   or jsonb_typeof(p_receipt->'total_amount') is distinct from 'number'
   or jsonb_typeof(p_receipt->'items') is distinct from 'array'
   or jsonb_array_length(p_receipt->'items')>100
   or p_image_path is null or p_image_path !~ ('^'||p_user_id::text||'/[a-f0-9-]+\.(jpg|png)$') then
   raise exception 'Only reviewed MYR receipt evidence is supported' using errcode='22023';
  end if;
  merchant:=nullif(btrim(p_receipt->>'merchant_name'),''); amount:=(p_receipt->>'total_amount')::numeric;
  purchased:=(p_receipt->>'receipt_date')::date; category:=p_receipt->>'category';
  if merchant is null or length(merchant)>250 or amount<=0 or amount>9999999999.99
   or purchased is null or purchased<date '2000-01-01' or purchased>date '2100-12-31' then
   raise exception 'Receipt facts require review' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || lower(merchant) || ':' || purchased::text || ':' || round(amount,2)::text,1));
  if not coalesce(p_allow_duplicate,false) then
   select id into existing_id from public.receipts where user_id=p_user_id and receipt_date=purchased
    and total_amount=round(amount,2) and lower(btrim(merchant_name))=lower(merchant) order by id limit 1;
   if found then return jsonb_build_object('outcome','possible_duplicate','receipt_id',existing_id); end if;
  end if;
  if category is null or category not in ('FOOD_AND_DRINK','GROCERIES','TRANSPORT','SHOPPING','BILLS',
   'ENTERTAINMENT','HEALTHCARE','EDUCATION','HOUSING','OTHER') then category:='OTHER'; end if;
  insert into public.receipts(user_id,merchant_name,total_amount,receipt_date,items,image_url,category,
   lhdn_category,tax_year,image_sha256,ai_validation_passed)
  values(p_user_id,merchant,round(amount,2),purchased,p_receipt->'items',p_image_path,category,
   case when p_tax_review then 'Tax review' else null end,
   case when p_tax_review then extract(year from purchased)::integer else null end,p_hash,null)
  returning * into evidence;
 end if;
 if p_tax_review then perform private.ensure_receipt_tax_claim(evidence); end if;
 select * into strict ledger from public.transactions where receipt_id=evidence.id and user_id=p_user_id;
 return jsonb_build_object('outcome','saved','receipt',to_jsonb(evidence),'transaction',to_jsonb(ledger),'reused',reused);
end $$;
revoke all on function public.ingest_scanned_receipt(uuid,jsonb,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.ingest_scanned_receipt(uuid,jsonb,text,text,boolean,boolean) to service_role;

comment on column public.receipts.image_sha256 is 'Exact image fingerprint scoped to owner; not a legal purchase identity.';
comment on function public.attach_receipt_tax_claim(uuid) is 'Reuses owned receipt evidence without creating or posting another expense.';
commit;
