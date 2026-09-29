-- Local regression: selection is durable, owner-readable and not a content copy.
begin;
insert into auth.users(id, email) values
  ('a1700000-0000-4000-8000-000000000001', 'studio-set-owner@example.test'),
  ('a1700000-0000-4000-8000-000000000002', 'studio-set-other@example.test');
insert into public.performance_sets(id,owner_id,content) values (
  'a1700000-0000-4000-8000-000000000003', 'a1700000-0000-4000-8000-000000000001',
  '{"schemaVersion":1,"name":"Distribution source","description":"","aspectRatio":"16:9","loop":false,"audioClips":[],"visualClips":[]}'
);
insert into public.studio_sets(set_id) values ('a1700000-0000-4000-8000-000000000003');
insert into public.studio_sets(set_id) values ('a1700000-0000-4000-8000-000000000003') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1700000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from public.studio_sets where set_id='a1700000-0000-4000-8000-000000000003') <> 1 then
    raise exception 'Owner cannot read selection or duplicate selection exists';
  end if;
  begin
    insert into public.studio_sets(set_id) values ('a1700000-0000-4000-8000-000000000003');
    raise exception 'Direct browser insert unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub','a1700000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists (select 1 from public.studio_sets where set_id='a1700000-0000-4000-8000-000000000003') then
    raise exception 'Another user can read the selection';
  end if;
end $$;
reset role;
update public.performance_sets set content=jsonb_set(content,'{name}','"Edited source"')
where id='a1700000-0000-4000-8000-000000000003';
do $$ begin
  if not exists (select 1 from public.studio_sets d join public.performance_sets s on s.id=d.set_id
    where s.id='a1700000-0000-4000-8000-000000000003' and s.content->>'name'='Edited source') then
    raise exception 'Selection lost its source Set';
  end if;
end $$;
delete from public.performance_sets where id='a1700000-0000-4000-8000-000000000003';
do $$ begin
  if exists (select 1 from public.studio_sets where set_id='a1700000-0000-4000-8000-000000000003') then
    raise exception 'Deleted Set left an orphan selection';
  end if;
end $$;
rollback;
