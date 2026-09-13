begin;

create table private.api_quota_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  window_seconds integer not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, endpoint, window_seconds, window_start),
  constraint api_quota_windows_endpoint_valid check (
    char_length(endpoint) between 1 and 80
    and endpoint ~ '^[a-z0-9_-]+$'
  ),
  constraint api_quota_windows_window_valid check (window_seconds between 1 and 604800),
  constraint api_quota_windows_count_nonnegative check (request_count >= 0)
);

revoke all on private.api_quota_windows from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.api_quota_windows to service_role;

create or replace function public.consume_api_quota(
  p_user_id uuid,
  p_endpoint text,
  p_burst_limit integer,
  p_burst_window_seconds integer,
  p_daily_limit integer,
  p_daily_window_seconds integer default 86400
)
returns table (
  allowed boolean,
  limit_scope text,
  burst_remaining integer,
  daily_remaining integer,
  retry_after integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_burst_start timestamptz;
  v_daily_start timestamptz;
  v_burst_count integer;
  v_daily_count integer;
begin
  if current_user <> 'service_role' then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_user_id is null
    or p_endpoint is null
    or char_length(p_endpoint) not between 1 and 80
    or p_endpoint !~ '^[a-z0-9_-]+$'
    or p_burst_limit not between 1 and 10000
    or p_daily_limit not between 1 and 100000
    or p_burst_window_seconds not between 1 and 604800
    or p_daily_window_seconds not between 1 and 604800
    or p_burst_window_seconds >= p_daily_window_seconds
  then
    raise exception 'Invalid API quota configuration' using errcode = '22023';
  end if;

  v_burst_start := to_timestamp(
    floor(extract(epoch from v_now) / p_burst_window_seconds) * p_burst_window_seconds
  );
  v_daily_start := to_timestamp(
    floor(extract(epoch from v_now) / p_daily_window_seconds) * p_daily_window_seconds
  );

  -- Always create and lock the longer window first so concurrent calls acquire
  -- locks in the same order.
  insert into private.api_quota_windows (
    user_id, endpoint, window_seconds, window_start, request_count
  ) values (
    p_user_id, p_endpoint, p_daily_window_seconds, v_daily_start, 0
  ) on conflict do nothing;

  insert into private.api_quota_windows (
    user_id, endpoint, window_seconds, window_start, request_count
  ) values (
    p_user_id, p_endpoint, p_burst_window_seconds, v_burst_start, 0
  ) on conflict do nothing;

  select quota.request_count
  into v_daily_count
  from private.api_quota_windows quota
  where quota.user_id = p_user_id
    and quota.endpoint = p_endpoint
    and quota.window_seconds = p_daily_window_seconds
    and quota.window_start = v_daily_start
  for update;

  select quota.request_count
  into v_burst_count
  from private.api_quota_windows quota
  where quota.user_id = p_user_id
    and quota.endpoint = p_endpoint
    and quota.window_seconds = p_burst_window_seconds
    and quota.window_start = v_burst_start
  for update;

  if v_daily_count >= p_daily_limit then
    return query select
      false,
      'daily'::text,
      greatest(p_burst_limit - v_burst_count, 0),
      0,
      greatest(
        1,
        ceil(extract(epoch from (
          v_daily_start + make_interval(secs => p_daily_window_seconds) - v_now
        )))::integer
      );
    return;
  end if;

  if v_burst_count >= p_burst_limit then
    return query select
      false,
      'burst'::text,
      0,
      greatest(p_daily_limit - v_daily_count, 0),
      greatest(
        1,
        ceil(extract(epoch from (
          v_burst_start + make_interval(secs => p_burst_window_seconds) - v_now
        )))::integer
      );
    return;
  end if;

  update private.api_quota_windows quota
  set request_count = quota.request_count + 1,
      updated_at = v_now
  where quota.user_id = p_user_id
    and quota.endpoint = p_endpoint
    and (
      (quota.window_seconds = p_daily_window_seconds and quota.window_start = v_daily_start)
      or
      (quota.window_seconds = p_burst_window_seconds and quota.window_start = v_burst_start)
    );

  -- Bound storage without a global scan; the primary key supports this prefix/range delete.
  delete from private.api_quota_windows quota
  where quota.user_id = p_user_id
    and quota.endpoint = p_endpoint
    and quota.window_start < v_daily_start - interval '8 days';

  return query select
    true,
    null::text,
    p_burst_limit - v_burst_count - 1,
    p_daily_limit - v_daily_count - 1,
    0;
end
$$;

revoke all on function public.consume_api_quota(uuid, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_quota(uuid, text, integer, integer, integer, integer)
  to service_role;

comment on table private.api_quota_windows is
  'Fixed-window per-user counters for server-side API cost controls.';
comment on function public.consume_api_quota(uuid, text, integer, integer, integer, integer) is
  'Atomically checks and consumes burst and daily backend API quota.';

commit;
