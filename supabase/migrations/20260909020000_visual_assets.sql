-- VIS-51: asset storage, validation and access control.
--
-- Bitmap, vector and 3D-model assets uploaded by users. Bytes live in the
-- private `assets` Supabase Storage bucket; this schema holds the catalogue,
-- the visibility state and the visualisation→asset reference index.
--
-- Rights confirmation, reuse wording, attribution and takedown grounds are
-- deliberately absent: VIS-73 owns them. What is here is the mechanism only.

create type public.asset_kind as enum ('bitmap', 'vector', 'model');

create table public.assets (
  id uuid primary key default gen_random_uuid(),

  -- Nullable, and set null on profile delete. A public asset outlives the
  -- account that uploaded it because other people's visuals reference it;
  -- cascading would delete their work out from under them. Unpublished assets
  -- of a deleted account are enqueued for object cleanup by the trigger below.
  owner_id uuid references public.profiles (id) on delete set null,

  kind public.asset_kind not null,
  mime_type text not null,
  file_name text not null,
  object_key text not null unique,
  bytes bigint not null,
  sha256 text not null,

  -- Content bytes are only trustworthy once the server has inspected them.
  -- Nothing reads an asset that is not ready.
  status text not null default 'uploading'
    check (status in ('uploading', 'ready', 'failed')),
  error text,

  -- `visibility` controls *discoverability for new references* only.
  -- `published_at` records that the bytes have been public at least once, and
  -- is never cleared: bytes served publicly cannot be recalled from copies
  -- already distributed, so unpublishing stops new use without breaking
  -- visuals that already reference the asset. Withdrawal is the only thing
  -- that stops reads.
  visibility public.visibility not null default 'private',
  published_at timestamptz,

  withdrawn_at timestamptz,
  withdrawn_by uuid references auth.users (id) on delete set null,
  replacement_asset_id uuid references public.assets (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assets_file_name_length check (char_length(file_name) between 1 and 255),
  constraint assets_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),

  -- The key is bound to the asset id, so a row can never be pointed at another
  -- asset's object. The owner prefix is enforced at write time by the storage
  -- policy rather than here, because owner_id goes null on account deletion and
  -- a CHECK naming it would then fail on the very UPDATE that clears it.
  constraint assets_object_key_shape check (
    object_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]+$'
    and split_part(object_key, '/', 2) like id::text || '.%'
  ),

  -- Per-kind ceilings. 3D models carry embedded buffers and textures, so they
  -- get the largest allowance; SVG is text and needs the smallest.
  constraint assets_bytes_within_kind check (
    bytes > 0 and bytes <= case kind
      when 'bitmap' then 20 * 1024 * 1024
      when 'vector' then 2 * 1024 * 1024
      when 'model' then 60 * 1024 * 1024
    end
  ),

  constraint assets_mime_matches_kind check (
    case kind
      when 'bitmap' then mime_type in ('image/png', 'image/jpeg', 'image/webp')
      when 'vector' then mime_type = 'image/svg+xml'
      when 'model' then mime_type = 'model/gltf-binary'
    end
  ),

  -- Public means published, and stays published once unpublished.
  constraint assets_public_is_published check (
    visibility = 'private' or published_at is not null
  ),
  constraint assets_withdrawal_is_attributed check (
    (withdrawn_at is null) = (withdrawn_by is null)
  ),
  constraint assets_replacement_is_not_self check (
    replacement_asset_id is null or replacement_asset_id <> id
  )
);

create index assets_owner_idx on public.assets (owner_id);

-- Library discovery: currently offerable assets, newest first.
create index assets_discoverable_idx
  on public.assets (created_at desc)
  where visibility = 'public' and status = 'ready' and withdrawn_at is null;

create trigger assets_touch_updated_at
  before update on public.assets
  for each row execute function public.touch_updated_at();

-- ── Reference index ─────────────────────────────────────────────────────────

-- Which visuals reference which assets. `visualisations.source` is free text
-- written directly by clients through PostgREST, so this is maintained by a
-- trigger: no client-side save path can be trusted to keep it honest, and
-- VIS-53 and VIS-55 both need it to be complete.
create table public.visualisation_assets (
  visualisation_id uuid not null
    references public.visualisations (id) on delete cascade,
  -- Restrict, not cascade: assets go out of service by withdrawal, which
  -- preserves the reference so VIS-55 can find and warn the affected visuals.
  asset_id uuid not null references public.assets (id) on delete restrict,
  created_at timestamptz not null default now(),

  primary key (visualisation_id, asset_id)
);

create index visualisation_assets_asset_idx
  on public.visualisation_assets (asset_id);

-- The citation form the index recognises, both spellings the DSL allows:
--   asset::bitmap("<uuid>")     asset::model(id: "<uuid>")
-- The engine-side builtins belong to VIS-53; this only has to read the text.
create function public.visualisation_asset_references(p_source text)
returns setof uuid
language sql
immutable
set search_path = ''
as $$
  select distinct lower(found.captured[1])::uuid
  from regexp_matches(
    coalesce(p_source, ''),
    'asset::(?:bitmap|vector|model)\s*\(\s*(?:id\s*:\s*)?"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"',
    'gi'
  ) as found(captured);
$$;

-- One trigger does both jobs, so their order cannot drift: rebuild the index
-- from the new source, then hold the publish rule against what it found.
-- AFTER, not BEFORE, because the join rows need the visualisation row to exist.
create function public.sync_visualisation_assets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  offending text;
begin
  delete from public.visualisation_assets ref
  where ref.visualisation_id = new.id
    and ref.asset_id not in (
      select cited.asset_id
      from public.visualisation_asset_references(new.source) as cited(asset_id)
    );

  insert into public.visualisation_assets (visualisation_id, asset_id)
  select new.id, cited.asset_id
  from public.visualisation_asset_references(new.source) as cited(asset_id)
  -- A citation naming an asset that does not exist is left out of the index
  -- rather than failing the save; VIS-55 owns the missing-asset experience.
  where exists (select 1 from public.assets a where a.id = cited.asset_id)
  on conflict do nothing;

  -- A public visual may not reference an asset the public cannot read. The
  -- alternatives were leaking private bytes or publishing work that renders
  -- broken for everyone but its author.
  if new.visibility = 'public' then
    select string_agg(a.file_name, ', ' order by a.file_name)
    into offending
    from public.visualisation_assets ref
    join public.assets a on a.id = ref.asset_id
    where ref.visualisation_id = new.id
      and (a.published_at is null or a.withdrawn_at is not null or a.status <> 'ready');

    if offending is not null then
      raise exception using
        errcode = '42501',
        message = 'This visual references assets that are not public: ' || offending,
        hint = 'Make each referenced asset public, or remove it, before publishing.';
    end if;
  end if;

  return null;
end;
$$;

create trigger visualisations_sync_assets
  after insert or update of source, visibility on public.visualisations
  for each row execute function public.sync_visualisation_assets();

-- ── Quotas ──────────────────────────────────────────────────────────────────

-- Serialised per account, because PostgREST will happily accept concurrent
-- inserts that each pass a naive count check.
create function public.enforce_asset_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored bigint;
begin
  -- Service-role inserts and rows whose owner has since been deleted have no
  -- account to charge; the lock key below would be null.
  if new.owner_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('asset-quota:' || new.owner_id::text, 0)
  );

  if (
    select count(*) from public.assets
    where owner_id = new.owner_id and status <> 'failed'
  ) >= 300 then
    raise exception using
      errcode = '23514',
      message = 'An account may store at most 300 assets';
  end if;

  select coalesce(sum(bytes), 0) into stored
  from public.assets
  where owner_id = new.owner_id and status <> 'failed';

  if stored + new.bytes > 1024 * 1024 * 1024 then
    raise exception using
      errcode = '23514',
      message = 'An account may store at most 1 GB of assets';
  end if;

  return new;
end;
$$;

create trigger assets_enforce_quota
  before insert on public.assets
  for each row execute function public.enforce_asset_quota();

-- ── Object cleanup outbox ───────────────────────────────────────────────────

-- Same shape as track_asset_deletions: the database records what should no
-- longer exist in object storage, and a worker drains it. Storage deletes
-- cannot participate in the transaction, so they must not be attempted inside
-- it.
create table public.asset_deletions (
  id bigserial primary key,
  asset_id uuid not null references public.assets (id),
  bucket text not null check (bucket = 'assets'),
  object_key text not null,
  reason text not null check (reason in ('withdrawal', 'owner_deleted', 'failed_upload')),
  attempts int not null default 0 check (attempts >= 0),
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint asset_deletions_object_unique unique (bucket, object_key)
);

create index asset_deletions_pending_idx
  on public.asset_deletions (created_at)
  where completed_at is null;

-- On account deletion, owner_id goes null (see the column comment). Assets that
-- were never public are unreachable at that point, so their bytes are enqueued
-- for removal rather than paid for indefinitely.
create function public.enqueue_deleted_owner_assets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.asset_deletions (asset_id, bucket, object_key, reason)
  select a.id, 'assets', a.object_key, 'owner_deleted'
  from public.assets a
  where a.owner_id = old.id and a.published_at is null
  on conflict (bucket, object_key) do nothing;

  update public.assets
  set status = 'failed', error = 'Owner account deleted'
  where owner_id = old.id and published_at is null;

  return old;
end;
$$;

create trigger profiles_enqueue_asset_cleanup
  before delete on public.profiles
  for each row execute function public.enqueue_deleted_owner_assets();

-- ── Publication and withdrawal ──────────────────────────────────────────────

-- Publishing is a one-way door for bytes already served, so it is stamped once
-- and never unstamped. Unpublishing only flips discoverability.
create function public.stamp_asset_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility = 'public' then
    if new.status <> 'ready' then
      raise exception using
        errcode = '42501',
        message = 'Only a fully uploaded asset can be made public';
    end if;
    if new.withdrawn_at is not null then
      raise exception using
        errcode = '42501',
        message = 'A withdrawn asset cannot be made public';
    end if;
    if new.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger assets_stamp_publication
  before insert or update on public.assets
  for each row execute function public.stamp_asset_publication();

-- Authorised removal. Takes the asset out of service everywhere at once: the
-- read policy stops matching, so every visual referencing it loses access on
-- next load, and the reference index names them for VIS-55.
--
-- The admin check lives here as well as in the route, so the rule holds even if
-- a future caller forgets it.
create function public.withdraw_asset(
  p_asset_id uuid,
  p_actor_id uuid,
  p_replacement_asset_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.assets%rowtype;
begin
  if not exists (select 1 from public.app_admins where user_id = p_actor_id) then
    raise exception using
      errcode = '42501',
      message = 'Admin access required to withdraw an asset';
  end if;

  select * into target from public.assets where id = p_asset_id for update;
  if not found then
    raise exception 'asset not found';
  end if;

  if p_replacement_asset_id is not null then
    if p_replacement_asset_id = p_asset_id then
      raise exception 'an asset cannot replace itself';
    end if;
    -- A replacement nobody can read would leave every affected visual broken
    -- in a second way. Format compatibility beyond this is VIS-73's call.
    if not exists (
      select 1 from public.assets r
      where r.id = p_replacement_asset_id
        and r.kind = target.kind
        and r.status = 'ready'
        and r.published_at is not null
        and r.withdrawn_at is null
    ) then
      raise exception 'replacement must be a readable public asset of the same kind';
    end if;
  end if;

  if target.withdrawn_at is null then
    update public.assets
    set withdrawn_at = now(),
        withdrawn_by = p_actor_id,
        visibility = 'private',
        replacement_asset_id = p_replacement_asset_id
    where id = p_asset_id;
  else
    update public.assets
    set replacement_asset_id =
          coalesce(p_replacement_asset_id, replacement_asset_id)
    where id = p_asset_id;
  end if;

  insert into public.asset_deletions (asset_id, bucket, object_key, reason)
  values (p_asset_id, 'assets', target.object_key, 'withdrawal')
  on conflict (bucket, object_key) do nothing;
end;
$$;

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.assets enable row level security;
alter table public.visualisation_assets enable row level security;
alter table public.asset_deletions enable row level security;

-- Owners see their own work in any state. Everyone else sees an asset only
-- while it is ready, has been published, and has not been withdrawn.
-- Discovery queries must still filter visibility = 'public' explicitly: this
-- policy deliberately keeps unpublished-but-once-public assets readable so
-- existing references keep working, and they have no business in the library.
create policy "Readable when owned, or published and not withdrawn"
  on public.assets
  for select
  using (
    owner_id = (select auth.uid())
    or (
      status = 'ready'
      and published_at is not null
      and withdrawn_at is null
    )
  );

create policy "Users can create their own assets"
  on public.assets
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners can update their own assets"
  on public.assets
  for update
  to authenticated
  using (owner_id = (select auth.uid()) and withdrawn_at is null)
  with check (owner_id = (select auth.uid()) and withdrawn_at is null);

-- Deleting an asset that has been public would break other people's visuals,
-- and the reference index would lose the evidence VIS-55 needs. Withdrawal is
-- the route for those; who may request it is VIS-73's decision.
create policy "Owners can delete assets that were never public"
  on public.assets
  for delete
  to authenticated
  using (owner_id = (select auth.uid()) and published_at is null);

-- The index is readable so the editor can show what a visual depends on, and
-- writable by nobody: the trigger maintains it.
create policy "Reference rows follow the visual and the asset"
  on public.visualisation_assets
  for select
  using (
    exists (
      select 1 from public.visualisations v
      where v.id = visualisation_id
        and (v.visibility = 'public' or v.owner_id = (select auth.uid()))
    )
  );

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke all on public.assets from anon, authenticated;
revoke all on public.visualisation_assets from anon, authenticated;
revoke all on public.asset_deletions from anon, authenticated;
revoke all on sequence public.asset_deletions_id_seq from anon, authenticated;

grant select on public.assets to anon, authenticated;
grant select on public.visualisation_assets to anon, authenticated;

-- Insert names only what an uploader may assert. status, published_at and the
-- withdrawal columns are absent: bytes are unverified until the server has
-- inspected them, and withdrawal is an admin action.
grant insert (
  owner_id, kind, mime_type, file_name, object_key, bytes, sha256
) on public.assets to authenticated;

-- The only thing an owner may change afterwards is discoverability. In
-- particular object_key and bytes are not updatable, so the bytes behind a
-- public asset cannot be swapped after the fact.
grant update (visibility) on public.assets to authenticated;

grant delete on public.assets to authenticated;

grant all on public.assets to service_role;
grant all on public.visualisation_assets to service_role;
grant all on public.asset_deletions to service_role;
grant usage, select on sequence public.asset_deletions_id_seq to service_role;

revoke all on function public.withdraw_asset(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.enforce_asset_quota() from public, anon, authenticated;
revoke all on function public.sync_visualisation_assets() from public, anon, authenticated;
revoke all on function public.enqueue_deleted_owner_assets() from public, anon, authenticated;
revoke all on function public.stamp_asset_publication() from public, anon, authenticated;

grant execute on function public.withdraw_asset(uuid, uuid, uuid) to service_role;
grant execute on function public.visualisation_asset_references(text)
  to anon, authenticated, service_role;

-- ── Storage ─────────────────────────────────────────────────────────────────

-- Private bucket. Public assets are served through these policies rather than a
-- public bucket, so a withdrawal stops reads immediately instead of waiting for
-- a CDN object to be removed.
insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do update set public = false;

-- The owner prefix is pinned here (see assets_object_key_shape), and the object
-- must correspond to a row the caller owns, so the bucket cannot be used as
-- arbitrary file storage.
create policy "Users can upload their own asset objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assets'
    and exists (
      select 1 from public.assets a
      where a.owner_id = (select auth.uid())
        and a.object_key = storage.objects.name
        and storage.objects.name like (select auth.uid())::text || '/%'
    )
  );

create policy "Asset objects follow asset read access"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'assets'
    and exists (
      select 1 from public.assets a
      where a.object_key = storage.objects.name
        and (
          a.owner_id = (select auth.uid())
          or (
            a.status = 'ready'
            and a.published_at is not null
            and a.withdrawn_at is null
          )
        )
    )
  );

-- Replacing the bytes under a published asset would defeat every check made at
-- upload time, so objects are mutable only while the asset has never been
-- public.
create policy "Owners can replace objects that were never public"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'assets'
    and exists (
      select 1 from public.assets a
      where a.owner_id = (select auth.uid())
        and a.object_key = storage.objects.name
        and a.published_at is null
    )
  )
  with check (
    bucket_id = 'assets'
    and exists (
      select 1 from public.assets a
      where a.owner_id = (select auth.uid())
        and a.object_key = storage.objects.name
        and a.published_at is null
    )
  );

create policy "Owners can delete objects that were never public"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'assets'
    and exists (
      select 1 from public.assets a
      where a.owner_id = (select auth.uid())
        and a.object_key = storage.objects.name
        and a.published_at is null
    )
  );
