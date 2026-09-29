-- M1 marketplace prototype: make a visualisation listable and allow its
-- creator to expose selected Visript props as musician-facing controls.

alter table public.visualisations
  add column marketplace_listed boolean not null default false,
  add column marketplace_price_credits integer
    check (marketplace_price_credits is null or marketplace_price_credits > 0),
  add column marketplace_controls jsonb not null default '[]'::jsonb
    check (jsonb_typeof(marketplace_controls) = 'array');

-- Existing owner RLS remains the authority. These grants only add the new
-- columns to the explicit owner-update surface established by the original
-- visualisations migration.
grant update (
  marketplace_listed,
  marketplace_price_credits,
  marketplace_controls
) on public.visualisations to authenticated;

-- Public marketplace discovery only needs listed public work. Price is kept
-- nullable so creators can configure controls before deciding to list.
create index visualisations_marketplace_idx
  on public.visualisations (updated_at desc)
  where marketplace_listed = true and visibility = 'public';

notify pgrst, 'reload schema';
