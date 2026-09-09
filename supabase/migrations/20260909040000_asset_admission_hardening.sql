-- VIS-51 review follow-up: close the gaps found reviewing PR #5.
--
-- 1. Validated bytes could be replaced. Object writes were allowed for as long
--    as the asset had never been public, so an uploader could pass validation,
--    overwrite the object, and publish bytes nothing had ever inspected. Writes
--    are now allowed only while the asset is still `uploading`, and the server
--    moves it to `validating` before it reads the object — so the bytes are
--    frozen for the whole of the check, not merely after it.
--
-- 2. Deleting a private asset left its bytes behind. The row went away and with
--    it the only record of what to clean up, and the owner's storage-delete
--    policy could no longer find a row to authorise against. Deletion now goes
--    through a function that enqueues the object and removes the row in one
--    transaction.

-- ── Frozen-on-validation ────────────────────────────────────────────────────

alter table public.assets drop constraint if exists assets_status_check;
alter table public.assets
  add constraint assets_status_valid
    check (status in ('uploading', 'validating', 'ready', 'failed'));

drop policy if exists "Users can upload their own asset objects" on storage.objects;
drop policy if exists "Owners can replace objects that were never public" on storage.objects;
drop policy if exists "Owners can delete objects that were never public" on storage.objects;

-- The object is writable only in the one window between the row being created
-- and the server claiming it for inspection. After that the bytes behind an
-- asset never change again, so what was validated is what everyone reads.
create policy "Users can upload their own asset objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'assets'
    and exists (
      select 1 from public.assets a
      where a.owner_id = (select auth.uid())
        and a.object_key = storage.objects.name
        and a.status = 'uploading'
        and storage.objects.name like (select auth.uid())::text || '/%'
    )
  );

create policy "Owners can replace objects awaiting validation"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'assets'
    and exists (
      select 1 from public.assets a
      where a.owner_id = (select auth.uid())
        and a.object_key = storage.objects.name
        and a.status = 'uploading'
    )
  )
  with check (
    bucket_id = 'assets'
    and exists (
      select 1 from public.assets a
      where a.owner_id = (select auth.uid())
        and a.object_key = storage.objects.name
        and a.status = 'uploading'
    )
  );

create policy "Owners can delete objects awaiting validation"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'assets'
    and exists (
      select 1 from public.assets a
      where a.owner_id = (select auth.uid())
        and a.object_key = storage.objects.name
        and a.status = 'uploading'
    )
  );

-- ── Deletion that takes the bytes with it ───────────────────────────────────

-- The cleanup job has to outlive the row it refers to: it is the only remaining
-- record that an object exists. bucket and object_key carry everything the
-- worker needs.
alter table public.asset_deletions alter column asset_id drop not null;
alter table public.asset_deletions drop constraint asset_deletions_asset_id_fkey;
alter table public.asset_deletions
  add constraint asset_deletions_asset_id_fkey
    foreign key (asset_id) references public.assets (id) on delete set null;

-- Deleting the row and enqueueing its object have to happen together, or one of
-- the two is guaranteed to be wrong. Direct DELETE through PostgREST is removed
-- below so this is the only way through.
create function public.delete_own_asset(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.assets%rowtype;
begin
  select * into target from public.assets where id = p_asset_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Asset not found';
  end if;

  if target.owner_id is null or target.owner_id <> (select auth.uid()) then
    raise exception using errcode = '42501', message = 'This asset is not yours';
  end if;

  -- Deleting an asset that has been public would break other people's visuals
  -- and lose the evidence VIS-55 needs. Those go out of service by withdrawal.
  if target.published_at is not null then
    raise exception using
      errcode = '42501',
      message = 'An asset that has been public cannot be deleted, only withdrawn';
  end if;

  if exists (
    select 1 from public.visualisation_assets where asset_id = p_asset_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'This asset is still used by a visual';
  end if;

  insert into public.asset_deletions (asset_id, bucket, object_key, reason)
  values (p_asset_id, 'assets', target.object_key, 'owner_deleted')
  on conflict (bucket, object_key) do nothing;

  -- asset_id falls to null on the outbox row; bucket and object_key remain.
  delete from public.assets where id = p_asset_id;
end;
$$;

revoke all on function public.delete_own_asset(uuid) from public, anon;
grant execute on function public.delete_own_asset(uuid) to authenticated, service_role;

-- A direct row delete cannot enqueue the object, so it is no longer offered.
drop policy if exists "Owners can delete assets that were never public" on public.assets;
revoke delete on public.assets from authenticated;
