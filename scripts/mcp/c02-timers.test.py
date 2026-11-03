"""Pure C02 timer failure/verification checks. No root, systemd, Docker or network."""
import copy
import ast
import datetime as dt
import hashlib
import json
from pathlib import Path
import runpy
import subprocess
import unittest
from unittest.mock import patch

with patch('subprocess.check_output', side_effect=AssertionError('IMPORT_MUST_NOT_EXECUTE')):
    m = runpy.run_path(str(Path(__file__).with_name('c02-timers.py')), run_name='timer_test')

T = 1793664000123
P = {'startsAt': T, 'normalCloseAt': T + 1680000, 'expiresAt': T + 1800000,
     'gateSHA256': m['GATE'], 'windowId': 'e32551d4-18f5-4fcd-b02d-9783eb4c2f9c', 'command': None}
CONFIG = {'plan': P, 'confirmations': []}
POINTER = {'gateSHA256': m['GATE'], 'windowId': m['WINDOW'], 'deadlineMs': P['expiresAt'],
           'planSHA256': 'a' * 64, 'defaultContainerId': 'b' * 64, 'defaultConfigSHA256': 'c' * 64}
RESTORE = {'beforeContainerId': 'b' * 64, 'beforeConfigSHA256': 'c' * 64,
           'beforeImage': 'sha256:' + 'd' * 64, 'candidateImage': 'sha256:' + 'd' * 64}


class Systemd:
    def __init__(self, fault=None):
        self.fault, self.created, self.calls, self.stopped = fault, {}, [], set()

    def __call__(self, args):
        self.calls.append(args)
        if args[0] == '/usr/bin/systemd-run':
            unit = next(v.split('=', 1)[1] for v in args if v.startswith('--unit='))
            if self.fault == 'second-create' and unit.endswith('-hard'):
                raise RuntimeError('SIMULATED_SYSTEMD_FAILURE')
            self.created[unit] = next(v.split('=', 1)[1] for v in args if v.startswith('--on-calendar='))
            assert args[-3:] == m['EXEC']
            return ''
        assert args[0] == '/usr/bin/systemctl'
        if args[1] == 'stop':
            self.stopped.update(args[2:])
            return ''
        if args[1] == 'list-units':
            return '\n'.join(self.created)
        assert args[1] == 'show'
        name, key = args[2], args[3].split('=', 1)[1]
        unit = name.rsplit('.', 1)[0]
        if unit not in self.created:
            return 'inactive'
        cal = self.created[unit]
        if key == 'ActiveState':
            return 'inactive' if self.fault == 'inactive' or name in self.stopped else 'active'
        if key == 'Unit':
            return 'other.service' if self.fault == 'service' else unit + '.service'
        if key == 'TimersCalendar':
            return '{ OnCalendar=' + ('*-*-* 00:00:00 UTC' if self.fault == 'calendar' else cal) + ' ; next_elapse=n/a ; }'
        if key == 'NextElapseUSecRealtime':
            value = dt.datetime.strptime(cal, '%Y-%m-%d %H:%M:%S UTC')
            if self.fault == 'late':
                value += dt.timedelta(seconds=1)
            return value.strftime('%a %Y-%m-%d %H:%M:%S UTC')
        if key == 'ExecStart':
            argv = ['python3', '/tmp/foreign.py'] if self.fault == 'exec' else m['EXEC']
            return '{ path=/usr/bin/python3 ; argv[]=' + ' '.join(argv) + ' ; ignore_errors=no ; }'
        if key == 'User':
            return 'nobody' if self.fault == 'user' else 'root'
        raise AssertionError('UNEXPECTED_PROPERTY')


class Timers(unittest.TestCase):
    def test_fixed_scope_and_time_fail_closed(self):
        self.assertEqual(m['validate'](CONFIG, POINTER, RESTORE, 'a' * 64, T), P)
        for field, value in [('gateSHA256', '0' * 64), ('windowId', m['WINDOW']),
                             ('startsAt', True), ('normalCloseAt', P['normalCloseAt'] + 1),
                             ('expiresAt', P['expiresAt'] + 1), ('command', {'command': 'CREATE_ITEM'})]:
            with self.subTest(field=field):
                q = copy.deepcopy(CONFIG)
                q['plan'][field] = value
                with self.assertRaises(AssertionError):
                    m['validate'](q, POINTER, RESTORE, 'a' * 64, T)
        for now in [T - 1, P['normalCloseAt'] // 1000 * 1000, P['expiresAt']]:
            with self.assertRaises(AssertionError):
                m['validate'](CONFIG, POINTER, RESTORE, 'a' * 64, now)
        q = copy.deepcopy(CONFIG)
        q['confirmations'] = [{'ownerConfirmed': True}]
        with self.assertRaisesRegex(AssertionError, 'EMPTY_ONLY'):
            m['validate'](q, POINTER, RESTORE, 'a' * 64, T)

    def test_pointer_and_restore_binding(self):
        for key, value in [('windowId', 'f' * 32), ('gateSHA256', '0' * 64),
                           ('deadlineMs', P['expiresAt'] + 1000), ('planSHA256', 'f' * 64),
                           ('defaultContainerId', 'f' * 64), ('defaultConfigSHA256', 'f' * 64)]:
            with self.subTest(key=key):
                pointer = {**POINTER, key: value}
                with self.assertRaises(AssertionError):
                    m['validate'](CONFIG, pointer, RESTORE, 'a' * 64, T)
        with self.assertRaises(AssertionError):
            m['validate'](CONFIG, POINTER, {**RESTORE, 'candidateImage': 'sha256:' + 'e' * 64}, 'a' * 64, T)

    def test_two_absolute_deadlines_target_only_existing_close(self):
        systemd = Systemd()
        result = m['arm'](P, systemd)
        self.assertEqual(result['status'], 'C02_BOTH_ABSOLUTE_TIMERS_VERIFIED')
        self.assertFalse(result['authorityActivated'])
        self.assertFalse(result['issuerArmed'])
        self.assertEqual(len(systemd.created), 2)
        for record, (unit, key) in zip(result['timers'], m['units']()):
            self.assertEqual(record['unit'], unit + '.timer')
            self.assertEqual(record['deadlineMs'], P[key] // 1000 * 1000)
            self.assertLessEqual(record['deadlineMs'], P[key])
            self.assertEqual(record['exec'], m['EXEC'])
        self.assertFalse(any(any(v.startswith('--on-active=') for v in cmd) for cmd in systemd.calls))

    def test_exact_armed_readback_required(self):
        for fault in ['inactive', 'service', 'calendar', 'late', 'exec', 'user']:
            with self.subTest(fault=fault), self.assertRaises(AssertionError):
                m['arm'](P, Systemd(fault))
        with self.assertRaises(AssertionError):
            m['observed_ms']('Tue 2026-11-03 00:00:00 NZDT')

    def test_partial_failure_does_not_reset_or_claim_ready(self):
        systemd = Systemd('second-create')
        with self.assertRaisesRegex(RuntimeError, 'SIMULATED_SYSTEMD_FAILURE'):
            m['arm'](P, systemd)
        before = copy.deepcopy(systemd.created)
        self.assertEqual(len(before), 1)
        with self.assertRaisesRegex(AssertionError, 'EXISTING_UNITS_RECONCILE_ONLY'):
            m['arm'](P, systemd)
        self.assertEqual(systemd.created, before)
        with self.assertRaises(AssertionError):
            m['verify'](P, systemd)
        self.assertFalse(any(cmd[1] in ('stop', 'start', 'restart') for cmd in systemd.calls))

    def test_before_serve_requires_original_window_and_both_real_readbacks(self):
        raw = json.dumps(RESTORE).encode()
        pointer = {**POINTER, 'planSHA256': hashlib.sha256(raw).hexdigest()}
        files = {'C02_EMPTY_CONFIG.json': json.dumps(CONFIG).encode(),
                 'close-current.json': json.dumps(pointer).encode(), 'deploy-plan.json': raw}
        read = lambda path: files[path.name]
        systemd = Systemd()
        m['arm'](P, systemd)
        g = {'authQaConfig': json.dumps(CONFIG)}
        self.assertEqual(m['require_before_serve'](g, m['ROOT'], read, T, systemd)['status'],
                         'C02_BOTH_ABSOLUTE_TIMERS_VERIFIED')
        systemd.fault = 'inactive'
        with self.assertRaisesRegex(AssertionError, 'TIMER_NOT_ACTIVE'):
            m['require_before_serve'](g, m['ROOT'], read, T, systemd)
        systemd.fault = None
        changed = copy.deepcopy(CONFIG)
        changed['plan']['expiresAt'] += 1000
        with self.assertRaisesRegex(AssertionError, 'TIMER_WINDOW_DRIFT'):
            m['require_before_serve']({'authQaConfig': json.dumps(changed)}, m['ROOT'], read, T, systemd)
        with self.assertRaises(AssertionError):
            m['require_before_serve'](g, Path('/tmp/foreign'), read, T, systemd)

    def test_disarm_targets_only_own_units_after_expiry(self):
        self.assertEqual(m['validate'](CONFIG, POINTER, RESTORE, 'a' * 64, None), P)
        systemd = Systemd()
        m['arm'](P, systemd)
        result = m['disarm'](systemd)
        self.assertEqual(result['status'], 'C02_OWN_TIMERS_DISARMED_AFTER_DEFAULT_CLOSED')
        self.assertEqual(set(result['units']), systemd.stopped)
        self.assertEqual(len(systemd.stopped), 4)
        self.assertTrue(all(name.startswith('otr-mcp-c02-' + m['WINDOW']) for name in systemd.stopped))

    def test_disarm_missing_transient_service_still_requires_all_units_inactive(self):
        for active, status in [(False, 5), (True, 5), (False, 1)]:
            systemd = Systemd()
            def run(args):
                if args[1] == 'stop':
                    systemd(args)
                    raise subprocess.CalledProcessError(status, args)
                if active and args[1] == 'show': return 'active'
                return systemd(args)
            if active:
                with self.assertRaisesRegex(AssertionError, 'TIMER_STOP_UNCONFIRMED'): m['disarm'](run)
            elif status != 5:
                with self.assertRaises(subprocess.CalledProcessError): m['disarm'](run)
            else:
                self.assertEqual(m['disarm'](run)['status'], 'C02_OWN_TIMERS_DISARMED_AFTER_DEFAULT_CLOSED')

    def test_generated_cas_checks_pinned_timer_before_any_service_stop(self):
        path = Path('/private/tmp/otr-mcp-c02-s1-package-20261103/operators/config_cas.py')
        tree = ast.parse(path.read_text())
        target = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'run')
        calls = list(n for n in ast.walk(target) if isinstance(n, ast.Call))
        guards = [n for n in calls if isinstance(n.func, ast.Name) and n.func.id == 'require_c02_timers']
        stops = [n for n in calls if isinstance(n.func, ast.Name) and n.func.id == 'call'
                 and n.args and isinstance(n.args[0], ast.List) and len(n.args[0].elts) > 1
                 and isinstance(n.args[0].elts[1], ast.Constant) and n.args[0].elts[1].value == 'stop']
        self.assertEqual(len(guards), 1)
        self.assertTrue(stops)
        self.assertLess(guards[0].lineno, min(n.lineno for n in stops))
        constants = {n.targets[0].id: n.value.value for n in tree.body
                     if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name)
                     and isinstance(n.value, ast.Constant)}
        self.assertEqual(constants['C02_TIMERS_SHA'], hashlib.sha256(
            Path(__file__).with_name('c02-timers.py').read_bytes()).hexdigest())


if __name__ == '__main__':
    unittest.main()
