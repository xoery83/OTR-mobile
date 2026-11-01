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
GATE = 'f93df0f8f6c37b74ca66930db9053b7ed8b0e7d5c3badbbaa10861a23b5f1d79'
MARKER = '530937ac86ad3f5fd6825677b405f7405d9d693ae4bd9787ea82ace57892c801'


class BeforeRemoteIO(Exception):
    pass


class Preflight(unittest.TestCase):
    def request(self):
        return {
            'phase': 'EMPTY', 'clientProfile': 'Claude',
            'windowId': '7cb5cd285a774df8bc71375c6890bce4', 'gateSHA256': GATE,
            'jointCloseReady': True, 'issuerCloseIndependentOfRuntimeId': True,
            'defaultContainerId': 'a1d0993ea215c4bb6f1ca554c2f5536d1ce8c1925374a06d867c36d44c21effd',
            'defaultConfigSHA256': '9a88efaac354f37c8863f48d1ac8c5c9ecf5b3368a3bdbd6e7dade955d19caba',
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
        self.assertIn('mcp-read-diag-609184bb-20261102/deploy-plan.json', source)
        self.assertIn('sha256:1c5d8f83d57ca9d704cfc947e908c3fa6d90ff8fbf16327e775201bdced4c39b', source)
        for forbidden in ('b94fd543', 'fbd9074e', 'cb71e00e', '9fd2b828', '80dd'):
            self.assertNotIn(forbidden, source)
        self.assertFalse((ROOT / 'EMPTY_ROUND_INTENT.json').exists())
        self.assertFalse((ROOT / 'EMPTY_ROUND_RESULT.json').exists())


if __name__ == '__main__':
    unittest.main()
