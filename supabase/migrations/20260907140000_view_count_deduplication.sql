-- A public RPC with no viewer identity made ranking counters trivial to inflate.
-- Views now enter through the server route and are deduplicated durably.
revoke execute on function public.record_vis_view(uuid) from anon, authenticated;
drop function public.record_vis_view(uuid);

create table public.visualisation_viewers (
  vis_id uuid not null references public.visualisations(id) on delete cascade,
  viewer_hash text not null,
  network_hash text not null,
  last_viewed_at timestamptz not null default now(),
  primary key (vis_id, viewer_hash),
  constraint visualisation_viewers_viewer_hash_format
    check (viewer_hash ~ '^[0-9a-f]{64}$'),
  constraint visualisation_viewers_network_hash_format
    check (network_hash ~ '^[0-9a-f]{64}$')
);

create index visualisation_viewers_network_recent_idx
  on public.visualisation_viewers (vis_id, network_hash, last_viewed_at desc);

alter table public.visualisation_viewers enable row level security;
revoke all on public.visualisation_viewers from anon, authenticated;
grant all on public.visualisation_viewers to service_role;

create function public.record_vis_view(
  p_vis_id uuid,
  p_viewer_hash text,
  p_network_hash text,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if p_viewer_hash !~ '^[0-9a-f]{64}$'
     or p_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid view identity';
  end if;

  -- Serialize both the viewer and network gates for this visualisation.
  perform pg_advisory_xact_lock(
    hashtextextended('vis-viewer:' || p_vis_id::text || ':' || p_viewer_hash, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('vis-network:' || p_vis_id::text || ':' || p_network_hash, 0)
  );

  select vis.owner_id into owner
  from public.visualisations as vis
  where vis.id = p_vis_id and vis.visibility = 'public';

  if owner is null then
    return false;
  end if;
  if p_user_id is not null and owner = p_user_id then
    return false;
  end if;

  if exists (
    select 1 from public.visualisation_viewers as viewer
    where viewer.vis_id = p_vis_id
      and viewer.viewer_hash = p_viewer_hash
      and viewer.last_viewed_at > now() - interval '24 hours'
  ) then
    return false;
  end if;

  -- Cookie clearing must not allow one network to manufacture an unlimited
  -- number of viewers. This deliberately favours trustworthy rankings over
  -- exact counts on large shared networks.
  if (
    select count(*) from public.visualisation_viewers as viewer
    where viewer.vis_id = p_vis_id
      and viewer.network_hash = p_network_hash
      and viewer.last_viewed_at > now() - interval '24 hours'
  ) >= 20 then
    return false;
  end if;

  insert into public.visualisation_viewers (
    vis_id, viewer_hash, network_hash, last_viewed_at
  ) values (
    p_vis_id, p_viewer_hash, p_network_hash, now()
  )
  on conflict (vis_id, viewer_hash) do update
    set network_hash = excluded.network_hash,
        last_viewed_at = excluded.last_viewed_at;

  update public.visualisations
  set view_count = view_count + 1
  where id = p_vis_id;

  update public.profiles
  set total_views = total_views + 1
  where id = owner;

  return true;
end;
$$;

revoke all on function public.record_vis_view(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.record_vis_view(uuid, text, text, uuid)
  to service_role;
