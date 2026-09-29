-- Video authoring writes must pass the service's owned-track and eligible-visual
-- checks. Owners retain RLS-protected reads; the service scopes every write.
revoke insert (owner_id, title, content) on public.videos from authenticated;
revoke update (title, content) on public.videos from authenticated;
notify pgrst, 'reload schema';
