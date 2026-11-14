"""Render only: the existing finite Hook with explicit Write scope and a new Gate marker."""
import argparse
import hashlib
import importlib.util
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

spec = importlib.util.spec_from_file_location("read_hook", Path(__file__).with_name("render-mcp-qa-hook.py"))
read = importlib.util.module_from_spec(spec)
spec.loader.exec_module(read)
TEMPLATE = read.TEMPLATE
CLOSED_INSTALL = read.CLOSED_INSTALL
CLIENT = "d2b8167f-ee42-4ac1-b5ef-4dc003c0d141"
CHATGPT_CLIENT = "83504d3f-59d4-43fd-99b1-bebc54c40f7d"
CLIENTS = (CLIENT, CHATGPT_CLIENT)
READ_GATE = "OTR_MCP_OAUTH_QA_20261031_V1"
WRITE_GATE = "OTR_MCP_OAUTH_WRITE_QA_20261101_V1"


def utc(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset().total_seconds() != 0:
        raise ValueError("UTC_INSTANT_REQUIRED")
    return parsed


def render(client_id, deadline, started_at):
    start, end = utc(started_at), utc(deadline)
    if client_id not in CLIENTS or not timedelta(0) < end - start <= timedelta(minutes=30):
        raise ValueError("FIXED_CLIENT_AND_FINITE_WRITE_WINDOW_REQUIRED")
    start_sql = start.isoformat().replace("+00:00", "Z")
    end_sql = end.isoformat().replace("+00:00", "Z")
    # Preserve frozen Claude output; only the selected registered UUID varies.
    result = read.render(CLIENT, end_sql)
    assert result.count(CLIENT) == 1, "UPSTREAM_REVIEWED_CLIENT_CHANGED"
    result = result.replace(CLIENT, client_id)
    result = result.replace("Two documented parameters", "Three documented parameters")
    result = result.replace("the single newly registered public client's", "the existing fixed Claude QA public client's")
    result = "-- STARTED_AT_UTC = first temporary configuration intention; deadline cannot extend it.\n" + result
    scope = "jsonb_build_array('otr.trips.read')"
    gate = " THEN RAISE EXCEPTION 'MCP_QA_EXACT_INSTALL_GATE_REQUIRED'; END IF;"
    session = " OR claims->>'session_id' IS NULL"
    for needle in [READ_GATE, scope, gate, session]:
        assert result.count(needle) == 1, "UPSTREAM_REVIEWED_TEMPLATE_CHANGED"
    result = result.replace(READ_GATE, WRITE_GATE).replace(scope, "jsonb_build_array('otr.trips.read','otr.trips.write')")
    result = result.replace(gate,
        f" OR '{start_sql}'::timestamptz>clock_timestamp()\n"
        f" OR '{end_sql}'::timestamptz>'{start_sql}'::timestamptz+interval '30 minutes'\n" + gate)
    return result.replace(session,
        " OR claims->>'iat' IS NULL OR claims->>'iat' !~ '^[0-9]{1,15}$'\n"
        f" OR (claims->>'iat')::bigint<extract(epoch FROM '{start_sql}'::timestamptz)\n"
        " OR (claims->>'iat')::bigint>now_epoch\n" + session)


def render_close(active_sql):
    result = read.render_close(active_sql)
    assert result.count(READ_GATE) == 1
    return result.replace(READ_GATE, WRITE_GATE)


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        start, end = "2026-11-01T00:00:00Z", "2026-11-01T00:20:00Z"
        sql = render(CLIENT, end, start)
        assert WRITE_GATE in sql and READ_GATE not in sql
        assert "jsonb_build_array('otr.trips.read','otr.trips.write')" in sql
        assert WRITE_GATE in render_close(sql) and READ_GATE not in render_close(sql)
        for client, deadline, beginning in [
            ("11111111-1111-4111-8111-111111111111", end, start),
            (CLIENT, "2026-11-01T01:00:00Z", start),
            (CLIENT, start, end),
            (CLIENT, end, "2026-11-01T00:00:00"),
        ]:
            try:
                render(client, deadline, beginning)
            except ValueError:
                pass
            else:
                raise AssertionError("INVALID_WRITE_POLICY_ACCEPTED")
        print("WRITE_HOOK_RENDER_SELF_CHECK_PASS_NO_SQL_OR_NETWORK")
        raise SystemExit(0)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-id", required=True)
    parser.add_argument("--deadline-utc", required=True)
    parser.add_argument("--started-at-utc", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    active = render(args.client_id, args.deadline_utc, args.started_at_utc)
    for path, text in [(args.output, active), (args.output.with_suffix(".close.sql"), render_close(active))]:
        with path.open("x", encoding="utf8") as output:
            path.chmod(0o600)
            output.write(text)
    print(json.dumps({"status": "RENDERED_ONLY_NO_SQL_EXECUTION", "sqlSHA256": hashlib.sha256(active.encode()).hexdigest()}))
