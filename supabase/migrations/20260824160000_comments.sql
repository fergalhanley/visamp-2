-- Comments (§4, E5.7–E5.9). Flat: one thread per visualisation, newest first.
-- Threading is explicitly out of scope, so there is no parent_id to grow into.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  vis_id uuid not null references public.visualisations (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,

  body text not null,

  created_at timestamptz not null default now(),
  -- Soft delete (E5.9): the row stays so moderation has something to look at,
  -- and so a deletion can be undone. Nothing reads a deleted body.
  deleted_at timestamptz,

  constraint comments_body_length check (char_length(body) between 1 and 2000)
);

-- The only query the panel makes: this visualisation's thread, newest first.
create index comments_vis_recent_idx
  on public.comments (vis_id, created_at desc)
  where deleted_at is null;

-- ── Rate limit ──────────────────────────────────────────────────────────────

-- E5.8. Definer because the insert policy needs a true count of the author's
-- own recent comments, and a plain subquery there would see only the rows the
-- reader is allowed to read — which is not the same thing.
--
-- It takes no argument on purpose: reading auth.uid() itself means the only
-- number it can ever report is the caller's own, so granting execute (which a
-- policy needs — policy expressions run as the caller) gives nothing away.
create function public.comments_within_rate_limit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) < 10
  from public.comments
  where author_id = (select auth.uid())
    and created_at > now() - interval '1 minute';
$$;

revoke all on function public.comments_within_rate_limit() from public;
grant execute on function public.comments_within_rate_limit() to authenticated;

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.comments enable row level security;

-- Anonymous read (E5.8), but only where the work itself is readable: the
-- exists() runs as the caller, so RLS on visualisations decides. Comments on a
-- private draft stay with its owner.
create policy "Comments are readable wherever the work is"
  on public.comments for select
  using (
    deleted_at is null
    and exists (select 1 from public.visualisations where id = vis_id)
  );

create policy "Signed-in users comment as themselves"
  on public.comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.visualisations where id = vis_id)
    and public.comments_within_rate_limit()
  );

-- Soft delete is an update, and the only updatable column is deleted_at (see
-- the grant below), so this cannot be used to rewrite what someone said.
create policy "Authors and the work's owner can remove a comment"
  on public.comments for update
  to authenticated
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.visualisations v
      where v.id = vis_id and v.owner_id = (select auth.uid())
    )
  )
  with check (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.visualisations v
      where v.id = vis_id and v.owner_id = (select auth.uid())
    )
  );

-- No delete policy: removal is the soft kind, and a hard delete would take the
-- moderation record with it.

-- ── Column grants ───────────────────────────────────────────────────────────

revoke all on public.comments from anon, authenticated;
grant select on public.comments to anon, authenticated;
grant insert (vis_id, author_id, body) on public.comments to authenticated;
grant update (deleted_at) on public.comments to authenticated;

-- ── visualisations.comment_count ────────────────────────────────────────────

-- Counts what is actually readable, so a soft delete takes the number down
-- with it and an undelete puts it back.
create function public.sync_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      update public.visualisations
        set comment_count = comment_count + 1
        where id = new.vis_id;
    end if;

  elsif tg_op = 'DELETE' then
    if old.deleted_at is null then
      update public.visualisations
        set comment_count = greatest(comment_count - 1, 0)
        where id = old.vis_id;
    end if;

  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      update public.visualisations
        set comment_count = greatest(comment_count - 1, 0)
        where id = new.vis_id;

    elsif old.deleted_at is not null and new.deleted_at is null then
      update public.visualisations
        set comment_count = comment_count + 1
        where id = new.vis_id;
    end if;
  end if;

  return null;
end;
$$;

create trigger comments_sync_comment_count
  after insert or delete or update of deleted_at on public.comments
  for each row execute function public.sync_comment_count();
