-- Store trusted object paths, not client-supplied public URLs. Uploaded avatars
-- use avatar_path; user-editable auth metadata is not treated as an image URL.
alter table public.profiles
  add column avatar_path text,
  add constraint profiles_avatar_path_owned
    check (avatar_path is null or avatar_path = id::text || '/avatar');

alter table public.visualisations
  add column thumb_path text,
  add constraint visualisations_thumb_path_owned
    check (thumb_path is null or thumb_path = owner_id::text || '/' || id::text || '.png');

-- Preserve existing legitimate uploads before discarding mutable URLs.
update public.profiles as profile
set avatar_path = profile.id::text || '/avatar'
where exists (
  select 1 from storage.objects as object
  where object.bucket_id = 'avatars'
    and object.name = profile.id::text || '/avatar'
);

update public.visualisations as vis
set thumb_path = vis.owner_id::text || '/' || vis.id::text || '.png'
where exists (
  select 1 from storage.objects as object
  where object.bucket_id = 'thumbnails'
    and object.name = vis.owner_id::text || '/' || vis.id::text || '.png'
);

-- avatar_url was previously client-writable, and auth user metadata is also
-- user-editable. Remove both as image trust boundaries; uploaded avatars are
-- preserved by the avatar_path backfill above.
update public.profiles set avatar_url = null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

-- All application thumbnails now resolve from thumb_path.
update public.visualisations set thumb_url = null;

revoke update (avatar_url) on public.profiles from authenticated;
grant update (avatar_path) on public.profiles to authenticated;

revoke insert (thumb_url), update (thumb_url)
  on public.visualisations from authenticated;
grant insert (thumb_path), update (thumb_path)
  on public.visualisations to authenticated;

-- A user can own exactly one avatar object at the stable documented key.
drop policy if exists "Users can upload their own avatar" on storage.objects;
drop policy if exists "Users can replace their own avatar" on storage.objects;

create policy "Users can upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar'
  );

create policy "Users can replace their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar'
  )
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar'
  );

-- Thumbnail keys must identify a real visualisation owned by the caller. This
-- prevents an account from using the public bucket as arbitrary image storage.
drop policy if exists "Owners can upload their own thumbnails" on storage.objects;
drop policy if exists "Owners can replace their own thumbnails" on storage.objects;
drop policy if exists "Owners can delete their own thumbnails" on storage.objects;

create policy "Owners can upload their own thumbnails"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'thumbnails'
    and exists (
      select 1 from public.visualisations as vis
      where vis.owner_id = (select auth.uid())
        and storage.objects.name = vis.owner_id::text || '/' || vis.id::text || '.png'
    )
  );

create policy "Owners can replace their own thumbnails"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'thumbnails'
    and exists (
      select 1 from public.visualisations as vis
      where vis.owner_id = (select auth.uid())
        and storage.objects.name = vis.owner_id::text || '/' || vis.id::text || '.png'
    )
  )
  with check (
    bucket_id = 'thumbnails'
    and exists (
      select 1 from public.visualisations as vis
      where vis.owner_id = (select auth.uid())
        and storage.objects.name = vis.owner_id::text || '/' || vis.id::text || '.png'
    )
  );

create policy "Owners can delete their own thumbnails"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'thumbnails'
    and exists (
      select 1 from public.visualisations as vis
      where vis.owner_id = (select auth.uid())
        and storage.objects.name = vis.owner_id::text || '/' || vis.id::text || '.png'
    )
  );

-- Keep cache-busting thumbnail URLs in step with recaptures.
drop trigger if exists visualisations_touch_updated_at on public.visualisations;
create trigger visualisations_touch_updated_at
  before update of title, description, source, thumb_path, thumb_pinned,
                   uses_audio, visibility
  on public.visualisations
  for each row execute function public.touch_updated_at();
