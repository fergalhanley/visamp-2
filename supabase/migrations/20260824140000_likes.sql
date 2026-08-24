-- Likes (§4, E5.5). One heart: like and favourite are the same row, so the
-- Favourites section and the Liked playlist are both queries over this table
-- rather than anything of their own.

create table public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  vis_id uuid not null references public.visualisations (id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (user_id, vis_id)
);

-- "Everything I liked, newest first" — the Favourites query.
create index likes_user_recent_idx on public.likes (user_id, created_at desc);
-- The primary key leads with user_id, so it cannot serve lookups by
-- visualisation. This one carries the cascade when a visualisation is deleted.
create index likes_vis_idx on public.likes (vis_id);

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.likes enable row level security;

-- Own rows only. All the client needs is "did I like this", and the total is
-- already on the visualisation as a counter; who liked what is nobody else's
-- business until something in the product asks for it.
create policy "Readers see their own likes"
  on public.likes for select
  to authenticated
  using (user_id = (select auth.uid()));

-- The exists() is checked as the calling user, so RLS on visualisations
-- applies: work you cannot read is work you cannot like. Without it a guessed
-- id would let anyone move a private draft's counter.
create policy "Signed-in users like on their own behalf"
  on public.likes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.visualisations where id = vis_id)
  );

create policy "Likers can unlike"
  on public.likes for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- No update policy on purpose: a like has nothing to change. Toggling off is a
-- delete, which is what keeps the counter trigger honest.

-- ── Column grants ───────────────────────────────────────────────────────────

revoke all on public.likes from anon, authenticated;
grant select, delete on public.likes to authenticated;
grant insert (user_id, vis_id) on public.likes to authenticated;

-- ── visualisations.like_count ───────────────────────────────────────────────

create function public.sync_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.visualisations
      set like_count = like_count + 1
      where id = new.vis_id;

  elsif tg_op = 'DELETE' then
    -- greatest() for the same reason sync_fork_count has it: a counter that
    -- has drifted should stop at zero rather than go negative in public.
    update public.visualisations
      set like_count = greatest(like_count - 1, 0)
      where id = old.vis_id;
  end if;

  return null;
end;
$$;

create trigger likes_sync_like_count
  after insert or delete on public.likes
  for each row execute function public.sync_like_count();
