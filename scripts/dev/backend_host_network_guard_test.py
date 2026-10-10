import copy
import unittest
import tempfile
import pathlib
import json
import os
from backend_host_network_guard import attested, preserved, preserved_with_evidence

OLD, NEW, OTHER, NETWORK = 'a' * 64, 'b' * 64, 'c' * 64, 'd' * 64
BRIDGE = 'br-' + NETWORK[:12]


def fixture():
    endpoint = {'NetworkID': NETWORK, 'EndpointID': 'old-endpoint', 'MacAddress': '02:00:00:00:00:01', 'IPAddress': '172.18.0.2'}
    own = {'ifname': 'vethold', 'ifindex': 10, 'link_index': 2, 'master': BRIDGE, 'linkinfo': {'info_kind': 'veth'}}
    bridge = {'ifname': BRIDGE, 'ifindex': 9, 'flags': ['UP', 'LOWER_UP'], 'operstate': 'UP', 'mtu': 1500}
    rules = '\n'.join([
        '-A PREROUTING -d 127.0.0.1/32 ! -i lo -p tcp -m tcp --dport 8787 -j DROP',
        f'-A DOCKER -d 172.18.0.2/32 ! -i {BRIDGE} -o {BRIDGE} -p tcp -m tcp --dport 8787 -j ACCEPT',
        f'-A DOCKER -d 127.0.0.1/32 ! -i {BRIDGE} -p tcp -m tcp --dport 8787 -j DNAT --to-destination 172.18.0.2:8787'])
    return {'backend': {'id': OLD, 'network': 'dev-backend_default', 'networks': {'dev-backend_default': endpoint}},
            'docker_networks': {NETWORK: {'Name': 'dev-backend_default', 'Driver': 'bridge', 'Containers': {
                OLD: {'Name': 'otr-dev-backend', 'EndpointID': 'old-endpoint', 'MacAddress': endpoint['MacAddress'], 'IPv4Address': '172.18.0.2/16'}}}},
            'inner_links': [{'ifname': 'eth0', 'ifindex': 2, 'link_index': 10, 'address': endpoint['MacAddress'], 'linkinfo': {'info_kind': 'veth'}}],
            'inner_addresses': [{'ifname': 'eth0', 'addr_info': [{'local': '172.18.0.2'}]}],
            'host_netns': 1, 'backend_netns': 2,
            'links': [own, bridge, {'ifname': 'eth0', 'ifindex': 1, 'mtu': 1500}, {'ifname': 'vethother', 'ifindex': 11, 'mtu': 1500}],
            'addresses': [{'ifname': 'vethold', 'addr_info': [{'local': 'fe80::1'}]}, {'ifname': 'eth0', 'addr_info': [{'local': '2001:db8::1'}]}],
            'routes4': [], 'routes6': [{'dev': 'vethold', 'dst': 'fe80::/64', 'protocol': 'kernel'}, {'dev': 'vethother', 'dst': 'fe80::/64', 'protocol': 'kernel'}],
            'containers': {OLD: {'image': 'old'}, OTHER: {'image': 'other', 'endpoint': 'unchanged'}},
            'firewall4': rules + '\n-A FORWARD -j DROP', 'firewall6': '-A INPUT -j DROP', 'sysctls': {'forwarding': 0}, 'daemon': 'unchanged'}


def host(before):
    after = copy.deepcopy(before)
    after['backend'] = {'id': NEW, 'network': 'host', 'networks': {'host': {}}}
    after['backend_netns'] = after['host_netns']
    after['links'] = [l for l in after['links'] if l['ifname'] != 'vethold']
    after['links'][0]['flags'] = ['UP']
    after['links'][0]['operstate'] = 'DOWN'
    after['addresses'] = [a for a in after['addresses'] if a['ifname'] != 'vethold']
    after['routes6'] = [r for r in after['routes6'] if r['dev'] != 'vethold']
    after['docker_networks'][NETWORK]['Containers'].pop(OLD)
    after['containers'].pop(OLD)
    after['containers'][NEW] = {'image': 'new'}
    after['firewall4'] = '-A FORWARD -j DROP'
    return after


class GuardTests(unittest.TestCase):
    def test_ownership(self):
        self.assertEqual(attested(fixture())['interface'], 'vethold')

    def test_host_lifecycle(self):
        before = fixture()
        self.assertEqual(preserved(before, host(before), 'host')['result'], 'PASS')

    def test_bridge_recreation(self):
        before = fixture()
        after = copy.deepcopy(before)
        after['backend']['id'] = NEW
        after['backend']['networks']['dev-backend_default']['EndpointID'] = 'new-endpoint'
        entry = after['docker_networks'][NETWORK]['Containers'].pop(OLD)
        entry['EndpointID'] = 'new-endpoint'
        after['docker_networks'][NETWORK]['Containers'][NEW] = entry
        after['containers'][NEW] = after['containers'].pop(OLD)
        after['links'][0].update(ifname='vethnew', ifindex=12)
        after['inner_links'][0]['link_index'] = 12
        after['addresses'][0]['ifname'] = 'vethnew'
        after['routes6'][0]['dev'] = 'vethnew'
        self.assertEqual(preserved(before, after, 'bridge')['result'], 'PASS')

    def test_drift_rejected(self):
        changes = {
            'other_veth': lambda a: a['links'][-1].update(mtu=1400),
            'physical_interface': lambda a: a['links'][1].update(mtu=1400),
            'extra_veth': lambda a: a['links'].append({'ifname': 'vethunknown', 'ifindex': 99}),
            'other_route': lambda a: a['routes6'][0].update(dst='::/0'),
            'other_address': lambda a: a['addresses'][0]['addr_info'][0].update(local='2001:db8::2'),
            'other_container': lambda a: a['containers'][OTHER].update(image='changed'),
            'other_endpoint': lambda a: a['docker_networks'][NETWORK]['Containers'].update({OTHER: {'EndpointID': 'changed'}}),
            'firewall': lambda a: a.update(firewall4=a['firewall4'] + '\n-A INPUT -j ACCEPT'),
            'forwarding': lambda a: a['sysctls'].update(forwarding=1),
            'bridge_admin': lambda a: a['links'][0].update(flags=[]),
            'daemon': lambda a: a.update(daemon='restarted'),
        }
        for name, change in changes.items():
            with self.subTest(name=name):
                before = fixture()
                after = host(before)
                change(after)
                with self.assertRaises(AssertionError):
                    preserved(before, after, 'host')

    def test_false_ownership_rejected(self):
        for field, value in [('link_index', 99), ('address', 'wrong')]:
            before = fixture()
            before['inner_links'][0][field] = value
            with self.assertRaises(AssertionError):
                attested(before)


class DiagnosticTests(unittest.TestCase):
    def test_mismatch_persisted_before_rollback(self):
        before = fixture()
        after = host(before)
        after['links'][-1]['mtu'] = 1400
        with tempfile.TemporaryDirectory() as directory:
            os.chmod(directory, 0o700)
            with self.assertRaisesRegex(AssertionError, 'UNRELATED_INTERFACES'):
                preserved_with_evidence(before, after, 'host', directory)
            # This is the controller's rollback-entry point; evidence must already exist.
            diagnostic = pathlib.Path(directory) / 'preservation-host-mismatch.json'
            data = json.loads(diagnostic.read_text())
            row = data['mismatches'][0]
            self.assertEqual(row['path'], '/interfaces/vethother/mtu')
            self.assertEqual((row['expected'], row['observed'], row['ownership']), (1500, 1400, 'unrelated'))
            self.assertEqual(diagnostic.stat().st_mode & 0o777, 0o600)
            self.assertTrue((pathlib.Path(directory) / 'preservation-host-interfaces.json').exists())

    def test_carrier_flag_is_diagnosed_without_weakening_guard(self):
        before = fixture()
        after = host(before)
        after['links'][0]['flags'].append('NO-CARRIER')
        rows = []
        with self.assertRaisesRegex(AssertionError, 'UNRELATED_INTERFACES'):
            preserved(before, after, 'host', diagnostics=rows.append)
        self.assertEqual(rows[0]['mismatches'][0]['path'], '/interfaces/' + BRIDGE + '/flags')
        self.assertEqual(rows[0]['mismatches'][0]['observed'], ['UP', 'NO-CARRIER'])
        self.assertEqual(rows[0]['mismatches'][0]['ownership'], 'backend_bridge')

    def test_indices_presence_and_lifecycle_attributes_are_reported(self):
        for field, value in [('ifindex', 99), ('link_index', 99), ('link_netnsid', 99), ('qdisc', 'fq')]:
            before = fixture()
            after = host(before)
            after['links'][-1][field] = value
            rows = []
            with self.assertRaisesRegex(AssertionError, 'UNRELATED_INTERFACES'):
                preserved(before, after, 'host', diagnostics=rows.append)
            self.assertEqual(rows[0]['mismatches'][0]['path'], '/interfaces/vethother/' + field)
        after = host(fixture())
        after['links'].pop()
        rows = []
        with self.assertRaisesRegex(AssertionError, 'UNRELATED_INTERFACES'):
            preserved(fixture(), after, 'host', diagnostics=rows.append)
        self.assertEqual(rows[0]['mismatches'][0]['observed'], False)

    def test_unknown_values_are_redacted_and_diagnostics_bounded(self):
        before = fixture()
        after = host(before)
        sentinel = 'sb_secret_SYNTHETIC_DIAGNOSTIC_SENTINEL'
        after['links'][-1]['unknown'] = sentinel
        after['links'][-1]['operstate'] = sentinel
        for number in range(40):
            after['links'].append({'ifname': 'dummy' + str(number), 'ifindex': 100 + number})
        with tempfile.TemporaryDirectory() as directory:
            os.chmod(directory, 0o700)
            with self.assertRaisesRegex(AssertionError, 'UNRELATED_INTERFACES'):
                preserved_with_evidence(before, after, 'host', directory)
            texts = [p.read_text() for p in pathlib.Path(directory).iterdir()]
            self.assertNotIn(sentinel, ''.join(texts))
            data = json.loads((pathlib.Path(directory) / 'preservation-host-mismatch.json').read_text())
            self.assertEqual(len(data['mismatches']), 32)
            self.assertTrue(data['truncated'])

    def test_success_keeps_evidence_and_guard_result(self):
        with tempfile.TemporaryDirectory() as directory:
            os.chmod(directory, 0o700)
            self.assertEqual(preserved_with_evidence(fixture(), host(fixture()), 'host', directory)['result'], 'PASS')
            self.assertFalse((pathlib.Path(directory) / 'preservation-host-mismatch.json').exists())

    def test_permissive_custody_and_overwrite_reject(self):
        with tempfile.TemporaryDirectory() as directory:
            os.chmod(directory, 0o755)
            with self.assertRaisesRegex(AssertionError, 'DIAGNOSTIC_CUSTODY'):
                preserved_with_evidence(fixture(), host(fixture()), 'host', directory)
            os.chmod(directory, 0o700)
            preserved_with_evidence(fixture(), host(fixture()), 'host', directory)
            with self.assertRaises(FileExistsError):
                preserved_with_evidence(fixture(), host(fixture()), 'host', directory)


if __name__ == '__main__':
    unittest.main()
