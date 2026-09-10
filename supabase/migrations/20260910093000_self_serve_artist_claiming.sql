-- VIS-83 — a user creates and claims their own artist, then uploads immediately.
--
-- Until now `music_artists` rows could only be created by `service_role`, so an
-- artist could not start at all until someone ran SQL for them. Claiming is
-- deliberately unverified: what keeps it safe is that a claim grants an upload
-- capability rather than a public identity. An artist page stays private to its
-- claimant until the artist has a live track (VIS-84), which happens on the same
-- one-time admin licence activation that releases the music.

-- Phase 4's Music tab reads a person's claimed artists; partial because most
-- rows are admin-created and unclaimed.
create index music_artists_claimed_by_idx
  on public.music_artists (claimed_by)
  where claimed_by is not null;

-- Called only by our authenticated server, matching begin_audio_upload: the
-- caller has already established who the user is, and `music_artists` stays
-- revoked from `authenticated` so no client can insert directly.
create function public.claim_music_artist(p_user_id uuid, p_name text)
returns public.music_artists
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Collapse runs of whitespace too: the name is displayed, and "Deep  Fixation"
  -- with a double space is nobody's intent.
  v_name text := btrim(regexp_replace(p_name, '\s+', ' ', 'g'));
  v_base text;
  v_slug text;
  v_suffix int := 1;
  v_row public.music_artists;
begin
  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'Enter an artist name of 1 to 120 characters.'
      using errcode = 'check_violation';
  end if;

  -- Serialised per user, so two requests in flight cannot both pass the check
  -- below and leave one person holding two artists.
  perform pg_advisory_xact_lock(
    hashtextextended('claim-music-artist:' || p_user_id::text, 0));

  -- VIS-7 — one self-claimed artist per user for now. An admin can still link
  -- several to one person, because that path does not come through here.
  if exists (select 1 from public.music_artists where claimed_by = p_user_id) then
    raise exception 'You already have an artist profile.'
      using errcode = 'unique_violation';
  end if;

  -- music_artists_slug_format wants lowercase words joined by single hyphens.
  -- A name with nothing alphanumeric in it — or nothing Latin — reduces to
  -- empty, so fall back rather than fail: the slug is a URL, the name is what
  -- gets displayed.
  v_base := btrim(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
  v_base := btrim(left(v_base, 80), '-');
  if v_base = '' then
    v_base := 'artist';
  end if;

  -- Insert-and-retry rather than look-then-insert. The unique index is the only
  -- thing that can actually settle a race between two users claiming the same
  -- name at once, so let it, and take the next suffix when it does.
  v_slug := v_base;
  loop
    begin
      insert into public.music_artists (slug, name, claimed_by)
      values (v_slug, v_name, p_user_id)
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      v_suffix := v_suffix + 1;
      if v_suffix > 50 then
        raise exception 'Could not allocate a web address for that name. Try a different one.'
          using errcode = 'check_violation';
      end if;
      v_slug := v_base || '-' || v_suffix::text;
    end;
  end loop;
end;
$$;

revoke all on function public.claim_music_artist(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_music_artist(uuid, text) to service_role;
