begin;
create or replace function public.consume_api_rate_limit(
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
  v_now timestamptz := clock_timestamp();
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
    floor(extract(epoch from v_now) / p_window_seconds)
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
    ceil(extract(epoch from current_window + make_interval(secs => p_window_seconds) - v_now))::integer
  );
end;
$$;
notify pgrst, 'reload schema';
commit;
