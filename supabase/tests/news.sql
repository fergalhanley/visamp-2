-- Run in a transaction with the migration installed; fixtures are rolled back.
begin;
insert into public.news_posts(id,title,body,status,published_at) values
 ('14900000-0000-0000-0000-000000000001','VIS149 draft','Secret draft','draft',null),
 ('14900000-0000-0000-0000-000000000002','VIS149 public','Public content','published',now());
set local role anon;
do $$ begin
  assert (select count(*) from public.news_posts where id in ('14900000-0000-0000-0000-000000000001','14900000-0000-0000-0000-000000000002')) = 1, 'anonymous readers only see published posts';
  begin
    insert into public.news_posts(title) values('Forbidden');
    raise exception 'anonymous write allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  assert not exists(select 1 from public.news_posts where id='14900000-0000-0000-0000-000000000001'), 'signed-in readers cannot see drafts';
  begin
    update public.news_posts set status='published' where id='14900000-0000-0000-0000-000000000001';
    raise exception 'non-admin update allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare old_stamp timestamptz; begin
  select updated_at into old_stamp from public.news_posts where id='14900000-0000-0000-0000-000000000001';
  update public.news_posts set title='Changed' where id='14900000-0000-0000-0000-000000000001';
  assert (select updated_at > old_stamp from public.news_posts where id='14900000-0000-0000-0000-000000000001'), 'updates refresh version';
  begin
    update public.news_posts set status='published',body='' where id='14900000-0000-0000-0000-000000000001';
    raise exception 'empty publication allowed';
  exception when check_violation then null; end;
  assert (select not public from storage.buckets where id='news-images'), 'images bucket is private';
end $$;
update public.news_posts set status='draft' where id='14900000-0000-0000-0000-000000000002';
set local role anon;
do $$ begin
  assert not exists(select 1 from public.news_posts where id='14900000-0000-0000-0000-000000000002'), 'unpublish immediately removes access';
end $$;
reset role;
rollback;
