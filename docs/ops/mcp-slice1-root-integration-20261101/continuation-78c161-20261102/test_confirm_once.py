"""Memory-only approval validation; stop before remote dispatch and never write intent."""
import ast
import hashlib
import io
import json
import runpy
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).parent
GATE = 'e5cf4d1b796568607e60052ef64bf8f4dd6839c57a78e633a051a312b344303d'
MARKER = '530937ac86ad3f5fd6825677b405f7405d9d693ae4bd9787ea82ace57892c801'


class BeforeRemoteIO(Exception):
    pass


class Confirm(unittest.TestCase):
    def synthetic_base(self):
        return {'windowId':'78c1610ecf5f43409106fb67ecd36489', 'approvedExecutionGateSHA256':GATE, 'gateSHA256':MARKER, 'defaultContainerId':'076edb49d761983f0f507d2102dbde5400b450ef38979ce16022e31fbb6fa2c0', 'defaultConfigSHA256':'011909bcc46adceb3f1defc9b769655d388413ac28d43502330bdfbc6afd588c', 'windowStartedAtMs':111000, 'deadlineMs':222000, 'authQaConfig':json.dumps({'confirmations':[], 'consentNotBefore':111000, 'expiresAt':222000})}

    def proof(self):
        return {'ownerConfirmed': True, 'sourceThreadId': '01a1803b-c5a7-7ab0-a90f-fb4f87609201',
                'sourceMessageId': 'SYNTHETIC_NOT_ACTUAL_HUMAN_APPROVAL',
                'operationId': '1d6c202d-4e1a-4be0-a3f7-e2ee158eeacf',
                'previewDigest': '1d5be7abe7b4ee323bf0631a55b8786eb5e05eddc8d1593fec8f44eb1dd6a546',
                'clientId': 'd2b8167f-ee42-4ac1-b5ef-4dc003c0d141',
                'approvedExecutionGateSHA256': GATE, 'gateSHA256': MARKER}

    def preflight(self, proof):
        raw = (json.dumps(proof, indent=3) + '\n').encode()
        approval = Path('/synthetic-not-an-approval.json')
        reads, intents, remote = [], [], []
        real_read, real_open = Path.read_bytes, Path.open

        def read(path):
            if path == approval:
                reads.append(path)
                return raw
            return real_read(path)

        class Intent(io.StringIO):
            def close(self):
                intents.append(json.loads(self.getvalue()))
                super().close()

        def local_open(path, mode='r', **kwargs):
            if path == ROOT / 'EMPTY_ROUND_INTENT.json':
                return io.StringIO(json.dumps({'request':self.synthetic_base()}))
            if path == ROOT / 'EMPTY_ROUND_RESULT.json':
                return io.StringIO(json.dumps({'result':{'status':'MCP_SLICE1_CONFIG_CAS_HEALTHY', 'defaultContainerId':self.synthetic_base()['defaultContainerId'], 'deadlineMs':222000}}))
            if mode in ('r', 'rb'):
                return real_open(path, mode, **kwargs)
            self.assertEqual(path, ROOT / 'CONFIRM_INTENT.json')
            self.assertEqual(mode, 'x')
            return Intent()

        def dispatch(source):
            remote.append(source)
            raise BeforeRemoteIO()

        module = types.ModuleType('universal_continuous_runtime_ports')
        module.remote_python = dispatch
        with patch.dict(sys.modules, universal_continuous_runtime_ports=module), \
                patch.object(Path, 'read_bytes', read), patch.object(Path, 'open', local_open), \
                patch.object(sys, 'argv', ['confirm-once.py', str(approval)]):
            try:
                runpy.run_path(str(ROOT / 'confirm-once.py'), run_name='__main__')
            except BeforeRemoteIO:
                pass
        return raw, reads, intents, remote

    def test_dual_gate_and_original_approval_bytes_bind_same_deadline(self):
        raw, reads, intents, remote = self.preflight(self.proof())
        base = self.synthetic_base()
        self.assertEqual(len(reads), 1)
        self.assertEqual(intents, [{'approvalSHA256': hashlib.sha256(raw).hexdigest(),
                                   'sourceMessageId': self.proof()['sourceMessageId'],
                                   'deadlineMs': base['deadlineMs']}])
        self.assertEqual(len(remote), 1)
        tree = ast.parse(remote[0])
        assignments = {node.targets[0].id: ast.literal_eval(node.value)
                       for node in tree.body[:3] if isinstance(node, ast.Assign)}
        self.assertEqual(assignments['APPROVAL'], raw)
        self.assertEqual(assignments['BASE']['deadlineMs'], base['deadlineMs'])
        self.assertEqual(assignments['BASE']['windowStartedAtMs'], base['windowStartedAtMs'])

    def test_old_unknown_or_confused_gate_rejects(self):
        for change in ({'approvedExecutionGateSHA256': 'b94fd543e02f5b0085fe5abe99fdc4d010a88c0c130234ba4f37b8382dde8251'},
                       {'approvedExecutionGateSHA256': MARKER}, {'approvedExecutionGateSHA256': 'unknown'},
                       {'gateSHA256': GATE}):
            with self.subTest(change=change), self.assertRaises(AssertionError):
                self.preflight(dict(self.proof(), **change))

    def test_changed_operation_digest_or_nonhuman_binding_rejects(self):
        for change in ({'operationId': 'f10713fc-d86c-456f-a4c9-929a1cced3e8'},
                       {'previewDigest': '0' * 64}, {'ownerConfirmed': False},
                       {'sourceThreadId': 'wrong'}, {'sourceMessageId': ''}):
            with self.subTest(change=change), self.assertRaises(AssertionError):
                self.preflight(dict(self.proof(), **change))

    def test_frozen_inputs_and_no_real_confirmation_artifacts(self):
        for name, sha in {'close-once.py': 'e3a90d17d037eb1c331b3af1e6f7b6cf783d53ac103c1a5122718df1385a7d8e',
                          'prepare-empty-round.py': '2d015b26245d7498934dacf58ba8ff15015d541d6ae30de182eb3e7e1cfcef0d'}.items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), sha)
        source = (ROOT / 'confirm-once.py').read_text()
        for forbidden in ('b94fd543', 'cb71e00e', '335997de', '9fd2b828', 'fbd9074e'):
            self.assertNotIn(forbidden, source)
        self.assertIn("private(r/'empty-cas.json')", source)
        for name in ('CONFIRM_INTENT.json', 'CONFIRM_RESULT.json', 'owner-approval.json'):
            self.assertFalse((ROOT / name).exists())


if __name__ == '__main__':
    unittest.main()
