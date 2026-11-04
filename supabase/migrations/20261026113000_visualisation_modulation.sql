-- LFO bank belongs to the visualisation, independent of Visript source.
-- Nullable for existing documents. VJ set overrides can be stored separately.
alter table public.visualisations
  add column if not exists modulation jsonb null;

alter table public.visualisations
  add constraint visualisations_modulation_is_object
  check (modulation is null or jsonb_typeof(modulation) = 'object');
