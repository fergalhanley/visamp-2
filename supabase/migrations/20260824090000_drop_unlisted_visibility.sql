-- Reduce visibility to public/private.
--
-- Unlisted promised something RLS cannot actually deliver: "reachable by anyone
-- holding the link" is indistinguishable from "reachable by anyone who guesses
-- the id", so every browse query had to filter to public by hand and remember
-- why. Two states carry the same meaning without the footgun.

-- Any existing unlisted work becomes private. Chosen over public deliberately:
-- unlisted was never indexed or browsable, so private is what its author was
-- already getting, and quietly publishing someone's work would be worse than
-- quietly hiding it.
update public.visualisations
set visibility = 'private'
where visibility = 'unlisted';

-- All three depend on the column, so they have to come off before the type can
-- be replaced, and go back on afterwards. The trigger is the non-obvious one:
-- it names visibility in its `update of` list, which is enough for Postgres to
-- refuse the retype ("cannot alter type of a column used in a trigger
-- definition"). Its function is unaffected — plpgsql bodies are not bound to
-- the column — so only the trigger itself is recreated.
drop policy if exists "Readable when public, unlisted, or owned" on public.visualisations;
drop index if exists public.visualisations_public_created_idx;
drop trigger if exists visualisations_sync_vis_count on public.visualisations;

alter table public.visualisations alter column visibility drop default;

alter type public.visibility rename to visibility_old;
create type public.visibility as enum ('public', 'private');

alter table public.visualisations
  alter column visibility type public.visibility
  using visibility::text::public.visibility;

drop type public.visibility_old;

-- Drafts still start private: a row exists from the moment the editor opens,
-- before there is anything worth showing.
alter table public.visualisations alter column visibility set default 'private';

create index visualisations_public_created_idx
  on public.visualisations (created_at desc)
  where visibility = 'public';

create policy "Readable when public or owned"
  on public.visualisations
  for select
  using (
    visibility = 'public'
    or owner_id = (select auth.uid())
  );

create trigger visualisations_sync_vis_count
  after insert or delete or update of visibility on public.visualisations
  for each row execute function public.sync_vis_count();
