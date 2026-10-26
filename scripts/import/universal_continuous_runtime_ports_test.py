"""Adapters are inert without explicit invocation; no remote/DEV acceptance."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import universal_continuous_runtime_ports as m


class PortsTests(unittest.TestCase):
    def test_unknown_never_exposes_private_output(self):
        with patch.object(m.subprocess, 'run', return_value=SimpleNamespace(returncode=2, stdout='PRIVATE', stderr='PRIVATE')):
            with self.assertRaisesRegex(RuntimeError, '^REMOTE_RUNTIME_UNCONFIRMED$'):
                m.remote_python('fixture')

    def test_command_argv_fixed_and_sealed_with_no_credentials(self):
        p = {'operatorPlanSHA256': 'a' * 64, 'runtime': {'imageId': 'sha256:' + 'b' * 64}}
        with patch.object(m.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=json.dumps({'status': 'ACKNOWLEDGED_REQUIRES_INDEPENDENT_READBACK'}))) as run:
            m.admin_command(p, 'closeCommands', 0)
            args = run.call_args.args[0]
            self.assertNotIn('access_token', ' '.join(args))
            self.assertEqual(args[-3:], ['closeCommands', '0', 'a' * 64])
        with self.assertRaises(ValueError):
            m.admin_command(p, 'arbitrary', 0)

    def test_restore_reuses_existing_engine_and_checks_exact_baseline(self):
        with patch.object(m, 'remote_python', return_value={'status': 'RETAINED_ORIGINAL_RESTORED_VERIFIED'}) as remote:
            m.restore_retained({'runtime': {}})
            source = remote.call_args.args[0]
            self.assertIn('restore_retained(plan,call,check)', source)
            self.assertIn("snapshot['Image']!=image", source)

    def test_candidate_create_uses_actual_supported_api_and_reports_only_safe_status(self):
        with patch.object(m, 'remote_python', return_value={'status': 'CREATE_REJECTED_RECONCILE_READONLY', 'httpStatus': 400}) as remote:
            with self.assertRaisesRegex(RuntimeError, 'HTTP_400'):
                m.stage_candidate('92969ddc-58f7-4dbc-ad38-ac365f2b5c2f')
            self.assertIn('/v1.47/containers/create', remote.call_args.args[0])
