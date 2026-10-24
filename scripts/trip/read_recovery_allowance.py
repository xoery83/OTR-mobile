"""Local Operator reservation for the Owner-approved additional read allowance."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

RUN_ID = 'afdf5785-670b-44c1-951d-9864dc1307f6'
LIMIT = 24  # The other 72 reservations belong exclusively to Native.


def reserve(directory: Path, purpose: str) -> int:
    if purpose not in {'CORE_RESULT', 'CORE_CAPABILITIES', 'CORE_COLLECTION', 'SUPABASE_READBACK', 'BACKEND_HEALTH'}:
        raise ValueError('UNAPPROVED_READ_PURPOSE')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock = directory / 'operator-read.lock'
    fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        path = directory / 'operator-read-ledger.json'
        if path.exists():
            value = json.loads(path.read_text())
            if (value.get('runId'), value.get('maximum')) != (RUN_ID, LIMIT):
                raise ValueError('READ_ALLOWANCE_IDENTITY_MISMATCH')
        else:
            value = {'runId': RUN_ID, 'maximum': LIMIT, 'reservations': []}
        rows = value['reservations']
        if not isinstance(rows, list) or any(row.get('ordinal') != i + 1 for i, row in enumerate(rows)):
            raise ValueError('READ_ALLOWANCE_LEDGER_INVALID')
        if len(rows) >= LIMIT:
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
    a = p.parse_args()
    print(json.dumps({'reserved': reserve(a.directory, a.purpose), 'maximum': LIMIT, 'runId': RUN_ID}))
