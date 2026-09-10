-- VIS-86 acceptance checks for the batch upload admission caps.
--
--   supabase db reset
--   docker exec -i supabase_db_visamp-2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -q < supabase/tests/upload_limits.sql
--
-- One transaction, rolled back. A run with no ERROR line passed.

begin;
create or replace function pg_temp.check(p_condition boolean, p_description text)
returns void language plpgsql as $$
begin
  if not p_condition then raise exception 'FAILED: %', p_description; end if;
  raise notice 'ok — %', p_description;
end;
$$;
create or replace function pg_temp.admit(p_user uuid, p_artist uuid, p_licence uuid, p_n int)
returns text language plpgsql as $$
declare v uuid; v_id uuid := gen_random_uuid();
begin
  -- upload_object_owned requires the key to name this row's own id.
  v := public.begin_audio_upload(v_id, p_user, p_artist, p_licence,
    'Track ' || p_n, 'f' || p_n || '.wav',
    'incoming/' || p_user::text || '/' || v_id::text || '/original.wav',
    1000, repeat('a', 64));
  return null;
exception when others then return sqlerrm;
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('d0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cap@test.local','x',now(),now(),now());
insert into public.music_artists (id, slug, name, claimed_by)
values ('d1000000-0000-4000-8000-000000000001','capper','Capper','d0000000-0000-4000-8000-000000000001');

do $$
declare
  v_lic public.licences;
  v_err text;
begin
  v_lic := public.accept_self_upload_agreement('d0000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001', '2026-09-10', 'test');

  -- Ten tracks, each completing its transfer, exactly as a batch upload behaves.
  for i in 1..10 loop
    v_err := pg_temp.admit('d0000000-0000-4000-8000-000000000001',
      'd1000000-0000-4000-8000-000000000001', v_lic.id, i);
    perform pg_temp.check(v_err is null, 'track ' || i || ' of an album is admitted');
    update public.audio_uploads set status = 'queued'
      where user_id = 'd0000000-0000-4000-8000-000000000001' and status = 'uploading';
  end loop;

  -- The daily cap is still real.
  for i in 11..20 loop
    perform pg_temp.admit('d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001', v_lic.id, i);
    update public.audio_uploads set status = 'queued'
      where user_id = 'd0000000-0000-4000-8000-000000000001' and status = 'uploading';
  end loop;
  v_err := pg_temp.admit('d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001', v_lic.id, 21);
  perform pg_temp.check(v_err like 'Daily upload limit%', 'the 21st in a day is refused');

  -- And abandoned admissions still cap concurrency.
  delete from public.audio_uploads where user_id = 'd0000000-0000-4000-8000-000000000001';
  for i in 1..3 loop
    perform pg_temp.admit('d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001', v_lic.id, i);
  end loop;
  v_err := pg_temp.admit('d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001', v_lic.id, 4);
  perform pg_temp.check(v_err like 'Too many uploads in progress%',
    'a fourth abandoned transfer is refused');
end;
$$;
rollback;
