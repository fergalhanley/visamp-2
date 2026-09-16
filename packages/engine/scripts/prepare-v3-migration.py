#!/usr/bin/env python3
"""Prepare guarded SQL from a private JSON export of id/source/updated_at.
Usage: prepare-v3-migration.py SNAPSHOT OUTPUT_DIRECTORY
Reads data only. Run SQL separately after deploying engine 3.0.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[3]

def quote(value):
    # SQL literals with standard_conforming_strings enabled below.
    return "'" + str(value).replace("'", "''") + "'"

def prepare(rows, output):
    ids = [r['id'] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate source IDs in snapshot')
    manifest = []
    for row in rows:
        result = subprocess.run([ROOT / 'target/release/visamp-migrate-v3'], input=row['source'], text=True, capture_output=True)
        if result.returncode:
            raise ValueError(f"Migration failed for {row['id']}: {result.stderr}")
        if result.stdout == row['source']:
            continue
        manifest.append({**row, 'replacement': result.stdout, 'original_sha256': hashlib.sha256(row['source'].encode()).hexdigest(), 'replacement_sha256': hashlib.sha256(result.stdout.encode()).hexdigest()})
    output.mkdir(parents=True, exist_ok=True)
    os.chmod(output, 0o700)
    def sql(rollback=False):
        sql = ["-- Generated from a reviewed snapshot. Contains private source: do not commit.",
               "-- Requires Visript 3.0 for forward migration; rollback restores 2.x syntax.",
               "begin;", "set local standard_conforming_strings = on;",
               "lock table public.visualisations in share row exclusive mode;",
               "create temporary table visript_v3_changes (id uuid primary key, original text not null, replacement text not null, original_updated_at timestamptz) on commit drop;"]
        for row in manifest:
            old, new = (row['replacement'], row['source']) if rollback else (row['source'], row['replacement'])
            revision = 'null' if rollback else quote(row['updated_at'])
            sql.append('insert into visript_v3_changes values (' + ', '.join([quote(row['id']), quote(old), quote(new), revision]) + ');')
        sql += ["""do $migration$
begin
  if exists (
    select 1 from visript_v3_changes m left join public.visualisations v on v.id = m.id
    where v.id is null or (v.source is distinct from m.replacement and
      (v.source is distinct from m.original or
       (m.original_updated_at is not null and v.updated_at is distinct from m.original_updated_at)))
  ) then
    raise exception 'Visript migration conflict: source changed or row removed. No rows updated; regenerate from a fresh snapshot.';
  end if;
end $migration$;
update public.visualisations v set source = m.replacement
from visript_v3_changes m
where v.id = m.id and v.source = m.original and v.source is distinct from m.replacement;
do $verification$
begin
  if exists (select 1 from visript_v3_changes m join public.visualisations v on v.id = m.id where v.source is distinct from m.replacement) then
    raise exception 'Visript migration readback mismatch';
  end if;
end $verification$;
select count(*) as verified_sources from visript_v3_changes;
commit;"""]
        return '\n'.join(sql) + '\n'
    for name, data in [('manifest.json',json.dumps(manifest,indent=2)), ('migrate.sql',sql()), ('rollback.sql',sql(True))]:
        path = output / name
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(data)
        os.chmod(path, 0o600)
    print(json.dumps({'inspected':len(rows),'changed':len(manifest),'output':str(output)}))

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    prepare(json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2]))
