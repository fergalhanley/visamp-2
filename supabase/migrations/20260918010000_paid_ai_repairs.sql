-- VIS-128: explicitly requested repairs cost one generation regardless of outcome.
alter table public.ai_generation_requests
  add column repair_charged boolean not null default false;

-- Only trusted server code may charge. Admission has already reserved the full
-- cost and enforced user ownership, rate and concurrency limits.
create function public.charge_ai_repair(p_request_id uuid, p_expected_cost integer)
returns text language plpgsql security definer set search_path = '' as $$
declare request public.ai_generation_requests%rowtype; reservation record;
begin
 select * into request from public.ai_generation_requests where id=p_request_id;
 if not found then return 'inactive'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ai-user:'||request.user_id::text,0));
 select * into request from public.ai_generation_requests where id=p_request_id for update;
 if request.repair_charged then return 'already_charged'; end if;
 if request.status<>'running' or request.created_at<=now()-interval '10 minutes' then return 'inactive'; end if;
 if p_expected_cost is null or p_expected_cost<>request.credit_cost then return 'price_changed'; end if;
 if exists(select 1 from public.ai_credit_reservations r
   join public.ai_credit_allocations a on a.id=r.allocation_id
   where r.request_id=p_request_id and a.expires_at<=now()) then return 'credits_expired'; end if;
 if (select coalesce(sum(amount),0) from public.ai_credit_reservations where request_id=p_request_id)<>request.credit_cost
 then raise exception 'Credit reservations missing'; end if;
 for reservation in select * from public.ai_credit_reservations where request_id=p_request_id loop
   update public.ai_credit_allocations set remaining=remaining-reservation.amount
     where id=reservation.allocation_id and remaining>=reservation.amount;
   if not found then raise exception 'Reserved credit allocation unavailable'; end if;
 end loop;
 if request.credit_cost>0 then
   insert into public.ai_credit_transactions(user_id,kind,amount,generation_request_id)
     values(request.user_id,'generation_charge',-request.credit_cost,p_request_id);
 end if;
 -- Consumed reservations must not subtract from the available balance again.
 delete from public.ai_credit_reservations where request_id=p_request_id;
 update public.ai_generation_requests set repair_charged=true where id=p_request_id;
 return 'charged';
end $$;
revoke all on function public.charge_ai_repair(uuid,integer) from public,anon,authenticated;
grant execute on function public.charge_ai_repair(uuid,integer) to service_role;

create or replace function public.complete_ai_generation(p_request_id uuid,p_status public.ai_generation_request_status,
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
 if p_status='success' and request.credit_cost>0 and not request.repair_charged then
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
   generated_source=case when p_status='success' or request.repair_charged then nullif(left(p_source,200000),'') else null end where id=p_request_id;
 return 'completed';
end $$;

notify pgrst, 'reload schema';
