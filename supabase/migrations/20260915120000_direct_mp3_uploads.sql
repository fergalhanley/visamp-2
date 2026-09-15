-- Direct MP3 uploads: no transcoding, waveform or admin approval prerequisite.
-- Existing processed tracks and manually managed licences retain their state.
alter table public.track_renditions drop constraint track_renditions_format_check;
alter table public.track_renditions add constraint track_renditions_format_check check (format in ('mp3', 'opus', 'aac'));

create or replace function public.enforce_hosted_track_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status <> 'ingesting' then
    raise exception 'new hosted tracks must start in ingesting state';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'withdrawn' and new.status <> 'withdrawn' then
      raise exception 'withdrawn tracks cannot be restored';
    end if;

    if old.status <> new.status and not (
      (old.status = 'ingesting' and new.status = 'draft')
      or (old.status = 'draft' and new.status = 'live')
      or (old.status = 'live' and new.status = 'withdrawn')
      or (old.status = 'draft' and new.status = 'withdrawn')
      or (old.status = 'ingesting' and new.status = 'withdrawn')
    ) then
      raise exception 'invalid hosted track status transition: % -> %', old.status, new.status;
    end if;
  end if;

  if new.status = 'live' then
    if not exists (
      select 1
      from public.licences l
      where l.id = new.licence_id
        and l.music_artist_id = new.music_artist_id
        and l.status = 'active'
        and l.signed_at is not null
        and l.effective_from is not null
        and l.effective_from <= current_date
        and (l.effective_until is null or l.effective_until >= current_date)
        and l.grants_hosting
        and l.grants_streaming
        and l.grants_transcoding
        and l.grants_sync
    ) then
      raise exception 'track does not have a currently valid complete licence';
    end if;

    if new.master_key is null or new.master_sha256 is null then
      raise exception 'track is missing required ingest assets';
    end if;

    if not exists (
      select 1 from public.track_renditions r
      where r.track_id = new.id and r.is_current and r.format in ('mp3', 'opus', 'aac')
    ) then
      raise exception 'track requires a current playable audio file';
    end if;

    if new.published_at is null then
      new.published_at := now();
    end if;
  end if;

  if new.status = 'withdrawn' and new.withdrawn_at is null then
    new.withdrawn_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.accept_self_upload_agreement(
  p_user_id uuid,
  p_artist_id uuid,
  p_version text,
  p_user_agent text
)
returns public.licences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.licences;
begin
  if p_version is null or btrim(p_version) = '' then
    raise exception 'An agreement version is required.'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.music_artists
    where id = p_artist_id and claimed_by = p_user_id
  ) then
    raise exception 'This artist is not linked to your account.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Serialised per artist so two uploads starting together cannot each create
  -- a licence and leave the artist holding duplicates.
  perform pg_advisory_xact_lock(
    hashtextextended('self-upload-agreement:' || p_artist_id::text, 0));

  if exists (
    select 1 from public.licences where music_artist_id = p_artist_id
      and accepted_by = p_user_id and status = 'terminated'
  ) then
    raise exception 'Your upload agreement has been terminated. Contact VisAmp.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_row
  from public.licences
  where music_artist_id = p_artist_id
    and accepted_by = p_user_id
    and agreement_version = btrim(p_version)
    and status <> 'terminated'
  limit 1;

  if found then
    if v_row.status = 'pending' then
      update public.licences set status = 'active' where id = v_row.id returning * into v_row;
    end if;
    return v_row;
  end if;

  -- Invited artists warrant their rights; acceptance authorizes publication.
  insert into public.licences (
    music_artist_id, status, signed_at, effective_from, territory,
    grants_hosting, grants_streaming, grants_transcoding, grants_sync,
    warrants_master, warrants_publishing,
    agreement_version, accepted_at, accepted_by, accepted_user_agent
  ) values (
    p_artist_id, 'active', now(), current_date, 'worldwide',
    true, true, true, true,
    true, true,
    btrim(p_version), now(), p_user_id, left(coalesce(p_user_agent, ''), 400)
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.accept_self_upload_agreement(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_self_upload_agreement(uuid, uuid, text, text)
  to service_role;

create or replace function public.begin_audio_upload(
  p_id uuid, p_user_id uuid, p_artist_id uuid, p_licence_id uuid,
  p_title text, p_file_name text, p_object_key text, p_bytes bigint, p_sha256 text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare existing public.audio_uploads;
begin
  perform pg_advisory_xact_lock(hashtextextended('audio-upload:' || p_user_id::text, 0));

  update public.audio_uploads
    set status = 'failed',
        error = 'Upload expired. Please submit again.',
        finished_at = now()
    where user_id = p_user_id
      and status = 'uploading'
      and coalesce(started_at, created_at) < now() - interval '1 hour';

  select * into existing from public.audio_uploads where id = p_id for update;
  if found then
    if existing.user_id <> p_user_id or existing.music_artist_id <> p_artist_id
      or existing.bytes <> p_bytes or existing.sha256 <> p_sha256
      or existing.file_name <> p_file_name or existing.object_key <> p_object_key then
      raise exception 'Upload details changed. Select the file again.' using errcode = 'check_violation';
    end if;
    if existing.status = 'completed' then return p_id; end if;
    if existing.status not in ('uploading', 'failed') or existing.created_at < now() - interval '24 hours' then
      raise exception 'Upload expired. Select the file again.' using errcode = 'check_violation';
    end if;
    if (select count(*) from public.audio_uploads
      where user_id = p_user_id and status = 'uploading' and id <> p_id) >= 3 then
      raise exception 'Too many uploads in progress. Wait for the current ones to finish.';
    end if;
    update public.audio_uploads set status = 'uploading', title = p_title,
      licence_id = p_licence_id, error = null, finished_at = null, started_at = now()
      where id = p_id;
    return p_id;
  end if;

  if (select count(*) from public.audio_uploads
      where user_id = p_user_id
        and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Daily upload limit reached. You can upload 20 tracks a day.';
  end if;

  -- Three concurrent transfers, including verification before publication.
  if (select count(*) from public.audio_uploads
      where user_id = p_user_id and status = 'uploading') >= 3 then
    raise exception 'Too many uploads in progress. Wait for the current ones to finish.';
  end if;

  insert into public.audio_uploads(id,user_id,music_artist_id,licence_id,title,file_name,object_key,bytes,sha256)
    values(p_id,p_user_id,p_artist_id,p_licence_id,p_title,p_file_name,p_object_key,p_bytes,p_sha256);
  return p_id;
end;
$$;

-- Storage verification happens first. The row lock makes completion idempotent
-- and rechecks rights atomically with publication, including concurrent withdrawal.
create function public.finalize_mp3_upload(
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
  if exists (select 1 from public.tracks where master_sha256 = p_sha256) then
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
