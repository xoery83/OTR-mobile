"""No Docker/network access; exact payload mutation tests only."""
import copy
import unittest
from unittest.mock import patch
import universal_continuous_container as m


class ContainerTests(unittest.TestCase):
    def test_preserves_original_and_appends_only_approved_delta(self):
        config = {'Env': ['OTR_DEV_BACKEND_NETWORK_MODE=host',
                         'OTR_DEV_SUPABASE_URL=https://tuqigdxrvrerfewsxqgm.supabase.co', 'EXISTING=preserved'],
                  'Image': m.BASE_IMAGE, 'User': 'otr', 'Cmd': ['node', 'server-capture.mjs']}
        host = {'Binds': ['a:a:ro'], 'Mounts': [{'Type': 'bind', 'Source': s, 'Target': s} for s in ['b', 'c', 'd']],
                'RestartPolicy': {'Name': 'unless-stopped'}}
        snapshot = {'Id': m.ORIGINAL, 'Image': m.BASE_IMAGE, 'Config': config, 'HostConfig': host,
                    'State': {'Health': {'Status': 'healthy'}}}
        before = copy.deepcopy(snapshot)
        with patch.object(m, 'CONFIG_SHA', m.sha(m.canonical(config))), patch.object(m, 'HOST_SHA', m.sha(m.canonical(host))):
            value = m.payload(snapshot, 'fixture-private-value')
            self.assertEqual(value['HostConfig']['Binds'][:1], host['Binds'])
            self.assertEqual(value['HostConfig']['Mounts'], host['Mounts'])
            self.assertEqual(len(value['HostConfig']['Binds']), 3)
            self.assertEqual(value['User'], 'otr')
            self.assertEqual(value['Cmd'], config['Cmd'])
            self.assertIn('EXISTING=preserved', value['Env'])
            with self.assertRaises(ValueError):
                m.payload(snapshot, '')
            snapshot['State']['Health']['Status'] = 'unhealthy'
            with self.assertRaises(ValueError):
                m.payload(snapshot, 'fixture-private-value')
        snapshot['State']['Health']['Status'] = 'healthy'
        self.assertEqual(snapshot, before)

    def test_baseline_drift_rejected(self):
        with self.assertRaises(ValueError):
            m.payload({'Id': 'changed'}, 'fixture')
