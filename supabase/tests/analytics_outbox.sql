-- VIS-33. Run after the analytics migration; all fixtures roll back.
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; raise notice 'ok: %',label; end $$;
do $$
declare u uuid:=gen_random_uuid(); r uuid; g uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); payload jsonb;
begin
 insert into auth.users(id,email) values(u,u::text||'@test.local');
 r := (public.analytics_manage('consent','{"environment":"staging"}') ->> 'id')::uuid;
 perform pg_temp.check(public.analytics_manage('active',jsonb_build_object('receipt',r))->>'environment'='staging','consent retains staging');
 insert into public.ai_generation_requests(id,user_id,ip_hash,status,attempts,completed_at,credit_cost,repair_charged)
 values(g,u,repeat('a',64),'exhausted',1,now(),15,true);
 perform public.analytics_manage('operation',jsonb_build_object('id',g,'receipt',r,'user_id',u,'kind','generation','mode','repair'));
 perform public.analytics_manage('reconcile','{}');
 perform public.analytics_manage('reconcile','{}');
 perform pg_temp.check((select count(*)=1 from public.analytics_outbox where id='generation:'||g),'terminal outcomes deduplicate');
 select properties into payload from public.analytics_outbox where id='generation:'||g;
 perform pg_temp.check(payload->>'charged_credits'='15','failed repair includes charged credits');
 perform pg_temp.check(payload->>'failure_category'='exhausted','normalised failure without prompt or raw error');
 insert into public.ai_credit_purchases(id,user_id,amount_cents,credits,credits_per_usd,livemode,stripe_session_id)
 values(p,u,500,500,100,false,'cs_test_'||p);
 perform public.analytics_manage('operation',jsonb_build_object('id',p,'receipt',r,'user_id',u,'kind','purchase'));
 perform public.analytics_manage('reconcile','{}');
 perform pg_temp.check(not exists(select 1 from public.analytics_outbox where id='purchase:'||p),'checkout creation is not revenue');
 update public.ai_credit_purchases set paid_at=now() where id=p;
 perform public.analytics_manage('reconcile','{}');
 perform pg_temp.check((select properties->>'credits'='500' from public.analytics_outbox where id='purchase:'||p),'persisted paid purchase becomes outcome');
 perform pg_temp.check(not has_function_privilege('authenticated','public.analytics_manage(text,jsonb)','execute'),'authenticated cannot forge server events');
 perform public.analytics_manage('revoke',jsonb_build_object('receipt',r));
 perform public.analytics_manage('reconcile','{}');
 perform pg_temp.check(not exists(select 1 from public.analytics_outbox where receipt=r),'withdrawal removes unsent outcomes');
 perform public.analytics_manage('enqueue',jsonb_build_object('id','late','receipt',r,'user_id',u,'event','checkout_started','properties','{}'::jsonb));
 perform pg_temp.check(not exists(select 1 from public.analytics_outbox where id='late'),'revoked consent rejects late events');
end $$;
rollback;
