-- VIS-132: transaction rollback keeps the database free of fixtures.
begin;
create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', message; end if;
  raise notice 'ok: %', message;
end $$;
do $$
declare
  owner_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid();
  artist_id uuid := gen_random_uuid(); licence_id uuid := gen_random_uuid();
  first_job uuid := gen_random_uuid(); second_job uuid := gen_random_uuid();
  first_track uuid; replacement uuid; playlist uuid := gen_random_uuid();
  digest text := md5(first_job::text)||md5(first_job::text);
begin
  insert into auth.users(id,email) values(owner_id,owner_id::text||'@test.local'),(other_id,other_id::text||'@test.local');
  insert into public.music_artists(id,name,slug,claimed_by) values(artist_id,'Removal Test '||artist_id,'removal-'||artist_id,owner_id);
  insert into public.licences(id,music_artist_id,status,signed_at,effective_from,grants_hosting,grants_streaming,grants_transcoding,grants_sync)
    values(licence_id,artist_id,'active',now(),current_date,true,true,true,true);
  insert into public.audio_uploads(id,user_id,music_artist_id,licence_id,title,file_name,object_key,bytes,sha256)
    values(first_job,owner_id,artist_id,licence_id,'First','original.mp3','incoming/'||owner_id||'/'||first_job||'/original.mp3',100,digest),
    (second_job,owner_id,artist_id,licence_id,'Replacement','original.mp3','incoming/'||owner_id||'/'||second_job||'/original.mp3',100,digest);
  first_track := public.finalize_mp3_upload(first_job,owner_id,first_job||'/v1/original.mp3','hosted-audio/'||first_job||'/v1/original.mp3',1000,128,digest,'Album',2026);
  begin
    perform public.finalize_mp3_upload(second_job,owner_id,second_job||'/v1/original.mp3','hosted-audio/'||second_job||'/v1/original.mp3',1000,128,digest,'Album',2026);
    raise exception 'Active duplicate was accepted';
  exception when check_violation then raise notice 'ok: active duplicate rejected'; end;
  insert into public.music_playlists(id,owner_id,title) values(playlist,owner_id,'Saved');
  insert into public.music_playlist_items(playlist_id,track_id) values(playlist,first_track);
  insert into public.track_favourites(user_id,track_id) values(owner_id,first_track);
  perform pg_temp.check((select track_count=1 from public.music_playlist_summaries(owner_id) where id=playlist),'playlist count includes saved track');
  perform pg_temp.check(not exists(select 1 from public.music_playlist_summaries(other_id) where id=playlist),'playlist counts respect ownership');
  begin
    perform public.withdraw_owned_track(first_track,other_id);
    raise exception 'Other owner removal accepted';
  exception when insufficient_privilege then raise notice 'ok: other owner rejected'; end;
  perform public.withdraw_owned_track(first_track,owner_id);
  perform public.withdraw_owned_track(first_track,owner_id);
  perform pg_temp.check((select status='withdrawn' from public.tracks where id=first_track),'owner removal is idempotent and retains tombstone');
  perform pg_temp.check(not exists(select 1 from public.track_renditions where track_id=first_track and is_current),'removed rendition is unavailable');
  perform pg_temp.check(exists(select 1 from public.track_asset_deletions where track_id=first_track),'removed assets queued for deletion');
  perform pg_temp.check((select track_count=0 from public.music_playlist_summaries(owner_id) where id=playlist),'removed track cleared from playlists');
  perform pg_temp.check(not exists(select 1 from public.track_favourites where track_id=first_track),'removed track cleared from favourites');
  replacement := public.finalize_mp3_upload(second_job,owner_id,second_job||'/v1/original.mp3','hosted-audio/'||second_job||'/v1/original.mp3',1000,128,digest,'New album',2026);
  perform pg_temp.check((select status='live' and album='New album' from public.tracks where id=replacement),'identical recording can be uploaded again after removal');
  perform pg_temp.check(replacement<>first_track,'replacement has its own track identity');
  perform pg_temp.check(not has_function_privilege('authenticated','public.withdraw_owned_track(uuid,uuid)','execute'),'browser cannot impersonate removal owner');
  perform pg_temp.check(not has_function_privilege('authenticated','public.music_playlist_summaries(uuid)','execute'),'browser cannot impersonate playlist owner');
end $$;
rollback;
