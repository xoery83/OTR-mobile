"""On-demand renewal for the existing root-custodied DEV CP14 identity."""
import fcntl
import json
import os
import signal
import stat
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path('/opt/otr/dev-backend/private')
AUTH = ROOT / 'qa-auth/universal-stage2-20261025.json'
CONFIG = ROOT / 'universal-stage2-continuous/credentials.json'
ACTOR = 'f4b059c5-8241-4ffb-aa15-37fa25474543'
ORIGIN = 'https://tuqigdxrvrerfewsxqgm.supabase.co'
LIMIT = 65536

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def metadata(s):
    if not (stat.S_ISREG(s.st_mode) and s.st_uid == os.geteuid() and s.st_gid == os.getegid()
            and stat.S_IMODE(s.st_mode) == 0o600 and s.st_nlink == 1 and 0 < s.st_size <= LIMIT):
        raise ValueError('PRIVATE_FILE_DRIFT')
    return s.st_dev, s.st_ino, s.st_mtime_ns, s.st_size

def private_json(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        identity = metadata(info)
        value = json.loads(stream.read(LIMIT + 1))
    if not isinstance(value, dict):
        raise ValueError('CUSTODY_SHAPE')
    return value, info, identity

def write_exclusive(path, value):
    data = json.dumps(value, separators=(',', ':')).encode() + b'\n'
    if len(data) > LIMIT:
        raise ValueError('CUSTODY_LIMIT')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())

def request(path, key, deadline, *, refresh=None, access=None):
    headers = {'apikey': key}
    data = None
    if refresh is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps({'refresh_token': refresh}).encode()
    else:
        headers['Authorization'] = 'Bearer ' + access
    req = urllib.request.Request(ORIGIN + path, data=data, headers=headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    remaining = min(8, deadline - time.time())
    if remaining <= 0:
        raise TimeoutError('AUTH_REQUEST_DEADLINE')
    signal.setitimer(signal.ITIMER_REAL, remaining)
    try:
        with opener.open(req, timeout=remaining) as response:
            raw = response.read(LIMIT + 1)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
    if len(raw) > LIMIT:
        raise ValueError('AUTH_RESPONSE_LIMIT')
    return json.loads(raw)

def ensure_session(auth_path=AUTH, config_path=CONFIG, *, send=request):
    status = 'NO_SEND'
    # Technical deadline for two Auth calls and the atomic save.
    deadline = time.time() + 30
    intent = auth_path.parent / 'cp14-session-renewal.intent.json'
    staged = auth_path.parent / 'cp14-session-renewal.rotated.private.json'
    terminal = {'actor': ACTOR[:8] + '…'}
    dir_fd = os.open(auth_path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        d = os.fstat(dir_fd)
        if d.st_uid != os.geteuid() or d.st_mode & 0o022:
            return {'status': status, 'reason': 'CUSTODY_PARENT_DRIFT'}
        # Also serializes cooperating engineering custody writers; the durable intent fences replay.
        fcntl.flock(dir_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if any(os.path.lexists(p) for p in (intent, staged)):
            return {'status': 'RECONCILE_ONLY', 'reason': 'PRIOR_ATTEMPT'}
        old, _, identity = private_json(auth_path)
        if old.get('accountId') != ACTOR:
            return {'status': status, 'reason': 'ACTOR_DRIFT'}
        expiry = old['session'].get('expires_at')
        if type(expiry) not in (int, float) or not 0 < expiry <= time.time() + 86400:
            return {'status': status, 'reason': 'CUSTODY_EXPIRY_INVALID'}
        if expiry > time.time() + 60:
            return {**terminal, 'status': 'CURRENT',
                    'expiresAt': datetime.fromtimestamp(expiry, timezone.utc).isoformat()}
        receipt = auth_path.parent / f'cp14-session-renewal-{identity[1]}-{identity[2]}.receipt.json'
        if os.path.lexists(receipt):
            return {'status': 'RECONCILE_ONLY', 'reason': 'PRIOR_GENERATION'}
        refresh = old['session'].get('refresh_token')
        config, _, _ = private_json(config_path)
        key = config.get('publishableKey')
        if not isinstance(refresh, str) or not refresh or not isinstance(key, str) or not key:
            return {'status': status, 'reason': 'CUSTODY_UNAVAILABLE'}
        write_exclusive(intent, {**terminal, 'custodyIdentity': identity})
        os.fsync(dir_fd)
        status = 'UNKNOWN_NO_RETRY'
        phase = 'REFRESH'
        try:
            rotated = send('/auth/v1/token?grant_type=refresh_token', key, deadline, refresh=refresh)
        except urllib.error.HTTPError as error:
            if error.code in (400, 401, 403):
                status = 'REFRESH_REJECTED_NO_RETRY'
            raise
        phase = 'RESPONSE'
        returned_actor = rotated.get('user', {}).get('id')
        access, next_refresh = rotated.get('access_token'), rotated.get('refresh_token')
        if (returned_actor != ACTOR or not isinstance(access, str) or not access
                or not isinstance(next_refresh, str) or not next_refresh):
            raise ValueError('AUTH_ROTATED_RESPONSE')
        expires = rotated.get('expires_at')
        if type(expires) not in (int, float):
            ttl = rotated.get('expires_in')
            if type(ttl) not in (int, float) or not 0 < ttl <= 86400:
                raise ValueError('AUTH_ROTATED_EXPIRY')
            expires = int(time.time()) + ttl
        if not deadline < expires <= time.time() + 86400:
            raise ValueError('AUTH_ROTATED_EXPIRY')
        next_auth = {**old, 'session': {**old['session'], 'access_token': access,
                                       'refresh_token': next_refresh, 'expires_at': expires}}
        # Secure staging preserves same-actor rotation for Auth if the later GET is inconclusive.
        phase = 'STAGE'
        write_exclusive(staged, next_auth)
        os.fsync(dir_fd)
        if time.time() >= deadline - 8:
            raise TimeoutError('IDENTITY_DEADLINE')
        phase = 'IDENTITY'
        user = send('/auth/v1/user', key, deadline, access=access)
        if user.get('id') != ACTOR or not user.get('email_confirmed_at'):
            raise ValueError('AUTH_ACTOR_NOT_VERIFIED')
        phase = 'SAVE'
        if time.time() >= deadline or metadata(auth_path.lstat()) != identity:
            raise ValueError('CUSTODY_CHANGED_OR_EXPIRED')
        os.replace(staged, auth_path)
        os.fsync(dir_fd)
        saved, _, _ = private_json(auth_path)
        if saved != next_auth:
            raise ValueError('CUSTODY_READBACK')
        status = 'SAME_ACTOR_REFRESHED_VERIFIED_SAVED'
        terminal.update(verifiedAt=datetime.now(timezone.utc).isoformat(),
                        expiresAt=datetime.fromtimestamp(expires, timezone.utc).isoformat())
    except Exception as error:
        if status == 'NO_SEND':
            return {'status': status, 'reason': type(error).__name__}
        terminal.update(phase=phase,errorType=type(error).__name__)
        if isinstance(error, urllib.error.HTTPError):
            terminal['httpStatus'] = error.code
    finally:
        if status != 'NO_SEND':
            terminal['status'] = status
            try:
                write_exclusive(receipt, terminal)
                os.fsync(dir_fd)
                if status == 'SAME_ACTOR_REFRESHED_VERIFIED_SAVED':
                    intent.unlink()
                    os.fsync(dir_fd)
            except Exception:
                terminal = {'status': 'RECONCILE_ONLY', 'reason': 'RECEIPT_UNCONFIRMED'}
        os.close(dir_fd)
    return terminal

def request_timeout(*_):
    raise TimeoutError('AUTH_REQUEST_DEADLINE')

def run_host():
    if os.geteuid() != 0 or os.getegid() != 0:
        return {'status': 'NO_SEND', 'reason': 'DEV_HOST_ROOT_REQUIRED'}
    if AUTH.parent.resolve() != AUTH.parent or CONFIG.parent.resolve() != CONFIG.parent:
        return {'status': 'NO_SEND', 'reason': 'CUSTODY_PARENT_DRIFT'}
    signal.signal(signal.SIGALRM, request_timeout)
    try:
        return ensure_session()
    except Exception as error:
        return {'status': 'RECONCILE_ONLY', 'reason': type(error).__name__}


if __name__ == '__main__':
    # Reuse the established SSH port. Only the Host reads or writes custody.
    from universal_continuous_runtime_ports import remote_python

    if len(sys.argv) != 1:
        sys.exit('Usage: cp14_host_session.py')

    source = Path(__file__).read_text().split("if __name__ == '__main__':", 1)[0]
    try:
        result = remote_python(source + '\nprint(json.dumps(run_host()))\n')
    except Exception:
        result = {'status': 'RECONCILE_ONLY', 'reason': 'HOST_REPLY_UNCONFIRMED'}
    print(json.dumps(result))
    sys.exit(0 if result.get('status') in ('CURRENT', 'SAME_ACTOR_REFRESHED_VERIFIED_SAVED') else 2)
