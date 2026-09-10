-- VIS-86 acceptance checks for self-accepted upload licences.
--
--   supabase db reset
--   docker exec -i supabase_db_visamp-2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -q < supabase/tests/self_upload_agreement.sql
--
-- One transaction, rolled back. Every assertion prints a NOTICE; a run with no
-- ERROR line passed.

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

create or replace function pg_temp.accept_error(p_user uuid, p_artist uuid, p_version text)
returns text language plpgsql as $$
declare v_ignored public.licences;
begin
  v_ignored := public.accept_self_upload_agreement(p_user, p_artist, p_version, 'test-agent');
  return null;
exception when others then
  return sqlerrm;
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('a0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','mine@test.local','x',now(),now(),now()),
  ('a0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','theirs@test.local','x',now(),now(),now());

insert into public.music_artists (id, slug, name, claimed_by) values
  ('b0000000-0000-4000-8000-000000000001','mine','Mine','a0000000-0000-4000-8000-000000000001');

do $$
declare
  v_first public.licences;
  v_again public.licences;
  v_track_error text;
begin
  v_first := public.accept_self_upload_agreement(
    'a0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001', '2026-09-10', 'test-agent');

  perform pg_temp.check(v_first.status = 'pending',
    'an accepted licence starts pending, not active');
  perform pg_temp.check(v_first.warrants_master and v_first.warrants_publishing,
    'the artist warrants master and publishing');
  perform pg_temp.check(v_first.grants_hosting and v_first.grants_streaming
    and v_first.grants_transcoding and v_first.grants_sync,
    'all four grants are recorded');
  perform pg_temp.check(v_first.agreement_version = '2026-09-10'
    and v_first.accepted_at is not null
    and v_first.accepted_by = 'a0000000-0000-4000-8000-000000000001',
    'version and acceptance evidence are captured');

  -- A batch of ten files must not leave ten licences behind.
  v_again := public.accept_self_upload_agreement(
    'a0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001', '2026-09-10', 'test-agent');
  perform pg_temp.check(v_again.id = v_first.id, 'accepting again reuses the licence');
  perform pg_temp.check(
    (select count(*) from public.licences
     where music_artist_id = 'b0000000-0000-4000-8000-000000000001') = 1,
    'only one licence exists for the artist');

  -- Nobody may accept on somebody else's behalf.
  perform pg_temp.check(
    pg_temp.accept_error('a0000000-0000-4000-8000-000000000002',
      'b0000000-0000-4000-8000-000000000001', '2026-09-10')
      = 'This artist is not linked to your account.',
    'a non-claimant cannot accept');
  perform pg_temp.check(
    pg_temp.accept_error('a0000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001', '  ') is not null,
    'a blank agreement version is refused');

  -- The whole point: uploading is now possible, publishing still is not.
  insert into public.tracks (id, music_artist_id, licence_id, slug, title, duration_ms,
                             peaks_key, master_key, master_sha256)
  values ('c0000000-0000-4000-8000-000000000001',
          'b0000000-0000-4000-8000-000000000001', v_first.id,
          'pending-track','Pending Track',180000,'peaks/x','masters/x',repeat('a',64));
  update public.tracks set status = 'draft'
    where id = 'c0000000-0000-4000-8000-000000000001';
  insert into public.track_renditions (track_id, format, object_key, bitrate_kbps, bytes)
  values ('c0000000-0000-4000-8000-000000000001','opus','m/x.opus',128,1),
         ('c0000000-0000-4000-8000-000000000001','aac','m/x.m4a',192,1);

  begin
    update public.tracks set status = 'live'
      where id = 'c0000000-0000-4000-8000-000000000001';
    v_track_error := null;
  exception when others then
    v_track_error := sqlerrm;
  end;
  perform pg_temp.check(v_track_error is not null,
    'a track cannot go live on a pending licence');

  -- ...and once an admin activates it, publication is allowed.
  update public.licences set status = 'active' where id = v_first.id;
  update public.tracks set status = 'live'
    where id = 'c0000000-0000-4000-8000-000000000001';
  perform pg_temp.check(
    (select status from public.tracks
     where id = 'c0000000-0000-4000-8000-000000000001') = 'live',
    'activating the licence releases the track');
end;
$$;

-- The client must not reach any of this directly.
do $$
begin
  perform pg_temp.check(
    not has_function_privilege('authenticated',
      'public.accept_self_upload_agreement(uuid, uuid, text, text)', 'execute'),
    'authenticated cannot execute the acceptance function');
  perform pg_temp.check(
    not has_table_privilege('authenticated', 'public.licences', 'insert'),
    'authenticated cannot insert licences directly');
end;
$$;

rollback;
