"""Network-none collector and actual wrapper-body checks; never invoke Docker/SSH."""
import ast
import hashlib
import importlib.util
import json
import signal
import subprocess
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location('safe_close_logs', ROOT / 'safe_mcp_close_logs.py')
logs = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(logs)
SOURCE = (ROOT / 'safe_mcp_close_logs.py').read_text()
CID = 'a' * 64
DEFAULT = 'b' * 64
STAMP = '2026-11-02T20:39:44.123456789Z'
REQUEST = {'requestId': '22222222-2222-4222-8222-222222222222', 'status': 401,
           'durationMs': 4, 'tool': 'apply_trip_changes', 'errorCode': 'AUTH_REQUIRED',
           'authFailureSource': 'BACKEND_401'}


class SafeLogs(unittest.TestCase):
    def collect(self, text='', code=0, sleep=0):
        real_popen = subprocess.Popen

        def local_fixture(args, **kwargs):
            self.assertEqual(args, ['docker', 'logs', '--timestamps', '--tail', '128', CID])
            program = 'import sys,time;sys.stdout.write(%r);sys.stdout.flush();time.sleep(%r);sys.exit(%r)' % (text, sleep, code)
            return real_popen([sys.executable, '-c', program], **kwargs)

        with patch.object(logs.subprocess, 'Popen', side_effect=local_fixture):
            return logs.collect_safe_mcp_logs(CID)

    def test_allowlisted_request_and_stage_only(self):
        stage = {'diagnosticId': '33333333-3333-4333-8333-333333333333',
                 'stage': 'PRECHECK', 'elapsedMs': 2, 'failure': 'GRANT_NOT_CURRENT',
                 'body': 'private-body'}
        request = dict(REQUEST, token='private-token', actor='private-actor', path='private-path')
        text = '\n'.join([STAMP + ' unrelated private-error',
                          STAMP + ' MCP_QA_REQUEST ' + json.dumps(request),
                          STAMP + ' MCP_QA_WRITE_STAGE ' + json.dumps(stage)])
        result = self.collect(text)
        self.assertEqual(result['status'], 'CAPTURED')
        self.assertEqual(len(result['events']), 2)
        self.assertEqual(result['events'][0], dict(event='MCP_QA_REQUEST', dockerTimestamp=STAMP, **REQUEST))
        self.assertNotIn('private', json.dumps(result))

    def test_nonzero_is_unavailable_even_with_empty_or_valid_stdout(self):
        for text in ('', STAMP + ' MCP_QA_REQUEST ' + json.dumps(REQUEST), 'private-container-absent'):
            result = self.collect(text, code=1)
            self.assertEqual(result['status'], 'UNAVAILABLE')
            self.assertEqual(result['reason'], 'LOG_COMMAND_FAILED')
            self.assertNotIn('events', result)
            self.assertNotIn('private', json.dumps(result))

    def test_read_stage_609184bb_exact_fields_only(self):
        read = {'diagnosticId': '44444444-4444-4444-8444-444444444444',
                'resource': 'COLLECTION', 'stage': 'OWNING_RETURNED', 'elapsedMs': 120000,
                'remainingMs': 0, 'owningResponseStatus': 401, 'failure': 'EXPIRED'}
        result = self.collect(STAMP + ' MCP_QA_READ_STAGE ' + json.dumps(dict(read, token='private-token', body='private-body')))
        self.assertEqual(result['events'], [dict(event='MCP_QA_READ_STAGE', dockerTimestamp=STAMP, **read)])
        self.assertNotIn('private', json.dumps(result))
        for change in ({'resource': 'private'}, {'stage': 'CORE_RETURNED'}, {'remainingMs': 60001},
                       {'remainingMs': True}, {'owningResponseStatus': True}, {'failure': 'GRANT_NOT_CURRENT'}):
            result = self.collect(STAMP + ' MCP_QA_READ_STAGE ' + json.dumps(dict(read, **change)))
            self.assertEqual(result['status'], 'UNAVAILABLE')
            self.assertNotIn('events', result)

    def test_real_empty_success_is_not_commit_proof(self):
        result = self.collect()
        self.assertEqual(result, {'status': 'CAPTURED_EMPTY', 'evidence': logs.EVIDENCE, 'events': []})

    def test_limits_and_timeout_never_become_empty(self):
        for result in (self.collect('x' * (logs.MAX_BYTES + 1)), self.collect(sleep=5),
                       self.collect((STAMP + ' MCP_QA_REQUEST ' + json.dumps(REQUEST) + '\n') * 65)):
            self.assertEqual(result['status'], 'UNAVAILABLE')
            self.assertNotIn('events', result)

    def test_malformed_fields_and_timestamp_are_not_partial_evidence(self):
        for value in (dict(REQUEST, tool='private-tool'), dict(REQUEST, status=True),
                      dict(REQUEST, requestId='private-id'), dict(REQUEST, durationMs=float('nan'))):
            self.assertEqual(self.collect(STAMP + ' MCP_QA_REQUEST ' + json.dumps(value))['status'], 'UNAVAILABLE')
        self.assertEqual(self.collect('private-timestamp MCP_QA_REQUEST ' + json.dumps(REQUEST))['status'], 'UNAVAILABLE')

    def test_bad_cid_never_starts_command(self):
        with patch.object(logs.subprocess, 'Popen') as start:
            self.assertEqual(logs.collect_safe_mcp_logs('otr-dev-backend')['status'], 'UNAVAILABLE')
            start.assert_not_called()

    def test_save_failure_or_total_timeout_is_unavailable_and_bounded(self):
        for timeout in (False, True):
            process = Mock(returncode=1, pid=12345)
            process.poll.return_value = None if timeout else 1
            process.communicate.side_effect = subprocess.TimeoutExpired('fixture', 1.8) if timeout else None
            process.communicate.return_value = (b'', None)
            with patch.object(logs.subprocess, 'Popen', return_value=process), patch.object(logs.os, 'killpg') as kill:
                result = logs.retain_before_close(CID, '/synthetic', SOURCE)
                self.assertEqual(result['status'], 'UNAVAILABLE')
                self.assertNotIn('events', result)
                process.communicate.assert_called_once_with(timeout=1.8)
                if timeout:
                    kill.assert_called_once_with(process.pid, signal.SIGKILL)

    def test_only_outer_owns_group_and_inner_cleanup_never_kills_close_group(self):
        inner = Mock(pid=12345)
        inner.poll.return_value = None
        selector = Mock()
        selector.select.return_value = []
        with patch.object(logs.subprocess, 'Popen', return_value=inner) as start, \
                patch.object(logs.selectors, 'DefaultSelector') as selectors, \
                patch.object(logs.os, 'killpg') as kill_group:
            selectors.return_value.__enter__.return_value = selector
            _, failure = logs._read_logs(CID)
            self.assertEqual(failure, 'TIMEOUT')
            self.assertFalse(start.call_args.kwargs.get('start_new_session', False))
            inner.kill.assert_called_once_with()
            kill_group.assert_not_called()
        outer = Mock(pid=54321)
        outer.poll.return_value = None
        outer.communicate.side_effect = subprocess.TimeoutExpired('fixture', 1.8)
        with patch.object(logs.subprocess, 'Popen', return_value=outer) as start, \
                patch.object(logs.os, 'killpg') as kill_group:
            self.assertEqual(logs.retain_before_close(CID, '/synthetic', SOURCE)['status'], 'UNAVAILABLE')
            self.assertTrue(start.call_args.kwargs['start_new_session'])
            kill_group.assert_called_once_with(outer.pid, signal.SIGKILL)
            outer.kill.assert_not_called()


class Caller(unittest.TestCase):
    def test_helper_is_pinned_and_historical_executed_sha_is_unchanged(self):
        wrapper = (ROOT / 'close-once.py').read_text()
        self.assertIn(hashlib.sha256(SOURCE.encode()).hexdigest(), wrapper)
        self.assertEqual(json.loads((ROOT / 'WRAPPER_HASHES.json').read_text())['close-once.py'],
                         '505015b366ad6f3e9928aaea9ad285ee552131297808f03dc8dd9d42300f1120')

    def run_body(self, collector):
        wrapper = ast.parse((ROOT / 'close-once.py').read_text())
        body = next(n.value for n in ast.walk(wrapper) if isinstance(n, ast.Constant)
                    and isinstance(n.value, str) and "pointer=json.loads(private(r/'close-current.json'))" in n.value)
        trace = []
        current = {'Id': CID, 'Config': 'active', 'HostConfig': {}, 'State': {'Health': {'Status': 'healthy'}}}
        base = {'windowId': 'c' * 32, 'defaultContainerId': DEFAULT, 'defaultConfigSHA256': 'default'}
        plan = {'expectedConfigSHA256': 'active', 'expectedHostConfig': {}}
        g = {'beforeConfigHashes': {}, 'mountedFileHashes': {}}

        def private(path):
            return json.dumps({'close-current.json': {'currentContainerId': CID},
                               'deploy-plan.json': plan, 'empty-cas.json': g}.get(path.name, {})).encode()

        def atomic_private(path, value):
            trace.append(path.name)

        def run(args, **kwargs):
            if args[0] == 'python3':
                trace.append('MANDATORY_CLOSE')
                current.update(Id=DEFAULT, Config='default')
                return types.SimpleNamespace(returncode=0, stdout='{"status":"RESTORED"}')
            return types.SimpleNamespace(returncode=0, stdout='inactive')

        config = types.ModuleType('config_cas')
        config.private, config.atomic_private = private, atomic_private
        deploy = types.ModuleType('deploy')
        deploy.inspect = lambda _: current
        deploy.digest = lambda value: value
        deploy.environment = lambda _: {}
        deploy.verify_http = lambda _: None
        with patch.dict(sys.modules, config_cas=config, deploy=deploy), \
                patch('subprocess.run', side_effect=run), patch.object(Path, 'exists', return_value=False), \
                patch('hashlib.sha256', return_value=types.SimpleNamespace(hexdigest=lambda: 'c9e086da959432b434d949e6a136d0daf1b9643add73f2e0365b629c15500cb0')), \
                patch('builtins.print') as output:
            exec(body, {'BASE': base, 'COLLECTOR_SOURCE': collector})
        result = json.loads(output.call_args.args[0])
        self.assertEqual(result['status'], 'ROOT_CLOSED_SERVER_VERIFIED')
        self.assertEqual(trace.count('MANDATORY_CLOSE'), 1)
        return trace, result

    def test_capture_precedes_restore_and_failures_still_close(self):
        good = "def retain_before_close(cid,directory,source):\n from config_cas import atomic_private\n atomic_private(directory/'pre-close-mcp-diagnostics.json',{})\n return {'status':'CAPTURED_EMPTY','evidence':'BOUNDED_TAIL_NOT_COMMIT_PROOF','events':[]}\n"
        trace, result = self.run_body(good)
        self.assertLess(trace.index('pre-close-mcp-diagnostics.json'), trace.index('MANDATORY_CLOSE'))
        self.assertEqual(result['mcpDiagnostics']['status'], 'CAPTURED_EMPTY')
        for source in (None, 'raise ImportError("private")',
                       'def retain_before_close(*args): raise OSError("private-save-failure")'):
            _, result = self.run_body(source)
            self.assertEqual(result['mcpDiagnostics']['status'], 'UNAVAILABLE')
            self.assertNotIn('private', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
