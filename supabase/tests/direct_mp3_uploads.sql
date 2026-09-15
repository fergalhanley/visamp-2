-- Run against a local database with the direct MP3 migration applied. Rolls back.
begin;
create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', label; end if;
  raise notice 'ok — %', label;
end; $$;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('e0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mp3@test.local','x',now(),now(),now());
insert into public.music_artists(id,slug,name,claimed_by)
values ('e1000000-0000-4000-8000-000000000001','mp3-test','MP3 Test','e0000000-0000-4000-8000-000000000001');
do $$
declare
  u uuid := 'e0000000-0000-4000-8000-000000000001';
  a uuid := 'e1000000-0000-4000-8000-000000000001';
  job uuid := gen_random_uuid();
  lic public.licences;
  track uuid;
  again uuid;
  err text;
  master text;
  media text;
begin
  lic := public.accept_self_upload_agreement(u,a,'2026-09-10','test');
  master := job::text || '/candidate/original.mp3';
  media := 'hosted-audio/' || job::text || '/candidate/original.mp3';
  perform public.begin_audio_upload(job,u,a,lic.id,'MP3','song.mp3','incoming/'||u||'/'||job||'/original.mp3',1000,repeat('e',64));
  -- Retry uses the same admission, even at the daily quota.
  update public.audio_uploads set status='failed' where id=job;
  perform public.begin_audio_upload(job,u,a,lic.id,'MP3','song.mp3','incoming/'||u||'/'||job||'/original.mp3',1000,repeat('e',64));
  perform pg_temp.check((select count(*) from public.audio_uploads where user_id=u)=1, 'retry reuses admission');
  begin
    perform public.finalize_mp3_upload(job,u,master,media,2000,320,repeat('f',64),null,null);
    raise exception 'expected checksum failure';
  exception when check_violation then null;
  end;
  perform pg_temp.check((select count(*) from public.tracks where music_artist_id=a)=0, 'bad checksum cannot create a track');
  track := public.finalize_mp3_upload(job,u,master,media,2000,320,repeat('e',64),'Album',2026);
  perform pg_temp.check((select status='live' and peaks_key is null from public.tracks where id=track), 'MP3 publishes without waveform or admin approval');
  perform pg_temp.check((select count(*) from public.track_renditions where track_id=track)=1, 'one original MP3 is sufficient');
  again := public.finalize_mp3_upload(job,u,master,media,2000,320,repeat('e',64),'Album',2026);
  perform pg_temp.check(again=track and (select count(*) from public.tracks where music_artist_id=a)=1, 'repeated completion is idempotent');
  perform public.withdraw_hosted_track(track,false);
  perform pg_temp.check((select status='withdrawn' from public.tracks where id=track), 'withdrawal still works');
  perform pg_temp.check((select count(*) from public.track_renditions where track_id=track and is_current)=0, 'withdrawal removes playback source');
  perform pg_temp.check(exists(select 1 from public.track_asset_deletions where track_id=track and object_key=media), 'withdrawal queues MP3 deletion');
  perform pg_temp.check(not exists(select 1 from public.track_asset_deletions where track_id=track and object_key=master), 'withdrawal retains original by default');
  again := public.finalize_mp3_upload(job,u,master,media,2000,320,repeat('e',64),null,null);
  perform pg_temp.check((select status='withdrawn' from public.tracks where id=again), 'completion retry cannot republish withdrawn music');
  perform pg_temp.check(not has_function_privilege('authenticated', 'public.finalize_mp3_upload(uuid,uuid,text,text,int,int,text,text,int)', 'execute'), 'browser cannot publish directly');
end; $$;
rollback;
