import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

module = Path(__file__).with_name('auto_activate.py')
spec = importlib.util.spec_from_file_location('auto_activate', module)
auto = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auto)
RID = 'c' * 64

class AutoActivateTests(unittest.TestCase):
    def candidate(self):
        return {'version': 1, 'environment': 'staging', 'id': RID, 'assets': {'/models/a.glb': {'sha256': 'a' * 64, 'size': 42}}}

    def test_metadata_is_bounded_and_staging_only(self):
        with patch.object(auto.sys, 'stdin', SimpleNamespace(buffer=io.BytesIO(json.dumps(self.candidate()).encode()))):
            self.assertEqual(auto.candidate_from_stdin(), self.candidate())
        for bad in (b'', b'not json', b'{"environment":"production"}'):
            with patch.object(auto.sys, 'stdin', SimpleNamespace(buffer=io.BytesIO(bad))):
                with self.assertRaises((ValueError, TypeError)): auto.candidate_from_stdin()

    def test_proof_must_match_and_cannot_be_symlinked(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            file = base / 'verified.json'
            file.write_text(json.dumps({'release': self.candidate(), 'objects': {'/models/a.glb': {'layout': 'digest'}}}))
            self.assertTrue(auto.valid_proof(file, self.candidate()))
            other = self.candidate(); other['assets'] = {}
            self.assertFalse(auto.valid_proof(file, other))
            link = base / 'link.json'; link.symlink_to(file)
            self.assertFalse(auto.valid_proof(link, self.candidate()))

    def test_gateway_manifest_list_preserves_old_releases(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            old = base / 'verified-tennis-alpha.json'; old.write_text('{}')
            current = base / ('verified-' + RID + '.json'); current.write_text('{}')
            with patch.object(auto, 'BASE', base), patch.object(auto, 'LEGACY', (old,)):
                self.assertIn(current, auto.manifests_for(current))
                self.assertIn(old, auto.manifests_for(current))

    def test_failed_gateway_update_restores_old_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            old = base / 'verified-old.json'; old.write_text(json.dumps({'release': {'id': 'd' * 64}}))
            override = base / 'override.conf'; override.write_bytes(b'old working config')
            with (patch.object(auto, 'DROPIN', override), patch.object(auto, 'LEGACY', (old,)),
                  patch.object(auto, 'manifests_for', return_value=[old]),
                  patch.object(auto, 'probe', side_effect=[False, False]),
                  patch.object(auto, 'run') as run):
                with self.assertRaisesRegex(RuntimeError, 'failed'):
                    auto.activate_gateway(self.candidate(), base / 'new.json')
            self.assertEqual(override.read_bytes(), b'old working config')
            self.assertEqual(run.call_count, 4)

    def test_active_release_is_noop(self):
        with patch.object(auto, 'probe', return_value=True), patch.object(auto, 'run') as run:
            auto.activate_gateway(self.candidate(), Path('/invalid'))
            run.assert_not_called()

if __name__ == '__main__': unittest.main()
