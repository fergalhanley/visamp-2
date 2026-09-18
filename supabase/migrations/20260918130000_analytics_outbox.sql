-- VIS-33: optional analytics never grants browser access to operational data.
create table public.analytics_consents (
 id uuid primary key default gen_random_uuid(),
 environment text not null check(environment in ('staging','production')),
 revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.analytics_operations (
 id uuid primary key,
 receipt uuid not null references public.analytics_consents(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('generation','upload','purchase')),
 mode text,
 created_at timestamptz not null default now()
);
create table public.analytics_outbox (
 id text primary key,
 receipt uuid not null references public.analytics_consents(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 event text not null,
 properties jsonb not null,
 occurred_at timestamptz not null default now(),
 delivered_at timestamptz
);
create index analytics_outbox_pending on public.analytics_outbox(occurred_at) where delivered_at is null;
alter table public.analytics_consents enable row level security;
alter table public.analytics_operations enable row level security;
alter table public.analytics_outbox enable row level security;
revoke all on public.analytics_consents,public.analytics_operations,public.analytics_outbox from anon,authenticated;
grant all on public.analytics_consents,public.analytics_operations,public.analytics_outbox to service_role;

create function public.analytics_manage(p_action text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare new_receipt uuid; result jsonb;
begin
 if p_action='consent' then
   insert into public.analytics_consents(environment) values(p_input->>'environment') returning id into new_receipt;
   return jsonb_build_object('id',new_receipt);
 elsif p_action='revoke' then
   update public.analytics_consents set revoked_at=now() where id=(p_input->>'receipt')::uuid;
   delete from public.analytics_outbox where receipt=(p_input->>'receipt')::uuid and delivered_at is null;
   delete from public.analytics_operations where receipt=(p_input->>'receipt')::uuid;
 elsif p_action='operation' then
   insert into public.analytics_operations(id,receipt,user_id,kind,mode)
     select (p_input->>'id')::uuid,c.id,(p_input->>'user_id')::uuid,p_input->>'kind',p_input->>'mode'
     from public.analytics_consents c where c.id=(p_input->>'receipt')::uuid and c.revoked_at is null
     on conflict(id) do nothing;
 elsif p_action='enqueue' then
   insert into public.analytics_outbox(id,receipt,user_id,event,properties,occurred_at)
     select p_input->>'id',c.id,(p_input->>'user_id')::uuid,p_input->>'event',p_input->'properties',
       coalesce((p_input->>'time')::timestamptz,now())
     from public.analytics_consents c where c.id=(p_input->>'receipt')::uuid and c.revoked_at is null
     on conflict(id) do nothing;
 elsif p_action='reconcile' then
   -- Derive terminal outcomes from durable business records, including lost HTTP responses.
   insert into public.analytics_outbox(id,receipt,user_id,event,properties,occurred_at)
   select 'generation:'||r.id,o.receipt,o.user_id,
     case when r.status='success' then 'generation_completed' else 'generation_failed' end,
     jsonb_build_object('request_id',r.id,'mode',o.mode,'model','gpt-6-astra','attempts',r.attempts,
       'duration_ms',extract(epoch from(r.completed_at-r.created_at))*1000,
       'charged_credits',case when r.status='success' or r.repair_charged then r.credit_cost else 0 end,
       'failure_category',case when r.status='success' then null else r.status::text end),r.completed_at
   from public.analytics_operations o join public.analytics_consents c on c.id=o.receipt
     join public.ai_generation_requests r on r.id=o.id
   where o.kind='generation' and r.status<>'running' and c.revoked_at is null on conflict(id) do nothing;
   insert into public.analytics_outbox(id,receipt,user_id,event,properties,occurred_at)
   select 'upload:'||u.id,o.receipt,o.user_id,
     case when u.status='completed' then 'track_upload_completed' else 'track_upload_failed' end,
     jsonb_build_object('upload_id',u.id,'artist_id',u.music_artist_id,'track_id',u.track_id,
       'failure_category',case when u.status='failed' then 'processing' else null end),coalesce(u.finished_at,now())
   from public.analytics_operations o join public.analytics_consents c on c.id=o.receipt
     join public.audio_uploads u on u.id=o.id left join public.tracks t on t.id=u.track_id
   where o.kind='upload' and (u.status='failed' or (u.status='completed' and t.status='live'))
     and c.revoked_at is null on conflict(id) do nothing;
   insert into public.analytics_outbox(id,receipt,user_id,event,properties,occurred_at)
   select 'purchase:'||p.id,o.receipt,o.user_id,'credits_purchased',
     jsonb_build_object('checkout_id',p.stripe_session_id,'amount_cents',p.amount_cents,'currency',p.currency,'credits',p.credits),p.paid_at
   from public.analytics_operations o join public.analytics_consents c on c.id=o.receipt
     join public.ai_credit_purchases p on p.id=o.id
   where o.kind='purchase' and p.paid_at is not null and c.revoked_at is null on conflict(id) do nothing;
 elsif p_action='pending' then
   select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
     select b.*,c.environment from public.analytics_outbox b join public.analytics_consents c on c.id=b.receipt
     where b.delivered_at is null and c.revoked_at is null order by b.occurred_at limit 100
   ) q;
   return result;
 elsif p_action='active' then
   return coalesce((select to_jsonb(c) from public.analytics_consents c where c.id=(p_input->>'receipt')::uuid and c.revoked_at is null),'null'::jsonb);
 elsif p_action='delivered' then
   update public.analytics_outbox set delivered_at=now() where id=p_input->>'id';
 else raise exception 'unknown analytics action';
 end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.analytics_manage(text,jsonb) from public,anon,authenticated;
grant execute on function public.analytics_manage(text,jsonb) to service_role;
