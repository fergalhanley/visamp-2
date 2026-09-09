-- The asset reference form is now `asset::bitmap(id: "<uuid>")` only.
--
-- The extractor previously accepted a bare string as well, matching a grammar
-- that allowed both. A bare string was the only positional argument anywhere in
-- the language, and two accepted spellings is a liability for something whose
-- whole job is to match source text exactly: the index is what makes "which
-- visuals use this asset" answerable, and every spelling it does not recognise
-- is a visual that silently loses its warning when an asset goes away.
--
-- Nothing in the wild uses the old form — the reference syntax and the library
-- that emits it shipped together, and it emits the labelled form.
create or replace function public.visualisation_asset_references(p_source text)
returns setof uuid
language sql
immutable
set search_path = ''
as $$
  select distinct lower(found.captured[1])::uuid
  from regexp_matches(
    coalesce(p_source, ''),
    'asset::(?:bitmap|vector|model)\s*\(\s*id\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"',
    'gi'
  ) as found(captured);
$$;
