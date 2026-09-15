-- Quiz completion is awarded only by the server-side scoring function.
drop policy if exists user_progress_insert_own
  on public.user_path_progress;

create policy user_progress_insert_non_quiz
on public.user_path_progress
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.learning_modules module
    join public.learning_paths path on path.id = module.path_id
    where module.id = user_path_progress.module_id
      and module.module_type in ('lesson', 'action')
      and path.is_published is true
      and (path.publish_date is null or path.publish_date <= now())
  )
);

drop policy if exists user_progress_update_own
  on public.user_path_progress;

create policy user_progress_update_non_quiz
on public.user_path_progress
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.learning_modules module
    join public.learning_paths path on path.id = module.path_id
    where module.id = user_path_progress.module_id
      and module.module_type in ('lesson', 'action')
      and path.is_published is true
      and (path.publish_date is null or path.publish_date <= now())
  )
);
