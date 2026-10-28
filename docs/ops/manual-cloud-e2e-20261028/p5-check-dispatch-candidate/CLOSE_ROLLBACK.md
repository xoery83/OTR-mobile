# P5 unknown-service CHECK candidate — UNAPPROVED / NOT_INSTALLED

This is a separate Schema candidate, not authority to deploy. It changes exactly five existing CHECK definitions on public.itinerary_transport_services. It does not enable P5, add functions/tables/roles/RLS/GRANT, change the five authority functions, or update any business row.

## Predicate

Each original complete predicate remains one side of OR. The additional side is independently IS TRUE and requires: trip_id IS NOT NULL; subtype one of TRAIN/BUS/FERRY/WATER_TAXI/SHUTTLE/TRANSFER; operator_namespace NAME; that specific field exactly ''. NULL, whitespace and overlength remain invalid. Legacy rows, Flight and other identity namespaces retain their previous predicates. Existing required-fields, unique/service-key, IATA/ICAO and deferred parent aggregate validation remain in effect. The CHECK is representation validation, not account/Trip permission; the separately approved owning policy must still authorize any write.

## Before any future installation

1. Obtain Owner approval for the five exact CHECK replacements, separately from the five-function business authority candidate. Do not ask for or perform installation in the night lane.
2. Coordinate one serial unique Writer window. Capture the five live pg_get_constraintdef/pg_get_expr/validation states/OIDs and table identity/owner/ACL. This packet's constraint preimages are from a disposable network-none clone, not a DEV read or proof of current DEV schema.
3. Compare exact live definitions to the fixed packet. Any mismatch requires a new reviewed candidate; never skip the CAS or silently regenerate approved SQL. Check five columns are still NOT NULL and all parent/child/service validation triggers remain enabled.
4. Existing install uses one transaction, 5s lock timeout, 30s statement timeout, ACCESS EXCLUSIVE table lock, five full-definition+validated CAS checks, then validated DROP/ADD. No row updates. Old facts remain byte-identical. DROP/ADD necessarily replaces CHECK OIDs; table/function OIDs and ownership/ACL are not modified. This is not an OID-preserving function replacement.
5. Recheck all five postdefinitions/convalidated, non-target constraints, table identity/ACL, row hashes and all business/Source gates after the transaction. No P5 runtime activation follows automatically.

## Close first; preserve data

If P5 must close after future activation, stop only the new normal Manual P5 work through its owning serial close procedure. Restore the exact approved current five-function authority preimages only if their postimage CAS still matches and doing so preserves all newer P2/Source work. Do not use stale authority rollback after another Writer advances the baseline. This packet provides no new authority-close SQL and never changes the global gate.

Constraint rollback is a separate operation:

- **No new exception rows:** checks-rollback.sql takes the same exclusive lock, checks all five postimages/validated states, proves every row satisfies all five original predicates, then restores the original BETWEEN predicates with validation. The isolated PG test proves pg_get_constraintdef/pg_get_expr/validation are identical to the original; OIDs are necessarily new.
- **Any accepted unknown-empty row:** rollback raises P5_CHECK_ROLLBACK_BLOCKED_RETAIN_DATA before any DDL. Transaction rollback retains all five broad CHECKs and every accepted row byte. Report SCHEMA_ROLLBACK_PENDING_DATA_PRESERVED. Keep P5 business writes closed while the representation remains readable.
- Never delete accepted rows, fill invented operator/service text, rewrite unrelated fields, temporarily disable constraints, or label NOT VALID as exact rollback. A later constraint strategy or truthful user-authored backfill is a separate reviewed decision; it must not be manufactured for this rollback.

The fixture shows successful normal Core P5 Create/Edit/immutable replay/Reader with all five service/operator facts unknown, followed by successful business-function rollback retaining accepted P5 facts. This is isolated L2 evidence only; no DEV or Native Cloud E2E claim.
