"""Pure fixed-render checks; no database or network calls."""
import hashlib
import unittest
from unittest.mock import patch
from render_install import ROOT, SOURCES, OLD_GATE, GATE, render


class FixedRender(unittest.TestCase):
    def test_only_the_fixed_body_and_gate_differ(self):
        old_body, old_install, aka_body = [(ROOT / name).read_text() for name in SOURCES]
        candidate = render()
        self.assertEqual(candidate.count(aka_body), 1)
        self.assertEqual(candidate.count(GATE), 1)
        self.assertNotIn(OLD_GATE, candidate)
        self.assertEqual(candidate.replace(aka_body, old_body).replace(GATE, OLD_GATE), old_install)
        self.assertEqual(hashlib.sha256(candidate.encode()).hexdigest(),
                         'c84671f456f4b0a850ae14dec9bf842b769cbab419e6398d1fefc1422ce6420d')

    def test_any_source_drift_fails_closed(self):
        with patch('pathlib.Path.read_bytes', return_value=b'drifted source'):
            with self.assertRaisesRegex(ValueError, 'FROZEN_PROFILE_SOURCE_MISMATCH'):
                render()


if __name__ == '__main__':
    unittest.main()
