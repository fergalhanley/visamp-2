-- VIS-123. Run against a disposable/local database with migration applied.
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; raise notice 'PASS: %',label; end $$;
insert into public.ai_credit_settings(singleton,signup_grant,generation_cost) values(true,2000,100)
on conflict(singleton) do update set signup_grant=2000,generation_cost=100;
insert into auth.users(id,email,raw_user_meta_data) values
 ('12300000-0000-4000-8000-000000000001','vis123-a@example.invalid','{}'),
 ('12300000-0000-4000-8000-000000000002','vis123-b@example.invalid','{}');
select pg_temp.check((select count(*)=0 from public.ai_credit_allocations where user_id='12300000-0000-4000-8000-000000000001'),'Unverified email receives no credits');
update auth.users set email_confirmed_at=now() where id='12300000-0000-4000-8000-000000000001';
select pg_temp.check(public.ai_available_credits('12300000-0000-4000-8000-000000000001')=2000,'Verified email receives 20 requests');
update public.ai_credit_settings set signup_grant=3000,grant_reference='promotion-2';
update auth.users set email_confirmed_at=now() where id='12300000-0000-4000-8000-000000000001';
select pg_temp.check(public.ai_available_credits('12300000-0000-4000-8000-000000000001')=2000,'Verification retry / promotion change does not double grant');
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
 ('12300000-0000-4000-8000-000000000003','vis123-oauth@example.invalid',now(),'{"provider":"google"}');
select pg_temp.check(public.ai_available_credits('12300000-0000-4000-8000-000000000003')=3000,'Verified OAuth signup uses current grant');
select pg_temp.check(not has_column_privilege('authenticated','public.profiles','ai_credit_exempt','UPDATE'),'Users cannot change exemption');
select pg_temp.check(not has_function_privilege('authenticated','public.grant_ai_credits(uuid,integer,text,text,timestamptz)','EXECUTE'),'Users cannot mint credits');
select public.grant_ai_credits('12300000-0000-4000-8000-000000000002',50,'discretionary','grant-expiring',now()+interval '1 day');
select public.grant_ai_credits('12300000-0000-4000-8000-000000000002',50,'discretionary','grant-expiring',now()+interval '1 day');
select pg_temp.check(public.ai_available_credits('12300000-0000-4000-8000-000000000002')=50,'Grant retries idempotent');
select pg_temp.check(public.begin_ai_generation('12300000-0000-4000-8000-000000000011','12300000-0000-4000-8000-000000000002',repeat('a',64),100,100,3600,10)='insufficient_credit','Positive insufficient balance rejected');
select public.grant_ai_credits('12300000-0000-4000-8000-000000000002',75,'discretionary','grant-free');
insert into public.ai_credit_purchases(id,user_id,amount_cents,credits,livemode) values
 ('12300000-0000-4000-8000-000000000020','12300000-0000-4000-8000-000000000002',500,500,false);
select pg_temp.check(public.fulfill_ai_credit_purchase('12300000-0000-4000-8000-000000000020','cs_test','pi_test',500,'usd',false),'Purchase fulfilled');
select pg_temp.check(not public.fulfill_ai_credit_purchase('12300000-0000-4000-8000-000000000020','cs_test','pi_test',500,'usd',false),'Duplicate payment ignored');
select pg_temp.check(public.ai_available_credits('12300000-0000-4000-8000-000000000002')=625,'Exact purchased credits added once');
select pg_temp.check(public.begin_ai_generation('12300000-0000-4000-8000-000000000011','12300000-0000-4000-8000-000000000002',repeat('a',64),100,100,3600,10)='allowed','Admit funded request');
select pg_temp.check((select sum(r.amount)=50 from public.ai_credit_reservations r join public.ai_credit_allocations a on a.id=r.allocation_id where request_id='12300000-0000-4000-8000-000000000011' and reference='grant-expiring'),'Earliest expiry reserved first');
select pg_temp.check((select sum(r.amount)=50 from public.ai_credit_reservations r join public.ai_credit_allocations a on a.id=r.allocation_id where request_id='12300000-0000-4000-8000-000000000011' and reference='grant-free'),'Non-expiring free before purchase');
select pg_temp.check(public.ai_available_credits('12300000-0000-4000-8000-000000000002')=525,'In-flight balance accounts for reservation');
-- A grant expiring in flight is replaced only with currently unexpired credits.
update public.ai_credit_allocations set expires_at=now()-interval '1 second' where reference='grant-expiring';
select pg_temp.check(public.complete_ai_generation('12300000-0000-4000-8000-000000000011','success',3,'render {}')='completed','Successful request replaces expired reservation');
select pg_temp.check(public.complete_ai_generation('12300000-0000-4000-8000-000000000011','success',3,'render {}')='inactive','Repeated completion does not charge twice');
select pg_temp.check((select sum(amount)=-100 from public.ai_credit_transactions where generation_request_id='12300000-0000-4000-8000-000000000011'),'Retries incur one 100-credit charge');
select pg_temp.check((select generated_source='render {}' from public.ai_generation_requests where id='12300000-0000-4000-8000-000000000011'),'Charged result persisted atomically');
select pg_temp.check(public.ai_available_credits('12300000-0000-4000-8000-000000000002')=475,'Expired grant excluded and 100 eligible credits charged');
select public.begin_ai_generation('12300000-0000-4000-8000-000000000012','12300000-0000-4000-8000-000000000002',repeat('a',64),100,100,3600,10);
select public.complete_ai_generation('12300000-0000-4000-8000-000000000012','exhausted',3);
select pg_temp.check(public.ai_available_credits('12300000-0000-4000-8000-000000000002')=475,'Exhausted attempts release credits without charging');
select public.grant_ai_credits('12300000-0000-4000-8000-000000000002',40,'discretionary','unused-expiry',now()+interval '1 day');
update public.ai_credit_allocations set expires_at=now()-interval '1 second' where reference='unused-expiry';
select pg_temp.check(public.ai_available_credits('12300000-0000-4000-8000-000000000002')=475,'Only unused expiring grant disappears');
-- Reserve four requests, then reject another despite a positive balance.
do $$ begin for i in 31..34 loop
 perform public.begin_ai_generation(('12300000-0000-4000-8000-0000000000'||i)::uuid,'12300000-0000-4000-8000-000000000002',repeat('a',64),100,100,3600,10);
end loop; end $$;
select pg_temp.check(public.begin_ai_generation('12300000-0000-4000-8000-000000000036','12300000-0000-4000-8000-000000000002',repeat('a',64),100,100,3600,10)='insufficient_credit','Concurrent reservations cannot overspend');
update public.ai_generation_requests set created_at=now()-interval '11 minutes' where id='12300000-0000-4000-8000-000000000031';
select pg_temp.check(public.complete_ai_generation('12300000-0000-4000-8000-000000000031','success',1,'render {}')='inactive','Late completion cannot charge expired reservation');
do $$ begin for i in 32..34 loop
 perform public.complete_ai_generation(('12300000-0000-4000-8000-0000000000'||i)::uuid,'aborted',1);
end loop; end $$;
select pg_temp.check(public.refund_ai_credit_purchase('pi_test',110,550,false),'Partial tax-inclusive refund');
select pg_temp.check(public.ai_available_credits('12300000-0000-4000-8000-000000000002')=375,'Partial refund removes proportional 100 credits');
select pg_temp.check(not public.refund_ai_credit_purchase('pi_test',110,550,false),'Duplicate refund ignored');
select pg_temp.check(not public.refund_ai_credit_purchase('pi_test',55,550,false),'Older refund ignored');
select public.begin_ai_generation('12300000-0000-4000-8000-000000000040','12300000-0000-4000-8000-000000000002',repeat('a',64),100,100,3600,10);
select public.complete_ai_generation('12300000-0000-4000-8000-000000000040','success',1,'render {}');
select public.refund_ai_credit_purchase('pi_test',550,550,false);
select pg_temp.check(public.ai_available_credits('12300000-0000-4000-8000-000000000002')=-125,'Refund of used credits creates debt');
update public.profiles set ai_credit_exempt=true where id='12300000-0000-4000-8000-000000000002';
select pg_temp.check(public.begin_ai_generation('12300000-0000-4000-8000-000000000041','12300000-0000-4000-8000-000000000002',repeat('a',64),100,100,3600,1)='allowed','Exempt user can generate with no credits');
select pg_temp.check(public.begin_ai_generation('12300000-0000-4000-8000-000000000042','12300000-0000-4000-8000-000000000002',repeat('a',64),100,100,3600,1)='concurrency','Exempt user still has concurrency limit');
select public.complete_ai_generation('12300000-0000-4000-8000-000000000041','success',1,'render {}');
select pg_temp.check(not exists(select 1 from public.ai_credit_transactions where generation_request_id='12300000-0000-4000-8000-000000000041'),'Exempt success has no charge');
select public.grant_ai_credits('12300000-0000-4000-8000-000000000002',100,'discretionary','offset-debt');
select pg_temp.check(public.ai_available_credits('12300000-0000-4000-8000-000000000002')=-25,'Future grant offsets refund debt');
insert into auth.users(id,email) values('12300000-0000-4000-8000-000000000004','expiry-only@example.invalid');
select public.grant_ai_credits('12300000-0000-4000-8000-000000000004',100,'discretionary','only-expiring',now()+interval '1 day');
select public.begin_ai_generation('12300000-0000-4000-8000-000000000044','12300000-0000-4000-8000-000000000004',repeat('d',64),100,100,3600,10);
update public.ai_credit_allocations set expires_at=now()-interval '1 second' where reference='only-expiring';
select pg_temp.check(public.complete_ai_generation('12300000-0000-4000-8000-000000000044','success',1,'render {}')='credits_expired','No success when credits expire without replacement');
select pg_temp.check(not exists(select 1 from public.ai_credit_transactions where generation_request_id='12300000-0000-4000-8000-000000000044'),'Expired request is free');
select pg_temp.check((select status='error' and generated_source is null from public.ai_generation_requests where id='12300000-0000-4000-8000-000000000044'),'Expired request releases reservation and does not publish result');
rollback;
