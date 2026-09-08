-- Artist uploads are private, bounded submissions processed off the web server.
create table public.audio_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  music_artist_id uuid not null references public.music_artists(id),
  licence_id uuid not null references public.licences(id),
  title text not null check (length(btrim(title)) between 1 and 200),
  file_name text not null check (length(file_name) between 1 and 255),
  object_key text not null unique,
  bytes bigint not null check (bytes between 1 and 262144000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploading' check (status in ('uploading','queued','processing','completed','failed')),
  track_id uuid references public.tracks(id),
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint upload_object_owned check (object_key like 'incoming/' || user_id::text || '/' || id::text || '/original.%')
);
create index audio_upload_queue on public.audio_uploads(created_at) where status = 'queued';
alter table public.audio_uploads enable row level security;
revoke all on public.audio_uploads from anon, authenticated;
grant select on public.audio_uploads to authenticated;
create policy "Artists read their upload status" on public.audio_uploads
  for select to authenticated using (user_id = (select auth.uid()));
grant all on public.audio_uploads to service_role;

-- Called only by our authenticated server after artist + licence verification.
create function public.begin_audio_upload(
  p_id uuid, p_user_id uuid, p_artist_id uuid, p_licence_id uuid,
  p_title text, p_file_name text, p_object_key text, p_bytes bigint, p_sha256 text
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('audio-upload:' || p_user_id::text, 0));
  update public.audio_uploads set status = 'failed', error = 'Upload expired. Please submit again.', finished_at = now()
    where user_id = p_user_id and status = 'uploading' and created_at < now() - interval '1 hour';
  if (select count(*) from public.audio_uploads where user_id = p_user_id and created_at > now() - interval '24 hours') >= 20
    or (select count(*) from public.audio_uploads where user_id = p_user_id and status in ('uploading','queued','processing')) >= 3 then
    raise exception 'Upload limit reached. Wait for your existing uploads to finish.';
  end if;
  insert into public.audio_uploads(id,user_id,music_artist_id,licence_id,title,file_name,object_key,bytes,sha256)
    values(p_id,p_user_id,p_artist_id,p_licence_id,p_title,p_file_name,p_object_key,p_bytes,p_sha256);
  return p_id;
end;
$$;
revoke all on function public.begin_audio_upload(uuid,uuid,uuid,uuid,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.begin_audio_upload(uuid,uuid,uuid,uuid,text,text,text,bigint,text) to service_role;

-- Workers atomically claim one job; concurrent workers cannot process the same row.
create function public.claim_audio_upload() returns setof public.audio_uploads
language sql security definer set search_path = '' as $$
  update public.audio_uploads set status = 'processing', started_at = now(), error = null
    where id = (select id from public.audio_uploads where status = 'queued'
      order by created_at for update skip locked limit 1)
    returning *;
$$;
revoke all on function public.claim_audio_upload() from public, anon, authenticated;
grant execute on function public.claim_audio_upload() to service_role;

-- Stop importing a real/display name from identity providers. Keep the legacy
-- column for compatibility with older clients; the UI now uses username only.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;
revoke update (display_name) on public.profiles from authenticated;
