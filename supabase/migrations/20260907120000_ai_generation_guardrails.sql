-- Durable admission control for paid AI generation requests.
--
-- The route uses the service role, so no browser-facing policy or grant is
-- needed. Keeping admission in one transaction prevents concurrent requests
-- from all observing the same remaining allowance.

create type public.ai_generation_request_status as enum (
  'running',
  'success',
  'exhausted',
  'error',
  'aborted'
);

create table public.ai_generation_requests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ip_hash text not null,
  status public.ai_generation_request_status not null default 'running',
  attempts int not null default 0 check (attempts between 0 and 10),
  created_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint ai_generation_requests_ip_hash_format
    check (ip_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_generation_requests_completion check (
    (status = 'running' and completed_at is null)
    or (status <> 'running' and completed_at is not null)
  )
);

create index ai_generation_requests_user_recent_idx
  on public.ai_generation_requests (user_id, created_at desc);

create index ai_generation_requests_ip_recent_idx
  on public.ai_generation_requests (ip_hash, created_at desc);

create index ai_generation_requests_running_idx
  on public.ai_generation_requests (user_id, created_at desc)
  where status = 'running';

create function public.begin_ai_generation(
  p_request_id uuid,
  p_user_id uuid,
  p_ip_hash text,
  p_user_limit int,
  p_ip_limit int,
  p_window_seconds int,
  p_concurrent_limit int
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  window_start timestamptz;
begin
  if p_user_id is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid AI generation identity';
  end if;
  if p_user_limit < 1 or p_ip_limit < 1
     or p_window_seconds < 1 or p_concurrent_limit < 1 then
    raise exception 'AI generation limits must be positive';
  end if;

  -- Every caller takes these locks in the same order. Requests for one user or
  -- one network identity are serialised without blocking unrelated users.
  perform pg_advisory_xact_lock(
    hashtextextended('ai-user:' || p_user_id::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('ai-ip:' || p_ip_hash, 0)
  );

  if (
    select count(*)
    from public.ai_generation_requests r
    where r.user_id = p_user_id
      and r.status = 'running'
      -- A crashed worker must not occupy a concurrency slot forever.
      and r.created_at > now() - interval '10 minutes'
  ) >= p_concurrent_limit then
    return 'concurrency';
  end if;

  window_start := now() - make_interval(secs => p_window_seconds);

  if (
    select count(*)
    from public.ai_generation_requests r
    where r.user_id = p_user_id and r.created_at > window_start
  ) >= p_user_limit then
    return 'user_rate';
  end if;

  if (
    select count(*)
    from public.ai_generation_requests r
    where r.ip_hash = p_ip_hash and r.created_at > window_start
  ) >= p_ip_limit then
    return 'ip_rate';
  end if;

  insert into public.ai_generation_requests (id, user_id, ip_hash)
  values (p_request_id, p_user_id, p_ip_hash);

  return 'allowed';
end;
$$;

alter table public.ai_generation_requests enable row level security;

revoke all on table public.ai_generation_requests from anon, authenticated;
revoke all on function public.begin_ai_generation(
  uuid, uuid, text, int, int, int, int
) from public, anon, authenticated;

grant all on table public.ai_generation_requests to service_role;
grant execute on function public.begin_ai_generation(
  uuid, uuid, text, int, int, int, int
) to service_role;
