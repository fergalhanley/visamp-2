-- VisAmp-hosted music catalogue.
-- Audio bytes stay in Cloudflare R2; Postgres stores catalogue, licence and
-- operational state only.

create type public.licence_status as enum ('pending', 'active', 'terminated');
create type public.track_status as enum ('ingesting', 'draft', 'live', 'withdrawn');

create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.music_artists (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  bio text,
  website_url text,
  avatar_key text,
  claimed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint music_artists_name_not_blank check (btrim(name) <> ''),
  constraint music_artists_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.licences (
  id uuid primary key default gen_random_uuid(),
  music_artist_id uuid not null references public.music_artists(id),
  status public.licence_status not null default 'pending',
  document_key text,
  signed_at timestamptz,
  effective_from date,
  effective_until date,
  territory text not null default 'worldwide',
  grants_hosting boolean not null default false,
  grants_streaming boolean not null default false,
  grants_transcoding boolean not null default false,
  grants_sync boolean not null default false,
  warrants_master boolean not null default false,
  warrants_publishing boolean not null default false,
  termination_notice_days int,
  notes text,
  terminated_at timestamptz,
  created_at timestamptz not null default now(),

  constraint licences_date_order check (
    effective_until is null
    or effective_from is null
    or effective_until >= effective_from
  ),
  constraint licences_notice_nonnegative check (
    termination_notice_days is null or termination_notice_days >= 0
  )
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  music_artist_id uuid not null references public.music_artists(id),
  licence_id uuid references public.licences(id),
  status public.track_status not null default 'ingesting',

  title text not null,
  album text,
  year int,
  isrc text,
  bpm numeric(6, 2),
  musical_key text,
  genre_tags text[] not null default '{}',
  is_explicit boolean not null default false,
  download_allowed boolean not null default false,

  duration_ms int not null,
  loudness_in_lufs numeric(5, 2),
  loudness_gain_db numeric(5, 2),
  peaks_key text,
  artwork_512_key text,
  artwork_1024_key text,

  master_key text,
  master_sha256 text,

  play_count bigint not null default 0,
  published_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tracks_title_not_blank check (btrim(title) <> ''),
  constraint tracks_slug_format
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint tracks_duration_positive check (duration_ms > 0),
  constraint tracks_bpm_positive check (bpm is null or bpm > 0),
  constraint tracks_year_plausible check (year is null or year between 1900 and 2200),
  constraint tracks_play_count_nonnegative check (play_count >= 0),
  constraint tracks_master_sha256_format check (
    master_sha256 is null or master_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint tracks_master_sha256_unique unique (master_sha256),
  constraint tracks_master_key_unique unique (master_key)
);

create index tracks_live_artist_idx
  on public.tracks (music_artist_id, published_at desc)
  where status = 'live';

create table public.track_renditions (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  format text not null check (format in ('opus', 'aac')),
  object_key text not null unique,
  bitrate_kbps int not null check (bitrate_kbps > 0),
  bytes bigint not null check (bytes > 0),
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index track_renditions_current_format_idx
  on public.track_renditions (track_id, format)
  where is_current;

create table public.track_asset_deletions (
  id bigserial primary key,
  track_id uuid not null references public.tracks(id),
  bucket text not null check (bucket in ('media-visamp-io', 'visamp-masters')),
  object_key text not null,
  reason text not null check (reason in ('withdrawal', 'superseded', 'orphan')),
  attempts int not null default 0 check (attempts >= 0),
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint track_asset_deletions_object_unique unique (bucket, object_key)
);

create index track_asset_deletions_pending_idx
  on public.track_asset_deletions (created_at)
  where completed_at is null;

create table public.track_plays (
  id bigserial primary key,
  track_id uuid not null references public.tracks(id),
  user_id uuid references auth.users(id) on delete set null,
  listener_hash text not null,
  played_at timestamptz not null default now(),
  context text not null check (context in ('vis', 'set', 'vj', 'preview')),

  constraint track_plays_listener_hash_format check (
    listener_hash ~ '^[0-9a-f]{64}$'
  )
);

create index track_plays_dedupe_idx
  on public.track_plays (track_id, listener_hash, played_at desc);

-- The first insert is always an ingest. Thereafter tracks move forward only;
-- withdrawn is a permanent tombstone.
create function public.enforce_hosted_track_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rendition_formats int;
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

    if new.master_key is null or new.master_sha256 is null or new.peaks_key is null then
      raise exception 'track is missing required ingest assets';
    end if;

    select count(distinct r.format)
    into rendition_formats
    from public.track_renditions r
    where r.track_id = new.id and r.is_current;

    if rendition_formats <> 2 then
      raise exception 'track requires current opus and aac renditions';
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

create trigger hosted_tracks_enforce_state
  before insert or update on public.tracks
  for each row execute function public.enforce_hosted_track_state();

-- Atomically replaces all derived pointers after an ingest/re-transcode. R2
-- uploads happen first; failed uploads never disturb the currently referenced
-- rendition set.
create function public.finalize_hosted_track_ingest(
  p_track_id uuid,
  p_master_key text,
  p_peaks_key text,
  p_artwork_512_key text,
  p_artwork_1024_key text,
  p_loudness_in_lufs numeric,
  p_loudness_gain_db numeric,
  p_renditions jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.tracks%rowtype;
  rendition_count int;
begin
  select * into existing
  from public.tracks
  where id = p_track_id
  for update;

  if not found or existing.status not in ('ingesting', 'draft') then
    raise exception 'track is not resumable';
  end if;

  select count(distinct x.format)
  into rendition_count
  from jsonb_to_recordset(p_renditions)
    as x(format text, object_key text, bitrate_kbps int, bytes bigint)
  where x.format in ('opus', 'aac')
    and x.object_key is not null
    and x.bitrate_kbps > 0
    and x.bytes > 0;

  if rendition_count <> 2 then
    raise exception 'ingest must provide valid opus and aac renditions';
  end if;

  insert into public.track_asset_deletions (track_id, bucket, object_key, reason)
  select p_track_id, 'media-visamp-io', object_key, 'superseded'
  from (
    select r.object_key
    from public.track_renditions r
    where r.track_id = p_track_id and r.is_current
    union all select existing.peaks_key
    union all select existing.artwork_512_key
    union all select existing.artwork_1024_key
  ) old_assets
  where object_key is not null
  on conflict (bucket, object_key) do nothing;

  update public.track_renditions
  set is_current = false
  where track_id = p_track_id and is_current;

  insert into public.track_renditions (
    track_id, format, object_key, bitrate_kbps, bytes
  )
  select p_track_id, x.format, x.object_key, x.bitrate_kbps, x.bytes
  from jsonb_to_recordset(p_renditions)
    as x(format text, object_key text, bitrate_kbps int, bytes bigint);

  update public.tracks
  set master_key = p_master_key,
      peaks_key = p_peaks_key,
      artwork_512_key = p_artwork_512_key,
      artwork_1024_key = p_artwork_1024_key,
      loudness_in_lufs = p_loudness_in_lufs,
      loudness_gain_db = p_loudness_gain_db,
      status = 'draft'
  where id = p_track_id;
end;
$$;

create function public.withdraw_hosted_track(
  p_track_id uuid,
  p_delete_master boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.tracks%rowtype;
begin
  select * into target
  from public.tracks
  where id = p_track_id
  for update;

  if not found then
    raise exception 'track not found';
  end if;

  if target.status <> 'withdrawn' then
    update public.tracks set status = 'withdrawn' where id = p_track_id;
  end if;

  insert into public.track_asset_deletions (track_id, bucket, object_key, reason)
  select p_track_id, 'media-visamp-io', object_key, 'withdrawal'
  from (
    select r.object_key
    from public.track_renditions r
    where r.track_id = p_track_id and r.is_current
    union all select target.peaks_key
    union all select target.artwork_512_key
    union all select target.artwork_1024_key
  ) derived_assets
  where object_key is not null
  on conflict (bucket, object_key) do nothing;

  if p_delete_master and target.master_key is not null then
    insert into public.track_asset_deletions (track_id, bucket, object_key, reason)
    values
      (p_track_id, 'visamp-masters', target.master_key, 'withdrawal'),
      (p_track_id, 'visamp-masters', p_track_id::text || '/original.json', 'withdrawal')
    on conflict (bucket, object_key) do nothing;
  end if;

  update public.track_renditions
  set is_current = false
  where track_id = p_track_id and is_current;
end;
$$;

create function public.record_hosted_track_play(
  p_track_id uuid,
  p_listener_hash text,
  p_user_id uuid,
  p_context text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_context not in ('vis', 'set', 'vj', 'preview') then
    raise exception 'invalid playback context';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_track_id::text || ':' || p_listener_hash, 0)
  );

  if exists (
    select 1
    from public.track_plays p
    where p.track_id = p_track_id
      and p.listener_hash = p_listener_hash
      and p.played_at > now() - interval '24 hours'
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public.tracks t
    join public.licences l on l.id = t.licence_id
    where t.id = p_track_id
      and t.status = 'live'
      and l.music_artist_id = t.music_artist_id
      and l.status = 'active'
      and l.signed_at is not null
      and l.effective_from is not null
      and l.effective_from <= current_date
      and (l.effective_until is null or l.effective_until >= current_date)
      and l.grants_hosting and l.grants_streaming
      and l.grants_transcoding and l.grants_sync
  ) then
    return false;
  end if;

  insert into public.track_plays (
    track_id, user_id, listener_hash, context
  ) values (
    p_track_id, p_user_id, p_listener_hash, p_context
  );

  update public.tracks
  set play_count = play_count + 1
  where id = p_track_id;

  return true;
end;
$$;

alter table public.app_admins enable row level security;
alter table public.music_artists enable row level security;
alter table public.licences enable row level security;
alter table public.tracks enable row level security;
alter table public.track_renditions enable row level security;
alter table public.track_asset_deletions enable row level security;
alter table public.track_plays enable row level security;

revoke all on table public.app_admins from anon, authenticated;
revoke all on table public.music_artists from anon, authenticated;
revoke all on table public.licences from anon, authenticated;
revoke all on table public.tracks from anon, authenticated;
revoke all on table public.track_renditions from anon, authenticated;
revoke all on table public.track_asset_deletions from anon, authenticated;
revoke all on table public.track_plays from anon, authenticated;
revoke all on sequence public.track_asset_deletions_id_seq from anon, authenticated;
revoke all on sequence public.track_plays_id_seq from anon, authenticated;

revoke all on function public.finalize_hosted_track_ingest(
  uuid, text, text, text, text, numeric, numeric, jsonb
) from public, anon, authenticated;
revoke all on function public.withdraw_hosted_track(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.record_hosted_track_play(uuid, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.enforce_hosted_track_state()
  from public, anon, authenticated;

grant all on table public.app_admins to service_role;
grant all on table public.music_artists to service_role;
grant all on table public.licences to service_role;
grant all on table public.tracks to service_role;
grant all on table public.track_renditions to service_role;
grant all on table public.track_asset_deletions to service_role;
grant all on table public.track_plays to service_role;
grant usage, select on sequence public.track_asset_deletions_id_seq to service_role;
grant usage, select on sequence public.track_plays_id_seq to service_role;
grant execute on function public.finalize_hosted_track_ingest(
  uuid, text, text, text, text, numeric, numeric, jsonb
) to service_role;
grant execute on function public.withdraw_hosted_track(uuid, boolean) to service_role;
grant execute on function public.record_hosted_track_play(uuid, text, uuid, text)
  to service_role;

-- Private licence-document storage. Only the service role can access objects;
-- no storage.objects policy is intentionally created.
insert into storage.buckets (id, name, public)
values ('music-licences', 'music-licences', false)
on conflict (id) do update set public = false;
