# Trip Canonical A1-I1 — Canonical Trip Person Foundation

Status: **A1-I1 CODE COMPLETE — REVIEW PENDING**. Human review and the independent
reviewer gate are outstanding; this is not FULL PASS or authorization for another
slice. Date: 2026-10-03 (Pacific/Auckland).

## A. Baseline

- Branch: `integration/ledger-polish-canonical`.
- Baseline HEAD: `4287abc1ab20d93a98daa63c353941f9d8b52317` (committed A1-D).
- Workspace was clean before work. Delivery is uncommitted; HEAD remains baseline.
- A0, A1-D, repository instructions/current state, mandatory architecture sources
  and terminology are the design baseline. Only the explicitly approved A1-I1
  identity/read subset is implemented; A1-D remains a historical design record.
- Production/Hosted Dev were not accessed or changed; no deployment/device build.

## B. Test-gate repair

The existing `accountSwitchFoundation.test.ts` failed before execution with
`Flow is not supported` from `react-native/index.js`. The import chain was
`syncOperationRepository` → `ledgerQueueActivity` → native Auth/database entries.
The test already injects its own Account callback and real in-memory SQLite.

Following `ledgerQueueActivity.test.ts`, the gate now isolates only unused native
Auth/database entry points with throwing mocks. Any accidental use fails. Real
Expense repository, queue repository, queue notifications, sync engine and SQL
remain under test. Production files/configuration and original assertions are
unchanged; no skipped or deleted tests.

Once the test executed, its old two-table hand-written fixture lacked
`ledger_expense_commands`, which current dependency wake-up SQL references.
The fixture now reuses the existing migration list in private in-memory SQLite,
including receipt tables, instead of a partial schema. No migration was added,
edited or applied to an application/remote database. This was fixture drift, not
an account-isolation behavior defect.

**TEST GATE PASS** was obtained before adding Trip Person implementation:
7 files / 36 tests (command in H). No real isolation failure was found.

## C. Files changed

| File                                                 | Change                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/domain/trip/person.ts`                          | Minimal canonical Person and semantic ID aliases                                 |
| `src/data/repositories/tripPersonRepository.ts`      | Account-scoped, local-only read boundary                                         |
| `src/data/repositories/tripPersonRepository.test.ts` | Ten deterministic real-SQLite/identity/isolation checks                          |
| `src/data/auth/accountSwitchFoundation.test.ts`      | Native import isolation and current schema fixture, original assertions retained |
| `docs/ARCHITECTURE.md`                               | Short canonical foundation/discovery section                                     |
| `docs/CURRENT_IMPLEMENTATION_STATE.md`               | Latest narrow checkpoint and review boundary                                     |
| `docs/architecture/TRIP_CANONICAL_A1_I1_REPORT.md`   | This evidence/report                                                             |

## D. Canonical contract

`TripPerson = { tripId: TripId; personId: TripPersonId; displayName: string }`.
`TripId`, `TripPersonId`, `AccountUserId` are semantic string aliases, consistent
with existing TypeScript UUID contracts, not branded types or runtime identities.

- `tripId` is the existing `trips.id` / Ledger `journeyId`.
- `personId` is the existing `journey_members.id`, retained by `ledger_members.id`.
- Display name is an attribute, not a key. Equal names remain separate Persons.
- Account linkage is optional in the domain. The current offline DTO/projection
  does not supply `user_id`; it is deliberately omitted from this surface. Absence
  does not claim a Person is unlinked, and the Actor's Account is never substituted.
- Core Person has no role, status, permission, household, invite or fake link data.
- Expense Participant remains an Expense-specific Member relationship; future
  Booking/Itinerary participation uses `TripPersonId`, without changing any current
  participant schema/type. The narrow Mobile `ItineraryItem` has no participant
  field today, so adding a helper just to use the new type was unnecessary.

## E. Existing source/projection reused

The existing backend `readLedgerBootstrap` maps `journey_members.id/display_name`
into Member DTOs; `ledgerMemberSchema` validates them. `applyJourney` in
`ledgerReadRepository` hydrates `ledger_members` and the Account-scoped
`ledger_actor_context`. None of those source/hydration contracts changed.

Use `createTripPersonRepository(database, getActiveUserId).listTripPersons(tripId)`.
Inject the existing opened database and local `requireActiveUserId` callback (or
equivalent existing session dependency). This is the feature-facing read boundary;
future screens do not query raw SQLite or depend on Ledger UI models. There is no
new singleton, networking path or separate Person store.

SQL reads `ledger_members` for the exact Trip only when the active Account has a
hydrated `ledger_actor_context` for that Trip. It selects only the three canonical
fields and orders duplicate names by stable ID. It does not deduplicate via the
household joins used by Ledger's existing `listMembers`, or infer permission from
a Person's role/status. Empty or unauthorized cached context returns an empty list.

The Account callback and existing account-generation counter are checked before
returning data. A different Account or a new generation (including a return to the
same Account) rejects an in-flight read; no stale result is returned. No session
refresh, network login or capability computation is introduced.

This reuses current cached admission context, as existing scoped repositories do.
Context presence is not a new live-server authorization proof; no future revoke/
creator-denial policy is implemented. Existing admission can include creator/legacy
paths with a null Member or false financial `canRead`; the adapter deliberately
does not redefine those paths by interpreting a financial capability as Trip access.

## F. Deliberately not implemented

No Invite/Claim/QR/link delivery, account linking, leave/revoke, Viewer, Person-less
collaborator feature, ownership transfer, Organizer/creator/access-role redesign,
active/inactive lifecycle, deletion, table consolidation or global registry.
No Booking, Credential, Import, Pool, Flexible Block, public sharing, provider
merge, general Action Layer, UI, notifications or extra infrastructure.
No server/SQLite migration, Member remapping, endpoint or DTO expansion.

## G. Regression impact and invariant evidence

Ledger can continue using its existing types and `listMembers`. No existing
production implementation was edited: the new read module is additive. Financial
IDs, snapshots, calculations, FX, finality/correction lineage, sync ownership,
Auth launch and current permissions remain unchanged.

| Invariants                                            | Concrete proof                                                                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1–I2 duplicate names / ID identity                   | Golden B returns two Davids ordered by distinct Member UUIDs                                                                                                          |
| I3–I4 no Account linkage required                     | Golden A hydrates an unlinked name-only Tina and reads the exact minimal object                                                                                       |
| I5–I7 original ID / Trip scope / not Auth ID          | Golden C hydrates one Account's two linked actor contexts with distinct Member IDs; reads retain those IDs                                                            |
| I8–I10 Expense relation / no remap / Ledger unchanged | Golden D applies real existing bootstrap, snapshots payer/participants/splits/member rows, compares after read, and compares old Ledger `listMembers` results         |
| I11 Account+Journey scoping                           | Golden E uses the real account-switch coordinator; B cannot see A-only Trip, shared hydrated contexts work, switching back restores only A's scope                    |
| I12 switch isolation                                  | Golden E and two in-flight tests; existing account-switch/queue tests; Personal Payment per-account projection test; Review ACK/decision/checkpoint isolation tests   |
| I13 offline/token behavior                            | Golden F recreates Auth/repository/bootstrap over persisted mocked SecureStore and cached SQLite with expired token and failed background sync; no login prerequisite |
| I14 no new permission                                 | Golden G preserves actor/capability rows and SQLite `total_changes`; Person without Account context is invisible                                                      |
| I15 access does not create Person                     | Golden G hydrates an authorized empty-member Trip; read stays empty and creates no row                                                                                |

## H. Automated validation evidence

All following successful commands exited 0. Tests execute locally with existing
mock/native boundaries and in-memory SQLite; no remote database test was run.

### Before identity implementation: test gate

```sh
npm test -- src/data/auth/accountSwitchFoundation.test.ts src/data/auth/accountSwitchCoordinator.test.ts src/domain/auth/authState.test.ts src/domain/auth/authRefresh.test.ts src/data/bootstrap/bootstrapApplication.test.ts src/data/sync/ledgerQueueActivity.test.ts src/data/sync/syncEngine.test.ts
```

Result: **7 files / 36 tests PASS**, including the formerly unexecuted foundation
suite's original real SQL/account-owner assertions.

### New foundation

```sh
npm test -- src/data/repositories/tripPersonRepository.test.ts
```

Result: **1 file / 10 tests PASS**, golden A–G, two in-flight transition cases and
missing-Account failure. Final combined regression reran these after formatting.

### Final relevant regression

```sh
npm test -- src/data/auth src/domain/auth src/data/bootstrap src/data/repositories/tripPersonRepository.test.ts src/data/repositories/ledgerReadRepository.test.ts src/data/repositories/ledgerReadRepository.convergence.test.ts src/data/repositories/ledgerExpenseRepository.test.ts src/data/repositories/expenseRepository.test.ts src/data/repositories/ledgerSettlementRepository.test.ts src/data/repositories/ledgerPersonalPaymentRepository.test.ts src/data/repositories/ledgerReviewRepository.test.ts src/data/repositories/ledgerReviewPersonal.test.ts src/data/repositories/personalSettlementReviewRepository.test.ts src/domain/ledger/journeyContext.test.ts src/domain/ledger/ledger.test.ts src/domain/ledger/settlementStage7.test.ts src/domain/ledger/settlementAdjustment.test.ts src/domain/ledger/settlementCorrection.test.ts src/domain/ledger/review.test.ts src/domain/ledger/reviewV2.test.ts src/data/sync/syncEngine.test.ts src/data/sync/syncOperationRepository.test.ts src/data/sync/ledgerQueueActivity.test.ts
```

Result: **30 files / 175 tests PASS**. Includes actual Foundation/Coordinator,
Account-local state, Auth/refresh, bootstrap, Member/context hydration, Expense,
Settlement/correction, Personal Payment, Review and queue regressions. Itinerary
repository was not touched; no itinerary behavior change requires extra testing.

### Static / format / safety checks

```sh
npm run typecheck
npx eslint --max-warnings 0 src/data/auth/accountSwitchFoundation.test.ts src/domain/trip/person.ts src/data/repositories/tripPersonRepository.ts src/data/repositories/tripPersonRepository.test.ts
npm run ui:guard
npx prettier --check src/data/auth/accountSwitchFoundation.test.ts src/domain/trip/person.ts src/data/repositories/tripPersonRepository.ts src/data/repositories/tripPersonRepository.test.ts docs/ARCHITECTURE.md docs/CURRENT_IMPLEMENTATION_STATE.md docs/architecture/TRIP_CANONICAL_A1_I1_REPORT.md
git diff --check
git status --short
```

Results: TypeScript PASS; scoped lint PASS with zero warnings; UI guard PASS
(473 existing legacy occurrences, 76 representative files); all seven changed
files formatted; tracked diff has no whitespace errors. New untracked files were
also checked with `git diff --no-index --check /dev/null <path>`: no whitespace
diagnostics (exit 1 indicates the expected addition, not a whitespace failure).
No full-repository formatting cleanup or unrelated test-toolchain rewrite.

## I. Known limitations

- `user_id`, avatar and canonical participation lifecycle are unavailable in the
  current local Member projection; they are not invented or added via migration.
- String aliases express semantics but do not provide compile-time nominal
  enforcement. They match repository conventions and avoid a mass type migration.
- This list boundary uses current cached Account/Journey context, including its
  existing freshness semantics. Live revocation, creator denial and new access
  models remain separately reviewed future work.
- No application screen consumes this new contract yet. Offline restart evidence
  recreates Auth/bootstrap/repository using persistent mocked storage and the same
  cached SQLite connection; it is not a physical-device/process cold-start result.
- Human and independent reviewer acceptance remain PENDING. No next phase follows
  automatically, and no commit/deployment is part of this delivery.

## J. Acceptance matrix

PASS refers to evidence for this narrow code delivery; it is not human approval.

| #   | Criterion                                          | Evidence                                                         | Result |
| --- | -------------------------------------------------- | ---------------------------------------------------------------- | ------ |
| 1   | Account-switch suite executes                      | B/H: real SQL gate ran, one original test                        | PASS   |
| 2   | Account-switch suite passes                        | H: pre-implementation 7/36 and final 30/175                      | PASS   |
| 3   | journey_members.id reused as canonical Person ID   | D/E; golden A/C/D hydration                                      | PASS   |
| 4   | No new Person identity table                       | E/F; no schema changes                                           | PASS   |
| 5   | No Member ID remapping                             | Golden D row snapshots; additive read only                       | PASS   |
| 6   | Account and Trip Person distinct                   | D aliases/contract; no Account field inference                   | PASS   |
| 7   | Unlinked Person valid                              | Golden A                                                         | PASS   |
| 8   | Duplicate names distinct                           | Golden B                                                         | PASS   |
| 9   | Same Account has different Person IDs across Trips | Golden C                                                         | PASS   |
| 10  | Expense Participant stays Expense-specific         | D/G; existing domain/schema untouched                            | PASS   |
| 11  | Ledger financial relationships unchanged           | Golden D and financial regressions; no existing production edits | PASS   |
| 12  | Canonical Person read/domain boundary exists       | person.ts / tripPersonRepository.ts                              | PASS   |
| 13  | Boundary respects Account/Journey scope            | E; golden E and in-flight tests                                  | PASS   |
| 14  | Offline behavior not weakened                      | Golden F; Auth/bootstrap regressions; no new network dependency  | PASS   |
| 15  | Existing permissions unchanged                     | Golden G; no capability/auth/backend modifications               | PASS   |
| 16  | trip_members unchanged                             | No SQL/backend edits                                             | PASS   |
| 17  | Invite/Claim not implemented                       | F and changed-file scope                                         | PASS   |
| 18  | Leave/Revoke not implemented                       | F and changed-file scope                                         | PASS   |
| 19  | Viewer not implemented                             | F; null Member context compatibility is existing behavior        | PASS   |
| 20  | Ownership transfer not implemented                 | F and changed-file scope                                         | PASS   |
| 21  | No global Person/contact registry                  | Trip-scoped key, no new store                                    | PASS   |
| 22  | No server migration added                          | Git scope; supabase/ untouched                                   | PASS   |
| 23  | No SQLite migration added                          | migrations.ts untouched; tests reuse existing migrations only    | PASS   |
| 24  | No Production access                               | Local-only execution, no remote commands                         | PASS   |
| 25  | No Hosted Dev mutation/deploy                      | Local-only execution, no deploy/migration command                | PASS   |
| 26  | Relevant automated regressions pass                | H exact commands/results and G invariant evidence                | PASS   |
| 27  | Architecture/report documentation updated          | C: architecture discovery, current-state checkpoint, this report | PASS   |

Required matrix: **27 PASS / 0 PENDING / 0 BLOCKED** for the narrow automated and
scope criteria. Separate approval gates: **human review PENDING; independent
reviewer gate PENDING**. Completion remains **A1-I1 CODE COMPLETE — REVIEW PENDING**.

## K. Git status

Expected final status; only these seven scoped files changed, no commit created:

```text
 M docs/ARCHITECTURE.md
 M docs/CURRENT_IMPLEMENTATION_STATE.md
 M src/data/auth/accountSwitchFoundation.test.ts
?? docs/architecture/TRIP_CANONICAL_A1_I1_REPORT.md
?? src/data/repositories/tripPersonRepository.test.ts
?? src/data/repositories/tripPersonRepository.ts
?? src/domain/trip/person.ts
```

Production accessed: **NO**. Hosted Dev mutated: **NO**. Deployment performed:
**NO**. Server/SQLite migration change: **NONE**.

**STOP — no Invite/Claim, access migration, A1-I2 or A2.**
