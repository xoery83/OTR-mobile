"""Seed only the isolated, loopback-only Analysis QA Simulator; never a backend."""
import argparse
import datetime
import json
import pathlib
import plistlib
import sqlite3
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("database", type=pathlib.Path)
parser.add_argument("--offline-bundle", required=True, type=pathlib.Path)
args = parser.parse_args()
database = args.database.resolve()
device = next((parent for parent in database.parents if parent.parent.name == "Devices"), None)
if not device or plistlib.loads((device / "device.plist").read_bytes()).get("name") != "OTR Analysis 2.0 Local QA":
    raise SystemExit("Only the isolated OTR Analysis 2.0 Local QA Simulator is allowed.")
if b"http://127.0.0.1:1" not in args.offline_bundle.read_bytes():
    raise SystemExit("Fixture requires the compiled loopback-only acceptance bundle.")

connection = sqlite3.connect(database)
connection.row_factory = sqlite3.Row
templates = {table: dict(connection.execute(f"SELECT * FROM {table} LIMIT 1").fetchone()) for table in ["ledger_journeys", "ledger_members", "ledger_actor_context", "ledger_expenses", "ledger_expense_participants", "ledger_expense_splits", "ledger_valuation_snapshots"]}
namespace = uuid.UUID("f1f6ba6a-ab21-4ce6-8400-53a8a55bf5a2")
def identity(key):
    return str(uuid.uuid5(namespace, key))
def insert(table, changes):
    row = templates[table] | changes
    columns = list(row)
    connection.execute(f"INSERT INTO {table} ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})", [row[column] for column in columns])

journey_id = identity("long")
if connection.execute("SELECT 1 FROM ledger_journeys WHERE journey_id=?", [journey_id]).fetchone():
    raise SystemExit("Fixture already exists; refusing to overwrite.")
backup = pathlib.Path("/private/tmp/otr-analysis2-local-qa-before.sqlite")
with sqlite3.connect(backup) as destination:
    connection.backup(destination)
categories = ["food", "hotel", "car", "transport", "ticket", "shopping", "fuel", "groceries", "other", "Family activities"]
members = ["Alex", "Bea", "Cam", "Dana", "Élodie 王", "Fran", "Grace"]
now = "2026-09-29T06:00:00.000Z"
results = []
with connection:
    for kind, title, start, end, count, incomplete in [
        ("long", "Local analysis • South Island", "2024-01-01", "2026-10-03", 2000, 3),
        ("single", "Local analysis • One day", "2026-09-29", "2026-09-29", 2, 0),
        ("empty", "Local analysis • No expenses", "2026-09-25", "2026-09-30", 0, 0),
        ("incomplete", "Local analysis • Waiting values", "2026-09-25", "2026-09-30", 0, 3),
    ]:
        jid = identity(kind)
        insert("ledger_journeys", {"journey_id": jid, "title": title, "start_date": start, "end_date": end, "settlement_currency": "NZD", "settlement_scale": 2, "updated_at": now})
        mids = [identity(f"{kind}-member-{index}") for index in range(len(members))]
        for index, name in enumerate(members):
            insert("ledger_members", {"id": mids[index], "journey_id": jid, "display_name": name, "updated_at": now})
        insert("ledger_actor_context", {"journey_id": jid, "member_id": mids[0], "updated_at": now})
        for index in range(count + incomplete):
            eid = identity(f"{kind}-expense-{index}")
            pending = index >= count
            day = (datetime.date.fromisoformat(start) + datetime.timedelta(days=index % 900 if kind == "long" else 0)).isoformat()
            minor = 1000 + index % 12000
            insert("ledger_expenses", {"id": eid, "server_id": eid, "journey_id": jid, "creator_member_id": mids[0], "payer_member_id": mids[index % len(mids)], "title": f"Local meal {index}" if index % 10 == 0 else f"Local travel expense {index} — multilingual 长标题確認", "description": "Isolated local synthetic fixture; no server identity", "category": categories[index % len(categories)], "occurred_at": day + "T08:00:00.000Z", "economic_date": day, "original_amount_minor": minor, "original_currency": "NZD", "original_scale": 2, "business_status": "RATE_REQUIRED" if pending else "ACCEPTED", "revision": 1, "server_revision": 1, "sync_status": "SYNCED", "deleted_at": None, "settlement_participation": "EXCLUDED" if index % 11 == 0 else "INCLUDED", "local_owner_user_id": templates["ledger_actor_context"]["user_id"], "created_at": now, "updated_at": now})
            for member_index, mid in enumerate(mids):
                share = minor // len(mids) + (member_index < minor % len(mids))
                insert("ledger_expense_participants", {"expense_id": eid, "member_id": mid, "display_name_snapshot": members[member_index], "display_order": member_index})
                insert("ledger_expense_splits", {"expense_id": eid, "member_id": mid, "split_method": "EQUAL", "original_amount_minor": share, "settlement_amount_minor": None if pending else share, "rounding_adjustment_minor": 0})
            if not pending:
                insert("ledger_valuation_snapshots", {"id": identity(f"{kind}-valuation-{index}"), "server_id": None, "expense_id": eid, "expense_revision": 1, "policy": "SAME_CURRENCY", "original_amount_minor": minor, "original_currency": "NZD", "original_scale": 2, "settlement_amount_minor": minor, "settlement_currency": "NZD", "settlement_scale": 2, "rate_snapshot_id": None, "payment_record_id": None, "reason": "Local QA only", "is_active": 1, "created_at": now, "effective_at": now, "decimal_rate": "1", "supersedes_valuation_id": None, "reference_evidence_json": None})
        results.append({"kind": kind, "journeyId": jid, "expenses": count + incomplete, "members": len(mids)})
    connection.execute("UPDATE account_local_state SET selected_journey_id=? WHERE user_id=?", [journey_id, templates["ledger_actor_context"]["user_id"]])
print(json.dumps({"simulator": device.name, "fixtures": results, "backup": str(backup)}))
