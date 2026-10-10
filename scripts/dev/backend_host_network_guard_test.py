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
            'firewall4': '*raw\n' + rules + f'\n-A PREROUTING -d 172.18.0.2/32 ! -i {BRIDGE} -j DROP\nCOMMIT\n-A FORWARD -j DROP', 'firewall6': '-A INPUT -j DROP', 'sysctls': {'forwarding': 0}, 'daemon': 'unchanged'}


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
    after['firewall4'] = '*raw\nCOMMIT\n-A FORWARD -j DROP'
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

    def test_attested_empty_bridge_no_carrier_allowed(self):
        before = fixture()
        after = host(before)
        after['links'][0]['flags'].append('NO-CARRIER')
        self.assertEqual(preserved(before, after, 'host')['result'], 'PASS')

    def test_carrier_exception_remains_narrow(self):
        for name in ['unrelated_bridge', 'unrelated_interface', 'extra_flag',
                     'bridge_mtu', 'bridge_index', 'active_no_carrier', 'shared_port']:
            with self.subTest(name=name):
                before = fixture()
                after = host(before)
                after['links'][0]['flags'].append('NO-CARRIER')
                if name in ['unrelated_bridge', 'unrelated_interface']:
                    link = {'ifname': 'br-other' if name == 'unrelated_bridge' else 'eth-other',
                            'ifindex': 90, 'flags': ['UP'], 'mtu': 1500}
                    before['links'].append(copy.deepcopy(link))
                    link['flags'].append('NO-CARRIER')
                    after['links'].append(link)
                elif name == 'extra_flag':
                    after['links'][0]['flags'].append('PROMISC')
                elif name == 'bridge_mtu':
                    after['links'][0]['mtu'] = 1400
                elif name == 'bridge_index':
                    after['links'][0]['ifindex'] = 99
                elif name == 'active_no_carrier':
                    before['links'][1]['flags'].append('NO-CARRIER')
                else:
                    port = {'ifname': 'vethshared', 'ifindex': 91, 'master': BRIDGE}
                    before['links'].append(copy.deepcopy(port))
                    after['links'].append(port)
                    after['links'][0]['operstate'] = 'UP'
                    after['links'][0]['flags'].append('LOWER_UP')
                with self.assertRaises(AssertionError):
                    preserved(before, after, 'host')

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


class ContainerDiagnosticTests(unittest.TestCase):
    def test_container_failures_are_durable_and_identified(self):
        for field, value in [('image', 'sha256:' + 'e' * 64), ('pid', 999),
                             ('network', 'host'), ('ports', {'8787/tcp': [{'HostIp': '0.0.0.0', 'HostPort': '8787'}]}),
                             ('status', 'restarting'), ('health', 'unhealthy'), ('presence', None)]:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as directory:
                os.chmod(directory, 0o700)
                before = fixture()
                before['containers'][OTHER].update(name='fixture-other', image='sha256:' + 'f' * 64,
                    pid=123, network='none', ports={}, status='running', health='healthy')
                after = host(before)
                if field == 'presence':
                    after['containers'].pop(OTHER)
                else:
                    after['containers'][OTHER][field] = value
                with self.assertRaisesRegex(AssertionError, 'UNRELATED_CONTAINERS'):
                    preserved_with_evidence(before, after, 'host', directory)
                # Rollback entry sees the durable normalized comparison mismatch.
                data = json.loads((pathlib.Path(directory) / 'preservation-host-mismatch.json').read_text())
                row = data['mismatches'][0]
                self.assertEqual(row['container_id'], OTHER)
                self.assertEqual(row['name'], 'fixture-other')
                self.assertEqual(row['ownership'], 'unrelated')
                self.assertTrue(row['path'].startswith('/containers/' + OTHER))
                self.assertTrue((pathlib.Path(directory) / 'preservation-host-containers.json').exists())

    def test_remaining_predicates_emit_before_rollback(self):
        changes = {
            'UNRELATED_ADDRESSES': lambda a: a['addresses'][0]['addr_info'][0].update(local='2001:db8::2'),
            'UNRELATED_ROUTES6': lambda a: a['routes6'][0].update(dst='::/0'),
            'UNRELATED_DOCKER_NETWORKS': lambda a: a['docker_networks'][NETWORK].update(Driver='changed'),
            'UNRELATED_FIREWALL4': lambda a: a.update(firewall4=a['firewall4'] + '\n-A INPUT -j ACCEPT'),
            'UNCHANGED_FIREWALL6': lambda a: a.update(firewall6='changed'),
            'UNCHANGED_SYSCTLS': lambda a: a['sysctls'].update(forwarding=1),
            'UNCHANGED_DAEMON': lambda a: a.update(daemon='restarted'),
            'BRIDGE_ADMIN_UP': lambda a: a['links'][0].update(flags=[]),
            'HOST_NETWORK': lambda a: a['backend'].update(network='none'),
        }
        for code, change in changes.items():
            with self.subTest(code=code), tempfile.TemporaryDirectory() as directory:
                os.chmod(directory, 0o700)
                before = fixture()
                after = host(before)
                change(after)
                with self.assertRaisesRegex(AssertionError, code):
                    preserved_with_evidence(before, after, 'host', directory)
                data = json.loads((pathlib.Path(directory) / 'preservation-host-mismatch.json').read_text())
                self.assertEqual(data['code'], code)
                self.assertTrue(data['mismatches'])

    def test_nonsecret_bounds_paths_and_missing_null(self):
        before = fixture()
        after = host(before)
        sentinel = 'sb_secret_SYNTHETIC_CONTAINER_SENTINEL'
        after['containers'][OTHER].update(labels={sentinel: sentinel}, mounts=[{'Source': sentinel}], **{sentinel: sentinel})
        with tempfile.TemporaryDirectory() as directory:
            os.chmod(directory, 0o700)
            with self.assertRaisesRegex(AssertionError, 'UNRELATED_CONTAINERS'):
                preserved_with_evidence(before, after, 'host', directory)
            self.assertNotIn(sentinel, ''.join(p.read_text() for p in pathlib.Path(directory).iterdir() if 'comparison-operands' not in p.name and 'firewall-inputs' not in p.name))
        from backend_host_network_guard import structured_mismatches
        data = structured_mismatches('UNRELATED_CONTAINERS', {OTHER: {}}, {OTHER: {'health': None}}, 'containers')
        self.assertFalse(data['mismatches'][0]['expected_present'])
        data = structured_mismatches('UNRELATED_CONTAINERS', {}, {('e' * 60 + format(i, '04x')): {} for i in range(100)}, 'containers')
        self.assertEqual(len(data['mismatches']), 32)
        self.assertTrue(data['truncated'])

    def test_canonical_comparison_stays_exact(self):
        before = fixture()
        before['routes6'][-1]['metric'] = 1
        after = host(before)
        after['routes6'][0]['metric'] = 1.0
        with self.assertRaisesRegex(AssertionError, 'UNRELATED_ROUTES6'):
            preserved(before, after, 'host')
        rows = []
        with self.assertRaisesRegex(AssertionError, 'UNRELATED_ROUTES6'):
            preserved(before, after, 'host', diagnostics=rows.append)
        self.assertTrue(rows[0]['mismatches'])


class FirewallDiagnosticTests(unittest.TestCase):
    def test_private_operands_before_rollback_public_structure_only(self):
        before = fixture()
        after = host(before)
        sentinel = 'sb_secret_SYNTHETIC_FIREWALL_COMMENT'
        after['firewall4'] += '\n-A INPUT -m comment --comment "' + sentinel + '" -j ACCEPT'
        with tempfile.TemporaryDirectory() as directory:
            os.chmod(directory, 0o700)
            with self.assertRaisesRegex(AssertionError, 'UNRELATED_FIREWALL4'):
                preserved_with_evidence(before, after, 'host', directory)
            private = pathlib.Path(directory) / 'preservation-host-comparison-operands.json'
            self.assertIn(sentinel, private.read_text())
            self.assertEqual(private.stat().st_mode & 0o777, 0o600)
            data = json.loads((pathlib.Path(directory) / 'preservation-host-mismatch.json').read_text())
            self.assertNotIn(sentinel, json.dumps(data))
            self.assertEqual(data['mismatches'][0]['operation'], 'insert')
            self.assertEqual(data['mismatches'][0]['observed'][0]['target'], 'ACCEPT')
            self.assertEqual(data['mismatches'][0]['ownership'], 'unattested')

    def test_large_shift_is_one_edit_not_positional_cascade(self):
        from backend_host_network_guard import firewall_mismatches
        rules = ['*filter'] + ['-A FORWARD -p tcp --dport ' + str(i) + ' -j DROP' for i in range(200)] + ['COMMIT']
        after = rules[:150] + ['-A INPUT -j ACCEPT'] + rules[150:]
        data = firewall_mismatches('UNRELATED_FIREWALL4', rules, after, attested(fixture()))
        self.assertEqual(data['operation_count'], 1)
        self.assertFalse(data['truncated'])
        self.assertEqual(data['mismatches'][0]['expected_range'], [150, 150])
        self.assertEqual(data['mismatches'][0]['observed'][0]['table'], 'filter')
        self.assertEqual(data['mismatches'][0]['observed'][0]['chain'], 'INPUT')

    def test_reorder_delete_replace_policy_and_other_docker_rule_reject(self):
        from backend_host_network_guard import firewall_mismatches
        rules = ['*filter', ':FORWARD DROP [COUNTERS]', '-A FORWARD -j DROP', '-A INPUT -j DROP', 'COMMIT']
        reorder = rules[:2] + [rules[3], rules[2]] + rules[4:]
        self.assertEqual(firewall_mismatches('X', rules, reorder, attested(fixture()))['change_class'], 'reordering')
        for tail in ['-A INPUT -j ACCEPT', '-A DOCKER-USER -j ACCEPT', '-A FORWARD -j ACCEPT']:
            before = fixture()
            after = host(before)
            after['firewall4'] += '\n' + tail
            with self.assertRaisesRegex(AssertionError, 'UNRELATED_FIREWALL4'):
                preserved(before, after, 'host')
        for changed in [rules[:-2] + rules[-1:], rules[:1] + [':FORWARD ACCEPT [COUNTERS]'] + rules[2:]]:
            self.assertTrue(firewall_mismatches('X', rules, changed, attested(fixture()))['mismatches'])

    def test_unrelated_reorder_and_deletion_remain_fail_closed(self):
        before = fixture()
        before['firewall4'] += '\n-A INPUT -j DROP\n-A OUTPUT -j DROP'
        for tail in ['-A OUTPUT -j DROP', '-A OUTPUT -j DROP\n-A INPUT -j DROP']:
            after = host(before)
            after['firewall4'] += '\n' + tail
            with self.assertRaisesRegex(AssertionError, 'UNRELATED_FIREWALL4'):
                preserved(before, after, 'host')

    def test_allowed_publication_lifecycle_and_counter_normalization(self):
        before = fixture()
        after = host(before)
        before['firewall4'] += '\n:FORWARD DROP [1:2]'
        after['firewall4'] += '\n:FORWARD DROP [100:200]'
        self.assertEqual(preserved(before, after, 'host')['result'], 'PASS')

    def test_noncontainer_none_is_never_backend_owned(self):
        from backend_host_network_guard import structured_mismatches
        data = structured_mismatches('X', {'forwarding': 0}, {'forwarding': 1}, 'sysctls', attested(fixture()), None)
        self.assertEqual(data['mismatches'][0]['ownership'], 'unattested')


class EndpointDropTests(unittest.TestCase):
    def test_endpoint_drop_presence_and_scope_fail_closed(self):
        rule = f'-A PREROUTING -d 172.18.0.2/32 ! -i {BRIDGE} -j DROP'
        for change in ['missing_before', 'duplicate_before', 'present_host', 'wrong_table',
                       'other_address', 'other_bridge', 'other_target']:
            with self.subTest(change=change):
                before = fixture()
                after = host(before)
                if change == 'missing_before':before['firewall4'] = before['firewall4'].replace(rule, '')
                elif change == 'duplicate_before':before['firewall4'] = before['firewall4'].replace(rule, rule + '\n' + rule)
                elif change == 'present_host':after['firewall4'] = after['firewall4'].replace('*raw', '*raw\n' + rule)
                elif change == 'wrong_table':before['firewall4'] = before['firewall4'].replace('*raw', '*filter')
                else:
                    extra = rule.replace('172.18.0.2', '172.18.0.3') if change == 'other_address' else rule.replace(BRIDGE, 'br-other') if change == 'other_bridge' else rule.replace('DROP', 'ACCEPT')
                    after['firewall4'] = after['firewall4'].replace('*raw', '*raw\n' + extra)
                with self.assertRaises(AssertionError):preserved(before, after, 'host')

    def test_shared_endpoint_address_rejects_ownership(self):
        before = fixture()
        before['docker_networks']['e' * 64] = {'Containers': {OTHER: {'IPv4Address': '172.18.0.2/16', 'EndpointID': 'other'}}}
        with self.assertRaisesRegex(AssertionError, 'EXCLUSIVE_ENDPOINT_IP'):
            preserved(before, host(before), 'host')

    def test_expected_rule_removed_without_changing_other_order(self):
        before = fixture()
        after = host(before)
        self.assertEqual(preserved(before, after, 'host')['result'], 'PASS')
        after['firewall4'] += '\n-A DOCKER-USER -j ACCEPT'
        with self.assertRaisesRegex(AssertionError, 'UNRELATED_FIREWALL4'):
            preserved(before, after, 'host')


if __name__ == '__main__':
    unittest.main()
