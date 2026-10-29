# P6 Manual DEV capability candidate — NOT APPROVED / NOT INSTALLED

The current P5 unknown-service Schema gap does not block this independent P6 profile. This packet recognizes P1/P3/P4/P6 only; it never enables P2 or P5.

- Replace exactly four existing functions: trip_sustained_dev_scope_allowed(uuid,uuid,uuid,text), trip_sustained_core_capabilities(uuid,uuid), trip_core_guard_write(), trip_core_finite_read_state_guard(). Latest read-only DEV preimages and function identities are pinned in P6_READINESS.json; install and rollback both compare exact function-definition MD5s and abort on drift.
- Scope stays Forms QA Account `3f7e964e-79d3-4028-a585-470e798e41ec`, its normally created V2 Trips with normal Create receipt at/after `2026-10-28T02:16:48Z`, existing enabled policy, linked Trip owner and normal authenticated gateway/principal checks. Existing P1/P3/P4 remain unchanged; no Import capability is borrowed.
- Exact P6 commands: CREATE_ITEM, SET_ITEM_TEXT, SET_ITEM_SCHEDULE, SET_ITEM_PLACE, SET_ITEM_PARTICIPATION, SET_ACTIVITY_DETAILS. P3/P4-specific commands remain family-fenced. P6 details and ENTRY rows require the same Item/Trip/Creator and owning Create/details command. UPDATE cannot change child event_id or ENTRY role; DELETE is not opened. Existing Source/exact-operation and legacy branches are preserved byte-for-byte.
- Native Accepted Edit reuses the existing complete MANUAL Create command/queue/hash/receipt verifier plus same Creator/manageability and expected revision. Actual local/accepted field mappings preserve session label/admission note/ENTRY place and explicit clearing. No Ticket, Voucher, media or new Authority store.
- New Schema/table/column/role/RLS/GRANT and temporary administrator count: zero. This is still a sustained business Authority expansion and requires precise Owner approval before installation. No runtime DEV software, SQL, Gate, Session, device or original QA data has changed.

Validation: Native child7suites128PASS; parent joined Native/Backend9suites165PASS, full TypeScript/UIguard/scoped ESLint/default Backend build PASS. Independent Backend reviewer37checks and four-function header/CAS/NULL/Source/legacy/identity review NO_BLOCKER. Repro `python3 scripts/trip/manual-p3-sql-acceptance.py P6` passes real network-none PostgreSQL Create/text/schedule/place/details/participation and entry clearing, immutable operation replay, validated full Reader, wrong-account denial, raw child reparent/ENTRY-role/DELETE/wrong-command/missing-context rejection, rollback retaining accepted data and OID/owner/ACL. These are LOCAL/L2 only, not a Native/DEV Cloud result.

SQL SHA256:
- install `f4d007aeb8d43518ca883110da137288e6dae4109266b99e974f5d5b2ef9bff5`
- rollback `453f25967fbdf1b287239856a310994ec5dd275e3b391837f16c0a6d6b975684`

After precise approval: fresh shared-function CAS and current DEV configuration preflight; serial deployment preserving current Import/Source code, six mounts and environment; then normal Forms QA Manual Create/Edit, real SERVER_ACCEPTED receipt, independent Supabase readback, Native cold/offline/replay/permission negatives. Do not install this packet on top of an intervening P5/Import SQL change without a fresh merged candidate and review. No night-time approval request is sent.
