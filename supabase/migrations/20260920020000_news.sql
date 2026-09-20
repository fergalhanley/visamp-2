-- VIS-149: public reads are limited to published news. Writes go through admin APIs.
create table public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null default '' check (char_length(body) <= 50000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or (published_at is not null and char_length(btrim(body)) > 0))
);
create index news_posts_published_idx on public.news_posts(published_at desc, id) where status = 'published';
alter table public.news_posts enable row level security;
revoke all on public.news_posts from anon, authenticated;
grant select on public.news_posts to anon, authenticated;
grant all on public.news_posts to service_role;
create policy news_published_read on public.news_posts for select to anon, authenticated using (status = 'published');
create function public.news_post_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger news_post_updated_at before update on public.news_posts for each row execute function public.news_post_updated_at();
-- No client storage policies: only the server can write or read this private bucket.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('news-images','news-images',false,3145728,array['image/webp']);
notify pgrst, 'reload schema';
