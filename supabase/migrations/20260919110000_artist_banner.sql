begin;
alter table public.music_artists add column banner_key text;
comment on column public.music_artists.banner_key is 'Owner-uploaded artist hero image; separate from avatar, stored as WebP in media R2.';
notify pgrst, 'reload schema';
commit;
