-- VIS-131. Run locally after the migration. No fixtures persist.
begin;
create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', message; end if;
  raise notice 'ok: %', message;
end $$;
do $$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  artist_id uuid := gen_random_uuid();
  licence_id uuid := gen_random_uuid();
  track_id uuid;
  first_track uuid;
  playlist_id uuid := gen_random_uuid();
  artist_slug text := 'library-test-' || artist_id::text;
  result jsonb;
  second_page jsonb;
begin
  insert into auth.users(id,email) values(owner_id, owner_id::text||'@test.local'),(other_id,other_id::text||'@test.local');
  insert into public.music_artists(id,name,slug,claimed_by) values(artist_id,'Library Test '||artist_id::text,artist_slug,owner_id);
  insert into public.licences(id,music_artist_id,status,signed_at,effective_from,grants_hosting,grants_streaming,grants_transcoding,grants_sync)
    values(licence_id,artist_id,'active',now(),current_date,true,true,true,true);
  for n in 1..45 loop
    track_id := gen_random_uuid();
    if n=1 then first_track:=track_id; end if;
    insert into public.tracks(id,music_artist_id,licence_id,slug,title,duration_ms,master_key,master_sha256,peaks_key)
      values(track_id,artist_id,licence_id,'test-'||track_id::text,'Song '||n,1000,track_id::text,md5(track_id::text)||md5(track_id::text),'peak/'||track_id::text);
    insert into public.track_renditions(track_id,format,object_key,bitrate_kbps,bytes)
      values(track_id,'opus',track_id::text||'.opus',128,100),(track_id,'aac',track_id::text||'.aac',192,100);
    update public.tracks set status='draft' where id=track_id;
    update public.tracks set status='live',published_at=now() where id=track_id;
  end loop;
  result:=public.browse_music(p_artist=>artist_slug);
  second_page:=public.browse_music(p_artist=>artist_slug,p_offset=>40);
  perform pg_temp.check(jsonb_array_length(result->'tracks')=40 and (result->>'nextOffset')::int=40,'first page is bounded with continuation');
  perform pg_temp.check(jsonb_array_length(second_page->'tracks')=5 and second_page->>'nextOffset' is null,'last page ends correctly');
  perform pg_temp.check(not exists(select 1 from jsonb_array_elements(result->'tracks') a join jsonb_array_elements(second_page->'tracks') b on a->>'id'=b->>'id'),'stable tie ordering avoids duplicate tracks');
  result:=public.browse_music(p_artist=>artist_slug,p_query=>'SONG 45');
  perform pg_temp.check(jsonb_array_length(result->'tracks')=1,'search filters before pagination and ignores case');
  insert into public.track_favourites(user_id,track_id) values(owner_id,first_track);
  result:=public.browse_music(p_user_id=>owner_id,p_favourites=>true);
  perform pg_temp.check(jsonb_array_length(result->'tracks')=1 and (result->'tracks'->0->>'favourite')::boolean,'favourites belong to owner');
  result:=public.browse_music(p_user_id=>other_id,p_favourites=>true);
  perform pg_temp.check(jsonb_array_length(result->'tracks')=0,'other users cannot see favourites');
  insert into public.music_playlists(id,owner_id,title) values(playlist_id,owner_id,'Test collection');
  insert into public.music_playlist_items(playlist_id,track_id) values(playlist_id,first_track);
  result:=public.browse_music(p_user_id=>owner_id,p_playlist=>playlist_id);
  perform pg_temp.check(jsonb_array_length(result->'tracks')=1,'playlist filter includes its track');
  result:=public.browse_music(p_user_id=>other_id,p_playlist=>playlist_id);
  perform pg_temp.check(jsonb_array_length(result->'tracks')=0,'playlist filter refuses another owner');
  update public.licences set status='terminated' where id=licence_id;
  result:=public.browse_music(p_user_id=>owner_id,p_playlist=>playlist_id);
  perform pg_temp.check(jsonb_array_length(result->'tracks')=0,'terminated licences disappear from saved playlists');
  perform pg_temp.check(not has_table_privilege('authenticated','public.track_favourites','select'),'browser cannot bypass API ownership');
  perform pg_temp.check(not has_function_privilege('authenticated','public.browse_music(text,text,uuid,boolean,uuid,integer,integer)','execute'),'browser cannot impersonate catalogue user');
end $$;
rollback;
