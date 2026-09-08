-- Shared fixed-window limits survive process restarts and apply consistently
-- across horizontally scaled application instances.
create table public.api_rate_limit_state (
  bucket text not null,
  identity_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null,
  primary key (bucket, identity_hash),
  constraint api_rate_limit_bucket_format
    check (bucket ~ '^[a-z0-9:_-]{1,80}$'),
  constraint api_rate_limit_identity_hash_format
    check (identity_hash ~ '^[0-9a-f]{64}$'),
  constraint api_rate_limit_request_count_positive check (request_count > 0)
);

alter table public.api_rate_limit_state enable row level security;
revoke all on public.api_rate_limit_state from anon, authenticated;
grant all on public.api_rate_limit_state to service_role;

create function public.consume_api_rate_limit(
  p_bucket text,
  p_identity_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_time timestamptz := clock_timestamp();
  current_window timestamptz;
  observed_count integer;
begin
  if p_bucket !~ '^[a-z0-9:_-]{1,80}$'
     or p_identity_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1 or p_limit > 100000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid API rate limit parameters';
  end if;

  current_window := to_timestamp(
    floor(extract(epoch from current_time) / p_window_seconds)
    * p_window_seconds
  );

  insert into public.api_rate_limit_state as state (
    bucket, identity_hash, window_started_at, request_count
  ) values (
    p_bucket, p_identity_hash, current_window, 1
  )
  on conflict (bucket, identity_hash) do update
  set window_started_at = case
        when state.window_started_at < current_window then current_window
        else state.window_started_at
      end,
      request_count = case
        when state.window_started_at < current_window then 1
        else state.request_count + 1
      end
  returning request_count into observed_count;

  if observed_count <= p_limit then
    return 0;
  end if;

  return greatest(
    1,
    ceil(extract(epoch from current_window + make_interval(secs => p_window_seconds) - current_time))::integer
  );
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;
