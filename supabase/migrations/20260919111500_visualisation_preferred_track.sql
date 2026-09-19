begin;
alter table public.visualisations add column preferred_track_id uuid references public.tracks(id) on delete set null;
create index visualisations_preferred_track_public_idx on public.visualisations(preferred_track_id, created_at desc) where visibility='public';
grant insert (preferred_track_id), update (preferred_track_id) on public.visualisations to authenticated;

create function public.validate_visualisation_preferred_track() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and new.preferred_track_id is not distinct from old.preferred_track_id then return new; end if;
  if new.preferred_track_id is null then return new; end if;
  if not exists (
    select 1 from public.tracks t join public.licences l on l.id=t.licence_id and l.music_artist_id=t.music_artist_id
    where t.id=new.preferred_track_id and t.status='live' and l.status='active' and l.signed_at is not null
      and l.effective_from <= current_date and (l.effective_until is null or l.effective_until >= current_date)
      and l.grants_hosting and l.grants_streaming and l.grants_transcoding and l.grants_sync
  ) then raise exception 'Choose an available track from the music catalogue.' using errcode='23514'; end if;
  return new;
end;
$$;
revoke all on function public.validate_visualisation_preferred_track() from public,anon,authenticated;
create trigger visualisations_validate_preferred_track before insert or update of preferred_track_id on public.visualisations for each row execute function public.validate_visualisation_preferred_track();
create trigger visualisations_track_touch_updated_at before update of preferred_track_id on public.visualisations for each row execute function public.touch_updated_at();
notify pgrst, 'reload schema';
commit;
