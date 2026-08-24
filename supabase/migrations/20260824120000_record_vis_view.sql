-- Views: one number per visualisation, bumped once per view.
--
-- No `vis_views` row per viewer. Counting views is not the same problem as
-- deciding whether two plays are the same person: a table of them would need a
-- viewer identity to be worth anything, and watching is anonymous (principle 5).
-- What is wanted here is the cheap, honest version — a play happened.

-- view_count is deliberately absent from the client's update grant, so the
-- increment goes through a definer function instead. Public work only: a
-- private draft has no audience, and the editor would otherwise count its own
-- author looking at their own preview.
create function public.record_vis_view(vis_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  update public.visualisations
  set view_count = view_count + 1
  where id = vis_id and visibility = 'public'
  returning owner_id into owner;

  -- Null when the id names nothing readable, which is also what a private or
  -- deleted row looks like from here. Returning void either way keeps this from
  -- being an existence probe.
  if owner is not null then
    update public.profiles
    set total_views = total_views + 1
    where id = owner;
  end if;
end;
$$;

grant execute on function public.record_vis_view(uuid) to anon, authenticated;

-- ── updated_at is about edits, not traffic ──────────────────────────────────

-- The touch trigger fired on any update, so a view would restamp updated_at and
-- every watched visualisation would look freshly edited. Narrow it to the
-- columns an author actually writes.
drop trigger visualisations_touch_updated_at on public.visualisations;

create trigger visualisations_touch_updated_at
  before update of title, description, source, thumb_url, thumb_pinned,
                   uses_audio, visibility
  on public.visualisations
  for each row execute function public.touch_updated_at();
