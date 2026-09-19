begin;
do $$
declare v_id uuid:=gen_random_uuid(); v_links jsonb;
begin
  assert public.valid_artist_profile_links('[]'), 'empty links allowed';
  assert not public.valid_artist_profile_links('{}'), 'object rejected';
  assert not public.valid_artist_profile_links('[{"type":"website","url":"javascript:alert(1)"}]'), 'script URL rejected';
  assert not public.valid_artist_profile_links('[{"type":"unknown","url":"https://example.com"}]'), 'unknown platform rejected';
  assert not public.valid_artist_profile_links('[{"type":"website"}]'), 'missing URL rejected';
  insert into public.music_artists(id,slug,name,website_url)
    values(v_id,'vis139-check-'||v_id::text,'VIS139 check '||v_id::text,'https://example.com');
  select links into v_links from public.music_artists where id=v_id;
  assert v_links='[{"type":"website","url":"https://example.com"}]'::jsonb, 'legacy insert copied';
  update public.music_artists set links=links||'[{"type":"bandcamp","url":"https://test.bandcamp.com"}]'::jsonb where id=v_id;
  update public.music_artists set website_url='https://new.example.com' where id=v_id;
  select links into v_links from public.music_artists where id=v_id;
  assert v_links->0->>'url'='https://new.example.com', 'legacy website edit synchronized';
  assert v_links->1->>'type'='bandcamp', 'social link preserved';
  update public.music_artists set website_url=null where id=v_id;
  select links into v_links from public.music_artists where id=v_id;
  assert jsonb_array_length(v_links)=1 and v_links->0->>'type'='bandcamp', 'legacy removal preserves social links';
  update public.music_artists set links='[]',website_url=null where id=v_id;
  select links into v_links from public.music_artists where id=v_id;
  assert v_links='[]'::jsonb, 'all links can be removed';
end;
$$;
rollback;
