"""Memory-only preflight checks: no request/intent/result files, SSH or clock activation."""
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


class Preflight(unittest.TestCase):
    def request(self):
        return {
            'phase': 'EMPTY', 'clientProfile': 'Claude',
            'windowId': '78c1610ecf5f43409106fb67ecd36489', 'gateSHA256': GATE,
            'jointCloseReady': True, 'issuerCloseIndependentOfRuntimeId': True,
            'defaultContainerId': '076edb49d761983f0f507d2102dbde5400b450ef38979ce16022e31fbb6fa2c0',
            'defaultConfigSHA256': '011909bcc46adceb3f1defc9b769655d388413ac28d43502330bdfbc6afd588c',
            # Synthetic sentinel values only, never a proposed real T/D.
            'windowStartedAtMs': 111000, 'deadlineMs': 222000,
            'authQaConfig': json.dumps({'confirmations': [], 'version': 4,
                                       'consentNotBefore': 111000, 'expiresAt': 222000}),
        }

    def preflight(self, value):
        raw = (json.dumps(value, indent=3) + '\n').encode()
        reads = []
        intents = []
        remote_payloads = []
        real_read = Path.read_bytes
        real_open = Path.open
        request_path = Path('/synthetic-auth-request.json')

        def read(path):
            if path == request_path:
                reads.append(path)
                return raw
            return real_read(path)

        class Intent(io.StringIO):
            def close(self):
                intents.append(json.loads(self.getvalue()))
                super().close()

        def local_open(path, mode='r', **kwargs):
            if mode in ('r', 'rb'):
                return real_open(path, mode, **kwargs)
            self.assertEqual(path, ROOT / 'EMPTY_ROUND_INTENT.json')
            self.assertEqual(mode, 'x')
            return Intent()

        def remote(source):
            remote_payloads.append(source)
            raise BeforeRemoteIO()

        module = types.ModuleType('universal_continuous_runtime_ports')
        module.remote_python = remote
        with patch.dict(sys.modules, universal_continuous_runtime_ports=module), \
                patch.object(Path, 'read_bytes', read), patch.object(Path, 'open', local_open), \
                patch.object(sys, 'argv', ['prepare-empty-round.py', str(request_path)]):
            try:
                runpy.run_path(str(ROOT / 'prepare-empty-round.py'), run_name='__main__')
            except BeforeRemoteIO:
                pass
        return raw, reads, intents, remote_payloads

    def test_real_gate_is_separate_and_auth_bytes_and_sentinel_td_are_preserved(self):
        raw, reads, intents, remote = self.preflight(self.request())
        self.assertEqual(len(reads), 1)
        self.assertEqual(len(intents), 1)
        intent = intents[0]
        self.assertEqual(intent['requestSHA256'], hashlib.sha256(raw).hexdigest())
        self.assertFalse(intent['notesApproval'])
        normalized = intent['request']
        self.assertEqual(normalized['gateSHA256'], MARKER)
        self.assertEqual(normalized['approvedExecutionGateSHA256'], GATE)
        self.assertEqual(normalized['windowStartedAtMs'], 111000)
        self.assertEqual(normalized['deadlineMs'], 222000)
        self.assertEqual(len(remote), 1)
        ast.parse(remote[0])  # Compile only; the Host program is never evaluated.

    def test_old_software_and_unknown_gates_reject_before_intent_or_remote(self):
        for gate in (MARKER, 'b94fd543e02f5b0085fe5abe99fdc4d010a88c0c130234ba4f37b8382dde8251', 'unknown'):
            with self.subTest(gate=gate), self.assertRaises(AssertionError):
                self.preflight(dict(self.request(), gateSHA256=gate))

    def test_wrong_nonce_default_or_nonempty_confirmations_reject(self):
        changes = ({'windowId': '8' * 32}, {'defaultContainerId': '8' * 64},
                   {'defaultConfigSHA256': '8' * 64}, {'jointCloseReady': False},
                   {'authQaConfig': json.dumps({'version': 4, 'confirmations': [{}]})})
        for change in changes:
            with self.subTest(change=change), self.assertRaises(AssertionError):
                self.preflight(dict(self.request(), **change))

    def test_fresh_template_only_and_no_real_window_artifacts(self):
        source = (ROOT / 'prepare-empty-round.py').read_text()
        ast.parse(source)
        self.assertIn('core-pool-138bd0b5-20261102/deploy-plan.json', source)
        self.assertIn('sha256:cdd762ea99b53fd21330dfe09df157b727b89e7a7c5e4e4da2c2487796364102', source)
        for forbidden in ('b94fd543', 'fbd9074e', 'cb71e00e', '9fd2b828', '80dd'):
            self.assertNotIn(forbidden, source)
        self.assertFalse((ROOT / 'EMPTY_ROUND_INTENT.json').exists())
        self.assertFalse((ROOT / 'EMPTY_ROUND_RESULT.json').exists())


if __name__ == '__main__':
    unittest.main()
