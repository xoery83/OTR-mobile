# DEV Auth negative-only shutdown Gate — candidate, not executed

This adds exactly one private function,
`otr_auth_guest_composite.close_qa_policy(boolean)`, and one EXECUTE grant to the
existing `otr_trip_core_v2_gateway`. No new role, credential, schema, table
privilege, RLS change, HTTP endpoint or positive authority is added.

The function can only read the closed state or change the existing
`otr.auth.fileless-p1.unpriced/1` singleton Policy from enabled to disabled.
It uses a row lock and xmin CAS. It cannot enable Policy, change its version,
alter Account/Person connections or modify Trip/Item/receipt/evidence rows.
The Policy is a global DEV Auth switch; the positive runtime remains restricted
to QA Account71b94800-f860-4685-a5d4-954adae38113 and Guest
d6b17e95-b6cd-4816-9c61-daa9d0acdc8f. This function does not claim per-Account SQL
policy isolation. API roles and the Core Writer cannot execute it.

Why this is needed: Root confirmed only a Mac-side management SQL channel exists.
The Host timer needs its own negative-only SQL capability so a lost desktop/chat
cannot leave Policy enabled. Source/PDF shutdown RPCs are not reused, and no
management credential is copied. The Host-only CJS control reuses the exact
existing mounted Core Gateway connection, with its approved DEV file hash.

Review [the exact SQL](CLOSE_HELPER_INSTALL_CANDIDATE.sql) and
[Gate ID/install SHA](CLOSE_HELPER_GATE.json). Installation requires Root's fresh
external DEV target check, source66410/6c, private function count24, Policy CLOSED,
explicit Gate intent and before/after permission metadata comparison. It ends
with Policy CLOSED; it does not activate a window.

[Local real-PG evidence](CLOSE_HELPER_LOCAL_PG_RESULT.json) covers actual close,
fresh READ ONLY verification, API/Writer/direct-table denials, idempotency, future
policy rejection and unchanged evidence/role flags. These are local component
checks, not Hosted execution or Adoption E2E.

Owner approval is required by Standing Authorization3.B for this new function
and EXECUTE permission. Approval covers only the exact DEV installation whose SHA
is in the manifest. Root remains the sole protected SQL/Host execution Writer.
