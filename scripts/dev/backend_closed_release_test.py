"""Local checks for feature-neutral closed packets and Host-custodied renewal."""
import hashlib
import json
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'import'))
from cp14_host_session import ACTOR, ensure_session, private_json, write_exclusive


class ClosedReleasePacket(unittest.TestCase):
    def test_packet_and_drift(self):
        commit = subprocess.check_output(
            ['git', '-C', str(HERE), 'rev-parse', 'HEAD'], text=True,
        ).strip()
        image = 'sha256:' + 'a' * 64
        with tempfile.TemporaryDirectory() as tmp:
            packet = Path(tmp).resolve()

            def artifact(name, content):
                path = packet / name
                path.write_bytes(content)
                return {'path': str(path), 'sha256': hashlib.sha256(content).hexdigest()}

            plan = {
                'candidateImage': image,
                'sourceCommit': commit,
                'beforeContainerId': 'b' * 64,
                'beforeImage': 'sha256:' + 'c' * 64,
                'containerName': 'test-candidate',
                'backupName': 'test-retained',
                'bundles': {'server.mjs': 'd' * 64},
                'writerDevice': 10,
                'writerInode': 20,
                'caddySocketDevice': 10,
                'caddySocketInode': 21,
                'mountedFileHashes': {},
                'protectedRoutes': [['/protected', 401]],
                **dict.fromkeys(('beforeConfigSHA256', 'beforeHostConfigSHA256',
                                 'beforeEnvironmentSHA256', 'beforeMountsSHA256',
                                 'caddySHA256'), 'd' * 64),
            }
            request = {
                'executionId': 'e' * 32,
                'project': 'tuqigdxrvrerfewsxqgm',
                'sourceCommit': commit,
                'candidateImage': image,
                'effects': {'sqlWrites': 0, 'providerCalls': 0, 'businessWindowOpened': False},
                'sqlOrder': [],
                'archive': {**artifact('images.tar.gz', b'sealed archive'), 'bytes': 14},
                'artifactPins': {
                    'release.py': artifact('release.py', (HERE / 'backend_closed_release_host.py').read_bytes()),
                    'deploy-plan.json': artifact('deploy-plan.json', json.dumps(plan).encode()),
                },
            }

            def check():
                fixed = artifact('EXECUTION_REQUEST.json', json.dumps(request).encode())
                return subprocess.run(
                    [sys.executable, '-B', str(HERE / 'backend_closed_release.py'),
                     'check', fixed['path'], fixed['sha256']], capture_output=True, text=True,
                )

            result = check()
            self.assertEqual((result.returncode, result.stdout.strip()), (0, 'ALL_FIXED_INPUTS_MATCH'), result.stderr)
            (packet / 'images.tar.gz').write_bytes(b'sealed archivE')
            self.assertIn('ARCHIVE_LOCAL_DRIFT', check().stderr)
            request['project'] = 'different-project'
            self.assertIn('DEV_SCOPE', check().stderr)
            self.assertFalse((packet / 'execution.json').exists())


class CustodiedSession(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.auth = self.root / 'auth.json'
        self.config = self.root / 'config.json'
        write_exclusive(self.auth, {'accountId': ACTOR, 'session': {
            'expires_at': time.time() - 10, 'refresh_token': 'fixture-old',
        }})
        write_exclusive(self.config, {'publishableKey': 'fixture-publishable'})
        self.calls = []

    def send(self, path, key, deadline, **credentials):
        self.calls.append(path)
        self.assertEqual(key, 'fixture-publishable')
        if path.endswith('grant_type=refresh_token'):
            self.assertEqual(credentials, {'refresh': 'fixture-old'})
            return {'user': {'id': ACTOR}, 'access_token': 'fixture-access',
                    'refresh_token': 'fixture-rotated', 'expires_in': 3600}
        self.assertEqual(credentials, {'access': 'fixture-access'})
        return {'id': ACTOR, 'email_confirmed_at': 'confirmed'}

    def test_refresh_once_and_keep_current(self):
        result = ensure_session(self.auth, self.config, send=self.send)
        self.assertEqual(result['status'], 'SAME_ACTOR_REFRESHED_VERIFIED_SAVED')
        self.assertEqual(private_json(self.auth)[0]['session']['refresh_token'], 'fixture-rotated')
        self.assertEqual(ensure_session(self.auth, self.config, send=self.send)['status'], 'CURRENT')
        self.assertEqual(self.calls, ['/auth/v1/token?grant_type=refresh_token', '/auth/v1/user'])
        self.assertNotIn('fixture-', json.dumps(result))

    def test_timeout_and_unverified_identity_fence_refresh(self):
        for failure in ('timeout', 'identity'):
            with self.subTest(failure=failure):
                original = self.auth.read_bytes()
                calls = []

                def send(path, key, deadline, **credentials):
                    calls.append(path)
                    if failure == 'timeout':
                        raise TimeoutError()
                    if path == '/auth/v1/user':
                        return {'id': 'different-actor'}
                    return self.send(path, key, deadline, **credentials)

                result = ensure_session(self.auth, self.config, send=send)
                self.assertEqual(result['status'], 'UNKNOWN_NO_RETRY')
                self.assertEqual(self.auth.read_bytes(), original)
                self.assertEqual(ensure_session(self.auth, self.config, send=send)['status'], 'RECONCILE_ONLY')
                self.assertEqual(len(calls), 1 if failure == 'timeout' else 2)
                for path in self.root.glob('cp14-session-renewal*'):
                    path.unlink()


if __name__ == '__main__':
    unittest.main()
