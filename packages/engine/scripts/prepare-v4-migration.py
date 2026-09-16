#!/usr/bin/env python3
"""Prepare guarded SQL from a private JSON export of id/source/updated_at.
Usage: prepare-v4-migration.py SNAPSHOT REVIEWED_SOURCES_DIRECTORY OUTPUT_DIRECTORY
Reads reviewed <id>.viscript replacements; performs no source rewriting or DB I/O.
Run SQL separately with engine/validator 4.0. All snapshot IDs need a reviewed file.
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

def prepare(rows, reviewed, output):
    version = subprocess.check_output([ROOT / 'target/release/visamp-validate', '--version'], text=True).strip()
    if not version.startswith('4.'):
        raise ValueError('Build engine 4.x before preparing this migration')
    ids = [r['id'] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate source IDs in snapshot')
    manifest = []
    expected = {r['id'] + '.viscript' for r in rows}
    actual = {p.name for p in reviewed.glob('*.viscript')}
    if actual != expected:
        raise ValueError('Reviewed source files must match every snapshot ID exactly')
    for row in rows:
        # UUID validation prevents paths outside the reviewed directory.
        import uuid
        uuid.UUID(row['id'])
        replacement = (reviewed / (row['id'] + '.viscript')).read_text()
        result = subprocess.run([ROOT / 'target/release/visamp-validate'], input=replacement, text=True, capture_output=True)
        if result.returncode:
            raise ValueError(f"Validation failed for {row['id']}: {result.stdout} {result.stderr}")
        manifest.append({**row, 'replacement': replacement, 'original_sha256': hashlib.sha256(row['source'].encode()).hexdigest(), 'replacement_sha256': hashlib.sha256(replacement.encode()).hexdigest()})
    output.mkdir(parents=True, exist_ok=True)
    os.chmod(output, 0o700)
    def sql(rollback=False):
        sql = ["-- Generated from a reviewed snapshot. Contains private source: do not commit.",
               "-- Requires Visript 4.0 for forward migration; rollback restores 3.1 syntax.",
               "begin;", "set local standard_conforming_strings = on;",
               "lock table public.visualisations in share row exclusive mode;",
               "create temporary table visript_v4_changes (id uuid primary key, original text not null, replacement text not null, original_updated_at timestamptz) on commit drop;"]
        for row in manifest:
            old, new = (row['replacement'], row['source']) if rollback else (row['source'], row['replacement'])
            revision = 'null' if rollback else quote(row['updated_at'])
            sql.append('insert into visript_v4_changes values (' + ', '.join([quote(row['id']), quote(old), quote(new), revision]) + ');')
        if not rollback:
            sql.append("""do $inventory$
begin
  if exists (select id from public.visualisations except select id from visript_v4_changes) then
    raise exception 'Visript migration inventory changed: new rows require a fresh export and review.';
  end if;
end $inventory$;""")
        sql += ["""do $migration$
begin
  if exists (
    select 1 from visript_v4_changes m left join public.visualisations v on v.id = m.id
    where v.id is null or (v.source is distinct from m.replacement and
      (v.source is distinct from m.original or
       (m.original_updated_at is not null and v.updated_at is distinct from m.original_updated_at)))
  ) then
    raise exception 'Visript migration conflict: source changed or row removed. No rows updated; regenerate from a fresh snapshot.';
  end if;
end $migration$;
update public.visualisations v set source = m.replacement
from visript_v4_changes m
where v.id = m.id and v.source = m.original and v.source is distinct from m.replacement;
do $verification$
begin
  if exists (select 1 from visript_v4_changes m join public.visualisations v on v.id = m.id where v.source is distinct from m.replacement) then
    raise exception 'Visript migration readback mismatch';
  end if;
end $verification$;
select count(*) as verified_sources from visript_v4_changes;
commit;"""]
        return '\n'.join(sql) + '\n'
    for name, data in [('manifest.json',json.dumps(manifest,indent=2)), ('migrate.sql',sql()), ('rollback.sql',sql(True))]:
        path = output / name
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(data)
        os.chmod(path, 0o600)
    print(json.dumps({'inspected':len(rows),'changed':sum(r['source'] != r['replacement'] for r in manifest),'output':str(output)}))

if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    prepare(json.loads(Path(sys.argv[1]).read_text()), Path(sys.argv[2]), Path(sys.argv[3]))
