"""Nonsecret snapshot guard: only an attested DEV Backend attachment may change."""
import copy
import ipaddress
import json
import re
import os
import pathlib
import stat
import time


def require(condition, code):
    if not condition:
        raise AssertionError(code)


def attested(snapshot):
    backend = snapshot['backend']
    require(re.fullmatch(r'[0-9a-f]{64}', backend['id']) is not None, 'BACKEND_ID')
    require(set(backend['networks']) == {'dev-backend_default'}, 'BRIDGE_ENDPOINT')
    endpoint = backend['networks']['dev-backend_default']
    network = snapshot['docker_networks'][endpoint['NetworkID']]
    require(network['Name'] == 'dev-backend_default' and network['Driver'] == 'bridge', 'NETWORK_ID')
    entry = network['Containers'][backend['id']]
    require(entry['Name'] == 'otr-dev-backend' and entry['EndpointID'] == endpoint['EndpointID']
            and entry['MacAddress'] == endpoint['MacAddress']
            and str(ipaddress.ip_interface(entry['IPv4Address']).ip) == endpoint['IPAddress'], 'ENDPOINT_IDENTITY')
    peers = [link for link in snapshot['inner_links'] if link['ifname'] != 'lo']
    require(len(peers) == 1, 'SINGLE_PEER')
    peer = peers[0]
    require(peer['ifname'] == 'eth0' and peer['address'] == endpoint['MacAddress']
            and peer.get('linkinfo', {}).get('info_kind') == 'veth', 'PEER_MAC_KIND')
    require(any(a['local'] == endpoint['IPAddress'] for i in snapshot['inner_addresses']
                if i['ifname'] == 'eth0' for a in i['addr_info']), 'PEER_IP')
    matches = [link for link in snapshot['links'] if link['ifindex'] == peer['link_index']]
    require(len(matches) == 1, 'HOST_PEER_INDEX')
    host = matches[0]
    require(host['link_index'] == peer['ifindex'] and host.get('linkinfo', {}).get('info_kind') == 'veth', 'RECIPROCAL_VETH')
    bridge = network.get('Options', {}).get('com.docker.network.bridge.name') or 'br-' + endpoint['NetworkID'][:12]
    require(host['master'] == bridge and snapshot['host_netns'] != snapshot['backend_netns'], 'BRIDGE_NAMESPACE')
    return {'container': backend['id'], 'endpoint': endpoint['EndpointID'], 'network': endpoint['NetworkID'],
            'interface': host['ifname'], 'ifindex': host['ifindex'], 'bridge': bridge, 'ip': endpoint['IPAddress']}


def canonical(rows):
    return sorted(json.dumps(row, sort_keys=True) for row in rows)



# Values are selected from ip-link metadata only; unknown fields/values never enter diagnostics.
INTERFACE_FIELDS = {'address', 'broadcast', 'flags', 'group', 'ifindex', 'ifname',
                    'link_index', 'link_netnsid', 'link_type', 'linkinfo', 'linkmode',
                    'master', 'mtu', 'operstate', 'qdisc', 'txqlen'}


def safe_value(field, value):
    if value is None:
        return None
    if field in {'ifindex', 'link_index', 'link_netnsid', 'mtu', 'txqlen'}:
        return value if type(value) is int and 0 <= value <= 2 ** 32 else '<redacted>'
    if field in {'address', 'broadcast'}:
        return value if isinstance(value, str) and re.fullmatch(r'(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}', value) else '<redacted>'
    if field == 'flags':
        return value if isinstance(value, list) and len(value) <= 16 and all(isinstance(v, str) and v in {'BROADCAST', 'MULTICAST', 'UP', 'LOWER_UP', 'LOOPBACK', 'NO-CARRIER', 'POINTOPOINT', 'RUNNING', 'PROMISC', 'ALLMULTI', 'DORMANT', 'NOARP', 'SLAVE', 'MASTER', 'ECHO', 'NOTRAILERS', 'DEBUG'} for v in value) else '<redacted>'
    if field == 'linkinfo':
        return {'info_kind': safe_value('info_kind', value.get('info_kind'))} if isinstance(value, dict) else '<redacted>'
    if field in {'ifname', 'master'}:
        return value if isinstance(value, str) and re.fullmatch(r'[a-zA-Z0-9_.:@-]{1,15}', value) else '<redacted>'
    if field in {'group', 'link_type', 'linkmode', 'operstate', 'qdisc', 'info_kind'}:
        allowed = {'group': {'default'}, 'link_type': {'ether', 'loopback', 'none', 'sit', 'gre', 'ipip', 'infiniband', 'ppp', 'tunnel6', 'ip6gre'},
                   'linkmode': {'DEFAULT', 'DORMANT'}, 'operstate': {'UNKNOWN', 'NOTPRESENT', 'DOWN', 'LOWERLAYERDOWN', 'TESTING', 'DORMANT', 'UP'},
                   'qdisc': {'noqueue', 'fq_codel', 'fq', 'pfifo_fast', 'mq', 'htb', 'tbf', 'cake'},
                   'info_kind': {'bridge', 'veth', 'dummy', 'bond', 'vlan', 'vxlan', 'geneve', 'tun', 'macvlan', 'ipvlan', 'wireguard'}}
        return value if isinstance(value, str) and value in allowed[field] else '<redacted>'
    return '<redacted>'


def interface_mismatches(expected, observed, old, new):
    left = {row['ifname']: row for row in expected}
    right = {row['ifname']: row for row in observed}
    rows = []
    count = 0
    for name in sorted(set(left) | set(right)):
        ownership = 'backend_bridge' if name == old['bridge'] else 'unrelated'
        fields = sorted(set(left.get(name, {})) | set(right.get(name, {}))) if name in left and name in right else ['presence']
        for field in fields:
            a = left.get(name, {}).get(field)
            b = right.get(name, {}).get(field)
            if field == 'presence':
                a, b = name in left, name in right
            if a == b and (field in left.get(name, {})) == (field in right.get(name, {})):
                continue
            count += 1
            if len(rows) < 32:
                safe_field = field if field in INTERFACE_FIELDS or field == 'presence' else '$unrecognized_field'
                rows.append({'path': '/interfaces/' + safe_value('ifname', name) + '/' + safe_field,
                             'expected': a if field == 'presence' else safe_value(field, a),
                             'observed': b if field == 'presence' else safe_value(field, b),
                             'ownership': ownership, 'expected_ifindex': safe_value('ifindex', left.get(name, {}).get('ifindex')),
                             'observed_ifindex': safe_value('ifindex', right.get(name, {}).get('ifindex'))})
    return {'code': 'UNRELATED_INTERFACES', 'mismatches': rows, 'mismatch_count': count,
            'truncated': count > len(rows), 'old_attachment': old, 'new_attachment': new}


# Diagnostics use known metadata shapes only; equality always uses the original operands.
DIFF_FIELDS = INTERFACE_FIELDS | {'id', 'name', 'image', 'status', 'health', 'pid', 'network',
    'ports', 'labels', 'networks', 'mounts', 'user', 'HostIp', 'HostPort', 'Name', 'Id',
    'Driver', 'Options', 'IPAM', 'Internal', 'EnableIPv6', 'Containers', 'NetworkID',
    'EndpointID', 'MacAddress', 'IPAddress', 'IPv4Address', 'IPv6Address', 'Gateway',
    'IPv6Gateway', 'IPPrefixLen', 'GlobalIPv6Address', 'GlobalIPv6PrefixLen', 'Aliases',
    'DNSNames', 'IPAMConfig', 'Links', 'DriverOpts', 'Network', 'Endpoint', 'Type',
    'Source', 'Destination', 'Mode', 'RW', 'Propagation', 'interface', 'family', 'local',
    'prefixlen', 'scope', 'label', 'dev', 'dst', 'gateway', 'prefsrc', 'protocol', 'table',
    'metric', 'type', 'expected', 'observed', 'presence', 'com.docker.compose.project',
    'com.docker.compose.service'}
KNOWN_NAMES = {'otr-dev-backend', '/otr-dev-backend', 'dev-backend', 'backend', 'otr',
    'host', 'none', 'default', 'dev-backend_default', 'otr_default', 'media-service',
    'stt-service', 'image-index-service', 'face-service', 'fixture-other',
    '/otr-media-service', '/otr-stt-service', '/otr-image-index-service', '/otr-face-service'}


def safe_segment(value):
    value = str(value)
    if value in DIFF_FIELDS or re.fullmatch(r'[0-9a-f]{64}|[0-9]{1,5}(?:/(?:tcp|udp))?', value):
        return value.replace('~', '~0').replace('/', '~1')
    if value in KNOWN_NAMES:
        return value
    if re.fullmatch(r'net/(?:ipv[46]/conf/[A-Za-z0-9_.:@-]{1,15}/(?:forwarding|disable_ipv6|accept_ra|autoconf)|ipv4/ip_forward)', value):
        return value.replace('/', '~1')
    return '$redacted_key'


def metadata_value(field, value):
    if value is None:
        return None
    if field in INTERFACE_FIELDS:
        return safe_value(field, value)
    if field not in DIFF_FIELDS and field not in {'sysctl', 'daemon'}:
        return '<redacted>'
    if type(value) is bool or type(value) is int:
        return value if -1 <= value <= 2 ** 32 else '<redacted>'
    if not isinstance(value, str):
        return '<redacted>'
    if field in {'id', 'Id', 'NetworkID', 'EndpointID', 'image'}:
        return value if re.fullmatch(r'(?:sha256:)?[0-9a-f]{64}', value) else '<redacted>'
    if field in {'name', 'Name', 'network', 'user', 'com.docker.compose.project', 'com.docker.compose.service'}:
        return value if value in KNOWN_NAMES or re.fullmatch(r'[0-9a-f]{64}', value) else '<redacted>'
    if field in {'status', 'health'}:
        return value if value in {'running', 'exited', 'created', 'paused', 'restarting', 'removing', 'dead', 'healthy', 'unhealthy', 'starting'} else '<redacted>'
    if field == 'MacAddress':
        return safe_value('address', value)
    if field in {'HostIp', 'IPAddress', 'IPv4Address', 'IPv6Address', 'Gateway', 'IPv6Gateway',
                 'GlobalIPv6Address', 'local', 'dst', 'gateway', 'prefsrc'}:
        try:
            ipaddress.ip_interface(value)
            return value
        except ValueError:
            return 'default' if field == 'dst' and value == 'default' else '<redacted>'
    if field == 'HostPort' or field == 'sysctl':
        return value if re.fullmatch(r'[0-9]{1,5}', value) else '<redacted>'
    return '<redacted>'


def safe_tree(value, field='', depth=0):
    if depth >= 12:
        return '<depth limit>'
    if isinstance(value, dict):
        result = {safe_segment(k): safe_tree(v, str(k), depth + 1)
                  for k, v in list(value.items())[:128]}
        if len(value) > 128 or len(result) < min(len(value), 128):
            result['$truncated_or_redacted_keys'] = True
        return result
    if isinstance(value, list):
        return [safe_tree(v, field, depth + 1) for v in value[:32]] + (['<truncated>'] if len(value) > 32 else [])
    return metadata_value(field, value)


def structured_mismatches(code, expected, observed, category, old=None, new=None):
    rows, visited, truncated = [], 0, False

    def walk(a, b, path, field='', identifier=None, present_a=True, present_b=True):
        nonlocal visited, truncated
        if visited >= 4096 or len(rows) >= 32:
            truncated = True
            return
        visited += 1
        if present_a == present_b and a == b and type(a) is type(b) and not isinstance(a, (dict, list)):
            return
        if present_a and present_b and isinstance(a, dict) and isinstance(b, dict):
            keys = sorted(set(a) | set(b))
            if len(keys) > 128:
                truncated = True
            for key in keys[:128]:
                cid = key if category == 'containers' and path == '/containers' else identifier
                walk(a.get(key), b.get(key), path + '/' + safe_segment(key),
                     'sysctl' if category == 'sysctls' else str(key), cid, key in a, key in b)
            return
        if present_a and present_b and isinstance(a, list) and isinstance(b, list):
            if max(len(a), len(b)) > 128:
                truncated = True
            for index in range(min(128, max(len(a), len(b)))):
                walk(a[index] if index < len(a) else None, b[index] if index < len(b) else None,
                     path + '/' + str(index), field, identifier, index < len(a), index < len(b))
            return
        row = {'path': path, 'expected_present': present_a, 'observed_present': present_b,
               'expected_type': type(a).__name__, 'observed_type': type(b).__name__,
               'expected': metadata_value(field, a), 'observed': metadata_value(field, b),
               'ownership': 'backend' if old and identifier in {old['container'], (new or {}).get('container')} else 'unrelated'}
        if category == 'containers':
            record = expected.get(identifier) or observed.get(identifier) or {}
            row.update(container_id=metadata_value('id', identifier),
                       name=metadata_value('name', record.get('name')),
                       name_source='snapshot' if 'name' in record else 'not_collected')
        rows.append(row)

    walk(expected, observed, '/' + category, category)
    return {'code': code, 'mismatches': rows, 'reported_count': len(rows),
            'truncated': truncated, 'utc': time.time(), 'old_attachment': old, 'new_attachment': new}


def preserved_with_evidence(before, after, direction, directory):
    """Persist sanitized inputs and every guard failure before caller can start rollback."""
    require(direction in ('host', 'bridge'), 'DIRECTION')
    directory = pathlib.Path(directory)
    custody = directory.lstat()
    require(stat.S_ISDIR(custody.st_mode) and custody.st_uid == os.geteuid()
            and stat.S_IMODE(custody.st_mode) == 0o700, 'DIAGNOSTIC_CUSTODY')

    def write(suffix, value):
        data = json.dumps(value, sort_keys=True).encode()
        require(len(data) <= 262144, 'DIAGNOSTIC_SIZE')
        path = directory / ('preservation-' + direction + '-' + suffix + '.json')
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

    def projection(snapshot):
        links = snapshot['links']
        return {'interfaces': [{k: safe_value(k, row[k]) for k in sorted(INTERFACE_FIELDS & row.keys())}
                               for row in sorted(links, key=lambda row: row['ifname'])[:128]],
                'interface_count': len(links), 'truncated': len(links) > 128}

    write('interfaces', {'expected': projection(before), 'observed': projection(after)})
    write('containers', {'expected': safe_tree(before['containers']), 'observed': safe_tree(after['containers']),
                         'expected_count': len(before['containers']), 'observed_count': len(after['containers']),
                         'truncated': len(before['containers']) > 128 or len(after['containers']) > 128})
    emitted = False

    def diagnostic(value):
        nonlocal emitted
        write('mismatch', value)
        emitted = True

    try:
        return preserved(before, after, direction, diagnostics=diagnostic)
    except (AssertionError, KeyError, TypeError, ValueError) as error:
        if not emitted:
            # Validation failures retain bounded context, not a claim about normalized operands.
            code = str(error) if isinstance(error, AssertionError) and re.fullmatch(r'[A-Z0-9_]+', str(error)) else 'GUARD_VALIDATION_' + type(error).__name__.upper()
            value = structured_mismatches(code, before, after, 'validation_context')
            value['scope'] = 'validation_context'
            diagnostic(value)
        raise


def firewall(text, attachment, bridge_mode):
    bridge, address = attachment['bridge'], attachment['ip']
    expected = {
        '-A PREROUTING -d 127.0.0.1/32 ! -i lo -p tcp -m tcp --dport 8787 -j DROP',
        f'-A DOCKER -d {address}/32 ! -i {bridge} -o {bridge} -p tcp -m tcp --dport 8787 -j ACCEPT',
        f'-A DOCKER -d 127.0.0.1/32 ! -i {bridge} -p tcp -m tcp --dport 8787 -j DNAT --to-destination {address}:8787',
    }
    lines = [re.sub(r'\[\d+:\d+\]', '[COUNTERS]', line) for line in text.splitlines() if line and not line.startswith('#')]
    selected = [line for line in lines if line in expected]
    require(len(selected) == (3 if bridge_mode else 0), 'BACKEND_PUBLICATION_RULES')
    return [line for line in lines if line not in expected]


def preserved(before, after, direction, diagnostics=None):
    require(direction in ('host', 'bridge'), 'DIRECTION')
    old = attested(before)
    require(before['backend']['id'] != after['backend']['id'], 'REPLACEMENT_ID')
    if direction == 'bridge':
        new = attested(after)
        require(new['network'] == old['network'] and new['bridge'] == old['bridge'] and new['ip'] == old['ip'], 'ROLLBACK_NETWORK')
        require(new['endpoint'] != old['endpoint'], 'FRESH_ENDPOINT')
    else:
        require(after['backend']['network'] == 'host' and set(after['backend']['networks']) == {'host'}
                and after['host_netns'] == after['backend_netns'], 'HOST_NETWORK')
        new = None
    def equal(left, right, code, category):
        if left != right and diagnostics is not None:
            a, b = left, right
            if category in {'addresses', 'routes4', 'routes6'}:
                a, b = [json.loads(r) for r in left], [json.loads(r) for r in right]
            diagnostics(structured_mismatches(code, a, b, category, old, new))
        require(left == right, code)

    excluded = {old['interface']} | ({new['interface']} if new else set())
    # Only freshly attested old/new service peers are excluded; other veths remain exact.
    def links(snapshot):
        result = []
        for original in snapshot['links']:
            if original['ifname'] in excluded:
                continue
            link = copy.deepcopy(original)
            if link['ifname'] == old['bridge']:
                # Carrier follows the sole port lifecycle; administrative UP/MTU/MAC stay exact.
                flags = link['flags']
                require('UP' in flags, 'BRIDGE_ADMIN_UP')
                remaining = [i for i in snapshot['links'] if i.get('master') == old['bridge']]
                require(link['operstate'] == ('UP' if remaining else 'DOWN')
                        and ('LOWER_UP' in flags) == bool(remaining), 'BRIDGE_CARRIER')
                require('NO-CARRIER' not in flags or not remaining, 'BRIDGE_NO_CARRIER')
                link['flags'] = [flag for flag in flags
                                 if flag != 'LOWER_UP' and not (flag == 'NO-CARRIER' and not remaining)]
                del link['operstate']
            result.append(link)
        return canonical(result)
    require(not any(i['ifname'] == old['interface'] for i in after['links']) or (new and new['interface'] == old['interface']), 'OLD_VETH_REMOVED')
    expected_links, observed_links = links(before), links(after)
    if expected_links != observed_links and diagnostics is not None:
        diagnostics(interface_mismatches([json.loads(row) for row in expected_links],
                                        [json.loads(row) for row in observed_links], old, new))
    require(expected_links == observed_links, 'UNRELATED_INTERFACES')
    def addresses(snapshot):
        rows = []
        for interface in snapshot['addresses']:
            if interface['ifname'] in excluded:
                continue
            # Link metadata is checked above; address lifetimes count down without config changes.
            for address in interface['addr_info']:
                row = {k: v for k, v in address.items() if k not in ('valid_life_time', 'preferred_life_time')}
                rows.append({'interface': interface['ifname'], 'address': row})
        return canonical(rows)
    equal(addresses(before), addresses(after), 'UNRELATED_ADDRESSES', 'addresses')
    for family in ('routes4', 'routes6'):
        def routes(snapshot):
            rows = []
            for original in snapshot[family]:
                if original.get('dev') in excluded:
                    require(family == 'routes6' and original.get('protocol') == 'kernel'
                            and (ipaddress.ip_network(original['dst'], strict=False).is_link_local
                                 or original['dst'] == 'ff00::/8'), 'VETH_KERNEL_ROUTE')
                    continue
                row = copy.deepcopy(original)
                if row.get('dev') == old['bridge']:
                    row['flags'] = [flag for flag in row.get('flags', []) if flag != 'linkdown']
                rows.append(row)
            return canonical(rows)
        equal(routes(before), routes(after), 'UNRELATED_' + family.upper(), family)
    for key in ('containers', 'docker_networks'):
        def unrelated(snapshot):
            value = copy.deepcopy(snapshot[key])
            ids = (old['container'], after['backend']['id'])
            if key == 'containers':
                for identifier in ids:
                    value.pop(identifier, None)
            else:
                for network in value.values():
                    for identifier in ids:
                        network['Containers'].pop(identifier, None)
            return value
        equal(unrelated(before), unrelated(after), 'UNRELATED_' + key.upper(), key)
    equal(firewall(before['firewall4'], old, True), firewall(after['firewall4'], new or old, direction == 'bridge'), 'UNRELATED_FIREWALL4', 'firewall4')
    for key in ('firewall6', 'sysctls', 'daemon'):
        left, right = before[key], after[key]
        if key == 'firewall6':
            left = firewall(left, old, False)
            right = firewall(right, new or old, False)
        if key == 'sysctls':
            left = {k: v for k, v in left.items() if not any('/' + name + '/' in k for name in excluded)}
            right = {k: v for k, v in right.items() if not any('/' + name + '/' in k for name in excluded)}
        equal(left, right, 'UNCHANGED_' + key.upper(), key)
    return {'result': 'PASS', 'old_attachment': old, 'new_attachment': new, 'direction': direction}
