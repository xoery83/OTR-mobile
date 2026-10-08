# Authenticated Transport Canonical Integration Preflight

Date: 2026-10-09 (Pacific/Auckland).

**READY for Owner review of dormant-code canonical integration.**
No integration commit or canonical ref change is authorized by this preflight.

## Verified source and accepted ancestry

Local main, origin/main and remote main independently match exactly
`094cf3beb6b05f2a7f1c8cca1fa007ed630651c4` (read-only `git ls-remote`). No fetch,
push, ref update or Hosted access is needed to verify this source. The initial
sandbox DNS failure was resolved by an authorized read-only network retry.

Transport closure: `afcb69c446a9538b71791a65180c00315fe0eef3`, with sole parent
`7273ac0599b7495bc108c2cf94cc4d8a1cdffdc0`, exactly19 committed paths and the
accepted commit title. Committed bytes match closure evidence. Its original
Independent Security Review and appended F1 Targeted Recheck PASS are retained
byte-for-byte. The original review remains an exact prefix; original Builder
report and F1 correction history are preserved. The recheck's14 additional
independent cases and historical unchanged-probe limitations remain visible;
this preflight does not manufacture an all-green historical-probe claim.

Verified ancestors of current main:

- SQLite51/C2: `914e854cba7c2c97cfec7243047a06cadcc82c05`.
- SQLite52 observation store: `138b55c40f39ed4776b9e2692309cf4a4dcb35a2`.
- SQLite53 Publication: `792141a864b2c2687092789a1f67c36afe43336e`, integrated by
  `7273ac0599b7495bc108c2cf94cc4d8a1cdffdc0`.
- P2b-A Adapter: current main `094cf3beb6b05f2a7f1c8cca1fa007ed630651c4`.
  Original Independent Review, R1 correction and appended R1 Targeted Recheck
  PASS remain exact. Adapter is already present at the adopted base.

## Merge strategy and actual conflict

Fresh isolated candidate:
`/Users/xoery/.codex/worktrees/authenticated-transport-integration/otr-mobile-canonical`.
Detached HEAD remains verified main. Executed
`git merge --no-ff --no-commit afcb69c446a9538b71791a65180c00315fe0eef3`.
The merge remains open with that exact closure as MERGE_HEAD. A separately
authorized future merge commit must retain both verified main and Transport closure
as parents; no cherry-pick, squash, rebase or history rewrite is proposed.

Exactly one actual conflict: `docs/CURRENT_IMPLEMENTATION_STATE.md`. Both branches
inserted their checkpoint handoffs above the same historical SQLite53 section.
Resolved only that document: preserve complete Transport and Adapter inserted
sections verbatim, retain common historical body once, and prepend a short current
integration status. No source conflict or compatibility edit was necessary.
Historical pending/closed statements are retained checkpoint history; the new
integration section supplies current status without rewriting accepted evidence.

All18 non-handoff Transport paths match the accepted closure exactly. All four
non-handoff Adapter paths match main exactly. Transport's optional AbortSignal
extension remains compatible with unchanged Adapter transaction-local consumers.
No production Adapter or Transport factory/caller/composition was added.

## Exact proposed integration scope

Relative to verified main: the accepted19 Transport paths, including the combined
handoff, plus this one new integration report: **20 paths total**. No extra source,
test fixture, dependency, lockfile, migration or configuration change.

- `backend/src/app.ts`
- `backend/src/supabaseGateway.ts`
- `backend/src/tripPublicationCatalogRead.test.ts`
- `backend/src/tripPublicationCatalogRead.ts`
- `docs/API_CONTRACT.md`
- `docs/CURRENT_IMPLEMENTATION_STATE.md`
- `docs/adr/2026-10-09-authenticated-publication-catalog-transport.md`
- `docs/architecture/OTR_PLATFORM_AUTHENTICATED_PUBLICATION_TRANSPORT_BUILDER_REPORT.md`
- `docs/architecture/OTR_PLATFORM_AUTHENTICATED_PUBLICATION_TRANSPORT_INDEPENDENT_SECURITY_REVIEW.md`
- `docs/architecture/OTR_PLATFORM_AUTHENTICATED_PUBLICATION_TRANSPORT_PREFLIGHT.md`
- `src/data/api/authenticatedClient.ts`
- `src/data/api/client.test.ts`
- `src/data/api/client.ts`
- `src/data/api/clientBounded.test.ts`
- `src/data/api/requestBoundary.ts`
- `src/data/api/tripPublicationCatalogTransport.test.ts`
- `src/data/api/tripPublicationCatalogTransport.ts`
- `src/data/repositories/tripPublicationMembershipRepository.test.ts`
- `src/data/repositories/tripPublicationMembershipRepository.ts`
- `docs/architecture/OTR_PLATFORM_AUTHENTICATED_TRANSPORT_CANONICAL_INTEGRATION_PREFLIGHT.md`

The closure already contains all implementation/security tests; this integration
adds no code or tests. All Builder reports, ADRs, original reviews and targeted
rechecks retain exact accepted bytes. The fresh candidate's temporary dependency
symlink and ignored local Backend build artifact were removed after validation.
Independent temporary probes remain outside the candidate and are not staged.
Other Builder/Review worktrees are not edited, reset, archived or rebased.

## Auth, evidence and authority preservation

Backend raw text still passes `parseEventJson(body,4194304)` before strict
version1 schema/scope validation or canonical serialization. Mobile counts bounded
stream bytes, fatally decodes UTF-8, and invokes the same existing strict parser
on original received text before schema/canonicalization. Duplicates at any object
depth and ambiguous/non-integer/rounded numeric tokens reject; no first/last-member
choice can produce a trusted handle. Ordinary API parsing remains unchanged.

Actor derives exclusively from verified bearer Auth. Existing Trip read admission
and protected SQL authorization remain required. Same leased actual session_user
must equal the approved protected principal. Fixed parameterized read-only SQL,
missing/wrong-connection failure, lease-retirement qualification and absence of
service-role/public-RPC/SET ROLE fallbacks remain unchanged.

Complete13-family roster,64 rows/family,4,194,304 actual received UTF-8 byte bound,
no partial success/filtering/pagination, empty-complete vs unavailable, private
headers and payload redaction remain in place. Account/Trip/generation captured
before token work, one401 refresh/replay, coalescing, cancellation/deadlines,
A→B→A/stale denial and exact-context CLOSED admission remain unchanged. Digest
alone supplies no trust; protected authenticated authority and owning validation
are still mandatory. No network occurs inside final SQLite installation.

SQLite1–53 registry/modules, protected SQL roots, Auth state/apply gates and
existing owning repositories match canonical main exactly, except the accepted
Transport cancellation extension to `tripPublicationMembershipRepository.ts`.
Candidate/Input/ancestry/provenance checks and historical NULL behavior are not
redesigned. Backend server.ts is exact main, with no SQL driver/principal supplied.
No native adapter, credentials, roles/grants, Hosted mutation, scheduler, GET outbox,
Integrated C4/C5/C9/provider activation or new domain-write authority was introduced.

## Combined validation

| Check                   | Result                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Combined final matrix   | **35 suites /1,100 tests PASS**, zero failures/skips;52.45s.                                                                                                                   |
| Typecheck               | PASS.                                                                                                                                                                          |
| Full lint / UI guard    | PASS, no warnings/errors;80 representative UI files /473 retained legacy occurrences.                                                                                          |
| Backend build           | PASS; local ignored2.1MiB bundle only, no server launch.                                                                                                                       |
| Changed-file formatting | All20 proposed paths PASS.                                                                                                                                                     |
| Whitespace              | Working-tree and staged `git diff --check` PASS.                                                                                                                               |
| Preservation            | All1,275 main tracked files compared; all differences restricted to accepted Transport scope. Closure/Adapter source, reports/reviews, both handoffs and shared history exact. |
| Merge/ref state         | HEAD/main/origin/remote remain094cf3b; MERGE_HEAD remainsafcb69c; no unresolved conflict, commit or canonical advancement.                                                     |

Initial combined execution:34 suites passed, one failed;1,099 tests passed and the
unchanged1,203-aggregate collection stress test exceeded its existing5s limit.
The identical35-file command was rerun alone, without code/assertion/timeout changes,
and passed all1,100 tests. Both logs remain; no failed run is suppressed. The
Transport independent recheck records the same timing-sensitive stress-test limit.

Reproduction options: `vitest run` with the35 paths below and
`--configLoader runner --cache=false --maxWorkers=1 --no-file-parallelism`.
The initial and final runs use exactly the same command/options.

Evidence:

- Source/closure/ancestry manifest: `/private/tmp/otr-transport-integration-before.json`.
- Combined test path list: `/private/tmp/otr-transport-integration-test-paths.json`.
- Initial/final regressions: `/private/tmp/otr-transport-integration-regression.log`
  and `/private/tmp/otr-transport-integration-regression-final.log`.
- Typecheck/lint/build/format: `/private/tmp/otr-transport-integration-{typecheck,lint,build,format}.log`.
- Final preservation/merge state: `/private/tmp/otr-transport-integration-preservation-final.json`.

Combined matrix includes the original17-file Transport matrix plus Adapter,
C2/C4a, SQLite52 observation, SQLite53 migration/Membership, CP11 Capture originals,
Import/Flight/Continuation, Account local state/bootstrap, database/serialization
and sync dispatch. Actual test selection:

- `backend/src/app.test.ts`
- `backend/src/supabaseGateway.test.ts`
- `backend/src/tripCanonicalRead.test.ts`
- `backend/src/tripEventCollection.test.ts`
- `backend/src/tripPublicationCatalogRead.test.ts`
- `src/data/api/client.test.ts`
- `src/data/api/clientBounded.test.ts`
- `src/data/api/authenticatedClient.test.ts`
- `src/data/api/tripPublicationCatalogTransport.test.ts`
- `src/data/auth/sessionAccessToken.test.ts`
- `src/data/auth/devSupabaseAuth.test.ts`
- `src/data/auth/accountRequestContext.test.ts`
- `src/data/auth/accountSwitchCoordinator.test.ts`
- `src/data/auth/accountSwitchFoundation.test.ts`
- `src/data/auth/accountLocalState.test.ts`
- `src/data/repositories/accountJourneyBootstrap.test.ts`
- `src/data/repositories/tripPublicationMembershipRepository.test.ts`
- `src/data/repositories/tripImportAdmissionRepository.test.ts`
- `src/data/db/publicationMembershipMigration.test.ts`
- `src/data/db/databaseConnection.test.ts`
- `src/data/db/database.test.ts`
- `src/data/repositories/captureBatchAssessmentAdapter.test.ts`
- `src/data/repositories/captureBatchAssessmentObservationRepository.test.ts`
- `src/data/repositories/captureSubmissionRepository.test.ts`
- `src/data/repositories/localCaptureInboxRepository.test.ts`
- `src/data/repositories/captureAutonomousQa.test.ts`
- `src/data/repositories/flightImportClosure.test.ts`
- `src/data/repositories/intelligenceContinuationRepository.test.ts`
- `src/data/files/capturePayloadReader.test.ts`
- `src/domain/capture/batchAssessment.test.ts`
- `src/domain/capture/batchAssessmentObservation.test.ts`
- `src/domain/capture/localCapture.test.ts`
- `src/domain/trip/flightAdmission.test.ts`
- `src/domain/trip/flightImportReview.test.ts`
- `src/data/sync/syncEngine.test.ts`

No full-suite or global-formatting claim. Existing negative/security tests cover
forged/missing Auth, scope/principal failure, complete roster and provenance,
strict ambiguous wire rejection, zero SQLite writes, bounded stream/UTF-8 reception,
401/cancel/deadline/late results, A→B→A and Adapter current-authority/final-observation
races. Synthetic passing tests do not certify deployed principal or native hardware.

## Remaining gates and Owner decision

**SQL Principal/Driver: CLOSED.** Separately authorized dedicated login/session/
ACL/TLS/primary and real revocation/timeout/lease retirement acceptance remain
required. No driver, credential, role or grant was provisioned.

**Native Streaming: CLOSED.** No installed/certified bounded native receive adapter,
decompression/redirect/buffering/cancellation or device acceptance. Unsupported
native receive continues to fail transport unavailable.

**Composer/Integrated C4: CLOSED.** Separately approved complete owning read-set,
SQLite52 current-owning NEW admission and revision/CAS composition, Continuation,
original-signal supersession ownership and runtime caller wiring remain separate.
This merge neither activates composition nor grants C5/C9/provider/business-write
capability. Hosted contract verification and native live installation are separate
Owner-authorized stages.

Owner review concerns only this proposed dormant-code canonical integration.
No commit, push, merge into main, rebase or canonical ref advancement occurred;
no Hosted DEV/Production, device, credential or provider operation occurred.

**STOP — AUTHENTICATED TRANSPORT CANONICAL INTEGRATION PREFLIGHT / OWNER REVIEW REQUIRED.**
