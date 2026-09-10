-- VIS-86 — the admission cap assumed one file at a time.
--
-- begin_audio_upload refused a fourth upload while three rows sat in
-- 'uploading', 'queued' or 'processing'. Queued means the transfer already
-- succeeded and the row is waiting on the worker, so with batch upload anyone
-- releasing an album was stopped at track four — and stayed stopped until the
-- worker drained, which is not something the person uploading can influence.
--
-- The two limits are really about different things, so they are separated:
--
--   * outstanding signed URLs, which is what could be abused to request write
--     access to many keys at once, and which the client only ever uses one at
--     a time. Still tightly capped.
--   * total work admitted per day, which is what actually bounds storage and
--     transcoding. Unchanged at 20, and now the only thing standing between an
--     artist and their album.

create or replace function public.begin_audio_upload(
  p_id uuid, p_user_id uuid, p_artist_id uuid, p_licence_id uuid,
  p_title text, p_file_name text, p_object_key text, p_bytes bigint, p_sha256 text
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('audio-upload:' || p_user_id::text, 0));

  update public.audio_uploads
    set status = 'failed',
        error = 'Upload expired. Please submit again.',
        finished_at = now()
    where user_id = p_user_id
      and status = 'uploading'
      and created_at < now() - interval '1 hour';

  if (select count(*) from public.audio_uploads
      where user_id = p_user_id
        and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Daily upload limit reached. You can upload 20 tracks a day.';
  end if;

  -- Only transfers actually in flight. The client uploads one at a time, so
  -- reaching three means abandoned admissions, which the sweep above clears
  -- after an hour.
  if (select count(*) from public.audio_uploads
      where user_id = p_user_id and status = 'uploading') >= 3 then
    raise exception 'Too many uploads in progress. Wait for the current ones to finish.';
  end if;

  insert into public.audio_uploads(id,user_id,music_artist_id,licence_id,title,file_name,object_key,bytes,sha256)
    values(p_id,p_user_id,p_artist_id,p_licence_id,p_title,p_file_name,p_object_key,p_bytes,p_sha256);
  return p_id;
end;
$$;
