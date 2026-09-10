-- VIS-83 acceptance checks for self-serve artist claiming.
--
-- Run against a local stack with the migrations applied:
--
--   supabase db start
--   docker exec -i supabase_db_visamp-2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -q < supabase/tests/artist_claiming.sql
--
-- Every assertion prints a NOTICE; a failure raises and aborts, so a run with
-- no ERROR line passed. Everything is inside one transaction that is rolled
-- back at the end, so the script leaves no rows behind.

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

-- Returns the error message a call raises, or null when it succeeds, so the
-- rejection cases can assert on wording the person actually reads.
create or replace function pg_temp.claim_error(p_user_id uuid, p_name text)
returns text language plpgsql as $$
declare
  v_ignored public.music_artists;
begin
  v_ignored := public.claim_music_artist(p_user_id, p_name);
  return null;
exception when others then
  return sqlerrm;
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','claim-a@test.local','x',now(),now(),now()),
  ('aaaaaaaa-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','claim-b@test.local','x',now(),now(),now()),
  ('aaaaaaaa-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','claim-c@test.local','x',now(),now(),now());

do $$
declare
  v_first public.music_artists;
  v_second public.music_artists;
  v_third public.music_artists;
begin
  -- A name is trimmed and its internal whitespace collapsed, because it is
  -- displayed; the slug is derived from it and must satisfy the format check.
  v_first := public.claim_music_artist(
    'aaaaaaaa-0000-4000-8000-000000000001', '  Deep   Fixation  ');
  perform pg_temp.check(v_first.name = 'Deep Fixation', 'name is normalised');
  perform pg_temp.check(v_first.slug = 'deep-fixation', 'slug derives from the name');
  perform pg_temp.check(
    v_first.claimed_by = 'aaaaaaaa-0000-4000-8000-000000000001',
    'the claimant owns the artist');

  -- VIS-7 — one self-claimed artist per user for now.
  perform pg_temp.check(
    pg_temp.claim_error('aaaaaaaa-0000-4000-8000-000000000001', 'Second Act')
      = 'You already have an artist profile.',
    'a second self-claim is refused');

  -- Two people may release under the same name; the web address disambiguates.
  v_second := public.claim_music_artist(
    'aaaaaaaa-0000-4000-8000-000000000002', 'Deep Fixation');
  perform pg_temp.check(v_second.slug = 'deep-fixation-2', 'a taken slug takes a suffix');
  perform pg_temp.check(v_second.name = 'Deep Fixation', 'the display name may repeat');

  -- A name with nothing usable in it still has to produce a valid slug rather
  -- than failing the format check.
  v_third := public.claim_music_artist('aaaaaaaa-0000-4000-8000-000000000003', '東京');
  perform pg_temp.check(v_third.name = '東京', 'the name is kept as written');
  perform pg_temp.check(v_third.slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    'an unrepresentable name still yields a valid slug');

  perform pg_temp.check(
    pg_temp.claim_error('aaaaaaaa-0000-4000-8000-000000000003', '   ') is not null,
    'a blank name is refused');
  perform pg_temp.check(
    pg_temp.claim_error('aaaaaaaa-0000-4000-8000-000000000003', repeat('x', 121)) is not null,
    'an over-long name is refused');
end;
$$;

-- The client must never reach this directly: music_artists is revoked from
-- authenticated, and the function is service_role only, so the server decides
-- who the caller is before it runs.
do $$
begin
  perform pg_temp.check(
    not has_function_privilege('authenticated',
      'public.claim_music_artist(uuid, text)', 'execute'),
    'authenticated cannot execute the claim function');
  perform pg_temp.check(
    not has_function_privilege('anon',
      'public.claim_music_artist(uuid, text)', 'execute'),
    'anon cannot execute the claim function');
  perform pg_temp.check(
    has_function_privilege('service_role',
      'public.claim_music_artist(uuid, text)', 'execute'),
    'service_role can execute the claim function');
  perform pg_temp.check(
    not has_table_privilege('authenticated', 'public.music_artists', 'insert'),
    'authenticated still cannot insert artists directly');
end;
$$;

rollback;
