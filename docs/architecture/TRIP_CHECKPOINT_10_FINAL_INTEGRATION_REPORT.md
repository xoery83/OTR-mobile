# Checkpoint #10 final integration candidate

Date: 2026-10-05. **Integration complete; STOP — INTEGRATION REVIEW PENDING.**
The candidate is on `trip/import` in `/Users/xoery/Project/otr-mobile-import`.
The commit containing this report is the final integration-only commit; its exact
HEAD is supplied in the completion message. A remains at its authoritative HEAD;
B remains at its rebased feature HEAD. Nothing was pushed or activated.

## Authoritative inputs and linear history

| Input | Accepted original                          | Candidate feature commit                   |
| ----- | ------------------------------------------ | ------------------------------------------ |
| A     | `248337917f4fb8aba841db5a6d6ed1a957b54de9` | unchanged                                  |
| B     | `5d231ba1d0cce51f8c737bfaf2f0b3573de8946d` | `9b0dabb0c893c8b2b193bff840b444287fd9e560` |
| C     | `dff8f03b95b476cbf3b9b029016a17b4ea4ae4e1` | `2b9fce50d8412f20382293db95e5e6e852b436da` |

All worktrees were clean before correction. The old B HEAD
`b780b1b0b52eb63ab2a5619b885431a8cd965529` was preserved on
`checkpoint10-old-b-integration`, then only `trip/temporal` was reset to accepted
`5d231ba`. Neither superseded `78d672b` nor `b780b1b` is in the candidate ancestry.
No old conflict resolution was used as the base. B/C feature messages are retained.

Linear candidate history, oldest first:

```text
55a35bc feat(trip): add bounded png parser worker
 a39cb1c 竞争对手
 5d0af4f feat(trip): add participation activation security foundation
 e073cfb CXE
 887de8b polor
 2483379 fix(trip): scope participation activation principals
 9b0dabb feat(trip): add canonical event collection apply
 2b9fce5 feat(trip): add durable source execution journal
 [commit containing this report] chore(trip): reconcile checkpoint 10 artifacts
```

The existing authoritative A order is retained exactly, including CXE/Polarsteps
commits between the A foundation and amendment. A was not reordered or rewritten.

## Integration-owned files

Conflict reconciliation changed only these six global artifacts; no implementation
or security-source conflict occurred:

- `docs/API_CONTRACT.md`
- `docs/CURRENT_IMPLEMENTATION_STATE.md`
- `docs/DATA_MODEL.md`
- `scripts/supabase/verify-baseline-artifacts.mjs`
- `supabase/schema-manifest.json`
- `supabase/tests/rls_matrix.test.sql`

B's three documentation conflicts and C's five expected conflicts were resolved
by semantic union against current A. The verifier retains A independent anchor,
principal-scope/security assertions and C journal assertions, including secret
scanning of both migrations. Counts/checksum come from the canonical query on the
actual integrated database. RLS matrix uses those measured counts without reducing
any assertion. C's accepted FK-child TRUNCATE test fixtures remain byte-identical.

The separate integration-only commit contains the three global documentation
updates and this report. Manifest/verifier/RLS reconciliation lives in the replayed
C conflict resolution. No accepted feature commit was subsequently amended.

## Migration topology and generated manifest

Server: **74 files / 74 unique versions**. Retained 72 migrations through `00100`
are byte-identical. Final versions:

```text
20261005000100 B-T3H collection foundation
20261005000200 A1-I2C5 amended activation foundation
20261005000300 C-I3H execution responsibility journal
```

SQLite IDs are exactly **1–46**, contiguous and unique. Historical migration-object
source 1–45 is exact, including 44 B-T3F and 45 A1-I2C2; 46 retains accepted B-T3I
BLOB-affinity/INTEGER bounds, scoped watermark triggers and repository trust checks.

| Manifest field      | Actual integrated value |
| ------------------- | ----------------------: |
| tables / RLS tables |               121 / 121 |
| columns             |                    1812 |
| indexes             |                     377 |
| constraints         |                    1071 |
| policies            |                     211 |
| triggers            |                     151 |
| functions           |                     227 |
| buckets             |                       4 |

Schema checksum:
`e6ee9b175bb920554cf61d7d4af76f09e4414e5e6149453fb6e396382abd982c`.
Verifier lineage checksum:
`96f772fa7637a7f267a7ca7c1c11ec95b283c834b031f50932e7a04bcf36ca1c`.

Each independent clean 74-migration replay executes the repository's unchanged
`supabase/schema_manifest.sql`; both raw outputs are byte-identical. Manifest
captures after each SQL/security/recovery suite are also byte-identical to their
pre-test captures. No manual arithmetic merge or baseline schema relaxation occurred.

## Validation

A+B pre-C gate: server73, SQLite46, A checker PASS, gate CLOSED; scope35,
Mobile collection/database105, A Backend54 PASS. Explicit unchanged C00300 apply
then returned the same A checker PASS and identical reviewed-root string before/after.

Both independent replay pipelines passed:

| Check                                                   | Replay 1                        | Replay 2    |
| ------------------------------------------------------- | ------------------------------- | ----------- |
| Clean 72-version baseline; A hostile reuse              | 63 PASS                         | 63 PASS     |
| A seed-populated forward install                        | 1 PASS, 119 prior tables        | same        |
| C hostile reuse / populated additive install            | 43 / 1 PASS                     | 43 / 1 PASS |
| Fresh actual 74-migration chain                         | 74/74 PASS                      | 74/74 PASS  |
| Full SQL suite                                          | 43 files / 1583 assertions PASS | same        |
| A principal-scope / fixed-root / previous P2            | 35 / 16 / 52 PASS               | same        |
| A+C compatibility / activation fence                    | 1 / 3 PASS                      | same        |
| B-T3H real collection / float regressions               | 7 / 11 PASS                     | same        |
| C-I3D independent vectors / concurrency                 | 1 / 1 PASS                      | same        |
| C-I3H fresh-process/SIGKILL recovery / historic UNKNOWN | 16 / 5 PASS                     | same        |
| Canonical manifest equality                             | PASS                            | PASS        |

The full SQL suite includes unchanged A foundation assertions, C-I3H111,
C-I3D159, C-I3B246 and B-T3H server SQL. Scope tests preserve globally pinned PUBLIC
ACLs and reject direct A grants on opaque isolated principals. A further rollback-only
C-specific grant to `otr_trip_source_execution_gateway` was independently rejected;
rollback restored checker PASS and both closed gates. C roles are NOLOGIN/NOINHERIT,
structurally isolated, with no C role-name exemption in A. Their 50 shared
PUBLIC-derived function capabilities per role do not change A's reviewed root.
Test-only fence probes use the disposable DB and leave CLOSED (generation3 after
fence tests); a clean replay starts CLOSED/generation0. No product runtime is enabled.

| Backend/Mobile/other validation                                      | Result                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------- |
| Full Backend                                                         | 30 files / 390 tests PASS                                  |
| A I2C2/C3/C4 + Account/client/DB/reporting selection                 | 7 files / 109 tests PASS                                   |
| B-T3I/E/F/H and SQLite selection                                     | 6 files / 207 tests PASS; B-T3I89 included                 |
| Clean SQLite1→46 / populated45→46                                    | PASS in B collection/database suites                       |
| Auth/DB/sync/API selection                                           | 39 files / 239 tests PASS                                  |
| Broader Trip/auth/DB/sync/API selection                              | 43 files / 395 tests PASS; 2 known native suites blocked   |
| Ten native-blocked suites with temporary notification isolation      | 10 files / 134 tests PASS                                  |
| Full Mobile standard run                                             | 173 passed / 11 failed files; 1521 passed / 1 failed tests |
| C-I3E / C-I3F / C-I3G                                                | 20 / 23 / 87 PASS                                          |
| Parser delayed real start6/16/32 seconds                             | PASS, exact ordered terminal proof, zero obligations       |
| Typecheck / Backend build / full lint / UI guard                     | PASS                                                       |
| Changed supported-file formatting / whitespace                       | PASS                                                       |
| Verifier / count drift / same-count checksum drift / anchor-negative | PASS                                                       |
| Full format                                                          | only the same 17 untouched baseline failures               |

6/16/32-second probes resolved by 6266/16813/32331ms. The longer probes return
protected PARSER_TERMINALITY_UNKNOWN before autonomous exact kill/inspect/remove;
UNKNOWN cannot release staging. C-I3G also retains unrelated-container survival.

All 10 native Flow import failures and the single existing Ledger architecture
assertion were independently reproduced on a pristine `55a35bc` archive using the
same dependencies. Their source files are unchanged. The isolation mock exists only
under `/private/tmp`, not product/test configuration. Full-format warnings match
that pristine baseline's exact 17-file set, with byte-identical offending files.
These known baseline failures remain; standard full Mobile/full format are not
reported as green.

Temporary copies of accepted harnesses change only stale HEAD guards, local
container/origin/workdir bindings and relocated module imports. A first relocated
B harness import failed before a DB test ran; its temporary import path was corrected
and all tests passed. No protected repository source was altered to accommodate tests.

## Byte integrity, cleanup and readiness

Byte comparisons passed for all non-derived artifacts changed by accepted A/B/C:
11 A, 12 B and 9 C files, including accepted reports/ADRs outside the global docs.
Every other tracked common-baseline file outside accepted change sets and the six
integration-owned files is exact. All 72 historical server migrations, SQLite1–45
source and the entire accepted parser tree are exact.

C00300 SHA-256:
`7598fa8c751034623fc4eb531b87d910bb7aeca549a380a983ca5cc8b7546528`.
Tripsy, CXE and Polarsteps DOCX bytes and original commits are unchanged.

Evidence is under `/private/tmp/checkpoint10-final/`, including the two replay and
validation progress logs, raw manifests, tests, baseline reproductions and
`bytes.json`. The task-only `otr-trip-ai2c5` stack is stopped; existing canonical
local services were left untouched. Parser obligations/containers are zero.
All three Git worktrees are clean after the integration commit. No remote environment,
credential provisioning, new feature or runtime activation occurred.

```yaml
authoritative B feature input: 5d231ba
superseded B integration history preserved on safety branch: YES
temporal reset performed only after clean-worktree verification: YES
A reset/rewrite performed: NO
C reset/rewrite performed during baseline correction: NO
C subsequently rebased under original integration authorization: YES
Checkpoint #10 integration complete: YES
A implementation semantics changed by integration: NO
B implementation semantics changed by integration: NO
C implementation semantics changed by integration: NO
A reviewed root/principal-scope semantics preserved: YES
C00300 changed: NO
B SQLite46 semantics preserved: YES
historical server migrations changed: NO
SQLite1-45 changed: NO
server migrations unique 74/74: YES
SQLite migrations contiguous 1-46: YES
A checker after integrated C: PASS
SET_PARTICIPATION runtime enabled: NO
Event commands enabled: NO
Source commands enabled: NO
provider terminality still BLOCKED: YES
safe IO_UNKNOWN retry enabled: NO
automatic startup reconciler added: NO
Tripsy/CXE/Polarsteps changed: NO
Production/Hosted Dev accessed: NO
push performed: NO
```

**STOP — INTEGRATION REVIEW PENDING.**
