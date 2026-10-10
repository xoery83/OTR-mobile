"""Nonsecret snapshot guard: only an attested DEV Backend attachment may change."""
import copy
import ipaddress
import json
import re


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


def preserved(before, after, direction):
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
                link['flags'] = [flag for flag in flags if flag != 'LOWER_UP']
                del link['operstate']
            result.append(link)
        return canonical(result)
    require(not any(i['ifname'] == old['interface'] for i in after['links']) or (new and new['interface'] == old['interface']), 'OLD_VETH_REMOVED')
    require(links(before) == links(after), 'UNRELATED_INTERFACES')
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
    require(addresses(before) == addresses(after), 'UNRELATED_ADDRESSES')
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
        require(routes(before) == routes(after), 'UNRELATED_' + family.upper())
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
        require(unrelated(before) == unrelated(after), 'UNRELATED_' + key.upper())
    require(firewall(before['firewall4'], old, True) == firewall(after['firewall4'], new or old, direction == 'bridge'), 'UNRELATED_FIREWALL4')
    for key in ('firewall6', 'sysctls', 'daemon'):
        left, right = before[key], after[key]
        if key == 'firewall6':
            left = firewall(left, old, False)
            right = firewall(right, new or old, False)
        if key == 'sysctls':
            left = {k: v for k, v in left.items() if not any('/' + name + '/' in k for name in excluded)}
            right = {k: v for k, v in right.items() if not any('/' + name + '/' in k for name in excluded)}
        require(left == right, 'UNCHANGED_' + key.upper())
    return {'result': 'PASS', 'old_attachment': old, 'new_attachment': new, 'direction': direction}
