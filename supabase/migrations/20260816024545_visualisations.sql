-- Visualisations: the artefact people write in the editor.
-- Follows dev/stories.md §4.

create type public.visibility as enum ('public', 'unlisted', 'private');

create table public.visualisations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,

  title text not null default 'Untitled',
  description text,
  source text not null default '',

  thumb_url text,
  thumb_pinned boolean not null default false,
  uses_audio boolean not null default false,

  -- Drafts start private: a row is created the moment the editor opens, before
  -- anything worth showing exists.
  visibility public.visibility not null default 'private',

  -- Attribution survives the original being deleted, and is not user-editable
  -- (see grants), which is what makes it non-removable.
  forked_from_id uuid references public.visualisations (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Trigger-maintained. Never client-writable.
  like_count integer not null default 0,
  view_count integer not null default 0,
  fork_count integer not null default 0,
  comment_count integer not null default 0,

  constraint visualisations_title_length check (char_length(title) between 1 and 120)
);

create index visualisations_owner_idx on public.visualisations (owner_id);
-- Browse queries filter to public explicitly and order by recency.
create index visualisations_public_created_idx
  on public.visualisations (created_at desc)
  where visibility = 'public';

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.visualisations enable row level security;

-- Unlisted is reachable by anyone holding the id. RLS cannot tell "has the
-- link" from "guessed the id", so browse queries must filter to public
-- explicitly — this policy alone would surface unlisted work in the panel.
create policy "Readable when public, unlisted, or owned"
  on public.visualisations
  for select
  using (
    visibility in ('public', 'unlisted')
    or owner_id = (select auth.uid())
  );

create policy "Owners can create their own visualisations"
  on public.visualisations
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

-- This is the entire enforcement of "you cannot save over someone else's art".
create policy "Owners can update their own visualisations"
  on public.visualisations
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners can delete their own visualisations"
  on public.visualisations
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ── Column grants ───────────────────────────────────────────────────────────

revoke all on public.visualisations from anon, authenticated;
grant select on public.visualisations to anon, authenticated;

-- forked_from_id is settable at insert (that is what a fork is) but absent
-- from the update grant, so attribution cannot be stripped later.
grant insert (
  owner_id, title, description, source, thumb_url, thumb_pinned,
  uses_audio, visibility, forked_from_id
) on public.visualisations to authenticated;

grant update (
  title, description, source, thumb_url, thumb_pinned, uses_audio, visibility
) on public.visualisations to authenticated;

grant delete on public.visualisations to authenticated;

-- ── updated_at ──────────────────────────────────────────────────────────────

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger visualisations_touch_updated_at
  before update on public.visualisations
  for each row execute function public.touch_updated_at();

-- ── profiles.vis_count ──────────────────────────────────────────────────────

-- Counts public work only: the number is shown on artist tiles, where private
-- drafts have no business being visible.
create function public.sync_vis_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.visibility = 'public' then
      update public.profiles set vis_count = vis_count + 1 where id = new.owner_id;
    end if;

  elsif tg_op = 'DELETE' then
    if old.visibility = 'public' then
      update public.profiles set vis_count = vis_count - 1 where id = old.owner_id;
    end if;

  elsif tg_op = 'UPDATE' then
    if old.visibility = 'public' and new.visibility <> 'public' then
      update public.profiles set vis_count = vis_count - 1 where id = old.owner_id;
    elsif old.visibility <> 'public' and new.visibility = 'public' then
      update public.profiles set vis_count = vis_count + 1 where id = new.owner_id;
    end if;
  end if;

  return null;
end;
$$;

create trigger visualisations_sync_vis_count
  after insert or delete or update of visibility on public.visualisations
  for each row execute function public.sync_vis_count();
