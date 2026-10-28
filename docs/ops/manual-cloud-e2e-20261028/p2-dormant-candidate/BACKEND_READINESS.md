# P2 dormant Backend minimal candidate

Base: 7b701e495c5ca13af51f1f1fe04db4c42c21d348. Four-file patch P2_DORMANT_BACKEND.patch. No DEV/SQL/shared tree changes.

Exact full-union MANUAL profile: families P1/P2/P3/P4/P5/P6; existing P1/P3/P4/P5/P6 commands plus CREATE_SPARSE_FLIGHT and SET_AUTHORED_FLIGHT_DETAILS. All older exact profiles stay intact. P2-specific whitelist is Sparse Create, Authored Details and existing participation; general text/schedule/place/CREATE_ITEM, qualification/update/service-replace remain unavailable for P2. New details family is inferred from existing target root, never from a payload claim.

Sparse Create is explicitly excluded from the Edit Creator check because its root does not yet exist. Existing P2 edits require same Creator, SPARSE qualification, no service and no active Booking link. Retained APPLIED MANUAL CREATE_SPARSE_FLIGHT canonical command and domain hashes, actor/trip/operation/target and created Item result must match; no Import receipt can substitute. A missing or malformed proof stays closed. Authored Manual receipts use normal item/audit visibility and do not demand a Source receipt port; QUALIFY/UPDATE/REPLACE and private evidence still do.

Validation: four suites/86 tests, full TypeScript, scoped eslint, Backend build, git apply --check. Tests include intact old profiles; exact new profile/closed modes; positive Sparse Create/AuthoredDetails; foreign Creator/family/Qualified/Booking/service/missing/Source/otherTarget/hash/actor negative; forbidden P2 commands; ordinary Manual receipt versus protected Source/audit. No real PostgreSQL/DEV/Native Cloud PASS is claimed by this child; SQL agent is reusing this exact candidate for its isolated PgPort validation.

## Precise remaining SQL owning delta

Current persistent policy does not advertise or allow Manual P2. Unique Writer must supply reviewed CAS/rollback for the exact union capability plus finite row/read-state fences: normal CREATE_SPARSE_FLIGHT and creator-owned receipted SPARSE-only SET_AUTHORED_FLIGHT_DETAILS/participation; endpoint ORIGIN/DESTINATION and endpoint_details/flight-intent updates, immutable event/role and no service writes; exact child target/actor/trip identity; no Source permission reuse. Existing aggregate validator requires qualified P2 with Flight services, so it needs an independently reviewed narrow authored SPARSE/zero-service branch while retaining Qualified invariants. New command does not resolve instants, create service/Segment/Journey/Booking/Ticket, or acquire proof rights. Actual live constraints and accepted receipt visibility must be proved by owning PG before DEV approval/deployment.

## Rollback

Dormant source-only rollback is reversing this four-file patch; it changes no persistent facts or installed capability. If future SQL is ever enabled, first restore its previous exact capability/four-or-more-function policy using that future packet's own reviewed rollback, retaining accepted data; only then remove Backend profile support. Do not revert Backend first while leaving the full-union SQL profile advertised, because older profile parsers would close P4-P6 as well. Existing Native Queue/Form integration remains separate and pending.
