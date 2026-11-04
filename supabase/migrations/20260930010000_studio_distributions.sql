-- Persistent output setup. Drafts grant no rendering, licensing or publishing rights.
create table public.set_distributions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.performance_sets(id) on delete cascade,
  target text not null check (target = 'master_download'),
  status text not null default 'draft' check (status = 'draft'),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, target)
);
alter table public.set_distributions enable row level security;
create policy "Owners read Set distributions"
  on public.set_distributions for select to authenticated
  using (exists (select 1 from public.performance_sets s
    where s.id = set_id and s.owner_id = (select auth.uid())));
revoke all on public.set_distributions from anon, authenticated;
grant select on public.set_distributions to authenticated;
grant all on public.set_distributions to service_role;
create trigger set_distributions_touch_updated_at before update on public.set_distributions
  for each row execute function public.touch_updated_at();
notify pgrst, 'reload schema';
