-- Run against a disposable migrated database. Every fixture is rolled back.
begin;
do $$
declare
  v_owner uuid := gen_random_uuid();
  a public.visualisations;
  b public.visualisations;
  c public.visualisations;
  v_words text[];
  v_kind text;
  v_expected int;
  v_slug text;
begin
  insert into auth.users(id, email, raw_user_meta_data)
    values(v_owner, v_owner::text||'@names.test', '{}'::jsonb);

  foreach v_kind in array array['visual','adjective','noun'] loop
    v_words:=public.visualisation_name_words(v_kind);
    v_expected:=case when v_kind='visual' then 64 else 256 end;
    assert cardinality(v_words)=v_expected, 'catalogue length';
    assert (select count(distinct w) from unnest(v_words) w)=v_expected, 'catalogue uniqueness';
  end loop;
  assert public.visualisation_title_key('  ＰＲＩＳＭ   Café  ')=public.visualisation_title_key(U&'prism Cafe\0301'), 'Unicode and whitespace normalization';
  assert public.visualisation_slug_base('Café & Waves!')='cafe-waves', 'readable accent slug';
  assert public.visualisation_slug_base('✨')='visualisation', 'empty ASCII fallback';

  perform setseed(0.137);
  insert into public.visualisations(owner_id) values(v_owner) returning * into a;
  assert array_length(string_to_array(a.title,' '),1)=3, 'new title has three words';
  perform setseed(0.137);
  insert into public.visualisations(owner_id) values(v_owner) returning * into b;
  assert b.title<>a.title, 'generated collision retried';
  insert into public.visualisations(owner_id,forked_from_id) values(v_owner,a.id) returning * into b;
  assert b.title like a.title||' — %', 'fork suffix';
  insert into public.visualisations(owner_id,forked_from_id) values(v_owner,b.id) returning * into c;
  assert c.title like a.title||' — %', 'nested fork uses base';
  assert c.lineage_title=a.title, 'lineage survives nesting';

  update public.visualisations set title='  Café   Waves!  ' where id=a.id returning * into a;
  assert a.title='Café Waves!', 'stored cleanup';
  assert a.slug='cafe-waves', 'draft slug follows title';
  begin
    insert into public.visualisations(owner_id,title) values(v_owner,'CAFÉ WAVES!');
    raise exception 'duplicate accepted';
  exception when unique_violation then null; end;
  begin
    update public.visualisations set title=E'Bad\nTitle' where id=a.id;
    raise exception 'newline accepted';
  exception when check_violation then null; end;
  begin
    update public.visualisations set title=repeat('a',121) where id=a.id;
    raise exception 'long title accepted';
  exception when check_violation then null; end;
  begin
    update public.visualisations set title='   ' where id=a.id;
    raise exception 'blank title accepted';
  exception when check_violation then null; end;

  insert into public.visualisations(owner_id,title) values(v_owner,'Cafe Waves') returning * into b;
  assert b.slug='cafe-waves-2', 'different titles slug collision';
  update public.visualisations set visibility='public' where id=a.id returning * into a;
  v_slug:=a.slug;
  update public.visualisations set title='Changed Public Title' where id=a.id returning * into a;
  assert a.slug=v_slug, 'published slug stable';
  update public.visualisations set visibility='private',title='Changed Again' where id=a.id returning * into a;
  assert a.slug=v_slug, 'unpublishing does not unlock slug';
  delete from public.visualisations where id=a.id;
  insert into public.visualisations(owner_id,title) values(v_owner,'Café Waves!') returning * into c;
  assert c.slug='cafe-waves-3', 'deleted slug reserved';
  insert into public.visualisations(owner_id,title) values(v_owner,'11111111-1111-1111-1111-111111111111') returning * into c;
  assert c.slug like 'vis-%', 'UUID namespace protected';
  update public.visualisations set title=repeat('x',120) where id=c.id returning * into c;
  insert into public.visualisations(owner_id,forked_from_id) values(v_owner,c.id) returning * into b;
  assert length(b.title)<=120 and b.title like '% — %', 'long base safely truncated';
end;
$$;
rollback;
