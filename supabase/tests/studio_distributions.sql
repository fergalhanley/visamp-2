begin;
insert into auth.users(id,email) values
 ('b3000000-0000-4000-8000-000000000001','distribution-owner@example.test'),
 ('b3000000-0000-4000-8000-000000000002','distribution-other@example.test');
insert into public.performance_sets(id,owner_id,content) values (
 'b3000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000001',
 '{"schemaVersion":1,"name":"Master","aspectRatio":"16:9","audioClips":[],"visualClips":[]}');
insert into public.set_distributions(set_id,target,settings) values
 ('b3000000-0000-4000-8000-000000000003','master_download','{"filename":"Master","format":"mp4","resolution":"1080p","frameRate":30}');
do $$ begin
 begin
  insert into public.set_distributions(set_id,target,settings) values
   ('b3000000-0000-4000-8000-000000000003','master_download','{}');
  raise exception 'Duplicate Master setup allowed';
 exception when unique_violation then null; end;
 begin
  insert into public.set_distributions(set_id,target,settings) values
   ('b3000000-0000-4000-8000-000000000003','youtube','{}');
  raise exception 'Unsupported target allowed';
 exception when check_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from public.set_distributions where set_id='b3000000-0000-4000-8000-000000000003') <> 1 then raise exception 'Owner cannot read setup'; end if;
 begin
  update public.set_distributions set settings='{}' where set_id='b3000000-0000-4000-8000-000000000003';
  raise exception 'Unvalidated browser update allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','b3000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists (select 1 from public.set_distributions where set_id='b3000000-0000-4000-8000-000000000003') then raise exception 'Another user can read setup'; end if;
end $$;
reset role;
delete from public.performance_sets where id='b3000000-0000-4000-8000-000000000003';
do $$ begin
 if exists (select 1 from public.set_distributions where set_id='b3000000-0000-4000-8000-000000000003') then raise exception 'Orphan distribution remains'; end if;
end $$;
rollback;
