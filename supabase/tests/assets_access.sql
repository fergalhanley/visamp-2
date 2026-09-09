-- VIS-51 acceptance checks for asset access control.
--
-- Run against a local stack with the migrations applied:
--
--   supabase db start
--   docker exec -i supabase_db_visamp-2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -q < supabase/tests/assets_access.sql
--
-- `supabase db query -f` cannot run this: it sends the file as a single
-- prepared statement and rejects multiple commands. Every assertion prints a
-- NOTICE; a failure raises and aborts, so a run with no ERROR line passed.
--
-- Everything happens inside one transaction that is rolled back at the end, so
-- the script leaves no rows behind. Any failed assertion aborts with an error.

begin;

create or replace function pg_temp.check(p_condition boolean, p_description text)
returns void language plpgsql as $$
begin
  if not p_condition then
    raise exception 'FAILED: %', p_description;
  end if;
  raise notice 'ok — %', p_description;
end;
$$;

-- Acting as a signed-in user means both the role and the JWT claim auth.uid()
-- reads; setting only the role would leave auth.uid() null.
create or replace function pg_temp.act_as(p_user_id uuid)
returns void language plpgsql as $$
begin
  execute format('set local role authenticated');
  execute format('set local request.jwt.claims = %L', json_build_object('sub', p_user_id)::text);
end;
$$;

create or replace function pg_temp.act_as_service()
returns void language plpgsql as $$
begin
  reset role;
  set local request.jwt.claims = '';
end;
$$;

-- Holds the generated visualisation id. Granted to public because the script
-- reads it back while acting as a signed-in user, not as postgres.
create temp table saved_visualisation (id uuid);
grant all on saved_visualisation to public;

-- ── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id, email)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'owner@example.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'other@example.test'),
  ('cccccccc-0000-4000-8000-000000000003', 'admin@example.test');

insert into public.app_admins (user_id)
values ('cccccccc-0000-4000-8000-000000000003');

-- Uploaded by the owner, inspected and marked ready the way the server does.
insert into public.assets (
  id, owner_id, kind, mime_type, file_name, object_key, bytes, sha256, status
) values (
  '11111111-0000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'bitmap', 'image/png', 'logo.png',
  'aaaaaaaa-0000-4000-8000-000000000001/11111111-0000-4000-8000-000000000001.png',
  2048, repeat('a', 64), 'ready'
);

-- ── Private assets are invisible to everyone but their owner ────────────────

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.check(
  (select count(*) from public.assets
   where id = '11111111-0000-4000-8000-000000000001') = 0,
  'another user cannot read a private asset'
);

set local role anon;
set local request.jwt.claims = '';
select pg_temp.check(
  (select count(*) from public.assets) = 0,
  'a signed-out visitor cannot read a private asset'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
select pg_temp.check(
  (select count(*) from public.assets
   where id = '11111111-0000-4000-8000-000000000001') = 1,
  'the uploader can read their own private asset'
);

-- ── Publishing ──────────────────────────────────────────────────────────────

update public.assets set visibility = 'public'
where id = '11111111-0000-4000-8000-000000000001';

select pg_temp.check(
  (select published_at is not null from public.assets
   where id = '11111111-0000-4000-8000-000000000001'),
  'publishing stamps published_at'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.check(
  (select count(*) from public.assets
   where id = '11111111-0000-4000-8000-000000000001') = 1,
  'a public asset is readable by another user'
);

-- Unpublishing withdraws it from the library without breaking existing use.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
update public.assets set visibility = 'private'
where id = '11111111-0000-4000-8000-000000000001';

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.check(
  (select count(*) from public.assets
   where id = '11111111-0000-4000-8000-000000000001') = 1,
  'unpublishing keeps an already-public asset readable'
);
select pg_temp.check(
  (select count(*) from public.assets
   where visibility = 'public' and status = 'ready' and withdrawn_at is null) = 0,
  'unpublishing removes the asset from library discovery'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
update public.assets set visibility = 'public'
where id = '11111111-0000-4000-8000-000000000001';

-- ── Column grants ───────────────────────────────────────────────────────────

do $$
begin
  begin
    update public.assets set object_key = 'x/y.png'
    where id = '11111111-0000-4000-8000-000000000001';
    raise exception 'FAILED: an owner must not be able to swap the bytes behind an asset';
  exception when insufficient_privilege then
    raise notice 'ok — object_key is not updatable by its owner';
  end;
end;
$$;

-- ── The reference index and the publish rule ────────────────────────────────

-- `id` is absent from the visualisations insert grant, so the id is read back
-- rather than chosen — the same way the editor saves.
with saved as (
  insert into public.visualisations (owner_id, title, source)
  values (
    'aaaaaaaa-0000-4000-8000-000000000001',
    'Uses one asset',
    'render { draw::image(asset::bitmap(id: "11111111-0000-4000-8000-000000000001")) }'
  )
  returning id
)
insert into pg_temp.saved_visualisation select id from saved;

select pg_temp.check(
  (select count(*) from public.visualisation_assets
   where visualisation_id = (select id from pg_temp.saved_visualisation)
     and asset_id = '11111111-0000-4000-8000-000000000001') = 1,
  'saving a visual indexes the assets its source cites'
);

update public.visualisations set visibility = 'public'
where id = (select id from pg_temp.saved_visualisation);
select pg_temp.check(
  (select visibility from public.visualisations
   where id = (select id from pg_temp.saved_visualisation)) = 'public',
  'a visual referencing a public asset can be published'
);

-- A second, never-published asset must block publication.
select pg_temp.act_as_service();
insert into public.assets (
  id, owner_id, kind, mime_type, file_name, object_key, bytes, sha256, status
) values (
  '11111111-0000-4000-8000-000000000002',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'bitmap', 'image/png', 'secret.png',
  'aaaaaaaa-0000-4000-8000-000000000001/11111111-0000-4000-8000-000000000002.png',
  1024, repeat('b', 64), 'ready'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
do $$
begin
  begin
    update public.visualisations
    set source = 'render { draw::image(asset::bitmap(id: "11111111-0000-4000-8000-000000000002")) }'
    where id = (select id from pg_temp.saved_visualisation);
    raise exception 'FAILED: a public visual must not be able to reference a private asset';
  exception when insufficient_privilege then
    raise notice 'ok — a public visual cannot reference a private asset';
  end;
end;
$$;

-- ── Objects are frozen once the server claims them ──────────────────────────

-- The storage policies are exercised directly against storage.objects, which is
-- the same table and the same policies the storage API writes through.

select pg_temp.act_as_service();
insert into public.assets (
  id, owner_id, kind, mime_type, file_name, object_key, bytes, sha256, status
) values (
  '11111111-0000-4000-8000-000000000004',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'bitmap', 'image/png', 'fresh.png',
  'aaaaaaaa-0000-4000-8000-000000000001/11111111-0000-4000-8000-000000000004.png',
  256, repeat('d', 64), 'uploading'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
insert into storage.objects (bucket_id, name, owner_id)
values (
  'assets',
  'aaaaaaaa-0000-4000-8000-000000000001/11111111-0000-4000-8000-000000000004.png',
  'aaaaaaaa-0000-4000-8000-000000000001'
);
select pg_temp.check(true, 'the owner can upload while the asset awaits validation');

-- The server claims the asset before it reads a byte of it.
select pg_temp.act_as_service();
update public.assets set status = 'validating'
where id = '11111111-0000-4000-8000-000000000004';

-- A policy that no longer matches makes the write affect nothing rather than
-- raise, so these are counted rather than caught.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
with attempted as (
  update storage.objects set metadata = '{}'::jsonb
  where bucket_id = 'assets'
    and name = 'aaaaaaaa-0000-4000-8000-000000000001/11111111-0000-4000-8000-000000000004.png'
  returning 1
)
select pg_temp.check(
  (select count(*) from attempted) = 0,
  'bytes cannot be replaced once the server has claimed them for validation'
);

select pg_temp.act_as_service();
update public.assets set status = 'ready'
where id = '11111111-0000-4000-8000-000000000004';

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
with attempted as (
  update storage.objects set metadata = '{}'::jsonb
  where bucket_id = 'assets'
    and name = 'aaaaaaaa-0000-4000-8000-000000000001/11111111-0000-4000-8000-000000000004.png'
  returning 1
)
select pg_temp.check(
  (select count(*) from attempted) = 0,
  'validated bytes stay frozen, so what was checked is what is published'
);

-- Delete-and-re-upload is covered by the same `status = 'uploading'` condition
-- on the delete policy. It cannot be asserted here: Supabase blocks direct
-- deletes from storage.objects outright, so that route is closed twice over.

-- ── Frozen bytes and owner deletion ─────────────────────────────────────────

-- A never-published asset the owner may still remove.
select pg_temp.act_as_service();
insert into public.assets (
  id, owner_id, kind, mime_type, file_name, object_key, bytes, sha256, status
) values (
  '11111111-0000-4000-8000-000000000003',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'bitmap', 'image/png', 'scratch.png',
  'aaaaaaaa-0000-4000-8000-000000000001/11111111-0000-4000-8000-000000000003.png',
  512, repeat('c', 64), 'ready'
);

select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');

-- Deleting the row directly would strand the object, so the grant is gone.
do $$
begin
  begin
    delete from public.assets where id = '11111111-0000-4000-8000-000000000003';
    raise exception 'FAILED: a row delete must not bypass the cleanup outbox';
  exception when insufficient_privilege then
    raise notice 'ok — assets cannot be deleted directly through PostgREST';
  end;
end;
$$;

select public.delete_own_asset('11111111-0000-4000-8000-000000000003');

select pg_temp.act_as_service();
select pg_temp.check(
  (select count(*) from public.assets
   where id = '11111111-0000-4000-8000-000000000003') = 0,
  'delete_own_asset removes the row'
);
select pg_temp.check(
  (select count(*) from public.asset_deletions
   where object_key = 'aaaaaaaa-0000-4000-8000-000000000001/11111111-0000-4000-8000-000000000003.png'
     and reason = 'owner_deleted' and completed_at is null) = 1,
  'delete_own_asset enqueues the object, and the job outlives the row'
);

-- A published asset is not deletable at all; it has to be withdrawn.
select pg_temp.act_as('aaaaaaaa-0000-4000-8000-000000000001');
do $$
begin
  begin
    perform public.delete_own_asset('11111111-0000-4000-8000-000000000001');
    raise exception 'FAILED: an asset that has been public must not be deletable';
  exception when insufficient_privilege then
    raise notice 'ok — an asset that has been public cannot be deleted, only withdrawn';
  end;
end;
$$;

-- Another user cannot delete someone else's asset.
select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');
do $$
begin
  begin
    perform public.delete_own_asset('11111111-0000-4000-8000-000000000002');
    raise exception 'FAILED: delete_own_asset must not accept another user';
  exception when insufficient_privilege then
    raise notice 'ok — delete_own_asset refuses an asset the caller does not own';
  end;
end;
$$;

-- ── Withdrawal ──────────────────────────────────────────────────────────────

select pg_temp.act_as_service();
do $$
begin
  begin
    perform public.withdraw_asset(
      '11111111-0000-4000-8000-000000000001',
      'bbbbbbbb-0000-4000-8000-000000000002'
    );
    raise exception 'FAILED: a non-admin must not be able to withdraw an asset';
  exception when insufficient_privilege then
    raise notice 'ok — a non-admin cannot withdraw an asset';
  end;
end;
$$;

select public.withdraw_asset(
  '11111111-0000-4000-8000-000000000001',
  'cccccccc-0000-4000-8000-000000000003'
);

select pg_temp.check(
  (select count(*) from public.asset_deletions
   where asset_id = '11111111-0000-4000-8000-000000000001'
     and reason = 'withdrawal' and completed_at is null) = 1,
  'withdrawal enqueues the object for removal'
);

select pg_temp.act_as('bbbbbbbb-0000-4000-8000-000000000002');
select pg_temp.check(
  (select count(*) from public.assets
   where id = '11111111-0000-4000-8000-000000000001') = 0,
  'a withdrawn asset is unreadable everywhere, including where already referenced'
);

select pg_temp.act_as_service();
select pg_temp.check(
  (select count(*) from public.visualisation_assets
   where asset_id = '11111111-0000-4000-8000-000000000001') = 1,
  'withdrawal preserves the reference so affected visuals can be found'
);

rollback;
