-- VIS-125: Fixed US$1 = 1,000 credits; generation costs remain configurable.
-- Apply before deploying the updated checkout. Existing quotes/balances stay intact.
begin;
alter table public.ai_credit_purchases
  add column credits_per_usd integer not null default 100
    check (credits_per_usd in (100, 1000));
-- Default 100 preserves older app instances during rollout. New checkouts
-- explicitly supply 1000. Both rates remain valid for historical fulfilment.
alter table public.ai_credit_purchases drop constraint ai_credit_purchases_check;
alter table public.ai_credit_purchases add constraint ai_credit_purchases_credits_check
  check (credits::bigint * 100 = amount_cents::bigint * credits_per_usd);
comment on column public.ai_credit_purchases.credits_per_usd is
  'Immutable checkout quote rate: 100 legacy, 1000 current. Future pricing changes generation_cost.';

create or replace function public.refund_ai_credit_purchase(p_payment_intent_id text,p_refunded_cents integer,p_paid_cents integer,p_livemode boolean)
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
 -- Convert the cumulative monetary refund to the credits originally quoted.
 -- Differences of cumulative totals keep repeated/partial refunds exact.
 delta := floor(p_refunded_cents::numeric * purchase.credits / purchase.amount_cents)::int
   - floor(purchase.refunded_cents::numeric * purchase.credits / purchase.amount_cents)::int;
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


commit;
