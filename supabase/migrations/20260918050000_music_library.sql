-- VIS-131: personal audio collections. Access goes through authenticated APIs;
-- audio catalogue/licence tables remain inaccessible to browser clients.
create table public.track_favourites (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, track_id)
);
create table public.music_playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index music_playlists_owner_idx on public.music_playlists(owner_id, created_at desc);
create table public.music_playlist_items (
  playlist_id uuid not null references public.music_playlists(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(playlist_id, track_id)
);
alter table public.track_favourites enable row level security;
alter table public.music_playlists enable row level security;
alter table public.music_playlist_items enable row level security;
revoke all on public.track_favourites, public.music_playlists, public.music_playlist_items from anon, authenticated;
grant all on public.track_favourites, public.music_playlists, public.music_playlist_items to service_role;

-- Filter before pagination so expired licences do not cause empty early pages.
-- Private collection filters are scoped to the authenticated user by the API.
create function public.browse_music(
  p_query text default '', p_artist text default null,
  p_user_id uuid default null, p_favourites boolean default false,
  p_playlist uuid default null, p_offset integer default 0, p_limit integer default 40
) returns jsonb language sql stable security definer set search_path = '' as $$
with matches as (
  select t.id, t.slug, t.title, a.name as artist, a.slug as "artistSlug",
    t.album, t.year, t.duration_ms as "durationMs", t.bpm,
    t.musical_key as "musicalKey", t.genre_tags as "genreTags",
    t.is_explicit as "isExplicit", t.play_count as "playCount",
    '/api/artwork/track/' || t.id as "artworkUrl",
    (f.track_id is not null) as favourite,
    row_number() over (order by
      case when p_playlist is not null then pi.created_at end asc,
      case when p_favourites then f.created_at end desc,
      t.published_at desc, t.id) as ordinal
  from public.tracks t
  join public.music_artists a on a.id=t.music_artist_id
  join public.licences l on l.id=t.licence_id and l.music_artist_id=a.id
  left join public.track_favourites f on f.track_id=t.id and f.user_id=p_user_id
  left join public.music_playlist_items pi on pi.track_id=t.id and pi.playlist_id=p_playlist
  where t.status='live' and l.status='active' and l.signed_at is not null
    and l.effective_from <= current_date
    and (l.effective_until is null or l.effective_until >= current_date)
    and l.grants_hosting and l.grants_streaming and l.grants_transcoding and l.grants_sync
    and (p_artist is null or a.slug=p_artist)
    and (not p_favourites or f.track_id is not null)
    and (p_playlist is null or (pi.track_id is not null and exists(
      select 1 from public.music_playlists p where p.id=p_playlist and p.owner_id=p_user_id)))
    and (coalesce(btrim(p_query),'')='' or strpos(lower(t.title || ' ' || a.name || ' ' || coalesce(t.album,'')),lower(btrim(p_query)))>0)
), page as (
  select * from matches order by ordinal
  offset greatest(p_offset,0) limit least(greatest(p_limit,1),80)+1
)
select jsonb_build_object(
  'tracks', coalesce((select jsonb_agg(to_jsonb(p)-'ordinal' order by ordinal) from
    (select * from page order by ordinal limit least(greatest(p_limit,1),80)) p),'[]'::jsonb),
  'nextOffset', case when (select count(*) from page)>least(greatest(p_limit,1),80)
    then greatest(p_offset,0)+least(greatest(p_limit,1),80) else null end);
$$;
revoke all on function public.browse_music(text,text,uuid,boolean,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.browse_music(text,text,uuid,boolean,uuid,integer,integer) to service_role;
notify pgrst, 'reload schema';

create index track_favourites_recent_idx on public.track_favourites(user_id, created_at desc);
create index music_playlist_items_order_idx on public.music_playlist_items(playlist_id, created_at, track_id);
create function public.enforce_music_collection_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='music_playlists' then
    perform pg_advisory_xact_lock(hashtextextended('music-playlists:'||new.owner_id::text,0));
    if (select count(*) from public.music_playlists where owner_id=new.owner_id)>=200 then
      raise exception 'An account may store at most 200 music playlists' using errcode='check_violation';
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('music-playlist-items:'||new.playlist_id::text,0));
    if not exists(select 1 from public.music_playlist_items where playlist_id=new.playlist_id and track_id=new.track_id)
       and (select count(*) from public.music_playlist_items where playlist_id=new.playlist_id)>=1000 then
      raise exception 'A music playlist may contain at most 1000 tracks' using errcode='check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger music_playlists_quota before insert on public.music_playlists for each row execute function public.enforce_music_collection_quota();
create trigger music_playlist_items_quota before insert on public.music_playlist_items for each row execute function public.enforce_music_collection_quota();
revoke all on function public.enforce_music_collection_quota() from public;
