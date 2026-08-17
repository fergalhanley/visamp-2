-- Playlists (§4) plus the fork counter.
--
-- The "Liked" playlist stays virtual — a query over `likes` — so it cannot be
-- renamed, deleted or reordered. Nothing here represents it.

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),

  constraint playlists_title_length check (char_length(title) between 1 and 80)
);

create index playlists_owner_idx on public.playlists (owner_id, created_at desc);

create table public.playlist_items (
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  vis_id uuid not null references public.visualisations (id) on delete cascade,
  position integer not null default 0,

  primary key (playlist_id, vis_id)
);

create index playlist_items_order_idx
  on public.playlist_items (playlist_id, position);

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;

-- Playlists are personal. Nothing in the product shares them, so they are not
-- readable by anyone else.
create policy "Owners can read their own playlists"
  on public.playlists for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "Owners can create playlists"
  on public.playlists for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners can update their own playlists"
  on public.playlists for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners can delete their own playlists"
  on public.playlists for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- Items inherit their owner from the parent playlist.
create policy "Owners can read their own playlist items"
  on public.playlist_items for select
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = (select auth.uid())
    )
  );

create policy "Owners can add to their own playlists"
  on public.playlist_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = (select auth.uid())
    )
  );

create policy "Owners can reorder their own playlist items"
  on public.playlist_items for update
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = (select auth.uid())
    )
  );

create policy "Owners can remove their own playlist items"
  on public.playlist_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.playlists p
      where p.id = playlist_id and p.owner_id = (select auth.uid())
    )
  );

-- ── Column grants ───────────────────────────────────────────────────────────

revoke all on public.playlists from anon, authenticated;
grant select, delete on public.playlists to authenticated;
grant insert (owner_id, title) on public.playlists to authenticated;
grant update (title) on public.playlists to authenticated;

revoke all on public.playlist_items from anon, authenticated;
grant select, delete on public.playlist_items to authenticated;
grant insert (playlist_id, vis_id, position) on public.playlist_items to authenticated;
grant update (position) on public.playlist_items to authenticated;

-- ── visualisations.fork_count ───────────────────────────────────────────────

-- A fork is an insert carrying forked_from_id, so the original's counter is
-- maintained here rather than by the forker writing to it.
create function public.sync_fork_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.forked_from_id is not null then
    update public.visualisations
      set fork_count = fork_count + 1
      where id = new.forked_from_id;

  elsif tg_op = 'DELETE' and old.forked_from_id is not null then
    update public.visualisations
      set fork_count = greatest(fork_count - 1, 0)
      where id = old.forked_from_id;
  end if;

  return null;
end;
$$;

create trigger visualisations_sync_fork_count
  after insert or delete on public.visualisations
  for each row execute function public.sync_fork_count();
