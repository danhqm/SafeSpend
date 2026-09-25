begin;
create table public.tax_rules (
  year integer not null, id text not null, version text not null,
  definition jsonb not null, primary key(year,id),
  check (definition->>'id'=id and (definition->>'year')::integer=year)
);
insert into public.tax_rules(year,id,version,definition)
select (r->>'year')::integer,r->>'id',r->>'version',r
from jsonb_array_elements('[{"id":"individual","year":2025,"version":"2025.1","category":"Personal","title":"Individual and dependent relatives","cap":9000,"mode":"fixed","condition":"I was a Malaysian tax resident for this assessment year.","group":null,"groupCap":null,"legacy":"asas_individu","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Personal declaration / relevant certification"},{"id":"disabled_self","year":2025,"version":"2025.1","category":"Personal","title":"Disabled individual","cap":7000,"mode":"fixed","condition":"I have the required disability certification.","group":null,"groupCap":null,"legacy":"med_oku","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Personal declaration / relevant certification"},{"id":"spouse","year":2025,"version":"2025.1","category":"Personal","title":"Spouse / alimony","cap":4000,"mode":"expense","condition":"My spouse / alimony claim meets the assessment and income conditions; qualifying alimony excludes child maintenance.","group":null,"groupCap":null,"legacy":"pasangan_alimoni","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"disabled_spouse","year":2025,"version":"2025.1","category":"Personal","title":"Disabled spouse","cap":6000,"mode":"fixed","condition":"My spouse has the required disability certification and I qualify to claim this relief.","group":null,"groupCap":null,"legacy":"pasangan_oku","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Personal declaration / relevant certification"},{"id":"education","year":2025,"version":"2025.1","category":"Education","title":"Self education fees","cap":7000,"mode":"expense","condition":"The qualification, institution and field of study meet HASiL requirements.","group":"education","groupCap":7000,"legacy":"edu_sendiri","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"skills","year":2025,"version":"2025.1","category":"Education","title":"Recognised skills / self-development courses","cap":2000,"mode":"expense","condition":"This is a qualifying recognised course; I have not also claimed it under lifestyle.","group":"education","groupCap":7000,"legacy":null,"source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"parents","year":2025,"version":"2025.1","category":"Medical","title":"Parents / grandparents medical care","cap":8000,"mode":"expense","condition":"The care and beneficiary qualify, with medical certification where required.","group":"parents","groupCap":8000,"legacy":"med_ibubapa","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"parents_check","year":2025,"version":"2025.1","category":"Medical","title":"Parents / grandparents full medical examination","cap":1000,"mode":"expense","condition":"This is a qualifying full medical examination for my parent or grandparent.","group":"parents","groupCap":8000,"legacy":null,"source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"equipment","year":2025,"version":"2025.1","category":"Medical","title":"Disability supporting equipment","cap":6000,"mode":"expense","condition":"This is basic supporting equipment for an eligible disabled family member with the required certification.","group":null,"groupCap":null,"legacy":"med_sokongan","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"medical","year":2025,"version":"2025.1","category":"Medical","title":"Serious illness / fertility treatment","cap":10000,"mode":"expense","condition":"This is qualifying serious-illness or fertility treatment for an eligible beneficiary.","group":"medical","groupCap":10000,"legacy":"med_gabungan","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"vaccination","year":2025,"version":"2025.1","category":"Medical","title":"Vaccinations","cap":1000,"mode":"expense","condition":"These are qualifying vaccinations for myself, spouse or child.","group":"medical","groupCap":10000,"legacy":null,"source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"dental","year":2025,"version":"2025.1","category":"Medical","title":"Dental examination / treatment","cap":1000,"mode":"expense","condition":"These are qualifying dental costs for myself, spouse or child.","group":"medical","groupCap":10000,"legacy":null,"source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"checkup","year":2025,"version":"2025.1","category":"Medical","title":"Check-ups, mental health and health screening","cap":1000,"mode":"expense","condition":"These costs meet the eligible examination, consultation, testing or screening-equipment requirements.","group":"medical","groupCap":10000,"legacy":null,"source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"learning","year":2025,"version":"2025.1","category":"Medical","title":"Child learning-disability intervention","cap":6000,"mode":"expense","condition":"The child is 18 or younger and the assessment / intervention and provider qualify.","group":"medical","groupCap":10000,"legacy":null,"source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"lifestyle","year":2025,"version":"2025.1","category":"Lifestyle","title":"Books, devices, internet and courses","cap":2500,"mode":"expense","condition":"These are eligible personal-use purchases; internet is in my name and no item is claimed elsewhere.","group":null,"groupCap":null,"legacy":"life_asas","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"sports","year":2025,"version":"2025.1","category":"Lifestyle","title":"Sports equipment, facilities and training","cap":1000,"mode":"expense","condition":"The activity, provider and beneficiary meet the sports relief conditions.","group":null,"groupCap":null,"legacy":"life_sukan","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"breastfeeding","year":2025,"version":"2025.1","category":"Family","title":"Breastfeeding equipment","cap":1000,"mode":"expense","condition":"I am the mother, my child is 2 or younger, the equipment qualifies, and I did not claim this in the previous assessment year.","group":null,"groupCap":null,"legacy":"life_susu","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"childcare","year":2025,"version":"2025.1","category":"Family","title":"Registered childcare / kindergarten","cap":3000,"mode":"expense","condition":"My child is 6 or younger, the provider is registered, and my spouse is not claiming the same relief.","group":null,"groupCap":null,"legacy":"edu_tadika","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"sspn","year":2025,"version":"2025.1","category":"Savings","title":"SSPN net savings","cap":8000,"mode":"expense","condition":"I used the qualifying annual net savings from my SSPN statement, applying the withdrawal and parent-claim rules.","group":null,"groupCap":null,"legacy":"edu_sspn","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"epf","year":2025,"version":"2025.1","category":"Savings","title":"EPF / approved scheme contributions","cap":4000,"mode":"expense","condition":"These contributions qualify for the RM4,000 category and are not included in another claim.","group":"epf_life","groupCap":7000,"legacy":null,"source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"life","year":2025,"version":"2025.1","category":"Savings","title":"Life insurance / takaful / additional voluntary EPF","cap":3000,"mode":"expense","condition":"These premiums or additional voluntary contributions qualify for this category and are not counted twice.","group":"epf_life","groupCap":7000,"legacy":null,"source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"insurance","year":2025,"version":"2025.1","category":"Savings","title":"Education / medical insurance","cap":4000,"mode":"expense","condition":"I used the eligible premium amount from the insurer''s annual tax statement.","group":null,"groupCap":null,"legacy":"ins_med_edu","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"prs","year":2025,"version":"2025.1","category":"Savings","title":"PRS / deferred annuity","cap":3000,"mode":"expense","condition":"These are qualifying contributions to an approved PRS or deferred annuity.","group":null,"groupCap":null,"legacy":"ins_prs","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"socso","year":2025,"version":"2025.1","category":"Savings","title":"SOCSO / EIS","cap":350,"mode":"expense","condition":"These are my eligible SOCSO / EIS contributions for the year.","group":null,"groupCap":null,"legacy":"ins_perkeso","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"ev","year":2025,"version":"2025.1","category":"Other","title":"EV charging / domestic composting equipment","cap":2500,"mode":"expense","condition":"These costs meet the permitted equipment / subscription conditions and are not for business use.","group":null,"groupCap":null,"legacy":"lain_ev","source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"home_low","year":2025,"version":"2025.1","category":"Other","title":"First-home loan interest: home up to RM500,000","cap":7000,"mode":"expense","condition":"I meet the first-home conditions: qualifying residential property, SPA dated 2025–2027, within the three consecutive claim years, no rental income, and only my eligible share of interest.","group":"home","groupCap":7000,"legacy":null,"source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"},{"id":"home_high","year":2025,"version":"2025.1","category":"Other","title":"First-home loan interest: RM500,001–RM750,000","cap":5000,"mode":"expense","condition":"I meet the first-home conditions: qualifying residential property, SPA dated 2025–2027, within the three consecutive claim years, no rental income, and only my eligible share of interest.","group":"home","groupCap":7000,"legacy":null,"source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Receipt, payment record or annual statement"}]'::jsonb) r;
update public.tax_rules set definition=definition || '{"title":"Spouse relief","mode":"fixed","condition":"I qualify for spouse relief under the applicable income and assessment conditions.","group":"spouse","groupCap":4000,"documents":"Personal declaration / marriage and income evidence"}'::jsonb where id='spouse' and year=2025;
insert into public.tax_rules(year,id,version,definition) values(2025,'alimony','2025.1',
'{"id":"alimony","year":2025,"version":"2025.1","category":"Personal","title":"Alimony to former wife","cap":4000,"mode":"expense","condition":"These are qualifying alimony payments to my former wife, excluding child maintenance.","group":"spouse","groupCap":4000,"legacy":null,"source":"https://www.hasil.gov.my/individu/pelepasan-cukai/","reviewed":"2026-09-25","kind":"relief","documents":"Payment record and supporting agreement"}'::jsonb);
alter table public.tax_rules enable row level security;
revoke all on public.tax_rules from anon,authenticated;
grant select on public.tax_rules to authenticated;
create policy tax_rules_read on public.tax_rules for select to authenticated using(true);

create table public.tax_claims (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 tax_year integer not null check(tax_year between 2000 and 2100),
 rule_id text, rule_version text,
 receipt_id uuid unique references public.receipts(id) on delete set null,
 title text not null check(length(title) between 1 and 250),
 amount numeric(12,2) not null default 0 check(amount>=0),
 eligible_amount numeric(12,2) not null default 0 check(eligible_amount>=0 and eligible_amount<=amount),
 status text not null default 'needs_review' check(status in ('suggested','needs_review','confirmed','rejected')),
 beneficiary text not null default '' check(length(beneficiary)<=200),
 evidence_note text not null default '' check(length(evidence_note)<=2000),
 eligibility_confirmed boolean not null default false,
 occurred_on date,
 eligible_items jsonb not null default '[]'::jsonb check(jsonb_typeof(eligible_items)='array'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index tax_claims_owner_year_idx on public.tax_claims(user_id,tax_year);
alter table public.tax_claims enable row level security;
revoke all on public.tax_claims from anon,authenticated;
grant select,insert,update,delete on public.tax_claims to authenticated;
create policy tax_claims_select on public.tax_claims for select to authenticated using(user_id=(select auth.uid()));
create policy tax_claims_insert on public.tax_claims for insert to authenticated with check(user_id=(select auth.uid()));
create policy tax_claims_update on public.tax_claims for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy tax_claims_delete on public.tax_claims for delete to authenticated using(user_id=(select auth.uid()));

create table public.tax_claim_history(
 id bigint generated always as identity primary key,
 claim_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
 action text not null, snapshot jsonb not null, recorded_at timestamptz not null default now()
);
create index tax_claim_history_owner_claim_idx on public.tax_claim_history(user_id,claim_id);
alter table public.tax_claim_history enable row level security;
revoke all on public.tax_claim_history from anon,authenticated;
grant select on public.tax_claim_history to authenticated;
create policy tax_history_select on public.tax_claim_history for select to authenticated using(user_id=(select auth.uid()));

create function private.validate_tax_claim() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.tax_rules; evidence public.receipts;
begin
 if tg_op='UPDATE' then
   if new.user_id<>old.user_id then raise exception 'Claim ownership cannot change'; end if;
   if new.receipt_id is distinct from old.receipt_id and new.receipt_id is null then
     new.status:='needs_review'; new.eligibility_confirmed:=false;
   end if;
 end if;
 if new.receipt_id is not null then
   select * into evidence from public.receipts where id=new.receipt_id and user_id=new.user_id;
   if not found then raise exception 'Receipt is not available to this account'; end if;
   if new.eligible_amount>evidence.total_amount then raise exception 'Claim exceeds receipt total'; end if;
 end if;
 if new.status='confirmed' then
   perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || new.tax_year::text,0));
   if new.rule_id in ('home_low','home_high') and exists(
     select 1 from public.tax_claims c where c.user_id=new.user_id and c.tax_year=new.tax_year
       and c.id<>new.id and c.status='confirmed' and c.rule_id in ('home_low','home_high') and c.rule_id<>new.rule_id
   ) then raise exception 'Choose one first-home price band for the year'; end if;
   select * into r from public.tax_rules where year=new.tax_year and id=new.rule_id;
   if not found or new.rule_version is distinct from r.version then raise exception 'This assessment year or rule has not been reviewed'; end if;
   if not new.eligibility_confirmed or length(trim(new.beneficiary))=0 then raise exception 'Confirm eligibility and beneficiary first'; end if;
   if r.definition->>'mode'='fixed' then
     if new.eligible_amount<>(r.definition->>'cap')::numeric then raise exception 'Use the fixed personal relief amount'; end if;
   else
     if new.occurred_on is null or extract(year from new.occurred_on)<>new.tax_year then raise exception 'Claim date must match assessment year'; end if;
     if new.eligible_amount<=0 then raise exception 'Enter a positive eligible amount'; end if;
     if new.receipt_id is null and length(trim(new.evidence_note))=0 then raise exception 'Describe the supporting document'; end if;
     if new.receipt_id is not null and evidence.receipt_date is distinct from new.occurred_on then raise exception 'Correct the receipt date in Transactions before confirming'; end if;
   end if;
 end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
create trigger tax_claims_validate before insert or update on public.tax_claims for each row execute function private.validate_tax_claim();
revoke all on function private.validate_tax_claim() from public,anon,authenticated;

create function private.audit_tax_claim() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
   if exists(select 1 from auth.users where id=old.user_id) then
     insert into public.tax_claim_history(claim_id,user_id,action,snapshot) values(old.id,old.user_id,tg_op,to_jsonb(old));
   end if;
   return old;
 end if;
 insert into public.tax_claim_history(claim_id,user_id,action,snapshot) values(new.id,new.user_id,tg_op,to_jsonb(new));
 return new;
end $$;
revoke all on function private.audit_tax_claim() from public,anon,authenticated;
create trigger tax_claims_audit after insert or update or delete on public.tax_claims for each row execute function private.audit_tax_claim();

-- Legacy evidence is preserved. No AI result is migrated as a confirmed claim.
insert into public.tax_claims(user_id,tax_year,rule_id,rule_version,receipt_id,title,amount,eligible_amount,occurred_on,evidence_note)
select r.user_id,coalesce(r.tax_year,extract(year from r.receipt_date)::integer,extract(year from r.created_at)::integer),
 t.id,t.version,r.id,left(coalesce(nullif(r.merchant_name,''),'Receipt to review'),250),
 coalesce(r.total_amount,0),0,r.receipt_date,'Imported receipt. Review the exact relief and eligible items.'
from public.receipts r left join public.tax_rules t on t.year=coalesce(r.tax_year,extract(year from r.receipt_date)::integer)
 and t.definition->>'legacy'=r.lhdn_subcategory where r.lhdn_category is not null;

-- The existing OCR endpoint continues to work, including older app installations.
create function private.receipt_tax_draft() returns trigger language plpgsql security definer set search_path='' as $$
declare yr integer; selected public.tax_rules;
begin
 yr:=coalesce(extract(year from new.receipt_date)::integer,new.tax_year,extract(year from new.created_at)::integer);
 if tg_op='INSERT' and new.lhdn_category is not null then
   select * into selected from public.tax_rules where year=yr and (id=new.lhdn_subcategory or definition->>'legacy'=new.lhdn_subcategory) limit 1;
   insert into public.tax_claims(user_id,tax_year,rule_id,rule_version,receipt_id,title,amount,eligible_amount,occurred_on)
   values(new.user_id,yr,selected.id,selected.version,new.id,left(coalesce(nullif(new.merchant_name,''),'Scanned receipt'),250),coalesce(new.total_amount,0),0,new.receipt_date)
   on conflict(receipt_id) do nothing;
 elsif tg_op='UPDATE' then
   if new.total_amount is distinct from old.total_amount or new.receipt_date is distinct from old.receipt_date or new.items is distinct from old.items then
     update public.tax_claims set status='needs_review',eligibility_confirmed=false,
       eligible_amount=least(eligible_amount,coalesce(new.total_amount,0)),
       amount=coalesce(new.total_amount,0),occurred_on=new.receipt_date,tax_year=yr,eligible_items='[]'::jsonb
     where receipt_id=new.id;
   end if;
 end if;
 return new;
end $$;
revoke all on function private.receipt_tax_draft() from public,anon,authenticated;
create trigger receipts_tax_draft after insert or update on public.receipts for each row execute function private.receipt_tax_draft();
commit;
