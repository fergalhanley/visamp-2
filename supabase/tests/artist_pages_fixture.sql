-- VIS-84 fixture: the three artist-page visibility scenarios.
--
-- Not assertions — the visibility rule lives in the app, not the database, so
-- this seeds a local stack for checking the pages themselves:
--
--   supabase db reset
--   docker exec -i supabase_db_visamp-2 psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -q < supabase/tests/artist_pages_fixture.sql
--
-- Then run the web app against the local stack and expect:
--
--   /artists              lists loud-act and orphan-act, never quiet-act
--   /artists/loud-act     200 for anyone; links to /creators/owner
--   /artists/orphan-act   200 for anyone; no creator link
--   /artists/quiet-act    404 for anyone but its claimant, 200 for them
--   /artists/<username>   308 to /creators/<username>, the VIS-82 fallback
--
-- Unlike the other files here this one commits, because the point is to leave
-- the rows in place.
create extension if not exists pgcrypto;

-- The claimant, signing in through the UI as owner@test.local / testpassword123
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values ('bbbbbbbb-0000-4000-8000-000000000001',
        '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'owner@test.local', crypt('testpassword123', gen_salt('bf')),
        now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

-- Somebody else, to prove the page is hidden from them.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
values ('bbbbbbbb-0000-4000-8000-000000000002',
        '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
        'other@test.local', crypt('testpassword123', gen_salt('bf')),
        now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

update public.profiles set username = 'owner' where id = 'bbbbbbbb-0000-4000-8000-000000000001';
update public.profiles set username = 'other' where id = 'bbbbbbbb-0000-4000-8000-000000000002';

-- A: claimed, nothing live      -> claimant only
-- B: claimed, one live track    -> public, cross-links to /creators/owner
-- C: unclaimed, one live track  -> public, no cross-link
insert into public.music_artists (id, slug, name, bio, claimed_by) values
  ('cccccccc-0000-4000-8000-00000000000a','quiet-act','Quiet Act','Nothing released yet.','bbbbbbbb-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-00000000000b','loud-act','Loud Act','A claimed act with music out.','bbbbbbbb-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-00000000000c','orphan-act','Orphan Act','No account behind this one.',null);

insert into public.licences (id, music_artist_id, status, signed_at, effective_from,
                             grants_hosting, grants_streaming, grants_transcoding, grants_sync)
values
  ('dddddddd-0000-4000-8000-00000000000b','cccccccc-0000-4000-8000-00000000000b','active',now(),current_date,true,true,true,true),
  ('dddddddd-0000-4000-8000-00000000000c','cccccccc-0000-4000-8000-00000000000c','active',now(),current_date,true,true,true,true);

-- Tracks must start ingesting and walk to live, as the trigger insists.
-- A live track needs its ingest assets as well as its licence.
insert into public.tracks (id, music_artist_id, licence_id, slug, title, album, duration_ms,
                          peaks_key, master_key, master_sha256)
values
  ('eeeeeeee-0000-4000-8000-00000000000b','cccccccc-0000-4000-8000-00000000000b','dddddddd-0000-4000-8000-00000000000b','loud-one','Loud One','First EP',214000,'peaks/b','masters/b',repeat('a',64)),
  ('eeeeeeee-0000-4000-8000-00000000000c','cccccccc-0000-4000-8000-00000000000c','dddddddd-0000-4000-8000-00000000000c','orphan-one','Orphan One',null,180500,'peaks/c','masters/c',repeat('b',64));

-- ...and current opus and aac renditions.
insert into public.track_renditions (track_id, format, object_key, bitrate_kbps, bytes)
values
  ('eeeeeeee-0000-4000-8000-00000000000b','opus','media/b.opus',128,4000000),
  ('eeeeeeee-0000-4000-8000-00000000000b','aac','media/b.m4a',192,6000000),
  ('eeeeeeee-0000-4000-8000-00000000000c','opus','media/c.opus',128,3000000),
  ('eeeeeeee-0000-4000-8000-00000000000c','aac','media/c.m4a',192,5000000);

update public.tracks set status = 'draft' where id in ('eeeeeeee-0000-4000-8000-00000000000b','eeeeeeee-0000-4000-8000-00000000000c');
update public.tracks set status = 'live', published_at = now() where id in ('eeeeeeee-0000-4000-8000-00000000000b','eeeeeeee-0000-4000-8000-00000000000c');

select slug, name, claimed_by is not null as claimed,
  (select count(*) from public.tracks t where t.music_artist_id = a.id and t.status = 'live') as live
from public.music_artists a order by slug;
