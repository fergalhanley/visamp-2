-- VIS-123. Allocation-based credits, verified grants, exemptions and purchases.
-- Deploy with AI generation paused and no requests running during cutover.
do $$ begin
  if exists (select 1 from public.ai_generation_requests where status = 'running'
    and created_at > now() - interval '10 minutes') then
    raise exception 'Pause AI generation and wait for running requests before migrating';
  end if;
end $$;

alter table public.profiles add column ai_credit_exempt boolean not null default false;
-- Profile UPDATE grants are column-specific; this flag remains service-role only.
alter table public.ai_generation_requests drop constraint ai_generation_requests_credit_cost_check;
alter table public.ai_generation_requests add constraint ai_generation_requests_credit_cost_check check (credit_cost >= 0);
alter table public.ai_credit_settings add column grant_reference text not null default 'signup-v1';
update public.ai_credit_settings set generation_cost = 100, signup_grant = 2000, updated_at = now();

create table public.ai_credit_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('signup', 'discretionary', 'purchase', 'legacy')),
  amount integer not null check (amount > 0),
  remaining integer not null check (remaining >= 0 and remaining <= amount),
  expires_at timestamptz,
  reference text not null unique,
  created_at timestamptz not null default now(),
  check (expires_at is null or source = 'discretionary')
);
create index ai_credit_allocations_user on public.ai_credit_allocations(user_id);
create table public.ai_credit_reservations (
  request_id uuid not null references public.ai_generation_requests(id),
  allocation_id uuid not null references public.ai_credit_allocations(id),
  amount integer not null check (amount > 0),
  primary key (request_id, allocation_id)
);
create table public.ai_credit_purchases (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  amount_cents integer not null check (amount_cents between 200 and 100000),
  credits integer not null check (credits = amount_cents),
  currency text not null default 'usd' check (currency = 'usd'),
  livemode boolean not null,
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  paid_at timestamptz,
  refunded_cents integer not null default 0 check (refunded_cents >= 0 and refunded_cents <= amount_cents),
  created_at timestamptz not null default now()
);
-- Refunds of already spent credits become debt, offset against future balance.
create table public.ai_credit_debts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  amount bigint not null default 0 check (amount >= 0)
);

-- Preserve current balances; old transaction history remains intact.
do $$ begin
 if exists (select 1 from public.ai_credit_transactions group by user_id having sum(amount) < 0)
 then raise exception 'Resolve negative legacy balances before credit migration'; end if;
end $$;
insert into public.ai_credit_allocations (user_id, source, amount, remaining, reference)
select user_id, 'legacy', sum(amount)::int, sum(amount)::int, 'legacy:' || user_id
from public.ai_credit_transactions group by user_id having sum(amount) > 0;

create function public.grant_ai_credits(p_user_id uuid, p_amount integer, p_source text,
  p_reference text, p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid; existing public.ai_credit_allocations%rowtype;
begin
  if p_amount is null or p_amount <= 0 or p_source not in ('signup','discretionary','purchase')
    or p_reference is null or length(p_reference) = 0
    or (p_expires_at is not null and p_source <> 'discretionary') then
    raise exception 'Invalid credit grant';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text, 0));
  select * into existing from public.ai_credit_allocations where reference = p_reference;
  if found then
    if existing.user_id <> p_user_id or existing.amount <> p_amount or existing.source <> p_source
      or existing.expires_at is distinct from p_expires_at then raise exception 'Grant reference mismatch'; end if;
    return existing.id;
  end if;
  if p_expires_at <= now() then raise exception 'New grants must expire in the future'; end if;
  insert into public.ai_credit_allocations(user_id,source,amount,remaining,reference,expires_at)
    values(p_user_id,p_source,p_amount,p_amount,p_reference,p_expires_at) returning id into result;
  insert into public.ai_credit_transactions(user_id,kind,amount)
    values(p_user_id,case when p_source = 'signup' then 'signup_grant'::public.ai_credit_transaction_kind
      else 'adjustment'::public.ai_credit_transaction_kind end,p_amount);
  return result;
end $$;

create or replace function public.grant_initial_ai_credits()
returns trigger language plpgsql security definer set search_path = '' as $$
declare settings public.ai_credit_settings%rowtype;
begin
  if new.email_confirmed_at is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || new.id::text, 0));
  -- Includes historical grants so old users are never granted twice.
  if exists(select 1 from public.ai_credit_transactions where user_id = new.id and kind = 'signup_grant')
    then return new; end if;
  select * into settings from public.ai_credit_settings where singleton;
  if settings.signup_grant > 0 then
    perform public.grant_ai_credits(new.id,settings.signup_grant,'signup',
      'signup:' || new.id::text || ':' || settings.grant_reference);
  end if;
  return new;
end $$;
drop trigger auth_users_grant_initial_ai_credits on auth.users;
create trigger auth_users_grant_initial_ai_credits after insert or update of email_confirmed_at on auth.users
  for each row execute function public.grant_initial_ai_credits();

create function public.ai_available_credits(p_user_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
 select coalesce(sum(greatest(0, a.remaining - coalesce((
   select sum(r.amount) from public.ai_credit_reservations r
   join public.ai_generation_requests q on q.id = r.request_id
   where r.allocation_id = a.id and q.status = 'running'
     and q.created_at > now() - interval '10 minutes'
 ),0))),0) - coalesce((select amount from public.ai_credit_debts where user_id=p_user_id),0)
 from public.ai_credit_allocations a where a.user_id = p_user_id
 and (a.expires_at is null or a.expires_at > now());
$$;

create or replace function public.begin_ai_generation(p_request_id uuid,p_user_id uuid,p_ip_hash text,
 p_user_limit int,p_ip_limit int,p_window_seconds int,p_concurrent_limit int)
returns text language plpgsql security definer set search_path = '' as $$
declare cost integer; needed integer; allocation record; take integer; exempt boolean;
begin
 if p_user_id is null or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
   or p_user_limit is null or p_user_limit < 1 or p_ip_limit is null or p_ip_limit < 1
   or p_window_seconds is null or p_window_seconds < 1 or p_concurrent_limit is null or p_concurrent_limit < 1
 then raise exception 'Invalid AI admission'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('ai-ip:' || p_ip_hash,0));
 update public.ai_generation_requests set status='aborted',completed_at=now()
   where user_id=p_user_id and status='running' and created_at <= now()-interval '10 minutes';
 if (select count(*) from public.ai_generation_requests where user_id=p_user_id and status='running') >= p_concurrent_limit
 then return 'concurrency'; end if;
 if (select count(*) from public.ai_generation_requests where user_id=p_user_id
   and created_at > now()-make_interval(secs=>p_window_seconds)) >= p_user_limit then return 'user_rate'; end if;
 if (select count(*) from public.ai_generation_requests where ip_hash=p_ip_hash
   and created_at > now()-make_interval(secs=>p_window_seconds)) >= p_ip_limit then return 'ip_rate'; end if;
 select ai_credit_exempt into exempt from public.profiles where id=p_user_id;
 select generation_cost into cost from public.ai_credit_settings where singleton;
 if cost is null then raise exception 'AI credit settings missing'; end if;
 if coalesce(exempt,false) then cost := 0;
 elsif public.ai_available_credits(p_user_id) < cost then return 'insufficient_credit'; end if;
 insert into public.ai_generation_requests(id,user_id,ip_hash,credit_cost) values(p_request_id,p_user_id,p_ip_hash,cost);
 needed := cost;
 for allocation in
   select a.*, a.remaining - coalesce((select sum(r.amount) from public.ai_credit_reservations r
     join public.ai_generation_requests q on q.id=r.request_id where r.allocation_id=a.id and q.status='running'
     and q.created_at > now()-interval '10 minutes'),0) as available
   from public.ai_credit_allocations a where a.user_id=p_user_id
     and (a.expires_at is null or a.expires_at>now())
   order by a.expires_at asc nulls last, (a.source='purchase'), a.created_at, a.id
 for update of a
 loop
   exit when needed=0;
   take := least(needed,greatest(0,allocation.available));
   if take>0 then
     insert into public.ai_credit_reservations values(p_request_id,allocation.id,take);
     needed := needed-take;
   end if;
 end loop;
 if needed<>0 then raise exception 'Credit reservation failed'; end if;
 return 'allowed';
end $$;

create function public.fulfill_ai_credit_purchase(p_purchase_id uuid,p_session_id text,
 p_payment_intent_id text,p_amount_cents integer,p_currency text,p_livemode boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare purchase public.ai_credit_purchases%rowtype;
begin
 select * into purchase from public.ai_credit_purchases where id=p_purchase_id;
 if not found then raise exception 'Unknown credit purchase'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-user:'||purchase.user_id::text,0));
 select * into purchase from public.ai_credit_purchases where id=p_purchase_id for update;
 if p_session_id is null or p_payment_intent_id is null or p_amount_cents is distinct from purchase.amount_cents
   or p_currency is distinct from purchase.currency or p_livemode is distinct from purchase.livemode
   or (purchase.stripe_session_id is not null and purchase.stripe_session_id<>p_session_id)
 then raise exception 'Credit purchase payment mismatch'; end if;
 if purchase.paid_at is not null then
   if purchase.stripe_payment_intent_id<>p_payment_intent_id then raise exception 'Payment intent mismatch'; end if;
   return false;
 end if;
 update public.ai_credit_purchases set stripe_session_id=p_session_id,
   stripe_payment_intent_id=p_payment_intent_id,paid_at=now() where id=p_purchase_id;
 perform public.grant_ai_credits(purchase.user_id,purchase.credits,'purchase','purchase:'||purchase.id::text);
 return true;
end $$;

-- Stripe's cumulative amount_refunded makes duplicate/reordered refund events safe.
create function public.refund_ai_credit_purchase(p_payment_intent_id text,p_refunded_cents integer,p_paid_cents integer,p_livemode boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare purchase public.ai_credit_purchases%rowtype; allocation public.ai_credit_allocations%rowtype;
 delta integer; removable integer;
begin
 select * into purchase from public.ai_credit_purchases where stripe_payment_intent_id=p_payment_intent_id;
 if not found then raise exception 'Payment not yet fulfilled; retry refund'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-user:'||purchase.user_id::text,0));
 select * into purchase from public.ai_credit_purchases where id=purchase.id for update;
 if p_livemode is distinct from purchase.livemode or p_refunded_cents is null
   or p_paid_cents is null or p_paid_cents < purchase.amount_cents
   or p_refunded_cents<0 or p_refunded_cents>p_paid_cents then raise exception 'Invalid refund'; end if;
 p_refunded_cents := floor(p_refunded_cents::numeric * purchase.amount_cents / p_paid_cents)::int;
 delta := p_refunded_cents-purchase.refunded_cents;
 if delta<=0 then return false; end if;
 select * into allocation from public.ai_credit_allocations where reference='purchase:'||purchase.id::text for update;
 select least(delta,greatest(0,allocation.remaining-coalesce(sum(r.amount),0))) into removable
 from public.ai_credit_reservations r join public.ai_generation_requests q on q.id=r.request_id
 where r.allocation_id=allocation.id and q.status='running' and q.created_at>now()-interval '10 minutes';
 update public.ai_credit_allocations set remaining=remaining-removable where id=allocation.id;
 insert into public.ai_credit_debts(user_id,amount) values(purchase.user_id,delta-removable)
 on conflict(user_id) do update set amount=public.ai_credit_debts.amount+excluded.amount;
 update public.ai_credit_purchases set refunded_cents=p_refunded_cents where id=purchase.id;
 insert into public.ai_credit_transactions(user_id,kind,amount) values(purchase.user_id,'refund',-delta);
 return true;
end $$;

-- Private billing tables and mutation RPCs are never writable from a browser.
alter table public.ai_credit_allocations enable row level security;
alter table public.ai_credit_reservations enable row level security;
alter table public.ai_credit_purchases enable row level security;
alter table public.ai_credit_debts enable row level security;
revoke all on public.ai_credit_allocations, public.ai_credit_reservations, public.ai_credit_purchases,
 public.ai_credit_debts from public,anon,authenticated;
grant all on public.ai_credit_allocations, public.ai_credit_reservations, public.ai_credit_purchases,
 public.ai_credit_debts to service_role;
revoke all on function public.grant_ai_credits(uuid,integer,text,text,timestamptz),
 public.ai_available_credits(uuid),public.fulfill_ai_credit_purchase(uuid,text,text,integer,text,boolean),
 public.refund_ai_credit_purchase(text,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.grant_ai_credits(uuid,integer,text,text,timestamptz),
 public.ai_available_credits(uuid),public.fulfill_ai_credit_purchase(uuid,text,text,integer,text,boolean),
 public.refund_ai_credit_purchase(text,integer,integer,boolean) to service_role;

alter table public.ai_generation_requests add column generated_source text;
drop function public.complete_ai_generation(uuid, public.ai_generation_request_status, integer);
create function public.complete_ai_generation(p_request_id uuid,p_status public.ai_generation_request_status,
 p_attempts integer,p_source text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare request public.ai_generation_requests%rowtype; reservation record;
 allocation record; needed integer; take integer;
begin
 if p_status is null or p_status='running' or p_attempts is null or p_attempts<0 or p_attempts>10
   or (p_status='success' and (p_source is null or length(p_source)=0 or length(p_source)>200000))
 then raise exception 'Invalid generation completion'; end if;
 select * into request from public.ai_generation_requests where id=p_request_id;
 if not found then return 'inactive'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-user:'||request.user_id::text,0));
 select * into request from public.ai_generation_requests where id=p_request_id for update;
 if request.status<>'running' then return 'inactive'; end if;
 if request.created_at<=now()-interval '10 minutes' then
   update public.ai_generation_requests set status='aborted',completed_at=now() where id=p_request_id;
   return 'inactive';
 end if;
 if p_status='success' and request.credit_cost>0 then
   -- Owner policy: all charged credits must still be unexpired at completion.
   if exists(select 1 from public.ai_credit_reservations r
     join public.ai_credit_allocations a on a.id=r.allocation_id
     where r.request_id=p_request_id and a.expires_at<=now()) then
     delete from public.ai_credit_reservations where request_id=p_request_id;
     if public.ai_available_credits(request.user_id)<request.credit_cost then
       update public.ai_generation_requests set status='error',attempts=p_attempts,completed_at=now()
         where id=p_request_id;
       return 'credits_expired';
     end if;
     needed := request.credit_cost;
     for allocation in
       select a.*, a.remaining-coalesce((select sum(r.amount) from public.ai_credit_reservations r
         join public.ai_generation_requests q on q.id=r.request_id where r.allocation_id=a.id
         and q.status='running' and q.created_at>now()-interval '10 minutes'),0) as available
       from public.ai_credit_allocations a where a.user_id=request.user_id
         and (a.expires_at is null or a.expires_at>now())
       order by a.expires_at asc nulls last,(a.source='purchase'),a.created_at,a.id for update of a
     loop
       exit when needed=0;
       take := least(needed,greatest(0,allocation.available));
       if take>0 then
         insert into public.ai_credit_reservations values(p_request_id,allocation.id,take);
         needed := needed-take;
       end if;
     end loop;
     if needed<>0 then raise exception 'Replacement credit reservation failed'; end if;
   end if;
   if (select coalesce(sum(amount),0) from public.ai_credit_reservations where request_id=p_request_id)<>request.credit_cost
   then raise exception 'Credit reservations missing'; end if;
   -- Settle the still-eligible reservation, including any replacement above.
   for reservation in select * from public.ai_credit_reservations where request_id=p_request_id loop
     update public.ai_credit_allocations set remaining=remaining-reservation.amount
       where id=reservation.allocation_id and remaining>=reservation.amount;
     if not found then raise exception 'Reserved credit allocation unavailable'; end if;
   end loop;
   insert into public.ai_credit_transactions(user_id,kind,amount,generation_request_id)
     values(request.user_id,'generation_charge',-request.credit_cost,p_request_id);
 end if;
 update public.ai_generation_requests set status=p_status,attempts=p_attempts,completed_at=now(),
   generated_source=case when p_status='success' then p_source else null end where id=p_request_id;
 return 'completed';
end $$;
revoke all on function public.complete_ai_generation(uuid,public.ai_generation_request_status,integer,text)
 from public,anon,authenticated;
grant execute on function public.complete_ai_generation(uuid,public.ai_generation_request_status,integer,text) to service_role;
alter table public.ai_generation_requests add column has_source boolean
 generated always as (generated_source is not null) stored;
