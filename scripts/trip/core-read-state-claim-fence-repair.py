#!/usr/bin/env python3
"""Render a single exact private function repair/rollback; never connects to a database."""
import argparse
import hashlib
import json
import os
from pathlib import Path

BEFORE = "5e7decd9c757920210013bf7de8004f7ef13945414f1580a18c6dfefea3f921d"
AFTER = "15fb16411839879cb85995df484b24f71dacd1d287f491e020fc7a397ad74c97"
HELPER = "e2b8d26256bdb6bd5a74918a55f43d7d3436a172ed7fcc11076f19e16af3f8fd"
START = " IF current_user='postgres' AND session_user='otr_trip_core_v2_gateway' AND TG_OP='UPDATE'\n"
END = " AND public.trip_member_claim_read_state_allowed(trip) THEN RETURN NEW;END IF;"
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def repair(raw):
    if sha(raw) != BEFORE:
        raise ValueError("GUARD_PREIMAGE_DRIFT")
    text = raw.decode("utf-8")
    if text.count(START) != 1 or text.count(END) != 1:
        raise ValueError("GUARD_ANCHOR_DRIFT")
    fixed = text.replace(START, " IF current_user='postgres' AND session_user='otr_trip_core_v2_gateway' THEN\n IF TG_OP='UPDATE'\n", 1).replace(END, END + "\n END IF;", 1).encode()
    if sha(fixed) != AFTER:
        raise ValueError("GUARD_POSTIMAGE_DRIFT")
    return fixed


def check(expected):
    return f"""DO $cas$
DECLARE f record;h record;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'CORE_GUARD_OWNER_REQUIRED';END IF;
 SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure('public.trip_core_finite_read_state_guard()');
 SELECT * INTO h FROM pg_proc WHERE oid=to_regprocedure('public.trip_member_claim_read_state_allowed(uuid)');
 IF f.oid IS DISTINCT FROM 65713::oid OR f.proowner IS DISTINCT FROM 'postgres'::regrole
 OR f.prosecdef IS DISTINCT FROM false OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
 OR f.proacl IS DISTINCT FROM ARRAY['postgres=X/postgres','otr_trip_core_v2_writer=X/postgres']::aclitem[]
 OR encode(sha256(convert_to(pg_get_functiondef(f.oid),'UTF8')),'hex') IS DISTINCT FROM '{expected}'
 THEN RAISE EXCEPTION 'CORE_GUARD_CAS_DRIFT';END IF;
 IF h.oid IS DISTINCT FROM 67419::oid OR h.proowner IS DISTINCT FROM 'postgres'::regrole
 OR h.prosecdef IS DISTINCT FROM true OR h.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
 OR h.proacl IS DISTINCT FROM ARRAY['postgres=X/postgres']::aclitem[]
 OR encode(sha256(convert_to(pg_get_functiondef(h.oid),'UTF8')),'hex') IS DISTINCT FROM '{HELPER}'
 OR has_function_privilege('otr_trip_core_v2_writer',h.oid,'EXECUTE')
 THEN RAISE EXCEPTION 'CORE_CLAIM_HELPER_CAS_DRIFT';END IF;
END $cas$;
"""


def transaction(definition, before, after):
    return ("BEGIN;\n" + check(before) + definition.decode().rstrip() + ";\n" + check(after) + "COMMIT;\n").encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preimage", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    raw = args.preimage.read_bytes()
    fixed = repair(raw)
    try:
        repair(raw + b"\n")
    except ValueError:
        pass
    else:
        raise AssertionError("DRIFT_SELF_CHECK_FAILED")
    args.output_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    outputs = {"GUARD_AFTER.private.sql": fixed,
               "INSTALL.private.sql": transaction(fixed, BEFORE, AFTER),
               "ROLLBACK.private.sql": transaction(raw, AFTER, BEFORE)}
    for name, content in outputs.items():
        path = args.output_dir / name
        if path.exists():
            if path.read_bytes() != content:
                raise ValueError("OUTPUT_DRIFT:" + name)
        else:
            with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as output:
                output.write(content)
    print(json.dumps({"beforeDefinitionSHA256": BEFORE, "afterDefinitionSHA256": AFTER,
                      "helperUnchangedSHA256": HELPER,
                      "files": {name: {"sha256": sha(content), "bytes": len(content)} for name, content in outputs.items()},
                      "databaseActions": 0}, indent=2))


if __name__ == "__main__":
    main()
