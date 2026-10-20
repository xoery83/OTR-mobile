"""CP13A rollback-only C1 UNKNOWN / C2 reprocess / C3 consolidation barrier.

Usage: python3 scripts/cp13a/verify-local-admission-races.py otr-cp13a-acceptance
The container must be an explicitly owned, disposable acceptance database.
No deployed profile is supported, and positive fixture capabilities never commit.
"""
from pathlib import Path
import json
import re
import selectors
import subprocess
import sys
import time

container = sys.argv[1] if len(sys.argv) == 2 else ""
if not re.fullmatch(r"otr-cp13a-acceptance(?:-[a-z0-9]+)?", container):
    raise SystemExit("An owned disposable CP13A acceptance container is required")
root = Path(__file__).resolve().parents[2]
sql = (root / "supabase/tests/trip_import_flight_admission.test.sql").read_text()
command = ["docker", "exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres"]
def query(text):
    result = subprocess.run(command, input=text, text=True, capture_output=True, timeout=15)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()
def facts():
    return query("select jsonb_build_object('gate',(select to_jsonb(g) from public.trip_import_admission_gate g),'C',(select count(*) from public.trip_source_runs),'B',(select count(*) from public.trip_event_operation_receipts),'events',(select count(*) from public.itinerary_events));")
before = facts()
assert json.loads(before)["gate"]["flight_admission_enabled"] is False
start = sql.index("select is(public.trip_source_publish_flight_run", sql.index("'dispatch is UNKNOWN before handoff'"))
holder = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
waiters = []
try:
    holder.stdin.write(sql[:start] + "\nreset session authorization;\nselect 'CP13A_C1_UNKNOWN_BARRIER';\n")
    holder.stdin.flush()
    reader = selectors.DefaultSelector()
    reader.register(holder.stdout, selectors.EVENT_READ)
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if not reader.select(timeout=.1):
            assert holder.poll() is None, holder.stderr.read()
            continue
        line = holder.stdout.readline()
        assert not line.startswith("not ok"), line
        if line.strip() == "CP13A_C1_UNKNOWN_BARRIER":
            break
    else:
        raise AssertionError("C1 did not reach the actual durable UNKNOWN barrier")
    for name in ("reprocess-run", "consolidate-run"):
        raw = re.search(r"insert into cp13a_fixture values\('" + name + r"',\$json\$(.*?)\$json\$\);", sql, re.S)[1]
        request = raw.replace("'", "''")
        waiter = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        waiter.stdin.write("set application_name='cp13a-race-" + name + "';set session authorization otr_trip_source_command_gateway;select public.trip_source_publish_flight_run('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','" + request + "');\n")
        waiter.stdin.close()
        waiters.append(waiter)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        blocked = query("select count(*) from pg_stat_activity where application_name like 'cp13a-race-%' and wait_event_type='Lock' and wait_event='advisory';")
        if blocked == "2":
            break
        time.sleep(.05)
    else:
        raise AssertionError("C2 and C3 did not both serialize behind C1's admission lock")
    holder.stdin.write("rollback;\n\\q\n")
    holder.stdin.close()
    assert holder.wait(timeout=15) == 0, holder.stderr.read()
    for waiter in waiters:
        assert waiter.wait(timeout=15) != 0
        error = waiter.stderr.read()
        assert "IMPORT_ADMISSION_DISABLED" in error, error
        assert "deadlock detected" not in error
    assert facts() == before, "Rollback leaked capability or canonical/C writes"
    print("PASS: actual C1 UNKNOWN holds C2/C3 at the shared scope barrier; rollback restores closed admission, no deadlock or escaped writes")
finally:
    for process in [holder, *waiters]:
        if process.poll() is None:
            process.kill()
            process.wait()
