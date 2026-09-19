-- Run on a migrated database with at least one live/licensed hosted track.
-- All test users and visualisations are rolled back.
begin;
do $$
declare
 owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid();
 vis_a uuid; vis_b uuid; chosen uuid; affected integer; original_role text:=current_user;
begin
 select t.id into chosen from public.tracks t join public.licences l on l.id=t.licence_id and l.music_artist_id=t.music_artist_id
 where t.status='live' and l.status='active' and l.signed_at is not null
 and l.effective_from<=current_date and (l.effective_until is null or l.effective_until>=current_date)
 and l.grants_hosting and l.grants_streaming and l.grants_transcoding and l.grants_sync limit 1;
 assert chosen is not null, 'Test requires a playable hosted track';
 insert into auth.users(id,email,raw_user_meta_data) values(owner_a,owner_a::text||'@preferred.test','{}'),(owner_b,owner_b::text||'@preferred.test','{}');
 insert into public.visualisations(owner_id) values(owner_a) returning id into vis_a;
 insert into public.visualisations(owner_id) values(owner_b) returning id into vis_b;
 perform set_config('request.jwt.claim.sub',owner_a::text,true);
 perform set_config('role','authenticated',true);
 update public.visualisations set preferred_track_id=chosen where id=vis_a;
 get diagnostics affected=row_count;
 assert affected=1, 'Owner can select a preferred track';
 update public.visualisations set preferred_track_id=chosen where id=vis_b;
 get diagnostics affected=row_count;
 assert affected=0, 'Another owner cannot change the pairing';
 begin
  update public.visualisations set preferred_track_id='00000000-0000-0000-0000-000000000000' where id=vis_a;
  raise exception 'Invalid track accepted';
 exception when check_violation then null; end;
 update public.visualisations set preferred_track_id=null where id=vis_a;
 assert (select preferred_track_id is null from public.visualisations where id=vis_a), 'Clearing allowed';
 perform set_config('role',original_role,true);
end $$;
rollback;
