"""Root-only close entry. Reuses pinned retained-container restore; never activates or writes business data."""
import datetime as dt
import hashlib, json, os, re, stat, subprocess, sys
from pathlib import Path

PORTS = {'deploy.py': '8389f0f2a2fdd2a01c2bbedeac63b2f8d2e4ed71a1be7420838f8d15c99ac4e8', 'restore.py': 'e7c06f49fb8457dd087086ff074b03064801e5d42ec379006ae827d62f5bee2b', 'universal_runtime_close.py': '931be989f9c5d8a7f3c9fc20c016970344326a0e8482b91feb105190ffff2e5f'}

def validate(pointer, plan, expected_sha):
    assert re.fullmatch(r'[0-9a-f]{32}', pointer['windowId'])
    assert re.fullmatch(r'[0-9a-f]{64}', pointer['gateSHA256']) and pointer['gateSHA256'] != '0' * 64
    assert pointer['planSHA256'] == expected_sha
    assert pointer['defaultContainerId'] == plan['beforeContainerId']
    assert pointer['defaultConfigSHA256'] == plan['beforeConfigSHA256']
    assert plan['beforeImage'] == plan['candidateImage'], 'RESTORE_SOFTWARE_DEFAULT_NOT_HISTORICAL_IMAGE'
    assert re.fullmatch(r'[0-9a-f]{64}', pointer['currentContainerId'])

def private(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        s = os.fstat(fd)
        assert stat.S_ISREG(s.st_mode) and s.st_uid == 0 and s.st_nlink == 1 and stat.S_IMODE(s.st_mode) == 0o600 and s.st_size <= 131072
        return os.read(fd, 131073)
    finally:
        os.close(fd)

def capture_request_trace(directory, pointer, read_private=private, run=subprocess.run):
    # Diagnostics must never stop the pinned restore, including after an earlier close attempt.
    try:
        if pointer['currentContainerId'] == pointer['defaultContainerId']:
            return {'status': 'SKIPPED_DEFAULT_CONTAINER'}
        assert re.fullmatch(r'[0-9a-f]{64}', pointer['currentContainerId'])
        destination = directory / ('mcp-request-trace-' + pointer['currentContainerId'] + '.json')
        if destination.exists():
            return {'status': 'ALREADY_PRESENT_NOT_OVERWRITTEN'}
        config = json.loads(read_private(directory / 'C02_EMPTY_CONFIG.json'))
        start = config['plan']['startsAt']
        assert type(start) is int and start > 0
        assert config['plan']['windowId'].replace('-', '') == pointer['windowId']
        since = dt.datetime.fromtimestamp(start / 1000, dt.timezone.utc).isoformat()
        completed = run(['docker', 'logs', '--timestamps', '--since', since, '--tail', '200', pointer['currentContainerId']],
                        capture_output=True, text=True, timeout=5, check=True)
        lines = completed.stdout.splitlines()
        records = []
        tools = {'get_otr_operating_guide', 'get_trip_item_edit_base', 'list_trips', 'get_trip', 'list_trip_items', 'get_trip_item',
                 'create_trip', 'create_trip_item', 'update_trip_item', 'review_travel_materials', 'preview_trip_changes', 'apply_trip_changes', 'get_operation_status'}
        errors = {'NOT_VISIBLE', 'BACKEND_UNAVAILABLE', 'BACKEND_TIMEOUT', 'INVALID_INPUT', 'STALE_CURSOR', 'READ_LIMIT', 'AUTH_REQUIRED'}
        for line in lines[-200:]:
            stamp, _, body = line.partition(' ')
            if len(line) > 16384 or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z', stamp) or not body.startswith('MCP_QA_REQUEST '):
                continue
            try:
                event = json.loads(body[len('MCP_QA_REQUEST '):])
                if (not isinstance(event, dict) or not isinstance(event.get('requestId'), str) or
                    not re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', event['requestId']) or
                    type(event.get('status')) is not int or not 100 <= event['status'] <= 599 or
                    type(event.get('durationMs')) not in (int, float) or not 0 <= event['durationMs'] <= 120000):
                    continue
                safe = {'timestamp': stamp, **{key: event[key] for key in ('requestId', 'status', 'durationMs')}}
                if isinstance(event.get('tool'), str) and event['tool'] in tools: safe['tool'] = event['tool']
                if isinstance(event.get('errorCode'), str) and event['errorCode'] in errors: safe['errorCode'] = event['errorCode']
                records.append(safe)
            except (ValueError, TypeError):
                continue
        raw = (json.dumps({'windowId': pointer['windowId'], 'candidateId': pointer['currentContainerId'], 'since': since,
                           'scope': 'ACCEPTED_LOGGER_RECORDS_ONLY_NOT_ALL_HTTP', 'tailLimit': 200, 'tailMayBeTruncated': len(lines) >= 200, 'records': records}, indent=2) + '\n').encode()
        assert len(raw) <= 131072
        fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as output:
            output.write(raw); output.flush(); os.fsync(output.fileno())
        return {'status': 'SANITIZED_REQUEST_TRACE_PRESERVED', 'records': len(records), 'sha256': hashlib.sha256(raw).hexdigest()}
    except FileExistsError:
        return {'status': 'ALREADY_PRESENT_NOT_OVERWRITTEN'}
    except Exception:
        return {'status': 'REQUEST_TRACE_UNAVAILABLE_RESTORE_CONTINUES'}


def main():
    directory = Path(sys.argv[1]); assert directory.parent == Path('/opt/otr/dev-backend/build')
    assert re.fullmatch(r'auth-consumer-write-qa-[0-9a-f]{32}', directory.name) and directory.resolve() == directory
    pointer = json.loads(private(directory / 'close-current.json'))
    raw = private(directory / 'deploy-plan.json'); plan_sha = hashlib.sha256(raw).hexdigest(); plan = json.loads(raw)
    validate(pointer, plan, plan_sha)
    assert directory.name.endswith(pointer['windowId'])
    for name, expected in PORTS.items():
        assert hashlib.sha256(private(directory / name)).hexdigest() == expected
    request_trace = capture_request_trace(directory, pointer)
    # Pinned helper takes the same short shared-resource lock and refuses current/default drift.
    subprocess.run([sys.executable, str(directory / 'restore.py'), str(directory / 'deploy-plan.json'), plan_sha, pointer['currentContainerId']], check=True, timeout=100)
    s = json.loads(subprocess.check_output(['docker','inspect','otr-dev-backend'], timeout=10))[0]
    assert s['Id'] == pointer['defaultContainerId']
    assert hashlib.sha256(json.dumps(s['Config'],sort_keys=True,separators=(',',':')).encode()).hexdigest() == pointer['defaultConfigSHA256']
    assert not any(e.startswith(('OTR_DEV_MCP_C02_QA_CONFIG=', 'OTR_DEV_MCP_WRITE_QA_CONFIG=', 'OTR_DEV_MCP_READ_QA_CONFIG=')) for e in s['Config']['Env'])
    print(json.dumps({'status':'C02_RUNTIME_CLOSED_RETAINED_DEFAULT_VERIFIED','windowId':pointer['windowId'],'containerId':s['Id'],'issuerCleanup':'SEPARATE_MANDATORY_AUTH_CLOSE_RECEIPT','requestTrace':request_trace}))

if __name__ == '__main__':
    main()
