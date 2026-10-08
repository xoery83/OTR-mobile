# Dormant Publication Membership Builder report

## Owner-authorized F1–F3 corrections — 2026-10-09

**Corrections ready for Owner review; migration/transport/runtime gates CLOSED.**
The original independent review is preserved as historical evidence.

Exact correction files:

- `src/data/repositories/tripPublicationMembershipRepository.ts`: reject each
  Run Input Source absent from committed Source scope in shared projection
  (CLOSED sealing, installation readback and owning current read). Single-Capture
  support requires exactly one distinct Original root from complete verified
  ancestry before binding selection. Complete publication still retains valid
  multi-parent and multi-root DAGs.
- `src/data/repositories/captureSourceAdmissionRepository.ts`: internal Source
  Store requires active transaction, current Account and cached Trip admission;
  reject ambiguous root lists. Its owning caller must supply **all verified
  roots**, never a selected subset. Only the complete publication support seam
  supplies them; no public support API accepts caller roots.
- `src/data/repositories/tripImportAdmissionRepository.ts`: exposed internal
  apply/Input Store methods require active transaction, current Account and Trip.
  Missing transaction-state capability fails closed. Existing public Import
  methods retain their existing transaction path and database adapter compatibility.
- `src/data/repositories/tripPublicationMembershipRepository.test.ts`: correctly
  rehashed out-of-scope negative through CLOSED/current read, scoped zero-Input
  Source positive, two-root/two-binding negatives (identical bytes intentionally
  cannot establish equivalence), convergent diamond support positive, direct
  Store transaction/Account/Trip negatives and absent-capability denial.
- `docs/CURRENT_IMPLEMENTATION_STATE.md` and this report: correction handoff.

The existing SQLite `isInTransactionAsync` guard enforces activity, **not caller
ownership** of a connection transaction. Internal Store callers must still hold
the existing Account apply gate and same serialized owning transaction throughout
the complete final read/validation. No new transaction manager or nested
transaction was introduced.

Verification commands use the existing dependency symlink temporarily:

- Existing report's 12-suite command: **788/788 PASS**, including membership38.
- Additional `accountSwitchCoordinator`, `accountSwitchFoundation`,
  `accountLocalState`, `captureAutonomousQa`: **4 suites / 13 PASS**.
- Final membership command after absent-capability test: **39/39 PASS**.
- `npm run typecheck`, `npm run lint` (includes `ui:guard`),
  changed-file Prettier and Git whitespace checks: **PASS**.
- Independent targeted F1–F3 code/test recheck by a separate read-only agent:
  **PASS, no remaining findings**. Connection-level activity versus ownership
  qualification above is retained.

Only the existing Builder worktree was changed. Detached HEAD remains
`f7115dc288aff7f0a252bf80f53b0f2b626a7534`; delivery is uncommitted.
SQLite registry/migrations remain exact base bytes. SQLite52 is untouched;
SQLite53 remains unallocated. No authenticated transport, Integrated C4,
provider/runtime/business gate or Hosted/device operation was activated.

Remaining checks are migration-gated: actual nullable-column/guard behavior and
file-backed committed-envelope cold restart. The test-only virtual column does
not prove those properties. Trusted transport admission remains uninstalled.

**STOP — PUBLICATION MEMBERSHIP CORRECTIONS READY FOR OWNER REVIEW.**

Date: 2026-10-08 (Pacific/Auckland).
**Ready for Independent Review: YES — dormant code/design scope only.**
**Migration registration, execution and durable-schema acceptance: BLOCKED.**

## Base and migration coordination

Read-only remote `refs/heads/main`, local main/origin-main and fresh isolated HEAD
verified identical: `f7115dc288aff7f0a252bf80f53b0f2b626a7534`.
Worktree: `/Users/xoery/.codex/worktrees/publication-membership-builder/otr-mobile-canonical`.
Detached, initially clean; uncommitted delivery. No Git integration/commit/push.

Owner accepted the complete publication preflight in the preceding isolated
`publication-membership-preflight` worktree. This Builder follows that accepted
contract without changing the blocked P2b-A implementation or its independent review.

Actual canonical registry is **contiguous SQLite1–51**. SHA-256 of its exact JSON
encoding is `b48136d3c787308f8588e392f047265e08b572e9469fbabef9a3a44075d8e982`;
`migrations.ts` SHA-256 is
`19a157ab72302015ea51d508dc7d8f16bd395f0618da8218015c56da056e1c25`.
Both remain unchanged. Separate P2b-B SQLite52 is implemented at the same HEAD,
pending independent review/Owner acceptance; its migration definition was read only
(SHA-256 `54a26fa858d94c895c27280059b76faa3467b52b91d13422e01d155e2483d684`).
**SQLite53 remains a candidate, not allocated.** No migration module, registry edit,
new DDL execution or schema history entry was created.

The implementation is safely separable: all dormant local installation/read paths
require an active transaction and the Run column. On actual SQLite51 they return
`PUBLICATION_MEMBERSHIP_SCHEMA_UNAVAILABLE` before any catalog installation write.
Historical Import catalog behavior remains available. The source gate therefore
does not require an unauthorized migration registration.

## Implemented scope

- Strict v1 canonical `{body,body_sha256}` envelope binds existing Account/Trip/Run/
  operation/generation, complete Source scope/digest, complete Run Input digest,
  extractor pins and all Candidate ID/key/kind/version/proposal hashes. Sorted
  unique member IDs/keys, strict primitive JSON, safe integers,64-member and32768-
  byte bounds. Separate `otr-source-run-publication-membership-v1` digest; no new
  publication identity or replacement of existing Input/proposal hashes.
- Explicit CLOSED reader invokes only the existing private
  `trip_source_read_import_catalogs(actor,trip)` contract through a mandatory
  trusted injected RPC (or fails unavailable). It validates the full bounded
  catalog, current Account/generation and exact Actor/Trip, recomputes complete
  Input digests and deterministically projects commitments from actual READY
  publication records. No default credentials/session/transport exists.
- The reader returns an immutable process-local admitted handle. A module-private
  WeakMap retains its exact raw catalog and Account context. Raw caller rows,
  copied handles, unsent CP13B requests and arbitrary `complete:true` assertions
  cannot enter the owning installation API. Parsing/sealing a checksum alone never
  creates a trusted handoff.
- Reuses existing `flightRunInputDigest` and `validateImportSnapshot`. Complete
  Inputs include unreferenced Inputs and all selected Representation/transform
  descriptors. Original/derived ancestry checks parents, ownership, material
  revision, retention, cycles/bounds and original-manifest membership. Child and
  original material hashes/sizes stay distinct.
- Dormant repository owns one existing Account-gated serialized transaction; it
  applies the admitted catalogs through the extracted existing Import store,
  installs each envelope, then reads/revalidates complete retained membership
  before COMMIT. Different-database Import stores are rejected. Transaction-local
  methods reject invocation outside a transaction and open no nested gate/transaction.
  All installed operations are local SQL/hash work; protected read I/O precedes them.
- Complete local read queries **all scoped sibling rows before registration
  filtering**, checks every member/body/proposal hash against the retained envelope,
  recomputes the complete Input digest and reuses owning Input admission. Missing,
  PENDING, extra or substituted siblings cannot become a smaller complete result.
  Stable sorted catalog identities form an exact current read set; current
  `assertCurrent` compares that whole set inside the caller's transaction.
- The Source-owned transaction-local binding validator checks ADMITTED scope,
  bound original identity/hash/size, actual CP11 payload bytes/hash and **current**
  Capture Trip assignment/revision. Future revision claims and later unassignment
  fail. `readCaptureSupport` combines it with the verified publication Input's
  original ancestry; it does not infer C2 occurrence identity from byte equality.
- Historical NULL remains unavailable to complete membership, distinct from a
  certified zero-member publication. Existing `applyCatalogs` and closure behavior
  remain. Exact matching installation reuses the same Run/envelope/operation;
  immutable installation readback is separate from current Source/Input admission,
  so older stale READY Runs do not block fresh Runs or destroy exact historical
  replay. Current semantic reads still repeat the existing owning Input checks.
  Corrupt or changed commitments reject. Simulated lost-ACK recovery reads the
  same installed facts rather than allocating/reinterpreting anything.

## Exact delivered paths

| Path                                                                        | Change                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/api/tripPublicationMembershipContracts.ts`                        | Strict envelope schema, bounded canonical sealing and hash/read validation.                                                                                                                                                                                                                 |
| `src/data/repositories/tripPublicationMembershipRepository.ts`              | CLOSED private-read handle; deterministic authoritative projection; dormant repository/transaction store; whole publication/ancestry verification and Capture support read.                                                                                                                 |
| `src/data/repositories/tripPublicationMembershipRepository.test.ts`         | 34 focused cases using real SQLite1–51 catalogs and explicitly test-only future-column simulation.                                                                                                                                                                                          |
| `src/data/repositories/tripImportAdmissionRepository.ts`                    | Extract existing catalog apply body into a frozen same-database transaction store and expose existing Input validator; public apply still owns its normal gate/transaction. Validation hashing now occurs locally inside that transaction. Existing merge/revision/error behavior retained. |
| `src/data/repositories/captureSourceAdmissionRepository.ts`                 | Narrow read-only current Capture/Source-binding transaction store; no change to Source commands/acquisition lifecycle.                                                                                                                                                                      |
| `src/data/interpretation/flightInterpretation.ts`                           | Narrow the digest helper's argument type to the `pin` fields it already consumes. Runtime digest bytes/algorithm and all existing callers remain unchanged.                                                                                                                                 |
| `docs/architecture/OTR_PLATFORM_PUBLICATION_MEMBERSHIP_MIGRATION_DESIGN.md` | Review-only one-column/four-guard DDL, unallocated and unexecuted; upgrade/rollback acceptance checklist.                                                                                                                                                                                   |
| `docs/adr/2026-10-08-complete-publication-membership.md`                    | Records Owner-accepted ownership/commitment decision and migration/runtime gates.                                                                                                                                                                                                           |
| `docs/CURRENT_IMPLEMENTATION_STATE.md`                                      | Short dormant Builder status and next review/migration gate.                                                                                                                                                                                                                                |
| `docs/architecture/OTR_PLATFORM_PUBLICATION_MEMBERSHIP_BUILDER_REPORT.md`   | This report.                                                                                                                                                                                                                                                                                |

No package/configuration, barrel export, runtime caller, Backend route, provider,
scheduler/worker/Job, C4a/CP13B interpretation behavior, C5/business command or
Server migration change. A temporary dependency symlink reused already installed
packages for checks and was removed from delivery; no dependencies were installed.

## Actual validation

- Focused membership suite: **34/34 PASS**. Zero/one/two/64 members; deterministic
  roster/replay; missing unreferenced/PENDING/extra/substituted siblings; unreferenced
  Input loss/wrong digest; derived-child distinct bytes and missing/cyclic ancestry;
  absent transport/copied handle/foreign scope; actual51 schema denial and historical
  NULL; same-database/active-transaction fences; A→B→A and switch during private read;
  corrupt/noncanonical/self-consistent wrong identity/scope/generation/hash envelopes;
  virtual-column lost ACK/transaction rollback; current Capture/future revision/
  unassignment; late Source/Actor denial; maximum bounded roster; FK-OFF sibling loss;
  exact historical replay after Source changes and a fresh Run beside a stale READY Run.
- Final selected10 suites **589 tests PASS**: membership, Import admission, CP11
  originals, C2 submissions, continuation repository, Flight interpretation and
  integration, Account context, sync denials and pure C4a.
- Direct additional caller checks: Flight closure and CLOSED inbound-client
  **2 suites /195 PASS**. Combined **12 suites /784 PASS**. No full-suite PASS claim.
- Typecheck, full lint/UI guard and Backend build PASS. UI guard checked80
  representative files, retaining473 legacy occurrences. Changed-file formatting
  and whitespace PASS. Initial Backend build lacked sandbox permission to create
  the isolated `dist` directory; authorized local retry passed, without deployment.
- Initial Capture fixture setup incorrectly used a nonexistent payload timestamp
  and Node SQLite REAL-bound byte count. Corrected to the actual CP11 schema and
  integer binding; no production guard was disabled or relaxed.
- Exact registry/historical migration bytes unchanged; protected P2b-A paths and
  separate P2b-B migration remained unchanged by this Builder. Precise caller
  search found no production composition of the new CLOSED/dormant factories.

**Test qualification:** The new column does not exist on this source. A test-only
adapter supplies virtual column metadata/read/write values while all existing
catalogs, SQL queries, Input/Source/Capture guards and transactions use real
disposable SQLite1–51. Virtual envelope values follow test transaction rollback/
lost-ACK behavior. This is not executed new DDL, SQL guard proof, file durability,
actual migrated schema, native concurrency or production transport acceptance.
Existing file-backed Import/C2/continuation regressions remain existing-system
evidence and do not certify new envelope durability.

## Migration-blocked scope and transport limits

Review-only migration design adds exactly one nullable `publication_membership`
column and four proposed guards: no populated insert, immutable committed envelope/
Run identity, eligible bound first installation, and committed Run retention.
Historical NULL is unchanged; sibling loss is detected by owning verification,
not new deletion guards on every catalog table. No table/index/backfill/new ID.

Still blocked until SQLite52 acceptance and verified migration ancestry/numbering:
allocated migration module/registry registration, actual DDL/history execution,
fresh/upgrade/FK-OFF guard tests, failure-at-each-DDL-boundary rollback, old-build
compatibility and **file-backed committed-envelope cold-restart/lost-ACK validation**.
Do not register a presumed53 onto this51 source. Rollback retains evidence/schema/
history and disables the dormant consumer; no destructive down migration/reset.

The exact private catalog SQL contract supplies complete authoritative rows and
rejects bounded truncation under accepted protected Track C custody/sealing. The
injected RPC is a trusted infrastructure dependency, not a network-origin witness
or installed authenticated session. Synthetic RPC tests cannot prove gateway
principal, credentials, Hosted availability or production authorization. Actual
transport/session provisioning remains separately gated; absent transport fails
closed and there is no replacement publisher. The existing private read's whole-
Trip64-per-family/4 MiB bounds remain; unavailable/oversized/incomplete/unregistered
read sets fail whole rather than infer completeness from matching local rows.

Process-local handles are intentionally not restart credentials. After process
restart a fresh admitted read is needed to install; after the migration gate clears,
the retained envelope can be verified from disk for readback. Current permission/
material loss withholds usable disclosure, preserving existing originals and
execution responsibility. NULL/corruption/read failure never proves an empty or
absent publication, nor authorizes re-execution.

## Next gates

1. Independent review of this dormant code/design and the explicit test limitations.
2. Owner acceptance of separate SQLite52; reverify canonical main/ancestry/registry,
   then separately allocate/authorize the publication migration and its real tests.
3. Independent durable installation/guard/cold-restart review.
4. Separately authorize P2b-A F1–F4 correction and P2b-B NEW append composition.
   Both must compare the complete owning read set in their final transaction;
   C2 occurrence/header/roster admission remains C2-owned. No adapter correction,
   integrated C4 acceptance, continuation callback wiring or runtime activation is
   supplied by this Builder. Historical/current assessment authority stays distinct.

No Hosted DEV/Production access, device operation, provider call, new Server
migration, runtime activation, C5 admission/business command, commit, push or Git
integration occurred. Independent review has not yet been performed.

**STOP — PUBLICATION MEMBERSHIP BUILDER / INDEPENDENT REVIEW REQUIRED.**
