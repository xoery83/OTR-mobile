"""Focused safe log preservation. No Root, Docker, network, OAuth or business IO."""
import ast
import json
from pathlib import Path
import runpy
import stat
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

with patch('subprocess.run', side_effect=AssertionError('IMPORT_MUST_NOT_EXECUTE')):
    m = runpy.run_path(str(Path(__file__).with_name('c02-close.py')), run_name='close_test')

POINTER = {'windowId': 'e32551d418f54fcdb02d9783eb4c2f9c', 'currentContainerId': 'a' * 64, 'defaultContainerId': 'b' * 64}
FILENAME = 'mcp-request-trace-' + POINTER['currentContainerId'] + '.json'
CONFIG = json.dumps({'plan': {'startsAt': 1793679613655, 'windowId': 'e32551d4-18f5-4fcd-b02d-9783eb4c2f9c'}}).encode()

class Trace(unittest.TestCase):
    def test_only_safe_mcp_summary_is_preserved_once(self):
        calls = []
        event = {'requestId': 'ef4562cf-f928-44ee-b160-cd03072c4072', 'status': 401, 'durationMs': 14,
                 'tool': 'get_otr_operating_guide', 'errorCode': 'AUTH_REQUIRED',
                 'authorization': 'Bearer SECRET_CANARY', 'params': {'notes': 'PRIVATE_CANARY'},
                 'url': 'https://private.invalid/?token=SECRET_CANARY'}
        line = '2026-11-03T04:43:00.123456789Z MCP_QA_REQUEST ' + json.dumps(event)
        bad = dict(event, requestId='SECRET_CANARY')
        output = '\n'.join([line, '2026-11-03T04:43:00Z unrelated PRIVATE_CANARY',
                            '2026-11-03T04:43:00Z MCP_QA_REQUEST not-json',
                            '2026-11-03T04:43:00Z MCP_QA_REQUEST ' + json.dumps(bad)])
        def run(args, **kwargs):
            calls.append((args, kwargs))
            return types.SimpleNamespace(stdout=output)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = m['capture_request_trace'](root, POINTER, lambda _: CONFIG, run)
            self.assertEqual(result['status'], 'SANITIZED_REQUEST_TRACE_PRESERVED')
            self.assertEqual(result['records'], 1)
            raw = (root / FILENAME).read_text()
            self.assertNotIn('CANARY', raw)
            self.assertNotIn('params', raw)
            self.assertNotIn('authorization', raw)
            self.assertEqual(stat.S_IMODE((root / FILENAME).stat().st_mode), 0o600)
            self.assertEqual(json.loads(raw)['records'][0]['status'], 401)
            self.assertEqual(calls[0][0][-1], POINTER['currentContainerId'])
            self.assertIn('--since', calls[0][0])
            self.assertEqual(calls[0][1]['timeout'], 5)
            self.assertEqual(m['capture_request_trace'](root, POINTER, lambda _: CONFIG, run)['status'], 'ALREADY_PRESENT_NOT_OVERWRITTEN')
            self.assertEqual(len(calls), 1)
            self.assertEqual((root / FILENAME).read_text(), raw)

    def test_preserves_only_correlated_strict_response_proof(self):
        common = {'requestId': 'ef4562cf-f928-44ee-b160-cd03072c4072', 'status': 200, 'durationMs': 2}
        hashes = {'version': 'otr.mcp.response-proof/1', 'inputSHA256': 'a' * 64, 'outputSHA256': 'b' * 64}
        for tool in ('get_trip_item_edit_base', 'create_trip_item', 'update_trip_item'):
            proof = dict(hashes, kind='EDIT_BASE') if tool == 'get_trip_item_edit_base' else dict(hashes, kind='PREVIEW', previewDigest='c' * 64)
            valid = dict(common, tool=tool, responseProof=proof)
            invalid = [dict(valid, status=401), dict(valid, errorCode='AUTH_REQUIRED'), dict(valid, authFailureSource='BACKEND_401'), dict(valid, tool='list_trips')]
            for bad in (dict(proof, inputSHA256='SECRET_CANARY'), dict(proof, rawBody='SECRET_CANARY'), dict(proof, version='other'), dict(proof, kind='APPLIED')):
                invalid.append(dict(valid, responseProof=bad))
            invalid.append(dict(valid, responseProof=dict(proof, previewDigest=None)))
            events = [dict(valid, authorization='SECRET_CANARY')] + invalid
            raw = '\n'.join('2026-11-03T04:43:00Z MCP_QA_REQUEST ' + json.dumps(e) for e in events)
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                result = m['capture_request_trace'](root, POINTER, lambda _: CONFIG, lambda *a, **kw: types.SimpleNamespace(stdout=raw))
                self.assertEqual(result['records'], len(events))
                text = (root / FILENAME).read_text()
                records = json.loads(text)['records']
                self.assertEqual(records[0]['responseProof'], proof)
                self.assertTrue(all('responseProof' not in v for v in records[1:]))
                self.assertNotIn('CANARY', text)

    def test_core_categories_are_preserved_without_raw_data_or_operation_attribution(self):
        events = [
            {'event': 'core_execution_failed', 'resource': 'COMMAND', 'category': 'CORE_CONNECTION_TIMEOUT',
             'driverCode': '57014', 'message': 'SECRET_CANARY', 'operationId': 'PRIVATE_CANARY'},
            {'event': 'core_validation_failed', 'resource': 'commands', 'method': 'POST', 'cause': 'SCHEMA',
             'issues': [{'path': ['PRIVATE_CANARY']}], 'body': 'SECRET_CANARY'},
            {'event': 'core_execution_failed', 'resource': 'PRIVATE_CANARY', 'category': ['SECRET_CANARY'], 'driverCode': 'SECRET_CANARY'},
            {'event': 'unrelated', 'message': 'SECRET_CANARY'},
        ]
        output = '\n'.join('2026-11-03T04:43:00Z ' + json.dumps(e) for e in events)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            m['capture_request_trace'](root, POINTER, lambda _: CONFIG, lambda *a, **kw: types.SimpleNamespace(stdout=output))
            text = (root / FILENAME).read_text()
            self.assertNotIn('CANARY', text)
            data = json.loads(text)
            self.assertEqual(len(data['coreRecords']), 3)
            self.assertEqual(data['coreRecords'][0]['category'], 'CORE_CONNECTION_TIMEOUT')
            self.assertEqual(data['coreRecords'][1]['cause'], 'SCHEMA')
            self.assertEqual(set(data['coreRecords'][2]), {'timestamp', 'event'})
            self.assertEqual(data['coreCorrelation'], 'CONTAINER_AND_WINDOW_ONLY_NOT_OPERATION_ATTRIBUTED')

    def test_write_stages_keep_only_safe_fields(self):
        event = {'diagnosticId': 'ef4562cf-f928-44ee-b160-cd03072c4072', 'method': 'POST',
                 'stage': 'CORE_RETURNED', 'elapsedMs': 22, 'coreStatus': 503,
                 'failure': 'TIMEOUT', 'body': 'SECRET_CANARY', 'operationId': 'PRIVATE_CANARY'}
        output = '2026-11-03T04:43:00Z MCP_QA_WRITE_STAGE ' + json.dumps(event)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            m['capture_request_trace'](root, POINTER, lambda _: CONFIG, lambda *a, **kw: types.SimpleNamespace(stdout=output))
            text = (root / FILENAME).read_text()
            self.assertNotIn('CANARY', text)
            record = json.loads(text)['writeStageRecords'][0]
            self.assertEqual(record['coreStatus'], 503)
            self.assertEqual(record['failure'], 'TIMEOUT')

    def test_default_probe_never_reads_shared_default_logs(self):
        def forbidden(*_): raise AssertionError('DEFAULT_LOG_READ_FORBIDDEN')
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(m['capture_request_trace'](Path(tmp), dict(POINTER, currentContainerId=POINTER['defaultContainerId']), forbidden, forbidden)['status'], 'SKIPPED_DEFAULT_CONTAINER')
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_capture_failure_never_replaces_restore(self):
        def fail(*args, **kwargs): raise subprocess.TimeoutExpired('synthetic-docker', 5)
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(m['capture_request_trace'](Path(tmp), POINTER, lambda _: CONFIG, fail)['status'], 'REQUEST_TRACE_UNAVAILABLE_RESTORE_CONTINUES')
            self.assertEqual(list(Path(tmp).iterdir()), [])
        tree = ast.parse(Path(__file__).with_name('c02-close.py').read_text())
        main = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'main')
        capture = next(n for n in main.body if isinstance(n, ast.Assign) and isinstance(n.value, ast.Call) and ast.unparse(n.value.func) == 'capture_request_trace')
        restore = next(n for n in main.body if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call) and ast.unparse(n.value.func) == 'subprocess.run')
        self.assertLess(capture.lineno, restore.lineno)
        self.assertIn('restore.py', ast.unparse(restore))

if __name__ == '__main__': unittest.main()
