# SQLite53 Publication Membership persistence Builder report

Date: 2026-10-09 (Pacific/Auckland).

**Builder complete — READY FOR INDEPENDENT REVIEW.** SQLite53 is implemented only
in the isolated, uncommitted Builder. Canonical main remains at the accepted
SQLite52 integration. No transport, provider, C4 or business runtime was activated.

## Source and allocation gate

Local main, origin/main and read-only remote main matched the exact accepted base:
`3216668e42e919a2b4657e1357e8c7536fead114`. Canonical registry was exactly
contiguous1–52. The accepted SQLite52 and Membership closures remain ancestors
through their two ordinary merge commits.

Before implementation, checked52 local/remote refs and44 worktrees for authored
SQLite53 definitions in the migration registry/modules: none found. Remote heads
were also verified: main at3216668, ledger integration at81db7678, and Trip Import/
Temporal atd295b5e2; those known sources have no competing53 allocation. Existing
review documents call53 an unallocated candidate, not a reservation. This Owner
request allocates53 to the Builder after that gate; it does not authorize canonical
publication. Evidence: `/private/tmp/otr-sqlite53-builder-evidence/source-allocation-gate.json`.

Fresh managed Builder, detached at the accepted base:
`/Users/xoery/.codex/worktrees/sqlite53-publication-membership-builder/otr-mobile-canonical`.
No unrelated checkout changes were copied. Existing dependencies were temporarily
reused; no dependency install, lockfile/configuration change or credential use.

Authoritative inputs read: the complete Membership preflight in the accepted
`publication-membership-preflight` worktree; canonical Membership migration design,
ADR, dormant implementation/review/F1–F3 recheck; SQLite52 implementation/recheck;
and accepted P2b integration preflight plus canonical3216668 lineage. Historical
accepted design/review/ADR/Builder report bytes were retained, including their
original gated/unallocated wording.

## Minimal implementation and exact changed files

Only production changes are the new migration module and its two-line registry
addition. Existing Membership repository, envelope contract, Import/Source stores,
Flight digest, C2 and Observation Store production code are unchanged.

1. `docs/CURRENT_IMPLEMENTATION_STATE.md`
2. `docs/architecture/OTR_PLATFORM_SQLITE53_PUBLICATION_MEMBERSHIP_BUILDER_REPORT.md`
3. `src/data/db/migrations.ts`
4. `src/data/db/migrations/tripSourcePublicationMembership.ts`
5. `src/data/db/publicationMembershipMigration.test.ts`
6. `src/data/db/checkpoint11Integration.test.ts`
7. `src/data/db/database.test.ts`
8. `src/data/foundation/diagnosticsReadOnly.test.ts`
9. `src/data/repositories/captureAutonomousQa.test.ts`
10. `src/data/repositories/captureBatchAssessmentObservationRepository.test.ts`
11. `src/data/repositories/intelligenceContinuationRepository.test.ts`
12. `src/data/repositories/tripCanonicalEventRepository.test.ts`
13. `src/data/repositories/tripPublicationMembershipRepository.test.ts`

Registry-sensitive existing tests advance their whole-registry expectations to53.
The fixed51→52 Observation Store test now selects migration52 by ID rather than
assuming the final registry entry is52; its original assertions remain. Other
Observation Store fixtures run against53, and two explicit populated52→53 tests
preserve and continue the accepted chain across the upgrade.

Membership fixtures use actual migrated SQLite53 and real column queries/writes.
The virtual column, Map-backed envelope and virtual rollback assumptions are gone.
The prior schema-unavailable case deliberately installs only1–52, still rejecting
before catalog writes. Existing F1–F3 and other accepted negatives are retained.
A protected Run Input-digest mutation now asserts the real immutable SQL guard
rejects it, while the owning missing-Input integrity assertion remains.

Corruption tests explicitly bypass the two guards in disposable fixtures, alter
stored evidence and restore the exact guards. This is a labeled TEST-ONLY privileged
corruption model, not a supported write or a claim that ordinary SQL can rewrite
a committed envelope. Separate FK ON/OFF tests prove normal guard enforcement.

## SQLite53 schema and preservation evidence

ID53: `trip_source_publication_membership`.

- Exactly one additive `ALTER TABLE trip_source_runs ADD COLUMN
publication_membership TEXT`, nullable with implicit NULL default.
- Exactly four reviewed triggers: `local_publication_membership_insert`,
  `local_publication_membership_immutable`, `local_publication_membership_install`,
  `local_publication_membership_retained`.
- No table/index, backfill, UPDATE sweep, new identity, queue type, API or down
  migration. Historical NULL remains unavailable, never certified empty membership.
- SQL body equals the accepted Migration Design code block **byte-for-byte**.
  SHA-256: `6b8df50cf814bbba249a58798eb59b30492bb276edb01cf9b3718bf37449cf68`.
- Registry delta is exactly one import and one trailing entry. Runtime comparison
  confirms all52 prior `{id,name,sql}` objects are unchanged; their JSON SHA-256 is
  `27fdf7c2eea6d32a69ca23e27f8877f4b721d15deb721ad575ac9e5466042278`.
- **90 external historical SQLite/server migration files** and **1,249 base paths**
  outside this delivery are byte-identical. Accepted repositories/contracts, ADRs,
  Builder reports, Independent Reviews and targeted rechecks are included.

Source retention remains the accepted four-guard design. SQL enforces type/object/
UTF-8 bounds and installation bindings; strict canonical parsing, digest and whole
Candidate/Input/descriptor/ancestry verification remain repository responsibilities.
A digest is not a signature or proof of authenticated transport.

## Executed acceptance matrix

**Final combined:24 files /974 tests PASS**, no failed or skipped tests in that
matrix. It includes the accepted23-file regression matrix plus the new migration
suite; repeated focused runs are not added to that result. Membership suite has
**58 tests** on real storage, and the migration suite has **16 tests**.

| Area                                                     | Observed result                                                                                                                                                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh1–53, FK ON/OFF                                     | PASS: contiguous unique history, one nullable TEXT column/four guards, empty Run table, idempotent runner and no FK violations                                                                                                    |
| Populated52→53 catalogs, FK ON/OFF                       | PASS: every prior table/column value and SQLite storage-class projection retained; all52 old migration records unchanged; existing Run remains NULL and old closure reads work; later owning installation succeeds                |
| Populated52→53 Observation Store/C2/originals, FK ON/OFF | PASS: accepted original BLOB bytes/storage classes, C2 rows and complete observation body/revision/digests/history preserved after cold reopen; exact historical read/replay and next append succeed                              |
| Atomic migration failures and retry                      | PASS:14 FK ON/OFF cases fail after ALTER, after each of four guards, and before/after53 history INSERT; exact prior sqlite_schema/history and typed BLOB sentinel restored, followed by successful idempotent retry               |
| Real install/read/replay                                 | PASS: exact committed envelope/read set survives replay; zero/one/two/64 rosters still verify through the existing owning installer                                                                                               |
| Committed identity/column guards, FK ON/OFF              | PASS: all17 pinned Run/envelope substitutions, changed bytes/NULL, direct populated INSERT and DELETE denied; identical envelope and permitted observation/retention changes preserve bytes and withhold unusable current reads   |
| First envelope write rollback, FK ON/OFF                 | PASS: incomplete admitted incoming roster reaches the real envelope write, then retained extra sibling causes whole transaction rejection; original NULL/catalog rows preserved, complete retry succeeds                          |
| Install bindings and invalid content, FK ON/OFF          | PASS: all12 reviewed body bindings and four admission predicates checked; nontext, malformed JSON, nonobjects and invalid bindings reject before commitment                                                                       |
| UTF-8 boundary, FK ON/OFF                                | PASS: structural32768-byte JSON admitted,32769 denied with NULL retained; multibyte byte count used; owning parser rejects the deliberately unknown padding field                                                                 |
| Complete Candidate/Input membership                      | PASS: missing/PENDING/extra/same-count-substituted Candidate and missing unreferenced Input reject; cold FK-OFF omissions/substitutions cannot become complete smaller publications                                               |
| Input digest and derived ancestry                        | PASS: wrong authoritative digest and malformed ancestry reject; distinct derived bytes and exact original roots survive file-backed cold reopen; convergent DAG and ambiguous distinct-root correction regressions remain passing |
| Account A→B→A                                            | PASS: stale contexts/handles reject, B gets no A disclosure, fresh A cold read recovers the exact retained envelope without changing it                                                                                           |
| Lost COMMIT ACK                                          | PASS: injected ACK loss occurs after actual SQLite file COMMIT; close/reopen recovers full envelope/Inputs/Candidates/derived roots, same Run replay is neutral, one TEST-ONLY RPC invocation and no provider execution           |
| Existing C2/C4a/Import/Continuation/Account              | PASS in final combined matrix; accepted production code unchanged and dispatch/runtime gates retained                                                                                                                             |

The32768-byte fixture is intentionally **structural SQL admission evidence**,
not a semantically valid padded canonical envelope. The unchanged repository rejects
its extra field. Valid maximum64-member canonical envelopes independently fit the
bound and retain their separate membership digest. No parser limit was relaxed.

The injected RPC is explicitly TEST-ONLY and CLOSED. It exercises trusted-handoff
provenance within the accepted dependency boundary; it does not certify real
network origin, credentials or an available authenticated gateway.

## Actual old-build compatibility rehearsal

Used the actual accepted canonical52 `migrationRunner.ts`, registry, Import and
Membership repository source from `/Users/xoery/Project/otr-mobile`, against a
newly migrated53 SQLite file containing a committed complete envelope/catalog.
The old runner, historical Import application/closure read, exact Membership
read/replay and file close/reopen preserved the envelope, whole read set, all53
history records and four guards. **PASS.** No copied approximate old algorithm,
destructive downgrade/reset or dropping the column was used.

Evidence: `/private/tmp/otr-sqlite53-builder-evidence/old-build-rehearsal.ts` and
`old-build-rehearsal.log`. This certifies accepted source-level compatibility on
Node SQLite; it does not claim an old Expo/native binary was installed or operated.
Rollback remains disabling the dormant consumer while retaining schema/history/
commitments; no destructive down migration is supplied.

## Static checks, reproducibility and delivery state

- Typecheck: **PASS**.
- Lint including UI guard: **PASS**,80 representative files and473 retained legacy
  occurrences. No UI or user-facing copy change.
- Backend local build: **PASS**, no server launched.
- All13 changed paths Prettier and Git whitespace: **PASS**.
- Historical migration/registry and out-of-scope preservation: **PASS** as above.
- No runtime factory caller, transport/provider install, startup composition,
  Integrated C4 wiring, C5/C9 or business command was added.

Final combined command uses the24 exact paths in
`/private/tmp/otr-sqlite53-builder-evidence/regression-files.txt`:

```sh
python3 /private/tmp/otr-sqlite53-builder-evidence/run-regressions.py
npm run typecheck
npm run lint
npm run backend:build
```

Run from the isolated Builder with existing installed dependencies. Evidence root:
`/private/tmp/otr-sqlite53-builder-evidence/`. `combined-tests.log` retains the final
run; `preservation.json`, `exact-changed-files.txt`, `changed-format.log` and
`verify-preservation.py` retain exact scope and preservation evidence. The temporary
dependency symlink is removed from the final delivery.

Exploratory new guard negatives initially used an extractor-options replacement
identical to the fixture's stored zero hash; changed to a genuinely distinct hash.
A generic test-adapter type annotation and the external rehearsal's alias resolution
were corrected. No production/repository/SQL correction or accepted protection
relaxation was needed. No global full-suite or global formatting PASS is claimed.

All Builder changes are uncommitted; HEAD/main/origin remain3216668. Canonical53
integration/push is a future separately authorized checkpoint. Main's unrelated
untracked Hosted report, accepted Builder/review worktrees and the starting dirty
chat checkout are preserved. A report-only copy in the chat checkout is for access;
it is not an integration or migration registration there.

## Independent Review and remaining gates

Ready for Independent Review of this exact SQLite53 Builder. Review should reproduce
the four actual guards, atomic failure/retry matrix, typed52 upgrade preservation,
file-backed ACK/cold complete readback and actual52-source compatibility. Owner
acceptance and canonical integration remain pending; Builder PASS is not independent
review or publication acceptance.

Authenticated private Transport remains CLOSED/unprovisioned and unverified. Current
C2/Capture/Trip/Source/publication read-set composition, P2b-A corrections, P2b-B NEW
append admission, Continuation callbacks and Integrated C4 require separate
implementation/review/authorization. C5/C9, provider/runtime/business gates remain
CLOSED. This migration alone grants no current semantic or canonical-write authority.

Not checked: full test suite, old/new native Expo binaries, device/OS concurrency,
physical disk/power-loss behavior, authenticated live transport, Hosted DEV or
Production. All databases here were disposable local SQLite fixtures. No Hosted,
device/provider operation, runtime activation, commit or push occurred.

**STOP — SQLITE53 PUBLICATION MEMBERSHIP BUILDER / INDEPENDENT REVIEW REQUIRED.**

## F1 replacement-retention correction — 2026-10-09

This appendix supersedes the original readiness claim for F1 while preserving the
original Builder report, Migration Design and Independent Review text. Owner
correction authorization follows Independent Review **PASS WITH REQUIRED
CORRECTIONS**, 0 CRITICAL / 1 IMPORTANT / 0 MINOR. Targeted Independent Recheck is
required; this Builder correction does not claim independent acceptance.

Before SQL changed, all **four original independent failures reproduced** against
identical original SQL: same-primary-key INSERT OR REPLACE to NULL, operation-key
REPLACE under a new Run ID, scope/generation INSERT OR REPLACE under a new Run ID
and operation, and UPDATE OR REPLACE of a separate NULL Run into a committed
operation-key victim. The original independent38 probes returned **34 PASS /
4 FAIL**; all three original file-backed loss characterizations confirmed lost
committed envelopes/Run identities after reopen with FK OFF / recursive OFF.

The explicit F1 record was appended to the Migration Design before SQL changed.
Only the existing INSERT and UPDATE guard predicates changed. Each finds a
committed victim through all three existing unique constraints before SQLite
replacement deletion. UPDATE excludes its own OLD Account/Run composite identity.
Existing errors are preserved: INSERT rejects with
`PUBLICATION_MEMBERSHIP_INSTALL_REQUIRED`; UPDATE rejects with
`PUBLICATION_MEMBERSHIP_IMMUTABLE`. The install/retention guards and column DDL are
byte-identical to the original Builder. Protection does not require FK or recursive
triggers. Normal NULL writes and permitted committed observation/retention updates
remain allowed. No new table/index/trigger/migration or Repository production code.

Corrected SQL SHA-256 (template contents excluding boundary newlines, same
convention as original design/review):
`271862444e9ed805befd3a065997cee9d1a1b2b6430dbc8a1e8d334e3c6a0506`.
Original vulnerable SQL SHA-256 remains historical:
`6b8df50cf814bbba249a58798eb59b30492bb276edb01cf9b3718bf37449cf68`.

### Correction validation

- Four original negative probes unchanged: **PASS** against corrected SQL. Full
  independent38-probe rehearsal: **38 PASS**, with only the three characterization
  expectations adapted from loss to rejection and exact cold retention. Original
  reviewer file/snapshot and accepted review report remain untouched.
- New F1 **28 PASS**: INSERT/UPDATE × primary/operation/scope constraint × FK ON/OFF
  × recursive triggers ON/OFF =24 file-backed rejection cases, plus4 legitimate
  NULL replacement/update and committed observation/retention controls. Rejection
  preserves all Run rows, exact committed envelope/readback and guard definitions
  after close/reopen; no guard bypass used.
- Accepted24-file affected matrix: **1002 PASS = original974 + new28**. Membership86
  and migration16 included. Fresh1–53, populated52→53, FK ON/OFF, DDL/guard/history
  atomic failure/retry, lost-ACK, complete Candidate/Input, derived ancestry,
  Account and C2/C4a/SQLite52/Import/Continuation regressions remain PASS.
- Independent file-backed migration failure/retry14 and accepted52-source
  compatibility2 included in38 PASS. Separate actual canonical52 runner/Import/
  Membership cold-file rehearsal: **PASS**, history1–53 and envelope/roster intact.
- Typecheck, lint/UI guard (80 representative files /473 legacy occurrences),
  Backend local build, changed-file Prettier and Git whitespace: **PASS**.
- SQLite1–52 bytes/registry and all90 prior local/server migration source files
  remain exact. SQLite53 stays the sole new migration, with one nullable column
  and four guards; no SQLite54. Accepted production repositories/contracts/ADRs,
  historical design prefix and Independent Review bytes remain exact.

Correction changes exactly five paths relative to original Builder delivery:

1. `docs/architecture/OTR_PLATFORM_PUBLICATION_MEMBERSHIP_MIGRATION_DESIGN.md`
2. `src/data/db/migrations/tripSourcePublicationMembership.ts`
3. `src/data/repositories/tripPublicationMembershipRepository.test.ts`
4. `docs/architecture/OTR_PLATFORM_SQLITE53_PUBLICATION_MEMBERSHIP_BUILDER_REPORT.md`
5. `docs/CURRENT_IMPLEMENTATION_STATE.md`

The combined uncommitted delivery has15 paths: original13 Builder paths, the
preserved Independent Review artifact and the appended Migration Design. No other
original Builder file changed. Evidence root:
`/private/tmp/otr-sqlite53-f1-correction-evidence/`; `before.log`,
`independent-after.log`, `targeted.log`, `regression.log`,
`accepted52-compatibility.log`, static logs, `preservation.json` and
`exact-changed-files.txt` retain reproducible results. The temporary snapshot uses
corrected SQL and preserves all original negative probes verbatim; only cold
characterization assertions change. The temporary dependency symlink is removed.

HEAD/local main/origin/remote main remain
`3216668e42e919a2b4657e1357e8c7536fead114`. No commit, push, merge, Hosted/device
operation or runtime/provider activation occurred. Transport remains CLOSED;
Authenticated Transport, Integrated C4, C5/C9 and provider gates require separate
authorization. Existing installed databases with the vulnerable uncommitted53 SQL
are disposable fixtures; this correction is pre-integration and introduces no
historical rewrite or deployed migration repair.

Not checked: full repository suite, native/device concurrency or power-loss,
Hosted/Server execution, authenticated Transport or providers. Remaining gate:
targeted Independent Recheck of F1, followed by Owner acceptance/integration.

**STOP — SQLITE53 F1 CORRECTION COMPLETE / TARGETED INDEPENDENT RECHECK REQUIRED.**
