import json
import unittest
from unittest.mock import patch

import owning_host_probe as probe


class PgFenceProofTest(unittest.TestCase):
    def test_activity_requires_normalized_legacy_pg_proof(self):
        o = probe.Observer.__new__(probe.Observer)
        o.phase = "reopen"
        o.binding = {"executionId": "execution", "leaseId": "lease", "planSHA256": "a" * 64}
        o.context = {"windowStartEpoch": 100, "launcherInventorySHA256": "b" * 64,
                     "owningActivityReader": {"path": "/fixture", "sha256": probe.digest(b"fixture")}}
        proof = {
            "roleMatrixSHA256": "c" * 64, "controlSHA256": "d" * 64, "pdfPinsSHA256": "e" * 64,
            "directSource": "DENIED", "directModelTask": "DENIED", "heldPool": "DENIED",
            "freshPool": "DENIED", "recheckoutPool": "DENIED",
            "pdfA": "RECLAIM_AND_FINALIZE_DENIED", "pdfB": "RECLAIM_AND_FINALIZE_DENIED",
            "noAdmittedOrPreparedWork": True,
        }
        pin = probe.digest(probe.canonical(proof))
        o.host = {"aperture": {"legacyPGFenceSHA256": pin}}
        row = {
            **o.binding, **dict.fromkeys(probe.COUNTS, 0), "phase": o.phase, "observedAt": 102,
            "launcherInventorySHA256": "b" * 64, "terminalAuthority": "BACKEND_REQUEST_TERMINAL_WATERMARK",
            "acceptedSequence": 2, "terminalSequence": 2, "coverageStartEpoch": 100,
            "bScope": "CLOSED_THROUGH_WINDOW", "protectedPgSHA256": "f" * 64,
            "legacyPGFenceSHA256": pin,
        }
        def verify(value):
            o.run = lambda *_args, **_kwargs: json.dumps(value).encode()
            return o.activity()
        def reject(value):
            with self.assertRaisesRegex(ValueError, "C01_LEGACY_PG_PDF_EXCLUSION_UNPROVED"):
                verify(value)
        with patch.object(probe, "private", return_value=b"fixture"), patch.object(probe.time, "time", return_value=103):
            reject(row)
            self.assertEqual(verify({**row, "legacyPGFence": proof})["legacyPGFenceSHA256"], pin)
            for delta in ({"heldPool": "UNKNOWN"}, {"recheckoutPool": "UNKNOWN"},
                          {"pdfB": "UNKNOWN"}, {"noAdmittedOrPreparedWork": 1},
                          {"roleMatrixSHA256": "0" * 64}):
                reject({**row, "legacyPGFence": {**proof, **delta}})
            reject({**row, "legacyPGFence": {k: v for k, v in proof.items() if k != "pdfA"}})

    def test_preflight_accepts_only_pinned_read_only_preimage(self):
        proof = {"roleMatrixSHA256": "a" * 64, "controlPreimageSHA256": "b" * 64,
                 "pdfPinsSHA256": "c" * 64}
        pin = probe.digest(probe.canonical(proof))
        row = {"legacyPGPreimage": proof, "legacyPGPreimageSHA256": pin}
        self.assertTrue(probe.legacy_pg_preimage_bound(row, pin))
        self.assertFalse(probe.legacy_pg_preimage_bound({"legacyPGPreimageSHA256": pin}, pin))
        self.assertFalse(probe.legacy_pg_fence_bound(row, pin))

    def test_read_only_preflight_cannot_authorize_drain(self):
        o = probe.Observer.__new__(probe.Observer)
        o.phase = "preflight"
        o.binding = {"executionId": "execution", "leaseId": "lease", "planSHA256": "a" * 64}
        proof = {"roleMatrixSHA256": "b" * 64, "controlPreimageSHA256": "c" * 64,
                 "pdfPinsSHA256": "d" * 64}
        pin = probe.digest(probe.canonical(proof))
        o.context = {"windowStartEpoch": 100, "launcherInventorySHA256": "e" * 64,
                     "legacyPGPreimageSHA256": pin,
                     "owningActivityReader": {"path": "/fixture", "sha256": probe.digest(b"fixture")}}
        o.host = {"aperture": {"legacyPGFenceSHA256": "0" * 64}}
        row = {**o.binding, "phase": o.phase, "observedAt": 102,
               "launcherInventorySHA256": "e" * 64, "protectedPgSHA256": "f" * 64,
               "activityAuthority": "BASELINE_READ_ONLY", "legacyPGPreimage": proof,
               "legacyPGPreimageSHA256": pin}
        with patch.object(probe, "private", return_value=b"fixture"), patch.object(probe.time, "time", return_value=103):
            o.run = lambda *_args, **_kwargs: json.dumps(row).encode()
            self.assertEqual(o.activity()["legacyPGPreimageSHA256"], pin)
            o.phase = row["phase"] = "drain"
            with self.assertRaisesRegex(ValueError, "OWNING_REQUEST_TERMINAL_EVIDENCE_UNPROVED"):
                o.activity()
            row.update(dict.fromkeys(probe.COUNTS, 0), terminalAuthority="BACKEND_REQUEST_TERMINAL_WATERMARK",
                       acceptedSequence=3, terminalSequence=2, coverageStartEpoch=100,
                       bScope="CLOSED_THROUGH_WINDOW")
            with self.assertRaisesRegex(ValueError, "OWNING_REQUEST_TERMINAL_EVIDENCE_UNPROVED"):
                o.activity()
            row["terminalSequence"] = 3
            with self.assertRaisesRegex(ValueError, "C01_LEGACY_PG_PDF_EXCLUSION_UNPROVED"):
                o.activity()
