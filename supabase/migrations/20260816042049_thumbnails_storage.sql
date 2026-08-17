-- Thumbnail storage for E6.10.
--
-- Public bucket: tiles, artist pages and OG cards all need to read these
-- without a signed URL, and a thumbnail of public work is not a secret.
-- Writes are still owner-only, enforced by the policies below.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'thumbnails',
  'thumbnails',
  true,
  2097152,                 -- 2 MB; a 1280x720 PNG lands far under this
  array['image/png']
)
on conflict (id) do nothing;

-- Objects are keyed <owner_id>/<vis_id>.png, so the first path segment is the
-- authorisation boundary.

create policy "Thumbnails are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'thumbnails');

create policy "Owners can upload their own thumbnails"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'thumbnails'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Re-capturing overwrites the same key, which is an update rather than an insert.
create policy "Owners can replace their own thumbnails"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'thumbnails'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'thumbnails'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Owners can delete their own thumbnails"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'thumbnails'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
