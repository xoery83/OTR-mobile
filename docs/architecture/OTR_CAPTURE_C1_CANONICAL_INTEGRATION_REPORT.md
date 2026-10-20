# Capture C1 canonical integration — prepared validation report

Date: 2026-10-08 (Pacific/Auckland).
Status: **PREPARED / READY FOR INDEPENDENT REVIEW.** No integration commit exists.

Owner authorized minimal completion of this existing pending merge on 2026-10-08.
The earlier final report formatting failure was repaired. Exact parents, source
preservation and scope were reverified; the semantic handoff, current Owner
decision ADR and this report are staged. Final formatting, whitespace,
staged-diff/scope and migration/hash checks PASS. Runtime and test source bytes
remain identical to the previously validated integration; the recorded 670 + 63
PASS evidence is reused without a full rerun. Only verified task-created dependency
symlinks and generated build artifacts were removed. No new worktree or Docker
operation was performed during this completion.

## Exact integration and scope

- Builder: `/private/tmp/otr-c1-canonical-integration`, branch
  `codex/c1-canonical-integration`.
- Retained HEAD / first parent: Platform
  `a817e8e881e2fa2e094696b13bc4df2eca7e2db2`.
- Pending MERGE_HEAD / second parent: Capture
  `79237cbd993792100ed51468e31671e4a2b59888`.
- Common ancestor: `b973f039dfd6405d302409252ddbdc8f70584159`;
  divergence 2 Platform / 7 Capture commits. All seven original Capture commits
  and both Platform commits are retained by the pending ordinary merge; no
  cherry-pick, squash, rebase or history rewrite. Two-parent ancestry is prepared,
  not asserted as a completed merge commit.
- Executed `git merge --no-ff --no-commit` against the exact Capture parent.
  Automatic merge returned success, with no textual conflicts or unmerged paths.
  The handoff still required semantic reconciliation.
- Expected staged scope: 19 Capture-only paths, reconciled
  `docs/CURRENT_IMPLEMENTATION_STATE.md`, current Owner decision ADR and this
  Builder validation report. No implementation code beyond the accepted Capture
  tree. All 19 Capture-only files, including tests/direction/Builder/Review reports,
  are byte-identical to Capture HEAD. All 55 Platform-only paths are byte-identical
  to Platform HEAD. External preflight/handshake/amendment are not adopted.

## Semantic reconciliation and Owner decision

The handoff preserves C1 device/review acceptance, the completed C1 local commit,
CP14 closure/F2 and final CP15B/LIVE-W R1-C1 independent PASS with zero remaining
CRITICAL/IMPORTANT/LOW. It qualifies C1's historical Server83 baseline, retains
current Server84/SQLite50 and labels older pending-review statements historical.
It separates inherited acceptance counts from this integration's actual checks.

The current Owner authorization explicitly records joint P1 ↔ C2 Revision 1
acceptance and final `continuesFromInputId` / `continues_from_input_id` naming.
`../adr/2026-10-08-c1-integration-owner-decision.md` records this current decision,
actual external evidence paths and verified SHA-256 hashes. No separate historical
Capture final acceptance artifact was supplied, invented or claimed. Historical
PROPOSED wording remains in external evidence; current Owner authority supersedes it.
C2 remains unimplemented and separately gated; Add stays disabled.

## Bounded validation actually executed

Synthetic fixtures only; existing lockfile and installed runtime reused without
install/update. macOS tests use the accepted TCP/fetch-denial preloader. No Backend
startup against a real environment, provider getter, secret file or Hosted command.

| Check                                                      | Result and evidence                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight command A, C1/auth/originals/UI                  | **16 files / 175 PASS**; `/private/tmp/otr-c1-matrix-a.log`                                                                                                                                                                                                                                                             |
| Preflight command B, continuation/Import/sync/CP15B/LIVE-W | **14 files / 495 PASS / 15 intentional skips** on macOS; `/private/tmp/otr-c1-matrix-b.log`                                                                                                                                                                                                                             |
| Independently provisioned validation worktree              | `/private/tmp/otr-c1-canonical-validation`, detached at exact Platform; accepted merged paths copied byte-for-byte. Combined A+B rerun **30 files / 670 PASS / 15 intentional skips**; `/private/tmp/otr-c1-independent-matrix.log`                                                                                     |
| Linux custody/live host/HTTPS                              | **63 PASS / 2 intentional skips / 0 failures**, 65 cases; `/private/tmp/otr-c1-linux.log`                                                                                                                                                                                                                               |
| Typecheck                                                  | PASS in Builder and validation worktrees; `/private/tmp/otr-c1-typecheck.log`, `/private/tmp/otr-c1-validation-typecheck.log`                                                                                                                                                                                           |
| Lint and UI guard                                          | PASS; 473 existing legacy occurrences, 78 representative files checked without baseline forgiveness; `/private/tmp/otr-c1-lint.log`, `/private/tmp/otr-c1-ui-guard.log`, `/private/tmp/otr-c1-validation-lint.log`                                                                                                      |
| Backend build and bundle isolation                         | PASS; `/private/tmp/otr-c1-backend-build.log`, `/private/tmp/otr-c1-validation-backend-build.log`; server metafile has 197 inputs and zero fixture/test/Capture-native/UI inputs. Four accepted live-host runtime exports only; actual fixture-only `createFlightProtocolTestHost` / `createProtocolTestCustody` absent |
| Migration/sync preservation                                | PASS; Server1–84, exact tail SHA `46e80899f14817d5162f255383e303232a12276e662f34b2cb16156c34d4f2a9`, SQLite50 and all 88 manifest hashes match. Migration files/registry and syncEngine remain Platform bytes                                                                                                           |
| Formatting/whitespace/scope                                | Final scoped formatting, staged/unstaged whitespace and exact 22-path staged scope PASS after Owner-authorized minimal completion; original accepted source/report bytes unchanged                                                                                                                                      |
| Source preservation                                        | Both HEADs, branches/status, empty sequencers and index SHA-256 match preflight. Every tracked source file matches its accepted HEAD. Neither source checkout/index was modified                                                                                                                                        |

Linux used the exact accepted cached base image
`sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553`,
Node24, UID10001:GID999, network none, read-only root, cap-drop ALL and
no-new-privileges. A task-owned custody volume was provisioned before unprivileged
execution. Production test sources were bundled with existing esbuild and the
retained `/private/tmp/live-w-linux-vitest-adapter.ts` (Node suite registration,
installed Vitest assertion/spy libraries; no changed assertions or new dependency).
`F1_CUSTODY_MODULE` enabled fresh-child-process continuity checks. TCP/fetch were
also denied. Retained-root replacement, wrong/copied/empty continuity, missing
request, private immutable ACK and strict grammar ran with the accepted tests.
Task-owned containers exited; test volume/image were removed after validation.
Docker image removal also pruned the untagged accepted base image, an unintended
local cache change. No source or accepted Git object was affected; a future exact
Linux rerun needs that base image restored. The completed results/bundles remain
available; this report does not claim the exact image remains cached.
Bundles/logs remain outside Git for review. Only verified task-created dependency links and exact generated server bundles were removed from Builder and validation worktrees. Retained bundles/logs remain outside Git.

Counts overlap; Linux reruns accepted sources and is not additive coverage.
No blanket full-suite PASS is claimed. Existing historical full-suite Ledger
architecture failure/format warnings retain their unchanged report attribution;
the earlier report formatting failure is resolved; final required checks PASS. Optional actual Server84 SQL environment E2E
was not run. New Release build/install/device smoke needs separate authorization;
C1's owner iPhone PASS is inherited, not rerun or broadened.

## Stop state and review handoff

The merge/index is prepared and uncommitted in the isolated Builder, including the reconciled handoff, current Owner decision ADR and this report. Independent
review has not been performed by this Builder. Review the exact pending parents,
staged scope/bytes, handoff semantics, Owner decision provenance, shared Account
subscription/generation gates and Backend bundle evidence before any later commit.

No C2, SQLite51/Server85, provider activation, Hosted Dev/Production access,
network fetch, deployment, main update, commit or push. All runtime CLOSED gates,
Account A→B→A behavior, C1 staging-only semantics, locales and strict UI root are
preserved. No unresolved integration blocker. Next: independent review only; merge commit, main advancement and publishing remain separately gated. The recorded Docker cache limitation remains relevant only to a future exact Linux rerun.
