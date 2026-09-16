#!/usr/bin/env python3
"""Integration check in a disposable database, never the application's database.
Usage: test-v4-migration.py [postgres-container]
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

spec = importlib.util.spec_from_file_location('prepare', Path(__file__).with_name('prepare-v4-migration.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
container = sys.argv[1] if len(sys.argv) > 1 else 'supabase_db_visamp-2'
database = 'visript_test_' + uuid.uuid4().hex

def command(*args, **kwargs):
    return subprocess.run(['docker','exec','-i',container,*args], text=True,capture_output=True,**kwargs)

def sql(source, ok=True):
    result = command('psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At',input=source)
    assert (result.returncode == 0) == ok, result.stderr
    return result.stdout.strip()

command('createdb','-U','postgres',database,check=True)
try:
    with tempfile.TemporaryDirectory() as temp:
        rows = [dict(id='00000000-0000-4000-8000-000000000001',source='render { let s = $FREQUENCY_DATA[0] / 255.0 }',updated_at='2026-09-16T00:00:00Z'),dict(id='00000000-0000-4000-8000-000000000002',source='render { if $BEAT { draw::clear() } }',updated_at='2026-09-16T00:00:00Z')]
        output=Path(temp)/'migration'
        reviewed=Path(temp)/'reviewed';reviewed.mkdir()
        for row in rows:
            (reviewed/(row['id']+'.viscript')).write_text(row['source'].replace('$FREQUENCY_DATA[0] / 255.0','audio::detect::get_spectrum()[0]').replace('$BEAT','audio::detect::get_beat()'))
        module.prepare(rows,reviewed,output)
        sql('create table public.visualisations(id uuid primary key, source text, updated_at timestamptz, title text default \'preserve\');')
        for row in rows:
            sql('insert into public.visualisations(id,source,updated_at) values ('+', '.join(module.quote(row[k]) for k in ['id','source','updated_at'])+');')
        forward=(output/'migrate.sql').read_text();rollback=(output/'rollback.sql').read_text()
        sql(forward); sql(forward)
        assert sql("select count(*) from public.visualisations where source like '%$FREQUENCY_DATA%' or source like '%$BEAT%';")=='0'
        assert sql("select count(*) from public.visualisations where title = 'preserve';")=='2'
        sql(rollback);sql(rollback)
        assert sql("select source from public.visualisations order by id limit 1;")==rows[0]['source']
        sql("update public.visualisations set updated_at = now() where id = '00000000-0000-4000-8000-000000000002';")
        sql(forward,ok=False)
        assert sql("select source from public.visualisations order by id limit 1;")==rows[0]['source']
        sql("update public.visualisations set updated_at = '2026-09-16T00:00:00Z';")
        sql(forward)
        sql("update public.visualisations set source = 'render {}' where id = '00000000-0000-4000-8000-000000000002';")
        sql(rollback,ok=False)
        assert 'audio::detect::get_spectrum()' in sql("select source from public.visualisations order by id limit 1;")
        sql("delete from public.visualisations where id = '00000000-0000-4000-8000-000000000002';")
        sql(forward,ok=False)
        sql('insert into public.visualisations(id,source,updated_at) values ('+', '.join(module.quote(rows[1][k]) for k in ['id','source','updated_at'])+');')
        sql(forward)
        sql("insert into public.visualisations values ('00000000-0000-4000-8000-000000000003', 'render {}', now(), 'preserve');")
        sql(forward,ok=False)
        invalid=reviewed/(rows[0]['id']+'.viscript')
        invalid.write_text('render { let s = $FREQUENCY_DATA }')
        try: module.prepare(rows,reviewed,output)
        except ValueError: pass
        else: raise AssertionError('Old globals accepted')
        invalid.unlink()
        try: module.prepare(rows,reviewed,output)
        except ValueError: pass
        else: raise AssertionError('Missing reviewed source accepted')
        print('PASS: removed/new rows, invalid/missing replacements, forward, rerun, rollback, metadata preservation, revision conflict, atomic abort and rollback conflict')
finally:
    command('dropdb','-U','postgres',database,check=True)
