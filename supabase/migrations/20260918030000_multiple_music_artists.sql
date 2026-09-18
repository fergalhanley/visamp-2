-- VIS-130: multiple artist identities per user, globally unique display names.
-- The index deliberately refuses existing duplicates; resolve them explicitly
-- before rollout rather than silently renaming or merging someone else's work.
create function public.music_artist_name_key(p_name text)
returns text language sql immutable strict set search_path = '' as $$
  select lower(btrim(regexp_replace(p_name, '\s+', ' ', 'g')));
$$;
create unique index music_artists_name_key_unique
  on public.music_artists (public.music_artist_name_key(name));

create or replace function public.claim_music_artist(p_user_id uuid, p_name text)
returns public.music_artists
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(regexp_replace(p_name, '\s+', ' ', 'g'));
  v_key text := public.music_artist_name_key(p_name);
  v_base text;
  v_slug text;
  v_suffix int := 1;
  v_constraint text;
  v_row public.music_artists;
begin
  if p_user_id is null or v_name is null or length(v_name)<1 or length(v_name)>120 then
    raise exception 'Enter an artist name of 1 to 120 characters.' using errcode='check_violation';
  end if;
  -- Serialize claims of the same normalized name, including repeat submissions.
  perform pg_advisory_xact_lock(hashtextextended('music-artist-name:'||v_key,0));
  select * into v_row from public.music_artists where public.music_artist_name_key(name)=v_key;
  if found then
    if v_row.claimed_by=p_user_id then return v_row; end if;
    raise exception 'This artist name has already been claimed.'
      using errcode='unique_violation', constraint='music_artists_name_key_unique',
      detail=json_build_object('name',v_row.name,'slug',v_row.slug)::text;
  end if;

  v_base := btrim(left(btrim(regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'),'-'),80),'-');
  if v_base='' then v_base := 'artist'; end if;
  v_slug := v_base;
  loop
    begin
      insert into public.music_artists(slug,name,claimed_by)
        values(v_slug,v_name,p_user_id) returning * into v_row;
      return v_row;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint='music_artists_name_key_unique' then
        -- Also handles admin/direct inserts which do not take our claim lock.
        select * into v_row from public.music_artists where public.music_artist_name_key(name)=v_key;
        if v_row.claimed_by=p_user_id then return v_row; end if;
        raise exception 'This artist name has already been claimed.'
          using errcode='unique_violation', constraint='music_artists_name_key_unique',
          detail=json_build_object('name',v_row.name,'slug',v_row.slug)::text;
      end if;
      if v_constraint<>'music_artists_slug_key' then raise; end if;
      v_suffix := v_suffix+1;
      if v_suffix>50 then
        raise exception 'Could not allocate a web address for that name. Try a different one.' using errcode='check_violation';
      end if;
      v_slug := v_base||'-'||v_suffix::text;
    end;
  end loop;
end;
$$;
revoke all on function public.claim_music_artist(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_music_artist(uuid,text) to service_role;
notify pgrst, 'reload schema';
