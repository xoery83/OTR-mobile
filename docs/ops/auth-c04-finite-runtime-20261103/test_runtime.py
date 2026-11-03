"""In-memory Docker/systemd only; no Host, filesystem plans or business requests."""
import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
from unittest.mock import patch
import unittest
import uuid

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('auth_c04_control', ROOT / 'runtime.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
OPEN = '2030-01-01T00:00:00Z'
NOW = r.instant(OPEN) + 60
BASE, CANDIDATE = 'a' * 64, 'b' * 64


class Fake:
    def __init__(self):
        self.containers = {BASE: {'Id': BASE, 'Image': 'sha256:' + 'c' * 64,
            'Config': {'Env': ['ORIGINAL=value'], 'Image': 'sha256:' + 'c' * 64},
            'HostConfig': {'OomKillDisable': None, 'Memory': 128}, 'Mounts': [],
            'Name': '/otr-dev-backend', 'State': {'Status': 'running', 'Running': True,
                'Health': {'Status': 'healthy'}}}}
        self.files = {}
        self.commands = []
        self.fail = None
        self.timer = False
        self.timers = {}
        self.created_body = None
        self.plan = self.make_plan()

    def make_plan(self):
        base = self.containers[BASE]
        return {'version': 1, 'windowId': str(uuid.uuid4()), 'root': '',
            'qaCase': {**r.CASE, 'opensAt': OPEN, 'inviteExpiresAt': '2030-01-01T00:10:00Z',
                'closesAt': '2030-01-01T00:30:00Z'},
            'ownerAuthorized': True, 'executionQualified': True,
            'approvedGateSHA256': 'd' * 64, 'ownerApprovalSHA256': 'e' * 64,
            'qualifiedPreflightSHA256': 'f' * 64, 'runtimeSHA256': '1' * 64,
            'baseline': {'containerId': BASE, 'image': base['Image'],
                'configSHA256': r.sha(base['Config']), 'hostConfigSHA256': r.sha(base['HostConfig']),
                'environmentSHA256': r.sha(r.env(base)), 'mountsSHA256': r.sha([]),
                'configHashes': {}, 'mountedFileHashes': {}}}

    def inspect(self, identity):
        if identity in self.containers:
            return copy.deepcopy(self.containers[identity])
        return copy.deepcopy(next(x for x in self.containers.values() if x['Name'] == '/' + identity))

    def save(self, path, value):
        if path.name in self.files:
            raise FileExistsError()
        self.files[path.name] = copy.deepcopy(value)

    def call(self, args, input=None):
        self.commands.append(args)
        if args[0] == 'systemd-run':
            self.timer = True
            unit = next(v.split('=',1)[1] for v in args if v.startswith('--unit='))
            calendar = next(v.split('=',1)[1] for v in args if v.startswith('--on-calendar='))
            self.timers[unit] = {'calendar':calendar, 'argv':args[args.index('/usr/bin/python3'):], 'user':'root'}
            return ''
        if args[0] == 'systemctl':
            if args[1] != 'show': return ''
            key = args[-2].split('=',1)[1]
            unit = args[2].removesuffix('.timer').removesuffix('.service')
            if key == 'ActiveState': return 'active' if self.timer and unit in self.timers else 'inactive'
            row = self.timers[unit]
            if key == 'Unit': return unit + '.service'
            if key == 'TimersCalendar': return 'OnCalendar=' + row['calendar'] + '; next_elapse=ignored'
            if key == 'NextElapseUSecRealtime': return dt.datetime.strptime(row.get('deadline',row['calendar']), '%Y-%m-%d %H:%M:%S UTC').strftime('%a %Y-%m-%d %H:%M:%S UTC')
            if key == 'ExecStart': return '{ argv[]=' + ' '.join(row['argv']) + ' ; }'
            if key == 'User': return row['user']
            raise AssertionError(key)
        if args[:2] == ['docker', 'ps']:
            name = args[-1].split('name=^/')[1].removesuffix('$')
            return '\n'.join(c['Id'] for c in self.containers.values() if c['Name'] == '/' + name)
        action = args[1]
        if action == 'stop':
            self.containers[args[-1]]['State'].update(Running=False, Status='exited')
        elif action == 'rename':
            self.containers[args[2]]['Name'] = '/' + args[3]
        elif action == 'start':
            self.containers[args[2]]['State'].update(Running=True, Status='running')
        else:
            raise AssertionError('UNEXPECTED_IO')
        if self.fail and self.fail(args):
            self.fail = None
            raise RuntimeError('SYNTHETIC_PARTIAL_FAILURE')
        return ''

    def docker(self, *_args, **_kwargs):
        owner = self
        class Client:
            def request(self, method, path, body, headers):
                owner.created_body = json.loads(body)
                config = copy.deepcopy(owner.created_body)
                host = config.pop('HostConfig')
                owner.containers[CANDIDATE] = {'Id': CANDIDATE, 'Image': config['Image'],
                    'Config': config, 'HostConfig': host, 'Mounts': [],
                    'Name': '/' + r.names(owner.plan)[0],
                    'State': {'Running': False, 'Status': 'created', 'Health': {'Status': 'healthy'}}}
            def getresponse(self):
                class Response:
                    status = 201
                    def read(self):
                        return json.dumps({'Id': CANDIDATE}).encode()
                return Response()
            def close(self):
                pass
        return Client()


class Controller(unittest.TestCase):
    def setUp(self):
        self.f = Fake()
        self.p = self.f.plan
        self.p['root'] = '/opt/otr/dev-backend/releases/auth-c04-qa-' + self.p['windowId']
        for target, value in [('inspect', self.f.inspect), ('call', self.f.call), ('save', self.f.save),
                ('private', lambda path: r.canonical(self.f.files[path.name])),
                ('Docker', self.f.docker), ('wait_healthy', self.f.inspect)]:
            context = patch.object(r, target, value)
            context.start()
            self.addCleanup(context.stop)
        context = patch.object(r.time, 'time', return_value=NOW)
        context.start()
        self.addCleanup(context.stop)

    def ready(self):
        r.stage(self.p)
        r.arm(self.p, '9' * 64)
        return self.f.files['state.json']

    def test_default_template_cannot_execute_or_fix_times_itself(self):
        with self.assertRaises(KeyError):
            r.validate({'version': 1, 'windowId': str(uuid.uuid4())}, starting=True)
        self.assertEqual(self.f.commands, [])
        self.assertNotIn('opensAt', r.CASE)

    def test_exact_case_approval_and_time_bounds(self):
        r.validate(self.p, now=NOW, starting=True)
        for key in ('tripId', 'personId', 'ownerAccountId', 'claimantAccountId', 'issueOperationId', 'claimOperationId'):
            changed = copy.deepcopy(self.p)
            changed['qaCase'][key] = str(uuid.uuid4())
            with self.subTest(key=key), self.assertRaises(AssertionError):
                r.validate(changed)
        for changes in [{'ownerAuthorized': False}, {'executionQualified': False}, {'approvedGateSHA256': '0' * 64}]:
            with self.assertRaises(AssertionError):
                r.validate({**self.p, **changes})
        for changes in [{'closesAt': '2030-01-01T00:30:01Z'}, {'inviteExpiresAt': '2030-01-01T00:10:01Z'},
                {'inviteExpiresAt': OPEN}, {'closesAt': '2030-01-01T00:05:00Z'}]:
            with self.assertRaises(AssertionError):
                r.validate({**self.p, 'qaCase': {**self.p['qaCase'], **changes}})
        for moment in [r.instant(OPEN) - 1, r.instant('2030-01-01T00:10:00Z'), float('nan')]:
            with self.assertRaises(AssertionError):
                r.validate(self.p, now=moment, starting=True)

    def test_stage_only_adds_selector_retains_config_mounts_and_does_not_start(self):
        r.stage(self.p)
        baseline, candidate = self.f.inspect(BASE), self.f.inspect(CANDIDATE)
        self.assertTrue(baseline['State']['Running'])
        self.assertFalse(candidate['State']['Running'])
        self.assertEqual(r.env(candidate), {**r.env(baseline), r.SELECTOR: r.canonical(self.p['qaCase']).decode()})
        self.assertEqual(candidate['HostConfig'], baseline['HostConfig'])
        self.assertEqual(candidate['Image'], baseline['Image'])
        self.assertFalse(any(c[:2] == ['docker', 'start'] for c in self.f.commands))

    def test_stage_state_save_failure_rolls_back_without_starting_candidate(self):
        with patch.object(r, 'save', side_effect=OSError('SYNTHETIC_STATE_WRITE_FAILURE')):
            with self.assertRaises(OSError):
                r.stage(self.p)
        self.assertTrue(r.verify(self.p)['runtimeClosed'])
        self.assertFalse(self.f.inspect(CANDIDATE)['State']['Running'])

    def test_unknown_create_is_not_retried(self):
        client = self.f.docker()
        class Response:
            status = 500
            def read(self):
                return b'{}'
        client.getresponse = lambda: Response()
        with patch.object(r, 'Docker', return_value=client):
            with self.assertRaisesRegex(AssertionError, 'CREATE_UNKNOWN'):
                r.stage(self.p)
        self.assertTrue(r.verify(self.p)['runtimeClosed'])
        self.assertNotIn('state.json', self.f.files)

    def test_reconcile_exact_created_candidate_without_new_create(self):
        r.stage(self.p)
        self.f.files.clear()
        result = r.reconcile_stage(self.p)
        self.assertEqual(result['candidateId'], CANDIDATE)
        self.assertFalse(self.f.inspect(CANDIDATE)['State']['Running'])

    def test_timer_is_absolute_pinned_independent_and_retries_lock_contention(self):
        self.ready()
        command = next(c for c in self.f.commands if c[0] == 'systemd-run')
        self.assertIn('--on-calendar=2030-01-01 00:30:00 UTC', command)
        self.assertIn('--property=Restart=on-failure', command)
        self.assertIn('--property=StartLimitIntervalSec=0', command)
        self.assertEqual(command[-3:], ['close', self.p['root'] + '/plan.json', '9' * 64])

    def test_start_requires_timer_identity_and_liveness(self):
        r.stage(self.p)
        state = self.f.files['state.json']
        with self.assertRaises(KeyError):
            r.start(self.p, state, '9' * 64)
        r.arm(self.p, '9' * 64)
        self.f.files['timer.json']['planSHA256'] = '8' * 64
        with self.assertRaisesRegex(AssertionError, 'TIMER_PLAN_DRIFT'):
            r.start(self.p, state, '9' * 64)
        self.f.files['timer.json']['planSHA256'] = '9' * 64
        self.f.timer = False
        with self.assertRaisesRegex(AssertionError, 'CLOSE_TIMER_REQUIRED'):
            r.start(self.p, state, '9' * 64)
        self.assertTrue(r.verify(self.p)['runtimeClosed'])

    def test_start_then_independent_expired_close_restores_and_reads_default(self):
        state = self.ready()
        self.assertEqual(r.start(self.p, state, '9' * 64)['status'], 'AUTH_C04_FINITE_RUNTIME_HEALTHY')
        with patch.object(r.time, 'time', return_value=r.instant('2030-01-01T01:00:00Z')):
            result = r.close(self.p, state)
        self.assertTrue(result['selectorAbsent'])
        self.assertEqual(result['containerId'], BASE)
        self.assertEqual(result['businessOutcome'], 'NOT_INFERRED')
        self.assertTrue(r.close(self.p, state)['runtimeClosed'])

    def test_partial_stop_or_rename_or_start_failure_restores_same_id(self):
        for predicate in [lambda c: c[:2] == ['docker', 'stop'],
                lambda c: c[:3] == ['docker', 'rename', BASE],
                lambda c: c[:3] == ['docker', 'rename', CANDIDATE],
                lambda c: c[:3] == ['docker', 'start', CANDIDATE]]:
            # Each scenario has independent identity/state, never a retry of a business operation.
            self.f.__init__()
            self.f.plan = copy.deepcopy(self.p)
            state = self.ready()
            self.f.fail = predicate
            with self.assertRaises(RuntimeError):
                r.start(self.p, state, '9' * 64)
            self.assertTrue(r.verify(self.p)['runtimeClosed'])

    def test_health_failure_does_not_report_success_and_restores(self):
        state = self.ready()
        def healthy(identity):
            if identity == CANDIDATE:
                raise RuntimeError('HEALTH_TIMEOUT')
            return self.f.inspect(identity)
        with patch.object(r, 'wait_healthy', side_effect=healthy):
            with self.assertRaisesRegex(RuntimeError, 'HEALTH_TIMEOUT'):
                r.start(self.p, state, '9' * 64)
        self.assertTrue(r.verify(self.p)['runtimeClosed'])

    def test_foreign_current_or_drift_never_stopped_or_overwritten(self):
        state = self.ready()
        self.f.containers[BASE]['Name'] = '/' + r.names(self.p)[1]
        foreign = copy.deepcopy(self.f.containers[BASE])
        foreign.update(Id='7' * 64, Name='/otr-dev-backend')
        self.f.containers[foreign['Id']] = foreign
        before = len(self.f.commands)
        with self.assertRaisesRegex(AssertionError, 'FOREIGN_CURRENT_SERVICE'):
            r.close(self.p, state)
        self.assertFalse(any(c[:2] in [['docker', 'stop'], ['docker', 'rename'], ['docker', 'start']] for c in self.f.commands[before:]))
        self.assertEqual(self.f.inspect('otr-dev-backend')['Id'], foreign['Id'])

    def test_baseline_drift_selector_or_candidate_config_closes_before_mutation(self):
        state = self.ready()
        self.f.containers[CANDIDATE]['Config']['Env'].append('UNAPPROVED=1')
        before = len(self.f.commands)
        with self.assertRaises(AssertionError):
            r.close(self.p, state)
        self.assertEqual(len(self.f.commands), before)
        self.f.containers[BASE]['Config']['Env'].append(r.SELECTOR + '={}')
        with self.assertRaises(AssertionError):
            r.verify(self.p)


    def test_recovery_mode_is_bound_and_restored_by_the_existing_controller(self):
        self.p['executionMode'] = 'RECOVERY_ONLY'
        self.p['qaCase']['closesAt'] = '2030-01-01T00:15:00Z'
        state = self.ready()
        self.assertEqual(r.env(self.f.containers[CANDIDATE])[r.MODE], 'RECOVERY_ONLY')
        r.start(self.p, state, '9' * 64)
        before = len(self.f.commands)
        self.assertEqual(r.qualify_recovery(self.p, state, '9' * 64)['status'], 'AUTH_C04_RECOVERY_WINDOW_QUALIFIED')
        self.assertFalse(any(c[:2] in [['docker', 'stop'], ['docker', 'rename'], ['docker', 'start']] for c in self.f.commands[before:]))
        self.assertEqual(len([c for c in self.f.commands if c[0]=='systemd-run']), 2)
        r.close(self.p, state)
        self.assertNotIn(r.MODE, r.env(self.f.inspect('otr-dev-backend')))
        self.assertTrue(r.verify(self.p)['runtimeClosed'])

    def test_unknown_recovery_mode_fails_before_any_mutation(self):
        self.p['executionMode'] = 'ALLOW_WRITES'
        with self.assertRaisesRegex(AssertionError, 'UNKNOWN_EXECUTION_MODE'):
            r.validate(self.p)
        self.assertEqual(self.f.commands, [])

    def test_baseline_with_recovery_mode_is_not_closed(self):
        self.f.containers[BASE]['Config']['Env'].append(r.MODE + '=RECOVERY_ONLY')
        with self.assertRaises(AssertionError):
            r.verify(self.p)


    def test_recovery_window_cannot_inherit_thirty_minute_business_limit(self):
        self.p['executionMode'] = 'RECOVERY_ONLY'
        with self.assertRaisesRegex(AssertionError, 'RECOVERY_WINDOW_LIMIT'):
            r.validate(self.p)

    def test_missing_normal_recovery_timer_blocks_start_before_stop(self):
        self.p['executionMode'] = 'RECOVERY_ONLY'
        self.p['qaCase']['closesAt'] = '2030-01-01T00:15:00Z'
        state = self.ready()
        original = self.f.call
        def response(args, input=None):
            if args[:2] == ['systemctl', 'show'] and args[2].startswith('otr-auth-c04-recovery-close-'):
                return 'inactive'
            return original(args, input)
        before = len(self.f.commands)
        with patch.object(r, 'call', side_effect=response):
            with self.assertRaisesRegex(AssertionError, 'CLOSE_TIMER_REQUIRED'):
                r.start(self.p, state, '9' * 64)
        self.assertFalse(any(c[:2] == ['docker', 'stop'] for c in self.f.commands[before:]))

    def test_recovery_qualification_rejects_normal_business_mode(self):
        with self.assertRaisesRegex(AssertionError, 'RECOVERY_MODE_REQUIRED'):
            r.qualify_recovery(self.p, {'candidateId': CANDIDATE}, '9' * 64)


    def test_active_but_drifted_timer_details_cannot_qualify_recovery(self):
        self.p['executionMode'] = 'RECOVERY_ONLY'
        self.p['qaCase']['closesAt'] = '2030-01-01T00:15:00Z'
        state = self.ready()
        r.start(self.p, state, '9' * 64)
        original = copy.deepcopy(self.f.timers)
        changes = [
            {'calendar': '2030-01-01 01:00:00 UTC'},
            {'deadline': '2030-01-01 01:00:00 UTC'},
            {'argv': ['/usr/bin/true']},
            {'argv': ['/usr/bin/python3', self.p['root']+'/runtime.py', 'close', '/other/plan.json', '9'*64]},
            {'argv': ['/usr/bin/python3', self.p['root']+'/runtime.py', 'close', self.p['root']+'/plan.json', '8'*64]},
            {'user': 'other'},
        ]
        for unit in original:
            for change in changes:
                self.f.timers = copy.deepcopy(original)
                self.f.timers[unit].update(change)
                with self.subTest(unit=unit,change=change), self.assertRaises(AssertionError):
                    r.qualify_recovery(self.p, state, '9' * 64)
        self.f.timers = original

    def test_stale_healthy_stopped_or_wrong_named_candidate_cannot_qualify(self):
        self.p['executionMode'] = 'RECOVERY_ONLY'
        self.p['qaCase']['closesAt'] = '2030-01-01T00:15:00Z'
        state = self.ready()
        r.start(self.p, state, '9' * 64)
        self.f.containers[CANDIDATE]['State']['Running'] = False
        with self.assertRaisesRegex(AssertionError, 'RECOVERY_RUNTIME_NOT_RUNNING'):
            r.qualify_recovery(self.p, state, '9' * 64)
        self.f.containers[CANDIDATE]['State']['Running'] = True
        self.f.containers[CANDIDATE]['Name'] = '/stopped-candidate'
        # Select the stopped candidate directly to exercise the explicit Name fence.
        original_inspect = self.f.inspect
        with patch.object(r, 'inspect', side_effect=lambda value: original_inspect(CANDIDATE) if value=='otr-dev-backend' else original_inspect(value)):
            with self.assertRaisesRegex(AssertionError, 'RECOVERY_RUNTIME_NOT_RUNNING'):
                r.qualify_recovery(self.p, state, '9' * 64)


    def test_original_resume_uses_existing_fixed_authority_and_distinct_qualified_wire(self):
        self.p['executionMode'] = 'ORIGINAL_ID_RESUME'
        state = self.ready()
        self.assertNotIn(r.MODE, r.env(self.f.containers[CANDIDATE]))
        self.assertEqual(json.loads(r.env(self.f.containers[CANDIDATE])[r.SELECTOR]), self.p['qaCase'])
        r.start(self.p, state, '9' * 64)
        result = r.qualify_resume(self.p, state, '9' * 64)
        self.assertEqual(result['status'], 'AUTH_C04_RESUME_WINDOW_QUALIFIED')
        self.assertEqual(result['executionMode'], 'ORIGINAL_ID_RESUME')
        self.assertIs(result['businessMutationAuthorized'], True)
        self.assertEqual(len([c for c in self.f.commands if c[0]=='systemd-run']), 2)
        r.close(self.p, state)
        self.assertTrue(r.verify(self.p)['runtimeClosed'])


    def test_resume_requires_its_own_mode_and_recovery_stays_false_fifteen_minutes(self):
        self.p['executionMode'] = 'RECOVERY_ONLY'
        self.p['qaCase']['closesAt'] = '2030-01-01T00:15:00Z'
        state = self.ready()
        r.start(self.p, state, '9' * 64)
        self.assertIs(r.qualify_recovery(self.p, state, '9' * 64)['businessMutationAuthorized'], False)
        with self.assertRaisesRegex(AssertionError, 'RESUME_MODE_REQUIRED'):
            r.qualify_resume(self.p, state, '9' * 64)

    def test_resume_missing_normal_timer_blocks_before_start(self):
        self.p['executionMode'] = 'ORIGINAL_ID_RESUME'
        state = self.ready()
        unit = r.timer_bindings(self.p)[1][0]
        self.f.timers.pop(unit)
        before = len(self.f.commands)
        with self.assertRaisesRegex(AssertionError, 'CLOSE_TIMER_REQUIRED'):
            r.start(self.p, state, '9' * 64)
        self.assertFalse(any(c[:2] == ['docker','stop'] for c in self.f.commands[before:]))

    def test_resume_rejects_foreign_case_and_short_tail(self):
        self.p['executionMode'] = 'ORIGINAL_ID_RESUME'
        for change in ({'personId':str(uuid.uuid4())},{'closesAt':'2030-01-01T00:02:00Z','inviteExpiresAt':'2030-01-01T00:01:00Z'}):
            with self.assertRaises(AssertionError):
                r.validate({**self.p,'qaCase':{**self.p['qaCase'],**change}})
        self.assertEqual(self.f.commands, [])

    def test_resume_health_failure_restores_exact_default(self):
        self.p['executionMode'] = 'ORIGINAL_ID_RESUME'
        state = self.ready()
        def healthy(identity):
            if identity == CANDIDATE: raise RuntimeError('HEALTH_TIMEOUT')
            return self.f.inspect(identity)
        with patch.object(r,'wait_healthy',side_effect=healthy), self.assertRaisesRegex(RuntimeError,'HEALTH_TIMEOUT'):
            r.start(self.p,state,'9'*64)
        self.assertTrue(r.verify(self.p)['runtimeClosed'])
        self.assertNotIn(r.MODE,r.env(self.f.inspect('otr-dev-backend')))


    def test_unapproved_resume_stays_closed_before_mutation(self):
        self.p['executionMode'] = 'ORIGINAL_ID_RESUME'
        self.p['ownerAuthorized'] = False
        with self.assertRaisesRegex(AssertionError, 'EXECUTION_NOT_QUALIFIED'):
            r.stage(self.p)
        self.assertEqual(self.f.commands, [])


    def fresh(self):
        self.p['executionMode'] = 'FRESH_INVITATION'
        self.p['qaCase'].update(r.FRESH_CASE)
        self.p['pgFunctionBodyMD5'] = dict(r.FRESH_PG_BODY_MD5)

    def test_fresh_qualifier_uses_new_case_two_absolute_timers_and_exact_restore(self):
        self.fresh()
        state = self.ready()
        self.assertNotIn(r.MODE, r.env(self.f.containers[CANDIDATE]))
        self.assertEqual(json.loads(r.env(self.f.containers[CANDIDATE])[r.SELECTOR]), self.p['qaCase'])
        r.start(self.p, state, '9' * 64)
        result = r.qualify_fresh_invitation(self.p, state, '9' * 64)
        self.assertEqual(result['status'], 'AUTH_C04_FRESH_INVITATION_WINDOW_QUALIFIED')
        self.assertEqual(result['executionMode'], 'FRESH_INVITATION')
        self.assertIs(result['businessMutationAuthorized'], True)
        self.assertEqual([v['calendar'] for v in self.f.timers.values()],
            ['2030-01-01 00:30:00 UTC', '2030-01-01 00:28:00 UTC'])
        with patch.object(r.time, 'time', return_value=r.instant('2030-01-01T01:00:00Z')):
            self.assertEqual(r.close(self.p, state)['containerId'], BASE)
        self.assertTrue(r.verify(self.p)['runtimeClosed'])

    def test_fresh_and_old_cases_and_qualifiers_are_mutually_exclusive(self):
        self.fresh()
        for mode in [None, 'RECOVERY_ONLY', 'ORIGINAL_ID_RESUME']:
            with self.subTest(mode=mode), self.assertRaisesRegex(AssertionError, 'EXACT_A_B_CASE_REQUIRED'):
                r.validate({**self.p, 'executionMode': mode})
        for key in r.CASE:
            if r.CASE[key] == r.FRESH_CASE[key]: continue
            with self.subTest(key=key), self.assertRaisesRegex(AssertionError, 'EXACT_A_B_CASE_REQUIRED'):
                r.validate({**self.p, 'qaCase': {**self.p['qaCase'], key: r.CASE[key]}})
        for qualifier in [r.qualify_resume, r.qualify_recovery]:
            with self.assertRaises(AssertionError): qualifier(self.p, {}, '9' * 64)
        old = {**self.p, 'executionMode': 'ORIGINAL_ID_RESUME', 'qaCase': {**self.p['qaCase'], **r.CASE}}
        with self.assertRaisesRegex(AssertionError, 'FRESH_INVITATION_MODE_REQUIRED'):
            r.qualify_fresh_invitation(old, {}, '9' * 64)
        self.assertEqual(self.f.commands, [])

    def test_fresh_pg_approval_gate_and_bounds_fail_before_mutation(self):
        self.fresh()
        variants = [{'pgFunctionBodyMD5': {}}, {'ownerAuthorized': False}, {'executionQualified': False},
            {'approvedGateSHA256': '03e24e48efb318ec66491e8fa58e8433bc73149c16c3e9dd21eb779c52ed0093'},
            {'qualifiedPreflightSHA256': '0' * 64}]
        for key in r.FRESH_PG_BODY_MD5:
            variants.append({'pgFunctionBodyMD5': {**r.FRESH_PG_BODY_MD5, key: '0' * 32}})
        for change in variants:
            with self.subTest(change=change), self.assertRaises(AssertionError):
                r.stage({**self.p, **change})
        for change in [{'closesAt': '2030-01-01T00:30:01Z'}, {'inviteExpiresAt': '2030-01-01T00:10:01Z'},
                       {'inviteExpiresAt': '2030-01-01T00:01:00Z', 'closesAt': '2030-01-01T00:02:00Z'}]:
            with self.assertRaises(AssertionError):
                r.stage({**self.p, 'qaCase': {**self.p['qaCase'], **change}})
        self.assertEqual(self.f.commands, [])

    def test_fresh_missing_either_timer_blocks_before_stop(self):
        self.fresh()
        state = self.ready()
        original = copy.deepcopy(self.f.timers)
        for unit in original:
            self.f.timers = copy.deepcopy(original)
            self.f.timers.pop(unit)
            before = len(self.f.commands)
            with self.subTest(unit=unit), self.assertRaisesRegex(AssertionError, 'CLOSE_TIMER_REQUIRED'):
                r.start(self.p, state, '9' * 64)
            self.assertFalse(any(c[:2] == ['docker', 'stop'] for c in self.f.commands[before:]))

    def test_fresh_qualified_wire_rejects_timer_and_active_identity_drift(self):
        self.fresh()
        state = self.ready()
        r.start(self.p, state, '9' * 64)
        original = copy.deepcopy(self.f.timers)
        for unit in original:
            for change in [{'calendar': '2030-01-01 00:31:00 UTC'}, {'argv': ['/usr/bin/true']}, {'user': 'other'},
                           {'deadline': '2030-01-01 00:31:00 UTC'}]:
                self.f.timers = copy.deepcopy(original)
                self.f.timers[unit].update(change)
                with self.subTest(unit=unit, change=change), self.assertRaises(AssertionError):
                    r.qualify_fresh_invitation(self.p, state, '9' * 64)
        self.f.timers = original
        self.f.containers[CANDIDATE]['State']['Running'] = False
        with self.assertRaisesRegex(AssertionError, 'FRESH_INVITATION_RUNTIME_NOT_RUNNING'):
            r.qualify_fresh_invitation(self.p, state, '9' * 64)
        self.f.containers[CANDIDATE]['State']['Running'] = True
        self.f.containers[CANDIDATE]['Config']['Env'].append('UNAPPROVED=1')
        with self.assertRaises(AssertionError): r.qualify_fresh_invitation(self.p, state, '9' * 64)

    def test_fresh_health_failure_restores_without_business_outcome(self):
        self.fresh()
        state = self.ready()
        def healthy(identity):
            if identity == CANDIDATE: raise RuntimeError('HEALTH_TIMEOUT')
            return self.f.inspect(identity)
        with patch.object(r, 'wait_healthy', side_effect=healthy), self.assertRaisesRegex(RuntimeError, 'HEALTH_TIMEOUT'):
            r.start(self.p, state, '9' * 64)
        self.assertTrue(r.verify(self.p)['runtimeClosed'])
        self.assertEqual(r.verify(self.p)['businessOutcome'], 'NOT_INFERRED')


if __name__ == '__main__':
    unittest.main()
