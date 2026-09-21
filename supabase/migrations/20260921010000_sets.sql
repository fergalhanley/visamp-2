-- Private set documents; media permissions remain with the referenced catalogue.
create table public.performance_sets (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 content jsonb not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint set_document_shape check (
   jsonb_typeof(content) = 'object' and content->>'schemaVersion' = '1'
   and content->>'aspectRatio' = '16:9'
   and jsonb_typeof(content->'audioClips') = 'array'
   and jsonb_typeof(content->'visualClips') = 'array'
   and octet_length(content::text) <= 2097152
 )
);
create index performance_sets_owner_updated on public.performance_sets(owner_id, updated_at desc);
alter table public.performance_sets enable row level security;
create policy performance_sets_owner on public.performance_sets for all to authenticated
 using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Mutations go through validated API, with owner checks as well as these policies.
revoke all on public.performance_sets from anon, authenticated;
grant select on public.performance_sets to authenticated;
grant all on public.performance_sets to service_role;
