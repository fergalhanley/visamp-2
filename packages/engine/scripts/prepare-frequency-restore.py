#!/usr/bin/env python3
"""Restore backed-up sources with the byte-frequency API; generate SQL only.
Usage: prepare-frequency-restore.py ORIGINAL_MANIFEST CURRENT_SNAPSHOT OUTPUT_DIRECTORY
The original manifest must be the pre-4.0 backup (its `source` fields).
Current revisions guard SQL; rollback restores the current experimental sources.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import uuid

spec = importlib.util.spec_from_file_location('prepare', Path(__file__).with_name('prepare-v4-migration.py'))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


def convert(source):
    # Strings and line comments are atomic in Visript. Change only code tokens;
    # leave all original frequency arithmetic, aliases and history units intact.
    parts = re.split(r'("(?:\\.|[^"\\])*"|//[^\n]*)', source)
    names = {'FREQUENCY_DATA': 'get_frequency', 'TIME_DOMAIN_DATA': 'get_waveform', 'BEAT': 'get_beat'}
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r'\$(FREQUENCY_DATA|TIME_DOMAIN_DATA|BEAT)\b', lambda m: 'audio::detect::' + names[m[1]] + '()', parts[i])
    return ''.join(parts)


def restore(originals, current, output):
    def index(rows):
        result = {}
        for row in rows:
            uuid.UUID(row['id'])
            if row['id'] in result:
                raise ValueError('Duplicate source ID')
            result[row['id']] = row
        return result
    backup, live = index(originals), index(current)
    if backup.keys() != live.keys():
        raise ValueError('Backup and current inventories differ; review new/deleted rows before restoring')
    reviewed = output / 'converted'
    reviewed.mkdir(parents=True, exist_ok=True)
    os.chmod(output, 0o700)
    os.chmod(reviewed, 0o700)
    provenance = []
    for id, row in backup.items():
        source = row['source']  # Never use the earlier migration's replacement.
        if hashlib.sha256(source.encode()).hexdigest() != row['original_sha256']:
            raise ValueError('Original backup checksum mismatch: ' + id)
        replacement = convert(source)
        # Reviewed exceptions from VIS-107: waveform units/length and an
        # uninitialised beat property. They do not alter frequency arithmetic.
        if id == 'cd1596df-0313-45fd-806d-38b55bf58751':
            changes = [('total = total + v/256', 'total = total + (v + 1.0) / 2.0'), ('i % 16', 'i % 8'), ('total / 16', 'total / 8'), ('width: v / $WIDTH * 8', 'width: (v + 1.0) * 128.0 / $WIDTH * 8')]
            for old, new in changes:
                if replacement.count(old) != 1:
                    raise ValueError('Waveform backup differs from reviewed source')
                replacement = replacement.replace(old, new)
        elif '$TIME_DOMAIN_DATA' in ''.join(re.split(r'("(?:\\.|[^"\\])*"|//[^\n]*)', source)[::2]):
            raise ValueError('Additional waveform source needs unit/length review: ' + id)
        if id == 'ca16e563-2a19-4631-ba3d-e30033d9f75a':
            if replacement.count('prop barCount = 17') != 1:
                raise ValueError('Beat backup differs from reviewed source')
            replacement = replacement.replace('prop barCount = 17', 'prop barCount = 17\nprop beatIndex = -1')
        path = reviewed / (id + '.viscript')
        path.write_text(replacement)
        os.chmod(path, 0o600)
        provenance.append({'id': id, 'backup_sha256': row['original_sha256'], 'current_sha256': hashlib.sha256(live[id]['source'].encode()).hexdigest(), 'replacement_sha256': hashlib.sha256(replacement.encode()).hexdigest()})
    prepare.prepare(current, reviewed, output)
    path = output / 'provenance.json'
    path.write_text(json.dumps(provenance, indent=2))
    os.chmod(path, 0o600)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    restore(json.loads(Path(sys.argv[1]).read_text()), json.loads(Path(sys.argv[2]).read_text()), Path(sys.argv[3]))
