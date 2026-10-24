"""Local Operator reservation for the Owner-approved additional read allowance."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

RUN_ID = 'afdf5785-670b-44c1-951d-9864dc1307f6'
LIMIT = 24  # The other 72 reservations belong exclusively to Native.


def reserve(directory: Path, purpose: str, policy: str = 'TRIP_P1') -> int:
    if policy not in {'TRIP_P1', 'UNIVERSAL_20261025'}:
        raise ValueError('UNAPPROVED_READ_POLICY')
    run_id = RUN_ID if policy == 'TRIP_P1' else '3665f191-1605-4365-92ca-30403d90b191'
    limit = LIMIT if policy == 'TRIP_P1' else 32
    purposes = {'SOURCE_RESULT', 'SOURCE_CATALOG', 'RUN_RESULT', 'TASK_CONTEXT', 'TASK_RESULT', 'LEDGER_BOOTSTRAP', 'SUPABASE_READBACK', 'BACKEND_HEALTH'} if policy == 'UNIVERSAL_20261025' else {'CORE_RESULT', 'CORE_CAPABILITIES', 'CORE_COLLECTION', 'SUPABASE_READBACK', 'BACKEND_HEALTH'}
    if purpose not in purposes:
        raise ValueError('UNAPPROVED_READ_PURPOSE')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock = directory / 'operator-read.lock'
    fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        path = directory / 'operator-read-ledger.json'
        if path.exists():
            value = json.loads(path.read_text())
            if (value.get('runId'), value.get('maximum')) != (run_id, limit):
                raise ValueError('READ_ALLOWANCE_IDENTITY_MISMATCH')
        else:
            value = {'runId': run_id, 'maximum': limit, 'reservations': []}
        rows = value['reservations']
        if not isinstance(rows, list) or any(row.get('ordinal') != i + 1 for i, row in enumerate(rows)):
            raise ValueError('READ_ALLOWANCE_LEDGER_INVALID')
        if len(rows) >= limit:
            raise ValueError('READ_ALLOWANCE_EXHAUSTED')
        rows.append({'ordinal': len(rows) + 1, 'purpose': purpose,
                     'at': datetime.now(timezone.utc).isoformat()})
        temporary = directory / 'operator-read-ledger.next'
        write_fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(write_fd, 'w') as stream:
            stream.write(json.dumps(value, indent=2) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        return len(rows)
    finally:
        os.close(fd)
        lock.unlink()


if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--directory', type=Path, required=True)
    p.add_argument('--purpose', required=True)
    p.add_argument('--policy', choices=['TRIP_P1', 'UNIVERSAL_20261025'], default='TRIP_P1')
    a = p.parse_args()
    print(json.dumps({'reserved': reserve(a.directory, a.purpose, a.policy), 'maximum': LIMIT if a.policy == 'TRIP_P1' else 32, 'runId': RUN_ID if a.policy == 'TRIP_P1' else '3665f191-1605-4365-92ca-30403d90b191'}))
