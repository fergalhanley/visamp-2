-- Run after the distribution migration. Read-only regression checks.
do $$
declare
  labels text[];
  definition text;
begin
  select array_agg(enumlabel::text order by enumsortorder) into labels
  from pg_enum where enumtypid = 'public.visibility'::regtype;
  if labels <> array['private', 'public', 'protected', 'product'] then
    raise exception 'Unexpected visual distribution classes: %', labels;
  end if;

  select pg_get_triggerdef(oid) into definition
  from pg_trigger
  where tgrelid = 'public.visualisations'::regclass
    and tgname = 'visualisations_touch_updated_at'
    and tgenabled = 'O';
  if definition is null or definition not like
    '%BEFORE UPDATE OF title, description, source, thumb_path, thumb_pinned, uses_audio, visibility ON public.visualisations FOR EACH ROW EXECUTE FUNCTION touch_updated_at()%' then
    raise exception 'Edit-only timestamp trigger was not restored: %', definition;
  end if;
  select pg_get_triggerdef(oid) into definition
  from pg_trigger
  where tgrelid = 'public.visualisations'::regclass
    and tgname = 'visualisations_sync_assets'
    and tgenabled = 'O';
  if definition is null or definition not like
    '%AFTER INSERT OR UPDATE OF source, visibility ON public.visualisations FOR EACH ROW EXECUTE FUNCTION sync_visualisation_assets()%' then
    raise exception 'Asset synchronisation trigger was not restored: %', definition;
  end if;
  if (select atttypid from pg_attribute where attrelid = 'public.assets'::regclass and attname = 'visibility')
      <> 'public.asset_visibility'::regtype then
    raise exception 'Assets must retain their original public/private type';
  end if;
  if (select count(*) from pg_enum where enumtypid = 'public.asset_visibility'::regtype) <> 2 then
    raise exception 'Visual distribution classes must not expand asset visibility';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.visualisation_assets'::regclass
    and polname = 'Reference rows follow the visual and the asset') then
    raise exception 'Asset-reference read policy was not restored';
  end if;
  if to_regclass('public.visualisations_preferred_track_public_idx') is null then
    raise exception 'Preferred-track index was not restored';
  end if;
  if to_regtype('public.visibility_old') is not null then
    raise exception 'Old visibility type was not removed';
  end if;
  raise notice 'Visual distribution enum, timestamp and asset triggers verified';
end;
$$;
