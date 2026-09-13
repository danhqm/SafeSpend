-- REVIEW-ONLY: this migration has not been applied to the hosted project.
-- It is intentionally transactional so a failed preflight rolls everything back.
begin;

-- Stop before structural changes if legacy profile rows cannot be constrained safely.
do $$
begin
  if exists (select 1 from public.users where user_id is null) then
    raise exception 'Preflight failed: public.users contains a null user_id';
  end if;
  if exists (
    select user_id from public.users group by user_id having count(*) > 1
  ) then
    raise exception 'Preflight failed: public.users contains duplicate user_id values';
  end if;
  if exists (select 1 from public.receipts where user_id is null) then
    raise exception 'Preflight failed: public.receipts contains a null user_id';
  end if;
end
$$;

-- Normalize the profile schema and remove the unused password-shaped column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'monthy_income'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'monthly_income'
  ) then
    alter table public.users rename column monthy_income to monthly_income;
  end if;
end
$$;

alter table public.users
  alter column user_id set not null,
  alter column monthly_income type numeric(12,2)
    using nullif(btrim(monthly_income::text), '')::numeric,
  drop column if exists password;

alter table public.receipts
  alter column user_id set not null,
  alter column created_at type timestamptz using created_at at time zone 'UTC';

alter table public.users
  alter column created_at type timestamptz using created_at at time zone 'UTC';

-- Correct legacy LHDN rows whose tax year was derived from scan time, not receipt date.
update public.receipts
set tax_year = extract(year from receipt_date)::integer
where lhdn_category is not null
  and receipt_date is not null
  and tax_year is distinct from extract(year from receipt_date)::integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass and conname = 'users_user_id_key'
  ) then
    alter table public.users add constraint users_user_id_key unique (user_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass and conname = 'users_user_id_fkey'
  ) then
    alter table public.users add constraint users_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass and conname = 'users_monthly_income_nonnegative'
  ) then
    alter table public.users add constraint users_monthly_income_nonnegative
      check (monthly_income is null or monthly_income >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.receipts'::regclass and conname = 'receipts_user_id_fkey'
  ) then
    alter table public.receipts add constraint receipts_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.receipts'::regclass and conname = 'receipts_total_amount_nonnegative'
  ) then
    alter table public.receipts add constraint receipts_total_amount_nonnegative
      check (total_amount >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.receipts'::regclass and conname = 'receipts_category_valid'
  ) then
    alter table public.receipts add constraint receipts_category_valid check (
      category is null or category in (
        'FOOD_AND_DRINK', 'GROCERIES', 'TRANSPORT', 'SHOPPING',
        'BILLS', 'ENTERTAINMENT', 'OTHER', 'TAX_RELIEF'
      )
    );
  end if;
end
$$;

create index if not exists receipts_user_created_idx
  on public.receipts (user_id, created_at desc);
create index if not exists receipts_user_lhdn_created_idx
  on public.receipts (user_id, lhdn_category, created_at desc);
create index if not exists learning_modules_path_id_idx
  on public.learning_modules (path_id);
create index if not exists user_path_progress_module_id_idx
  on public.user_path_progress (module_id);

-- Create profiles from trusted Auth rows, including sign-ups awaiting email confirmation.
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  profile_username text;
  profile_dob date;
  profile_income numeric(12,2);
begin
  requested_username := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
  profile_username := coalesce(requested_username, split_part(new.email, '@', 1));

  if exists (select 1 from public.users where username = profile_username) then
    profile_username := profile_username || '_' || substr(new.id::text, 1, 8);
  end if;

  begin
    profile_dob := nullif(new.raw_user_meta_data ->> 'dob', '')::date;
  exception when others then
    profile_dob := null;
  end;

  begin
    profile_income := nullif(new.raw_user_meta_data ->> 'monthly_income', '')::numeric(12,2);
  exception when others then
    profile_income := null;
  end;

  insert into public.users (user_id, username, email, mobile, dob, monthly_income)
  values (
    new.id,
    profile_username,
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'mobile'), ''),
    profile_dob,
    profile_income
  )
  on conflict (user_id) do nothing;
  return new;
end
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- Rebuild user-owned policies with authenticated-only roles and cached auth.uid().
alter table public.users enable row level security;
alter table public.receipts enable row level security;
alter table public.user_goals enable row level security;
alter table public.user_path_progress enable row level security;
alter table public.user_streaks enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('users', 'receipts', 'user_goals', 'user_path_progress', 'user_streaks')
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end
$$;

create policy users_select_own on public.users for select to authenticated
  using ((select auth.uid()) = user_id);
create policy users_update_own on public.users for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy receipts_select_own on public.receipts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy receipts_delete_own on public.receipts for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy user_goals_select_own on public.user_goals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy user_goals_insert_own on public.user_goals for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy user_goals_update_own on public.user_goals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_goals_delete_own on public.user_goals for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy user_progress_select_own on public.user_path_progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy user_progress_insert_own on public.user_path_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy user_progress_update_own on public.user_path_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_progress_delete_own on public.user_path_progress for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy user_streaks_select_own on public.user_streaks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy user_streaks_insert_own on public.user_streaks for insert to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.users, public.receipts, public.user_goals,
  public.user_path_progress, public.user_streaks,
  public.learning_paths, public.learning_modules from anon;
grant select, update on public.users to authenticated;
grant select, delete on public.receipts to authenticated;
grant select, insert, update, delete on public.user_goals to authenticated;
grant select, insert, update, delete on public.user_path_progress to authenticated;
grant select, insert on public.user_streaks to authenticated;
grant select on public.learning_paths, public.learning_modules to authenticated;

-- Private buckets: backend uploads receipts; authenticated users receive short-lived URLs.
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png']
where id in ('receipts', 'avatars');

drop policy if exists receipt_images_select_own on storage.objects;
create policy receipt_images_select_own on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.receipts receipt
      where receipt.user_id = (select auth.uid())
        and right(receipt.image_url, length(name)) = name
    )
  )
);

drop policy if exists avatar_images_select_own on storage.objects;
drop policy if exists avatar_images_insert_own on storage.objects;
drop policy if exists avatar_images_update_own on storage.objects;
drop policy if exists avatar_images_delete_own on storage.objects;
create policy avatar_images_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatar_images_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatar_images_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatar_images_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
