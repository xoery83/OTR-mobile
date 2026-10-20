# SQLite53 Canonical Integration Preflight

Date: 2026-10-09 (Pacific/Auckland).

## Verdict and boundary

**READY for Owner review of this uncommitted integration candidate.**
No commit, push, canonical-main merge, branch/ref advancement, Hosted DEV/Production
access or device operation. No provider, Transport or Integrated C4 activation.
Read-only remote Git verification does not access an OTR environment.

## Exact source and proposed ancestry

- Verified local `main`, local `origin/main`, and remote `refs/heads/main`:
  `2128ec7c7dea9a12366a21f98b8722d4c1d75c38` at initial and final verification.
- Accepted SQLite53 closure: `792141a864b2c2687092789a1f67c36afe43336e`;
  exactly one parent `3216668e42e919a2b4657e1357e8c7536fead114`, exactly 15 files.
- Common ancestor is that exact closure parent; current main includes the accepted
  Core bootstrap merge as well as Platform SQLite52 and Membership ancestry.
- Fresh isolated detached worktree:
  `/private/tmp/otr-sqlite53-canonical-preflight-20261009`.
- Prepared by `git merge --no-ff --no-commit` of the exact closure. `HEAD` remains
  verified main; `MERGE_HEAD` remains the accepted closure. A future separately
  authorized ordinary merge commit would have those exact first/second parents.
  No proposed merge commit has been created.
- The dirty chat checkout, canonical checkout and accepted Builder/review worktrees
  are preserved. The report-only copy in the chat checkout is for access.

## Conflicts and compatibility

One textual conflict: `docs/CURRENT_IMPLEMENTATION_STATE.md`, where both sides
prepended checkpoint sections. Resolution retains every complete section from both
handoffs verbatim and adds a new preflight status above them. Historical wording
such as unallocated53 or earlier pending review remains historical, not current
integration status. No source conflict occurred.

Initial Core bootstrap recheck:20 PASS /1 FAIL, solely because its fixed registry
assertion expected1–52 and received1–53. Minimum compatibility correction is exactly
two lines in `src/data/bootstrap/participationWakeAcceptance.test.ts`: describe
SQLite53 and expect53 contiguous IDs. Account/discovery/hydration, queued Expense/
Capture bytes, integrity and FK assertions remain intact. No runtime change.

## Exact proposed scope

Relative to verified main: **17 paths**, comprising the accepted15 closure paths,
one Core test expectation adjustment and this report. Fourteen closure paths are
byte-identical; only the shared handoff is reconciled. Production changes are only
one new migration module and one registry import/trailing entry. No Backend/API,
repository runtime, UI, transport, dependency, provider or configuration change.

```text
docs/CURRENT_IMPLEMENTATION_STATE.md
docs/architecture/OTR_PLATFORM_PUBLICATION_MEMBERSHIP_MIGRATION_DESIGN.md
docs/architecture/OTR_PLATFORM_SQLITE53_CANONICAL_INTEGRATION_PREFLIGHT.md
docs/architecture/OTR_PLATFORM_SQLITE53_PUBLICATION_MEMBERSHIP_BUILDER_REPORT.md
docs/architecture/OTR_PLATFORM_SQLITE53_PUBLICATION_MEMBERSHIP_INDEPENDENT_REVIEW.md
src/data/bootstrap/participationWakeAcceptance.test.ts
src/data/db/checkpoint11Integration.test.ts
src/data/db/database.test.ts
src/data/db/migrations.ts
src/data/db/migrations/tripSourcePublicationMembership.ts
src/data/db/publicationMembershipMigration.test.ts
src/data/foundation/diagnosticsReadOnly.test.ts
src/data/repositories/captureAutonomousQa.test.ts
src/data/repositories/captureBatchAssessmentObservationRepository.test.ts
src/data/repositories/intelligenceContinuationRepository.test.ts
src/data/repositories/tripCanonicalEventRepository.test.ts
src/data/repositories/tripPublicationMembershipRepository.test.ts
```

Exact proposed patch, path manifest, diff statistics and SHA-256 are retained in
`/private/tmp/otr-sqlite53-canonical-evidence/`. The report itself is included in
that patch; dependency symlinks, build output and reviewer-only probes are excluded.

## Allocation, historical preservation and accepted evidence

- 171 local refs /47 registered worktrees checked. Explicit53/54 definition scan
  and registry inspection find only accepted53 and this byte-identical candidate;
  no competing local allocation or54 definition. Remote-main registry is52.
  Other remote branch freshness is not claimed; local refs are recorded versions.
- Registry delta is exactly one import and one trailing entry. IDs1–53 are unique
  and contiguous. All52 original `{id,name,sql}` objects are identical to accepted
  evidence; JSON SHA-256:
  `27fdf7c2eea6d32a69ca23e27f8877f4b721d15deb721ad575ac9e5466042278`.
- 90 prior external SQLite/server migration source files and1,254 tracked main paths
  outside allowed scope are byte-identical. This preserves Core Fresh Account
  Bootstrap, Ledger, SQLite52 observations, Publication Membership runtime,
  C2/C4a, Import, Continuation, startup, transport and provider configuration.
- Full corrected53 migration module is byte-identical to accepted closure:
  module SHA-256 `ccc5ce353b109e3ce1d2545181cc550ee95f36842dc979451454ee2beef586dc`.
  SQL template excluding boundary newlines:
  `271862444e9ed805befd3a065997cee9d1a1b2b6430dbc8a1e8d334e3c6a0506`.
  One nullable Run TEXT column, four guards; no table/index/backfill/down migration.
  F1 preemptive replacement checks across all three Run uniqueness constraints
  remain exact, including UPDATE self exclusion. FK/recursive OFF protection is
  retained. Historical NULL remains unavailable, never certified empty membership.
- Original SQLite53 Independent Review and appended F1 targeted recheck are exact
  accepted closure bytes. Its original finding remains visible; appended PASS
  closes F1 with zero remaining required findings. Historical independent evidence:
  affected24 files /1002 PASS, original38 PASS, additional48 PASS.
  Original Core, SQLite52 and Membership reviews/rechecks on main are unchanged.
  Migration Design and Builder F1 correction history remain exact accepted bytes.

## Combined validation

| Check                                                                                        | Result                                                                                  |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Combined Core/Account/Ledger/C2/C4a/SQLite52/SQLite53/Publication/Import/Continuation matrix | **163 files /2258 tests PASS**, zero failures/skips;302.07 seconds                      |
| Original + additional independent F1 probes on integrated-source copy                        | **2 files /86 tests PASS**, comprising38 original and48 additional probes;26.79 seconds |
| Typecheck                                                                                    | PASS                                                                                    |
| Full lint including UI guard                                                                 | PASS;80 representative UI files,473 retained legacy occurrences                         |
| Backend build                                                                                | PASS; local compilation only                                                            |
| Changed17-file Prettier                                                                      | PASS                                                                                    |
| Staged/unstaged whitespace and resolved-conflict check                                       | PASS                                                                                    |
| Exact scope, registry/history, accepted bytes and both handoffs                              | PASS                                                                                    |
| Branch/remote-tracking ref comparison                                                        | PASS; identical before/after inventory                                                  |

Combined command, run in the isolated candidate with existing dependencies:

```sh
./node_modules/.bin/vitest run src/data src/domain/ledger src/domain/capture \
  src/domain/trip src/features/ledger src/hooks backend/src/inboundAiClient.test.ts \
  --configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism
npm run typecheck
npm run lint
npm run backend:build
```

Independent probes are reviewer-only files copied unchanged from the accepted F1
recheck into a disposable integrated-source snapshot under the evidence root.
They include actual accepted52-source Import/Membership/runner cold-file compatibility,
14 file-backed migration rollback/retry cases, lost-COMMIT ACK recovery and exact
replacement rejection under FK/recursive ON/OFF. They are not added to delivery
and their overlapping86 results are not added to the2258 combined count.
The combined matrix includes real migration fresh/upgrade tests, complete durable
membership and F1 negatives, Account/selected-bootstrap/Ledger, C2/C4a/SQLite52,
Import/Flight/Continuation and scheduler dormancy regressions.

Evidence root: `/private/tmp/otr-sqlite53-canonical-evidence/`. Retained logs:
`initial-core.log`, `regressions.log`, `independent-probes.log`, `typecheck.log`,
`lint.log`, `backend-build.log`, `format.log`, `whitespace.log` and `preservation.log`.
`preservation.json`, `allocation.json`, `allocation-id-scan.json`,
`migration-equality.log`, `refs-before.txt` and `refs-after.txt` record scope,
allocation, bytes and ref checks. `verify-preservation.py` and
`migration-equality.ts` retain executable assertions. Dependencies were reused
without installation; manifests/lockfile remain unchanged. Temporary candidate
symlink and generated Backend build output were removed after checks.

## Runtime authority and remaining gates

Exact out-of-scope preservation plus the production-only migration/registry delta
establish no new runtime Transport, Integrated C4, C5/C9, provider, startup or
business-command activation. Tests use disposable local SQLite and test-only CLOSED
read injection. Backend compilation starts no server. Existing accepted Core
bootstrap behavior is preserved;53 schema availability alone grants no Transport
or semantic execution authority.

Owner review is required before any integration commit or canonical ref advancement;
publication/push also requires authorization. Remaining gates:

1. A new Owner-authorized isolated native DEV Test artifact from approved integrated
   source; actual Expo SQLite52→53 upgrade, preserved originals/queues, restart/
   offline/Account A→B→A and fresh Journey discovery/selected hydration acceptance.
   Old/new native binary compatibility, OS concurrency/interruption and hardware
   disk/power-loss remain unverified. No reserved Simulator/device was operated.
2. Authenticated private Transport: real current principal/session and bounded
   complete projection; CLOSED injected reads do not certify a live gateway.
3. Integrated C4: separately reviewed current C2/Capture/Trip/Source/publication
   read-set composition, P2b-A corrections, P2b-B NEW admission, Continuation
   callbacks and Account-gated transaction wiring.
4. C5/C9, providers, runtime/business-write authority remain CLOSED.

Not checked: full repository suite/global formatting, native devices/binaries,
Hosted environments, live authenticated Transport or hardware failures. Node
file-backed evidence does not certify those gates.

**STOP — SQLITE53 CANONICAL INTEGRATION PREFLIGHT / OWNER REVIEW REQUIRED.**
