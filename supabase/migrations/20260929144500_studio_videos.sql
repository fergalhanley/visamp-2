-- M1 Studio: videos are durable artist authoring projects, separate from
-- performance sets. Authoring state is JSON so the timeline schema can evolve
-- without turning every clip field into a relational migration.

create type public.video_status as enum ('draft', 'rendering', 'ready', 'error');

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled video'
    check (length(btrim(title)) between 1 and 160),
  content jsonb not null default '{
    "schemaVersion": 1,
    "aspectRatio": "9:16",
    "audioClips": [],
    "visualClips": []
  }'::jsonb
    check (jsonb_typeof(content) = 'object'),
  status public.video_status not null default 'draft',
  rendered_key text,
  rendered_mime text,
  distribution_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(distribution_state) = 'object'),
  schedule_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(schedule_state) = 'object'),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index videos_owner_updated_idx
  on public.videos (owner_id, updated_at desc);

alter table public.videos enable row level security;

create policy "Owners read videos"
  on public.videos for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Owners create videos"
  on public.videos for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners update videos"
  on public.videos for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners delete videos"
  on public.videos for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.videos from anon, authenticated;
grant select on public.videos to authenticated;
grant insert (owner_id, title, content) on public.videos to authenticated;
grant update (title, content, distribution_state, schedule_state) on public.videos to authenticated;
grant delete on public.videos to authenticated;
grant all on public.videos to service_role;

create trigger videos_touch_updated_at
  before update on public.videos
  for each row execute function public.touch_updated_at();

notify pgrst, 'reload schema';
