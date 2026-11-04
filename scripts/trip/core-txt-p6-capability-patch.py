#!/usr/bin/env python3
"""Offline exact-preimage patch; no database connection, activation or privilege changes."""
from pathlib import Path
import argparse
import hashlib
import json
import os

PREIMAGE_SHA256 = 'e8c1e45c9c3cc547d4ebe1c3c9c83fca84d4f2001332d242fd35b38c3c4a6ff9'
ANCHOR = ' requested_family:=coalesce(slot_family,requested_family);\n'
ROOT = Path(__file__).resolve().parents[2]
BRANCH = ROOT / 'backend/sql/universal_txt_p6_capability_branch.sql'

def patch(raw: bytes) -> bytes:
    if hashlib.sha256(raw).hexdigest() != PREIMAGE_SHA256:
        raise ValueError('TXT_P6_CAPABILITY_EXACT_PREIMAGE_REQUIRED')
    text = raw.decode('utf-8')
    if text.count(ANCHOR) != 1 or 'bounded_scope' in text:
        raise ValueError('TXT_P6_CAPABILITY_ANCHOR_DRIFT')
    return text.replace(ANCHOR, ANCHOR + BRANCH.read_text(), 1).encode('utf-8')

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--preimage', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    a = p.parse_args()
    before = a.preimage.read_bytes()
    after = patch(before)
    fd = os.open(a.output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(after)
    print(json.dumps({'beforeSHA256': hashlib.sha256(before).hexdigest(),
      'afterSHA256': hashlib.sha256(after).hexdigest(), 'databaseActions': 0,
      'defaultClosed': 'Existing policy flag defaults false; patch never changes data or ACL'}))

if __name__ == '__main__':
    main()
