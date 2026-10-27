# Independent Review SQL null fix

Review reproduced JSON-null bypasses in Person command `tripId`, `operationId` and `dataOwnership`: PostgreSQL IF treats an UNKNOWN predicate as not true. The original 8e773ef candidate is superseded by this correction; no DEV install occurred.

The owning SQL command now uses IS DISTINCT FROM for authoritative bindings and version/ownership, explicit JSON scalar types for all seven fields, and non-null SQL Actor/Trip/operation guards. Result qualification has the same explicit argument guard. No scope, grant or business authority was widened.

Real network-none PostgreSQL17 regression: 37 checks plus 8 typed Pg/Core checks PASS. All seven JSON fields independently reject null/object/boolean before insertion (21 malformed requests), with valid SQL Trip/operation arguments so a transport validator cannot hide the database boundary. Independent canonical/receipt count remains unchanged. Legitimate replay/P1/Person results, revocation and exact rollback still pass. Updated function postimages, rollback and artifact hashes are fixed with the correction. Prior original receipts remain unchanged; new evidence is PERSON_SQL_NULL_FIX_PG.txt.

No DEV operation, Native run or deployment; sustained L3 remains CLOUD_PENDING.
