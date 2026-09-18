-- Removed recordings retain their audit record; only active recordings must be unique.
alter table public.tracks drop constraint tracks_master_sha256_unique;
create unique index tracks_active_master_sha256_unique on public.tracks(master_sha256)
  where status <> 'withdrawn';


create or replace function public.finalize_mp3_upload(
  p_upload_id uuid, p_user_id uuid, p_master_key text, p_media_key text,
  p_duration_ms int, p_bitrate_kbps int, p_sha256 text, p_album text, p_year int
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  job public.audio_uploads;
  result_id uuid;
begin
  select * into job from public.audio_uploads where id = p_upload_id for update;
  if not found or job.user_id <> p_user_id then
    raise exception 'Upload not found.' using errcode = 'insufficient_privilege';
  end if;
  if job.status = 'completed' then return job.track_id; end if;
  if job.status <> 'uploading' then
    raise exception 'Upload is no longer active.' using errcode = 'check_violation';
  end if;
  perform 1 from public.music_artists where id = job.music_artist_id and claimed_by = p_user_id for share;
  if not found then
    raise exception 'This artist is not linked to your account.' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.licences where id = job.licence_id and status = 'active' for share;
  if not found then
    raise exception 'Your upload agreement is no longer active.' using errcode = 'insufficient_privilege';
  end if;
  if p_sha256 is distinct from job.sha256 or p_duration_ms is null or p_duration_ms not between 1 and 1800000
    or p_bitrate_kbps is null or p_bitrate_kbps <= 0
    or p_master_key is null or p_master_key not like job.id::text || '/%/original.mp3'
    or p_media_key is null or p_media_key not like 'hosted-audio/' || job.id::text || '/%/original.mp3' then
    raise exception 'The uploaded MP3 could not be verified.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.tracks where master_sha256 = p_sha256 and status <> 'withdrawn') then
    raise exception 'This recording has already been uploaded.' using errcode = 'check_violation';
  end if;
  insert into public.tracks (slug, music_artist_id, licence_id, title, duration_ms,
    master_key, master_sha256, album, year)
  values ('upload-' || job.id::text, job.music_artist_id, job.licence_id, job.title,
    p_duration_ms, p_master_key, p_sha256, nullif(left(p_album, 200), ''), p_year)
  returning id into result_id;
  insert into public.track_renditions (track_id, format, object_key, bitrate_kbps, bytes)
    values (result_id, 'mp3', p_media_key, p_bitrate_kbps, job.bytes);
  update public.tracks set status = 'draft' where id = result_id;
  update public.tracks set status = 'live' where id = result_id;
  update public.audio_uploads set status = 'completed', track_id = result_id,
    error = null, finished_at = now() where id = job.id;
  return result_id;
end;
$$;
revoke all on function public.finalize_mp3_upload(uuid,uuid,text,text,int,int,text,text,int) from public, anon, authenticated;
grant execute on function public.finalize_mp3_upload(uuid,uuid,text,text,int,int,text,text,int) to service_role;

create function public.withdraw_owned_track(p_track_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.tracks t join public.music_artists a on a.id = t.music_artist_id
    where t.id = p_track_id and a.claimed_by = p_user_id for update of t for share of a;
  if not found then raise exception 'Track not found.' using errcode = 'insufficient_privilege'; end if;
  perform public.withdraw_hosted_track(p_track_id, false);
  delete from public.music_playlist_items where track_id = p_track_id;
  delete from public.track_favourites where track_id = p_track_id;
end;
$$;
revoke all on function public.withdraw_owned_track(uuid,uuid) from public, anon, authenticated;
grant execute on function public.withdraw_owned_track(uuid,uuid) to service_role;

-- Count every saved member in SQL without a row-limit dependent client fetch.
create function public.music_playlist_summaries(p_user_id uuid)
returns table(id uuid, title text, track_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.title, (select count(*) from public.music_playlist_items i where i.playlist_id = p.id)
  from public.music_playlists p where p.owner_id = p_user_id order by p.created_at desc, p.id;
$$;
revoke all on function public.music_playlist_summaries(uuid) from public, anon, authenticated;
grant execute on function public.music_playlist_summaries(uuid) to service_role;
