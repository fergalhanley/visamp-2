-- Prepaid AI credits are an append-only ledger. Configuration lives in one
-- service-role-only row so pricing/grants can change without an application
-- deploy. The signup grant defaults to zero until CAPTCHA is enabled.
create type public.ai_credit_transaction_kind as enum (
  'signup_grant',
  'generation_charge',
  'refund',
  'adjustment'
);

create table public.ai_credit_settings (
  singleton boolean primary key default true check (singleton),
  signup_grant integer not null default 0 check (signup_grant >= 0),
  generation_cost integer not null default 1 check (generation_cost > 0),
  updated_at timestamptz not null default now()
);

insert into public.ai_credit_settings (singleton) values (true);

alter table public.ai_generation_requests
  add column credit_cost integer not null default 1 check (credit_cost > 0);

create table public.ai_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.ai_credit_transaction_kind not null,
  amount integer not null check (amount <> 0),
  generation_request_id uuid references public.ai_generation_requests(id),
  created_at timestamptz not null default now(),
  constraint ai_credit_generation_charge_shape check (
    (kind = 'generation_charge' and amount < 0 and generation_request_id is not null)
    or (kind <> 'generation_charge' and generation_request_id is null)
  ),
  constraint ai_credit_generation_charge_once unique (generation_request_id)
);

create index ai_credit_transactions_user_idx
  on public.ai_credit_transactions (user_id, created_at desc);
create unique index ai_credit_signup_grant_once
  on public.ai_credit_transactions (user_id)
  where kind = 'signup_grant';

alter table public.ai_credit_settings enable row level security;
alter table public.ai_credit_transactions enable row level security;
revoke all on public.ai_credit_settings from anon, authenticated;
revoke all on public.ai_credit_transactions from anon, authenticated;
grant all on public.ai_credit_settings to service_role;
grant all on public.ai_credit_transactions to service_role;

create function public.grant_initial_ai_credits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  grant_amount integer;
begin
  select signup_grant into grant_amount
  from public.ai_credit_settings
  where singleton;

  if coalesce(grant_amount, 0) > 0 then
    insert into public.ai_credit_transactions (user_id, kind, amount)
    values (new.id, 'signup_grant', grant_amount)
    on conflict (user_id) where kind = 'signup_grant' do nothing;
  end if;
  return new;
end;
$$;

create trigger auth_users_grant_initial_ai_credits
  after insert on auth.users
  for each row execute function public.grant_initial_ai_credits();

-- Replace admission with the same RPC signature, now reserving enough balance
-- for every running request so concurrent generations cannot overspend.
create or replace function public.begin_ai_generation(
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
  configured_cost integer;
  available_credits bigint;
begin
  if p_user_id is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid AI generation identity';
  end if;
  if p_user_limit < 1 or p_ip_limit < 1
     or p_window_seconds < 1 or p_concurrent_limit < 1 then
    raise exception 'AI generation limits must be positive';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('ai-user:' || p_user_id::text, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('ai-ip:' || p_ip_hash, 0)
  );

  update public.ai_generation_requests
  set status = 'aborted', completed_at = now()
  where user_id = p_user_id
    and status = 'running'
    and created_at <= now() - interval '10 minutes';

  if (
    select count(*) from public.ai_generation_requests as request
    where request.user_id = p_user_id
      and request.status = 'running'
      and request.created_at > now() - interval '10 minutes'
  ) >= p_concurrent_limit then
    return 'concurrency';
  end if;

  window_start := now() - make_interval(secs => p_window_seconds);
  if (
    select count(*) from public.ai_generation_requests as request
    where request.user_id = p_user_id and request.created_at > window_start
  ) >= p_user_limit then
    return 'user_rate';
  end if;
  if (
    select count(*) from public.ai_generation_requests as request
    where request.ip_hash = p_ip_hash and request.created_at > window_start
  ) >= p_ip_limit then
    return 'ip_rate';
  end if;

  select generation_cost into configured_cost
  from public.ai_credit_settings
  where singleton;
  if configured_cost is null then
    raise exception 'AI credit settings are missing';
  end if;

  select
    coalesce((
      select sum(transaction.amount)
      from public.ai_credit_transactions as transaction
      where transaction.user_id = p_user_id
    ), 0)
    - coalesce((
      select sum(request.credit_cost)
      from public.ai_generation_requests as request
      where request.user_id = p_user_id
        and request.status = 'running'
        and request.created_at > now() - interval '10 minutes'
    ), 0)
  into available_credits;

  if available_credits < configured_cost then
    return 'insufficient_credit';
  end if;

  insert into public.ai_generation_requests (
    id, user_id, ip_hash, credit_cost
  ) values (
    p_request_id, p_user_id, p_ip_hash, configured_cost
  );
  return 'allowed';
end;
$$;

create function public.complete_ai_generation(
  p_request_id uuid,
  p_status public.ai_generation_request_status,
  p_attempts integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.ai_generation_requests%rowtype;
begin
  if p_status = 'running' or p_attempts < 0 or p_attempts > 10 then
    raise exception 'invalid AI generation completion';
  end if;

  select * into request
  from public.ai_generation_requests
  where id = p_request_id
  for update;

  if not found or request.status <> 'running' then
    return false;
  end if;

  if p_status = 'success' then
    insert into public.ai_credit_transactions (
      user_id, kind, amount, generation_request_id
    ) values (
      request.user_id,
      'generation_charge',
      -request.credit_cost,
      request.id
    );
  end if;

  update public.ai_generation_requests
  set status = p_status,
      attempts = p_attempts,
      completed_at = now()
  where id = p_request_id;
  return true;
end;
$$;

revoke all on function public.grant_initial_ai_credits()
  from public, anon, authenticated;
revoke all on function public.complete_ai_generation(
  uuid, public.ai_generation_request_status, integer
) from public, anon, authenticated;
grant execute on function public.complete_ai_generation(
  uuid, public.ai_generation_request_status, integer
) to service_role;
