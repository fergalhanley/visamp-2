-- VIS-125. Run on a disposable database after both credit migrations.
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; raise notice 'PASS: %',label; end $$;
insert into auth.users(id,email) values ('12500000-0000-4000-8000-000000000001','vis125@example.invalid');
insert into public.ai_credit_purchases(id,user_id,amount_cents,credits,livemode)
values ('12500000-0000-4000-8000-000000000002','12500000-0000-4000-8000-000000000001',500,500,false);
insert into public.ai_credit_purchases(id,user_id,amount_cents,credits,credits_per_usd,livemode)
values ('12500000-0000-4000-8000-000000000003','12500000-0000-4000-8000-000000000001',500,5000,1000,false);
select public.fulfill_ai_credit_purchase('12500000-0000-4000-8000-000000000002','cs_125_old','pi_125_old',500,'usd',false);
select public.fulfill_ai_credit_purchase('12500000-0000-4000-8000-000000000003','cs_125_new','pi_125_new',500,'usd',false);
select pg_temp.check(public.ai_available_credits('12500000-0000-4000-8000-000000000001')=5500,'Both purchase rates fulfilled at their original quotes');
select pg_temp.check(not public.fulfill_ai_credit_purchase('12500000-0000-4000-8000-000000000003','cs_125_new','pi_125_new',500,'usd',false),'Duplicate new-rate payment does not add credits');
select public.refund_ai_credit_purchase('pi_125_old',100,500,false);
select public.refund_ai_credit_purchase('pi_125_new',100,500,false);
select pg_temp.check(public.ai_available_credits('12500000-0000-4000-8000-000000000001')=4400,'20 percent refunds remove 100 old and 1000 new credits');
select pg_temp.check(not public.refund_ai_credit_purchase('pi_125_new',100,500,false),'Duplicate refund ignored');
select pg_temp.check(not public.refund_ai_credit_purchase('pi_125_new',50,500,false),'Out-of-order refund ignored');
select public.refund_ai_credit_purchase('pi_125_new',101,500,false);
select pg_temp.check(public.ai_available_credits('12500000-0000-4000-8000-000000000001')=4390,'Additional one-cent refund removes ten credits');
select public.refund_ai_credit_purchase('pi_125_new',500,500,false);
select public.refund_ai_credit_purchase('pi_125_old',500,500,false);
select pg_temp.check(public.ai_available_credits('12500000-0000-4000-8000-000000000001')=0,'Full refunds remove all purchased credits at either rate');
do $$ begin
 begin
  insert into public.ai_credit_purchases(id,user_id,amount_cents,credits,credits_per_usd,livemode)
  values(gen_random_uuid(),'12500000-0000-4000-8000-000000000001',500,500,1000,false);
  raise exception 'FAILED: inconsistent quote accepted';
 exception when check_violation then raise notice 'PASS: inconsistent quote rejected'; end;
end $$;
rollback;
