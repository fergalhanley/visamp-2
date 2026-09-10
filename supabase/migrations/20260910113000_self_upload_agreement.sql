-- VIS-86 — the artist accepts the agreement themselves, and that is their licence.
--
-- Every licence used to come from an admin, so a self-claimed artist reached the
-- upload form and stopped: "no approved licence available", with no way to get
-- one. The licence was gating upload when it should gate publication.
--
-- Acceptance creates a `pending` licence. Upload accepts pending; the
-- `enforce_hosted_track_state` trigger still demands `active` before a track may
-- reach `live`, and is untouched. An admin activating the licence once is what
-- releases the music.

alter table public.licences
  add column agreement_version text,
  add column accepted_at timestamptz,
  add column accepted_by uuid references auth.users(id),
  add column accepted_user_agent text;

comment on column public.licences.agreement_version is
  'Set for self-accepted licences: which agreement text the artist accepted.';

-- Evidence is only meaningful together, and a self-accepted licence must name a
-- person: an admin-recorded licence carries none of these and stays as it was.
alter table public.licences add constraint licences_acceptance_complete check (
  (agreement_version is null and accepted_at is null and accepted_by is null)
  or (agreement_version is not null and accepted_at is not null and accepted_by is not null)
);

create index licences_artist_accepted_idx
  on public.licences (music_artist_id)
  where accepted_at is not null;

/*
 * Idempotent: returns the artist's existing self-accepted licence rather than
 * stacking a new one per upload. Only the claimant may accept, and only for an
 * artist they hold — an admin uploading on someone's behalf uses the licence
 * that was recorded for them, not this.
 */
create function public.accept_self_upload_agreement(
  p_user_id uuid,
  p_artist_id uuid,
  p_version text,
  p_user_agent text
)
returns public.licences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.licences;
begin
  if p_version is null or btrim(p_version) = '' then
    raise exception 'An agreement version is required.'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.music_artists
    where id = p_artist_id and claimed_by = p_user_id
  ) then
    raise exception 'This artist is not linked to your account.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Serialised per artist so two uploads starting together cannot each create
  -- a licence and leave the artist holding duplicates.
  perform pg_advisory_xact_lock(
    hashtextextended('self-upload-agreement:' || p_artist_id::text, 0));

  select * into v_row
  from public.licences
  where music_artist_id = p_artist_id
    and accepted_by = p_user_id
    and agreement_version = btrim(p_version)
    and status <> 'terminated'
  limit 1;

  if found then
    return v_row;
  end if;

  -- Pending on purpose. The artist warrants the rights here; an admin still
  -- decides whether the music goes out.
  insert into public.licences (
    music_artist_id, status, signed_at, effective_from, territory,
    grants_hosting, grants_streaming, grants_transcoding, grants_sync,
    warrants_master, warrants_publishing,
    agreement_version, accepted_at, accepted_by, accepted_user_agent
  ) values (
    p_artist_id, 'pending', now(), current_date, 'worldwide',
    true, true, true, true,
    true, true,
    btrim(p_version), now(), p_user_id, left(coalesce(p_user_agent, ''), 400)
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.accept_self_upload_agreement(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.accept_self_upload_agreement(uuid, uuid, text, text)
  to service_role;
