"""Bounded pre-remove diagnostics; never command/receipt or NoCommit evidence."""
import datetime
import json
import os
import re
import selectors
import signal
import subprocess
import sys
import time
import uuid

MAX_BYTES = 32768
MAX_EVENTS = 64
LOG_SECONDS = 1.2
RETAIN_SECONDS = 1.8
EVIDENCE = 'BOUNDED_TAIL_NOT_COMMIT_PROOF'
TOOLS = {
    'get_otr_operating_guide', 'get_trip_item_edit_base', 'list_trips', 'get_trip',
    'list_trip_items', 'get_trip_item', 'create_trip', 'create_trip_item',
    'update_trip_item', 'preview_trip_changes', 'apply_trip_changes', 'get_operation_status',
}
OPTIONAL = {
    'tool': TOOLS,
    'errorCode': {'NOT_VISIBLE', 'BACKEND_UNAVAILABLE', 'BACKEND_TIMEOUT', 'INVALID_INPUT',
                  'STALE_CURSOR', 'READ_LIMIT', 'AUTH_REQUIRED'},
    'authFailureSource': {'EXPIRED_BEFORE_BACKEND', 'EXPIRED_AFTER_BACKEND', 'BACKEND_401'},
    'failure': {'EXPIRED', 'CANCELED', 'TIMEOUT', 'GRANT_NOT_CURRENT', 'UNCLASSIFIED'},
}
STAGES = {'PRECHECK', 'CORE_BOUNDARY_ENTERED', 'CORE_RETURNED', 'POSTCHECK'}
READ_STAGES = {'PRECHECK', 'OWNING_ENTERED', 'OWNING_RETURNED', 'POSTCHECK'}
PREFIXES = {'MCP_QA_REQUEST', 'MCP_QA_WRITE_STAGE', 'MCP_QA_READ_STAGE'}


def unavailable(reason):
    return {'status': 'UNAVAILABLE', 'reason': reason, 'evidence': EVIDENCE}


def _stop(process, own_group=False):
    if process.poll() is None:
        try:
            if own_group:
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
        except ProcessLookupError:
            pass
    try:
        process.wait(timeout=0.05)
    except subprocess.TimeoutExpired:
        pass


def _read_logs(cid):
    process = subprocess.Popen(
        ['docker', 'logs', '--timestamps', '--tail', '128', cid],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    deadline = time.monotonic() + LOG_SECONDS
    try:
        data = bytearray()
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None, 'TIMEOUT'
                if not selector.select(remaining):
                    return None, 'TIMEOUT'
                chunk = os.read(process.stdout.fileno(), min(4096, MAX_BYTES + 1 - len(data)))
                if not chunk:
                    code = process.wait(timeout=max(0.001, deadline - time.monotonic()))
                    return (bytes(data), None) if code == 0 else (None, 'LOG_COMMAND_FAILED')
                data.extend(chunk)
                if len(data) > MAX_BYTES:
                    return None, 'OUTPUT_LIMIT'
    finally:
        _stop(process)
        process.stdout.close()


def _project(marker, raw):
    assert isinstance(raw, dict)
    identity, duration = ('requestId', 'durationMs') if marker == 'MCP_QA_REQUEST' else ('diagnosticId', 'elapsedMs')
    assert isinstance(raw.get(identity), str) and str(uuid.UUID(raw[identity])) == raw[identity]
    assert type(raw.get(duration)) in (int, float) and 0 <= raw[duration] <= 120000
    result = {identity: raw[identity], duration: raw[duration]}
    if marker == 'MCP_QA_REQUEST':
        assert type(raw.get('status')) is int and 100 <= raw['status'] <= 599
        result['status'] = raw['status']
        optional = ('tool', 'errorCode', 'authFailureSource')
    elif marker == 'MCP_QA_READ_STAGE':
        assert raw.get('resource') in {'DISCOVERY', 'COLLECTION', 'ITEM'}
        assert raw.get('stage') in READ_STAGES
        assert type(raw.get('remainingMs')) in (int, float) and 0 <= raw['remainingMs'] <= 60000
        result.update(resource=raw['resource'], stage=raw['stage'], remainingMs=raw['remainingMs'])
        if 'owningResponseStatus' in raw:
            assert type(raw['owningResponseStatus']) is int and 100 <= raw['owningResponseStatus'] <= 599
            result['owningResponseStatus'] = raw['owningResponseStatus']
        if 'failure' in raw:
            assert raw['failure'] in {'EXPIRED', 'CANCELED', 'TIMEOUT', 'UNCLASSIFIED'}
        optional = ('failure',)
    else:
        assert raw.get('stage') in STAGES
        result['stage'] = raw['stage']
        optional = ('failure',)
    for key in optional:
        if key in raw:
            assert raw[key] in OPTIONAL[key]
            result[key] = raw[key]
    return result


def collect_safe_mcp_logs(cid):
    if not isinstance(cid, str) or not re.fullmatch('[0-9a-f]{64}', cid):
        return unavailable('INVALID_CURRENT_CID')
    try:
        data, failure = _read_logs(cid)
        if failure:
            return unavailable(failure)
        events = []
        for line in data.decode('utf-8').splitlines():
            stamp, _, message = line.partition(' ')
            marker, _, payload = message.partition(' ')
            if marker not in PREFIXES:
                if stamp in PREFIXES:
                    return unavailable('MALFORMED_LOG')
                continue
            assert re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z', stamp)
            datetime.datetime.fromisoformat(stamp.replace('Z', '+00:00'))
            events.append({'event': marker, 'dockerTimestamp': stamp, **_project(marker, json.loads(payload))})
            if len(events) > MAX_EVENTS:
                return unavailable('EVENT_LIMIT')
        return {'status': 'CAPTURED' if events else 'CAPTURED_EMPTY', 'evidence': EVIDENCE, 'events': events}
    except Exception:
        return unavailable('LOG_CAPTURE_FAILED')


def retain_before_close(cid, directory, source):
    """One bounded child owns log read and fsync; failure must never prevent close."""
    program = source + "\nfrom pathlib import Path\nsys.path.insert(0,sys.argv[2])\nfrom config_cas import atomic_private\nvalue=collect_safe_mcp_logs(sys.argv[1])\natomic_private(Path(sys.argv[2])/'pre-close-mcp-diagnostics.json',value)\nprint(json.dumps(value))\n"
    process = None
    try:
        process = subprocess.Popen(
            [sys.executable, '-c', program, cid, str(directory)],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True,
        )
        output, _ = process.communicate(timeout=RETAIN_SECONDS)
        if process.returncode != 0 or len(output) > MAX_BYTES:
            return unavailable('RETENTION_FAILED')
        return json.loads(output)
    except Exception:
        return unavailable('RETENTION_UNAVAILABLE')
    finally:
        if process is not None:
            _stop(process, own_group=True)
