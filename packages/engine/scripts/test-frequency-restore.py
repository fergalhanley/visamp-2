#!/usr/bin/env python3
"""Checks restoration provenance and preservation before generating SQL."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('restore', Path(__file__).with_name('prepare-frequency-restore.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Restoration(unittest.TestCase):
    def test_only_code_tokens_change(self):
        source = 'prop note = "$FREQUENCY_DATA" // $BEAT\nrender { let audio = $FREQUENCY_DATA let value = audio[3] / 256.0 if $BEAT { draw::clear() } }'
        result = module.convert(source)
        self.assertIn('"$FREQUENCY_DATA" // $BEAT', result)
        self.assertIn('let audio = audio::detect::get_frequency()', result)
        self.assertIn('audio[3] / 256.0', result)
        self.assertIn('if audio::detect::get_beat()', result)
        self.assertEqual(module.convert(result), result)
        self.assertEqual(module.convert('prop a = $BEAT_EXTRA'), 'prop a = $BEAT_EXTRA')

    def test_original_backup_drives_replacement_current_drives_rollback(self):
        source = 'render { let x = $FREQUENCY_DATA[1] / 256 }'
        id = '00000000-0000-4000-8000-000000000001'
        backup = [{'id': id, 'source': source, 'replacement': 'WRONG EARLIER MIGRATION', 'original_sha256': hashlib.sha256(source.encode()).hexdigest()}]
        current = [{'id': id, 'source': 'render { let experiment = 123 }', 'updated_at': '2026-09-16T00:00:00Z'}]
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'migration'
            module.restore(backup, current, output)
            manifest = json.loads((output / 'manifest.json').read_text())[0]
            self.assertEqual(manifest['source'], current[0]['source'])
            self.assertEqual(manifest['replacement'], 'render { let x = audio::detect::get_frequency()[1] / 256 }')
            self.assertIn(current[0]['source'], (output / 'rollback.sql').read_text())
            self.assertNotIn('WRONG EARLIER MIGRATION', (output / 'migrate.sql').read_text())
            self.assertEqual(json.loads((output / 'provenance.json').read_text())[0]['backup_sha256'], backup[0]['original_sha256'])
            with self.assertRaises(ValueError): module.restore(backup, [], output)
            with self.assertRaises(ValueError): module.restore(backup + backup, current, output)
            backup[0]['source'] += ' '
            with self.assertRaises(ValueError): module.restore(backup, current, output)


if __name__ == '__main__':
    unittest.main()
