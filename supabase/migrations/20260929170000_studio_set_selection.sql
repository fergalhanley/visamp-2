-- Studio selects existing Sets for distribution. Authoring stays in Set Builder.
-- Selection is not a licence, render or publication, and copies no Set content.
create table public.studio_sets (
  set_id uuid primary key references public.performance_sets(id) on delete cascade,
  selected_at timestamptz not null default now()
);

alter table public.studio_sets enable row level security;
create policy "Owners read Studio selections"
  on public.studio_sets for select to authenticated
  using (exists (
    select 1 from public.performance_sets s
    where s.id = set_id and s.owner_id = (select auth.uid())
  ));

-- The service checks Set ownership before selecting. No browser writes.
revoke all on public.studio_sets from anon, authenticated;
grant select on public.studio_sets to authenticated;
grant all on public.studio_sets to service_role;
notify pgrst, 'reload schema';
