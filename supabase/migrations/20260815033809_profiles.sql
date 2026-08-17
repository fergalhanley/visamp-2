-- Profiles: the public identity attached to every auth user.
--
-- Follows dev/stories.md §4. The counter columns exist here from the start but
-- stay at zero until the tables that feed them (visualisations, follows,
-- vis_views) land; their triggers arrive with those migrations.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- Null until the viewer claims one at first sign-in (E5.3). Nullable rather
  -- than generated, so a half-finished signup can never squat a good name.
  username text,
  display_name text,
  avatar_url text,
  bio text,

  -- Trigger-maintained, never client-writable. Enforced by column grants
  -- below, because RLS alone cannot restrict which columns an update touches.
  vis_count integer not null default 0,
  follower_count integer not null default 0,
  total_views integer not null default 0,

  created_at timestamptz not null default now(),

  constraint profiles_username_format
    check (username is null or username ~ '^[A-Za-z0-9_]{3,30}$')
);

-- Case-insensitive uniqueness: "Nova" and "nova" are the same artist.
create unique index profiles_username_lower_idx
  on public.profiles (lower(username));

comment on table public.profiles is
  'Public profile per auth user. Counter columns are trigger-maintained.';

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.profiles enable row level security;

-- Watching is anonymous (principle 5): profiles are world-readable.
create policy "Profiles are readable by everyone"
  on public.profiles
  for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No insert or delete policy on purpose: rows are created by the signup
-- trigger below and removed by the cascade from auth.users.

-- ── Column grants ───────────────────────────────────────────────────────────

-- Supabase grants all privileges on new public tables to anon/authenticated by
-- default. Narrow that so the denormalised counters cannot be written by a
-- client, which is what makes them trustworthy as a ranking signal.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (username, display_name, avatar_url, bio)
  on public.profiles to authenticated;

-- ── Signup trigger ──────────────────────────────────────────────────────────

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    -- Google sends full_name, GitHub sends name; email signups get neither.
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Username availability ───────────────────────────────────────────────────

-- Lets the claim form check a name before submitting. Returns only a boolean,
-- so it cannot be used to enumerate who holds what.
create function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(candidate)
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;
