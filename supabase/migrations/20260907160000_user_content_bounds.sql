-- Bounds are enforced in the database because REST clients can bypass every
-- input maxlength in the web application. NOT VALID avoids breaking rollout
-- on legacy rows while still enforcing each new or changed row.
alter table public.profiles
  add constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) <= 100) not valid,
  add constraint profiles_bio_length
    check (bio is null or char_length(bio) <= 2000) not valid,
  add constraint profiles_avatar_url_length
    check (avatar_url is null or char_length(avatar_url) <= 2048) not valid;

alter table public.visualisations
  add constraint visualisations_description_length
    check (description is null or char_length(description) <= 4000) not valid,
  add constraint visualisations_source_length
    check (char_length(source) <= 200000 and octet_length(source) <= 400000) not valid;

alter table public.playlist_items
  add constraint playlist_items_position_bounds
    check (position between 0 and 9999) not valid;

-- Serialised quotas keep user-created row counts finite even when inserts are
-- sent concurrently or directly through PostgREST.
create function public.enforce_visualisation_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('visualisation-quota:' || new.owner_id::text, 0)
  );
  if (
    select count(*) from public.visualisations
    where owner_id = new.owner_id
  ) >= 500 then
    raise exception using
      errcode = '23514',
      message = 'An account may store at most 500 visualisations';
  end if;
  return new;
end;
$$;

create trigger visualisations_enforce_quota
  before insert on public.visualisations
  for each row execute function public.enforce_visualisation_quota();

create function public.enforce_playlist_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('playlist-quota:' || new.owner_id::text, 0)
  );
  if (
    select count(*) from public.playlists
    where owner_id = new.owner_id
  ) >= 200 then
    raise exception using
      errcode = '23514',
      message = 'An account may store at most 200 playlists';
  end if;
  return new;
end;
$$;

create trigger playlists_enforce_quota
  before insert on public.playlists
  for each row execute function public.enforce_playlist_quota();

create function public.enforce_playlist_item_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('playlist-item-quota:' || new.playlist_id::text, 0)
  );
  if (
    select count(*) from public.playlist_items
    where playlist_id = new.playlist_id
  ) >= 1000 then
    raise exception using
      errcode = '23514',
      message = 'A playlist may contain at most 1000 visualisations';
  end if;
  return new;
end;
$$;

create trigger playlist_items_enforce_quota
  before insert on public.playlist_items
  for each row execute function public.enforce_playlist_item_quota();

revoke all on function public.enforce_visualisation_quota() from public;
revoke all on function public.enforce_playlist_quota() from public;
revoke all on function public.enforce_playlist_item_quota() from public;
