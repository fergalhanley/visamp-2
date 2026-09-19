-- VIS-139: multiple artist website/music/social links. Existing websites survive.
begin;
alter table public.music_artists add column links jsonb not null default '[]'::jsonb;
update public.music_artists set links=jsonb_build_array(jsonb_build_object('type','website','url',website_url))
  where website_url is not null and btrim(website_url)<>'';

create function public.valid_artist_profile_links(p_links jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare v_link jsonb;
begin
  if jsonb_typeof(p_links)<>'array' or jsonb_array_length(p_links)>20 then return false; end if;
  for v_link in select value from jsonb_array_elements(p_links) loop
    if jsonb_typeof(v_link)<>'object'
      or coalesce(jsonb_typeof(v_link->'type'),'')<>'string'
      or coalesce(jsonb_typeof(v_link->'url'),'')<>'string'
      or v_link->>'type' not in ('website','spotify','applemusic','soundcloud','bandcamp','youtube','instagram','tiktok','facebook','x','threads','bluesky','twitch','discord','patreon','mixcloud','beatport')
      or length(v_link->>'url')>500
      or v_link->>'url' !~ '^https?://[^[:space:]/?#]+'
      or v_link->>'url' ~ '[[:space:][:cntrl:]]'
    then return false; end if;
  end loop;
  return true;
end;
$$;
alter table public.music_artists add constraint music_artists_links_valid
  check(public.valid_artist_profile_links(links));

-- The old deployed editor still writes website_url. Keep its first Website
-- entry synchronized without deleting newly added social links or other sites.
create function public.sync_artist_website_link()
returns trigger language plpgsql set search_path='' as $$
declare v_index integer;
begin
  if tg_op='INSERT' then
    if new.links='[]'::jsonb and new.website_url is not null then
      new.links:=jsonb_build_array(jsonb_build_object('type','website','url',new.website_url));
    end if;
  elsif new.website_url is distinct from old.website_url and new.links is not distinct from old.links then
    select (ordinality-1)::integer into v_index from jsonb_array_elements(new.links) with ordinality
      where value->>'type'='website' order by ordinality limit 1;
    if v_index is not null then
      if new.website_url is null then new.links:=new.links-v_index;
      else new.links:=jsonb_set(new.links,array[v_index::text],jsonb_build_object('type','website','url',new.website_url)); end if;
    elsif new.website_url is not null then
      new.links:=new.links||jsonb_build_array(jsonb_build_object('type','website','url',new.website_url));
    end if;
  end if;
  return new;
end;
$$;
create trigger music_artists_sync_website_link before insert or update on public.music_artists
  for each row execute function public.sync_artist_website_link();
notify pgrst,'reload schema';
commit;
