import hashlib
import unittest
from pathlib import Path
from render_compat import render, OLD_MARKER, NEW_MARKER, OLD_GUARD, NEW_GUARD, SOURCE_SHA256

class CompatibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (Path(__file__).resolve().parent.parent / "pg-candidate/MEMBER_CLAIM_CANDIDATE.sql").read_bytes()

    def test_only_marker_and_role_guard_change(self):
        result = render(self.source).decode()
        self.assertEqual(result.replace(NEW_MARKER, OLD_MARKER).replace(NEW_GUARD, OLD_GUARD).encode(), self.source)
        self.assertNotIn(OLD_MARKER, result)
        self.assertNotIn(OLD_GUARD, result)

    def test_installed_objects_functions_and_privileges_are_identical(self):
        anchor = b"CREATE TABLE public.trip_directed_invite_targets"
        self.assertEqual(render(self.source).split(anchor, 1)[1], self.source.split(anchor, 1)[1])
        self.assertEqual(hashlib.sha256(self.source).hexdigest(), SOURCE_SHA256)

    def test_drifted_original_and_compat_input_are_rejected(self):
        for changed in [self.source + b"\n", render(self.source), self.source.replace(b"LIMIT 1", b"LIMIT 2") + b"-- changed"]:
            with self.assertRaisesRegex(ValueError, "APPROVED_SOURCE_BYTES_REQUIRED"):
                render(changed)

    def test_role_guard_is_login_only_without_extra_authority(self):
        self.assertIn("AND rolcanlogin", NEW_GUARD)
        for flag in ["rolsuper", "rolbypassrls", "rolinherit", "rolcreatedb", "rolcreaterole", "rolreplication"]:
            self.assertIn("AND NOT " + flag, NEW_GUARD)
        self.assertNotIn("ALTER ROLE", render(self.source).decode())

if __name__ == "__main__":
    unittest.main()
