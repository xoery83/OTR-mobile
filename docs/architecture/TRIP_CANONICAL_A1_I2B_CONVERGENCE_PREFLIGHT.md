# Trip Canonical A1-I2B-P — Participation Convergence Preflight

Status: **A1-I2B-P PREFLIGHT COMPLETE — REVIEW PENDING**.
Date: 2026-10-03 (Pacific/Auckland). Design only; no implementation approval.

Startup: `/Users/xoery/Project/otr-mobile-canonical`, branch
`integration/ledger-polish-canonical`, clean HEAD
`0191f1e70b5df658d035cc127751656dd043740a`.
Startup log: `0191f1e`, `2371fe7`, `3bb7cf2`, `e6fd8ad`, `7a9c0a6`,
`fb8a58a`, `0285ace`, `92862af`. Only this document changes.

CURRENT describes checked-in source; RECOMMENDED specifies this proposal if
approved. PASS means design coverage, not runtime certification. The owner states
I2A is FULL PASS; the handoff/report still say review pending. Treat the supplied
review outcome as the latest task authority, without rewriting those historical
files. I2A is committed as `fb8a58a`; no command exists at this HEAD.

## A. Executive decision

Recommend exactly **F: complete bootstrap snapshot plus a derived participation
fingerprint bound to the shared Ledger cursor**. Each authorized shared pull
checks the current complete vector digest. Mismatch invokes the existing scoped
`INVALID_CURSOR` → bootstrap recovery. The bootstrap commits the coherent Member
observation, completeness certificate and shared cursor in one local transaction.
No persisted Trip counter, Member change feed, new public delta entity or neutral
Person table is justified.

Authority remains `journey_members`, with per-Person revision. A fingerprint is
only a compact comparison of a complete set, not identity, access, financial
evidence or an ordered revision. Matching proves agreement at a server observation
point, never permanent real-time freshness. Eventual convergence requires a
successful authorized refresh after a change, retry progress and a sufficiently
stable source; offline or permanently denied clients cannot be guaranteed current.

Keep the existing Ledger bootstrap transport for this slice. Add only the server
complete-read/fingerprint contract, local snapshot metadata, shared-cursor adapter
and scoped refresh integration needed to make that guarantee real. Future
independent Trip transport needs a concrete consumer/cost reason.

## B. Current implemented baseline

Required contracts consulted: A1 identity/membership, I1 report, I2 persistence
preflight, I2A schema/report, B-T1 temporal/spatial, B-T2 persistence, C-I1 source/
provenance, root guide and canonical architecture/API/offline/current-state docs.
Product/data/environment/legacy-audit context remains applicable; no legacy Web
or sibling checkout was inspected. Relevant source, not historical draft endpoint
lists, establishes current behavior.

| Evidence                                                                                            | Current behavior and implication                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20261003000100_trip_person_participation.sql`                                  | Protected true/0 Boolean and bounded bigint revision. Ordinary INSERT normalizes; UPDATE/upsert preserves. Private execution is disabled.                                                                 |
| `src/data/db/migrations.ts`, migration 42                                                           | Existing `ledger_members` nullable pair; NULL/NULL is unobserved.                                                                                                                                         |
| `src/data/api/ledgerReadContracts.ts:ledgerMemberSchema`                                            | Both fields optional together; malformed pair rejected. No completeness/freshness certificate.                                                                                                            |
| `src/data/repositories/ledgerReadRepository.ts:applyJourney/applyBootstrap/applyChanges/saveCursor` | Preserving per-ID hydration; rows and account-scoped cursor commit together. Omitted Persons are retained; no Member delta handler or authoritative roster reconciliation.                                |
| `src/domain/trip/person.ts`; `tripPersonRepository.ts:listTripPersons`                              | Object/null observation; complete cached list gated by Account/Trip actor context and read generation.                                                                                                    |
| `backend/src/supabaseGateway.ts:readLedgerBootstrap` (6187 onward)                                  | Single Member SELECT ordered by display name; no explicit range/count/completion proof. Existing finance sequence/settings before/after checks do not detect participation-only transitions.              |
| Same file: `readAllJourneyExpenses`; `backend/src/ledgerBootstrapPagination.test.ts`                | Expenses explicitly page in batches of 500; test covers 1,203 Expenses. This is not a test/proof of complete Members.                                                                                     |
| Same file: `encodeLedgerCursor/decodeLedgerCursor/readLedgerChanges` (271/277/6384)                 | v1 token has Account, Trip and financial sequence. Currency barrier returns INVALID_CURSOR. Pull pages 100 feed rows; no participation comparison. Empty bootstrap sequence currently yields null cursor. |
| Same file: private payment changes (5517 onward)                                                    | Private stream shares cursor helpers, but has its own admission/feed and local checkpoint. A global helper-version bump is unsafe.                                                                        |
| `src/data/sync/ledgerReportingCoordinator.ts`                                                       | Cursor absent or INVALID_CURSOR causes bootstrap; generation keys coalesce pulls. Revalidation also directly bootstraps.                                                                                  |
| `src/data/auth/accountSwitchCoordinator.ts`; `accountGeneration.ts`                                 | Generation advances at switch start, sync pauses, memory resets; repository transaction checks its application generation/Account.                                                                        |
| `backend/src/app.ts:authorizeRead`; gateway `canReadTrip`                                           | Existing server admission is checked separately; lifecycle does not grant or deny access.                                                                                                                 |

Important implementation gaps: Member row-cap/completeness proof, coherent lifecycle
snapshot/cursor binding, end-to-end request generation capture, and refresh
coverage without pending queue work. Repository generation capture happens when
application begins, not necessarily before the network request. Coordinator
coalescing by generation does not itself reject an old network response. Its
mocked cross-generation test resolves both pulls; it is not stale-response
isolation proof. These are future I2B obligations, not fixes made here.

## C. Convergence options

All options require exact Trip admission, complete-set evidence and per-ID monotonic
reconciliation. None changes offline truth or makes a late response authoritative.

| Option                                     | Correctness / omission / convergence                                                                                                                                                   | Server and local cost; cursor / compatibility / I2C / reversibility                                                                                                                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Full Members on every bootstrap/refresh | Reliable if explicitly complete and coherent; catches additions/deletions. Restart can retry.                                                                                          | Full existing bootstrap repeatedly reloads financial/private aggregates; O(N) Member transfer. Simple local apply, compatible old DTOs but no old-backend freshness proof. I2C can trigger it. Reversible, unnecessarily costly every refresh.                                               |
| B. Per-Person vector                       | A **complete** ID/state/revision vector establishes state, detects new/missing IDs and ABA. Cached revisions alone miss unseen IDs/deletions.                                          | O(N) transfer/check every pull and Member display hydration still needed. More transport/local merge than compact digest; no natural existing cursor binding without an adapter. Compatible additive contract; I2C supplies one row but not completeness. Reversible.                        |
| C. Persisted Trip counter                  | O(1) detection only if every lifecycle **and** legacy insert/delete changes it atomically. Does not identify omissions.                                                                | New shared contention/trigger/backfill/write authority across old writers, plus complete refresh anyway. New cursor binding required. No measured justification; difficult rollback after command reliance. Reject.                                                                          |
| D. Complete-vector digest alone            | Detects membership/state/revision mismatch, including ABA, with hash-collision assumptions; cannot identify a missing ID by itself.                                                    | O(N) scoped server scan, O(1) response, retained ID set needed locally. Without snapshot/cursor binding a false “current” claim remains possible. Useful component, not sufficient whole protocol.                                                                                           |
| E. Dedicated change feed/cursor            | Efficient deltas only with durable retention, tombstones, gap recovery and proven commit ordering.                                                                                     | New triggers/feed/union/backend/local handlers; old parser rejects unknown entities. Must prevent late-commit sequence overtaking. I2C must write feed atomically. More machinery and rollback/retention burden; defer until measured need.                                                  |
| **F. Snapshot + cursor-bound digest**      | Complete bootstrap supplies IDs/state; every shared pull checks mismatch, including empty financial pages. Missed changes need no feed replay. Restart uses durable certificate/token. | O(N) server scan, constant digest response; rare full bootstrap. Reuses INVALID_CURSOR, public financial entity union and paired DTO compatibility. Isolate private cursor. I2C invalidates by actual state/revision. No persisted counter; reversible to safe full snapshots. **Selected.** |

N is Trip Person count. No measured maximum group size, acceptable payload bound
or scan latency is claimed. Hash/version serialization must be tested rather than
assuming arbitrary JSON objects are canonical.

## D. Complete-vector semantics

The authoritative vector is the exact set of `(personId, active, revision)` for
one Trip at one database snapshot. Unique same-Trip IDs, valid pairs, explicit
completion, and supported contract version are required. It establishes lifecycle
and current server presence **at that point**, not display-name freshness, access,
physical attendance or historical deletion evidence.

| Case                                  | Required result                                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New Person                            | Included ID changes digest even at true/0; complete bootstrap hydrates it.                                                                                                                                                |
| Active → inactive / inactive → active | Same ID, higher revision; replaces observed pair without removing Person.                                                                                                                                                 |
| ABA true/0 → false/1 → true/2         | Digest changes because revision changes, even if Boolean matches initial state.                                                                                                                                           |
| Complete snapshot omits cached ID     | Establishes “not present in this admitted server set at observation”; retain cached identity/pair and historical references. Record absence through snapshot ID-set membership, not inactive/null/deleted business state. |
| Partial/delta omission                | Says nothing about presence or lifecycle. Never reconcile absence or certify completeness.                                                                                                                                |
| Legacy hard deletion                  | Changes complete ID set/digest; can establish absence but cannot prove why/when/who deleted. No tombstone or soft-delete invention.                                                                                       |
| Partial page / interrupted paging     | No complete certificate/cursor; stage/discard and retry whole snapshot.                                                                                                                                                   |
| Duplicate ID                          | Reject entire snapshot, even identical pairs; two same names with distinct IDs are valid.                                                                                                                                 |
| Same revision, opposing Boolean       | Reject entire application; keep prior certificate/cursor and diagnose inconsistency.                                                                                                                                      |
| Stale lower revision                  | Preserve newer local pair. Cannot certify the older snapshot as matching local current projection; discard its participation certificate/checkpoint advance and revalidate.                                               |

A complete response does not authorize deleting retained local rows. Person IDs
must not be reused after deletion under future lifecycle flows (I2A-SPEC E).
Arbitrary privileged delete/recreate with reset revisions breaks that assumption;
this protocol does not repair it. A digest match is not evidence against all
transient insert/delete episodes that leave the same vector.

## E. Bootstrap authority

Retain Member hydration in Ledger bootstrap. No independent bootstrap entity or
second Person authority. Future server read must replace the current unbounded
Member list with an explicitly complete, single-snapshot read. Recommended smallest
implementation: one backend-internal read operation aggregates **all** Trip Member
DTOs plus their count/vector into one database-statement JSON result, avoiding the
PostgREST row-result cap. Return all existing Member fields, not just the vector;
keep authorization in the backend and narrow internal read privileges.

A future read function is implementation work and may require its own reviewed
migration; none is written here. If response limits prevent the one-result read,
fail explicitly. Do not silently truncate or fall back to independently paged
queries. Stable-ID pagination tied to one immutable snapshot and a terminal
completion proof is a later alternative, not a second selected strategy.

Bootstrap procedure: read complete vector V0; obtain complete Member snapshot M
and existing aggregates; read complete vector V1; require
`digest(V0) = digest(vector(M)) = digest(V1)` and existing finance sequence/settings
stability. Retry with a bounded budget (reuse the current three-attempt pattern);
on exhaustion fail without any checkpoint. Associate cursor with M's digest,
including when financial sequence is zero. A commit after V1 is detected by the
next pull. Do not claim all display/status/role fields form a transactionally
frozen general Member snapshot; this certificate covers participation/presence.

Recommended additive snapshot envelope: contract/encoding version, `complete:true`,
Person count, digest and server observation time. IDs come from complete Members,
not a second redundant wire vector. Old payloads without the envelope remain
legacy-compatible, with no completeness claim. Any malformed pair, duplicate ID,
count/digest mismatch, missing terminal completion or unsupported certificate
rejects the new certified snapshot atomically. Do not publish a certificate for
an omitted-field Member, even though I2A's legacy parser permits omission.

## F. Incremental freshness

On **every authorized shared Ledger pull**, even zero-change/final continuation
pages, derive the current complete digest and compare the token's original digest.
Mismatch/missing required shared binding returns scoped INVALID_CURSOR before
advancing the shared checkpoint. Recover with one coherent bootstrap per bounded
refresh attempt; repeated churn/error backs off through existing retry ownership.
No infinite mismatch/bootstrap loop inside one cycle.

A matching pull retains that original digest while advancing only its financial
sequence. Never stamp a new digest without applying the corresponding complete
snapshot. A post-check lifecycle commit is discovered on the next successful
pull; continuation checks catch changes mid-pagination. Already committed financial
pages remain valid; lifecycle invalidation never rolls their money back.

Reuse normal refresh and central lifecycle scheduling. Future I2B must wire an
eligible active/cached-admitted Trip refresh on Trip entry, foreground after stale
verification, reconnect/auth recovery and explicit refresh, coalesced by Account/
Trip/generation, plus a scoped wake after a future I2C result. Existing queue
completion alone is insufficient when no work exists. No new feature-owned timer,
always-on polling or global sweep. An idle foreground client has no instantaneous
push guarantee; freshness is explicitly “last checked,” and a later eligible
refresh discovers missed changes. Offscreen Trips refresh on next use; do not
promise every stored Trip is continuously current.

## G. Fingerprint/cursor decision

No Trip-level persisted revision. Use a versioned deterministic SHA-256 over a
canonical sorted vector: normalized UUID strings sorted by stable ID, tuple
`[personId, boolean, revisionDecimalString]`, canonical array serialization with a
participation/encoding-version domain prefix. Validate unique IDs, Boolean and
safe integer bounds before hashing. Canonical decimal encoding avoids bigint
representation ambiguity; empty vector has a defined digest. Hash equality is a
practical integrity/comparison assumption, not mathematical collision freedom.

Include IDs to detect new/missing Persons, Boolean to detect contradictory same-
revision data, and revision to detect ABA. Exclude displayName/status/role/user_id,
updated_at, money, private grants and access. Those fields have separate authority
and refresh requirements; this must not become a general Member identity digest.
A fingerprint proves no presence change only between compared vectors, not why
an ID disappeared. It requires no persisted counter or lifecycle write hook.

Introduce an explicitly **shared participation-bound cursor format** retaining
Account/Trip/financial sequence and adding purpose/version/digest binding.
Do not globally change `encodeLedgerCursor/decodeLedgerCursor`: private Personal
Payment v1 encoding, scope and checkpoints remain unchanged. Scope/purpose/version
checks precede comparison; a token is opaque and grants no access. A valid legacy
shared v1 cursor goes through one controlled bootstrap to obtain the new format.
New backend must never issue a private token as a shared token or vice versa.

An old client can ignore additive metadata and store the opaque new shared token;
it may not expose lifecycle freshness in its UI. An old backend omitting pair/
certificate is a finite legacy compatibility mode: preserve known pairs, mark
verification unavailable, accept only its financial protocol, and retry lifecycle
verification on a later eligible refresh/compatible backend. Do not endlessly
force INVALID_CURSOR recovery or silently downgrade known state to true/0.

## H. Account/generation behavior

Capture `(accountId, tripId, generation)` **before requesting credentials/network**.
Bind the returned actor, response scope and shared token to that exact Account/
Trip. Reject any result after generation changes, including A→B→A, before opening
application and again inside the transaction immediately before commit. Apply the
same captured context across bootstrap recovery and every continuation page.
Repository checks at application time alone cannot establish request ownership.
Reuse generation, admission, pause and transaction infrastructure; add the missing
context propagation rather than redesigning Account isolation.

For shared Trip A/B, durable Member observations may be reused only through B's
own existing cached admission gate. B never adopts A's in-flight response, cursor,
actor capabilities or freshness certificate. B issues its own authorized refresh.
If B has no cached admission, Person rows alone reveal nothing. If B receives an
explicit access denial, route it through the existing admission/access-loss policy,
stop that scope's verification and never reinterpret denial as an empty snapshot.
Do not invent universal offline revocation or logout. An expired-token offline
valid cached session retains its already admitted data.

## I. Offline semantics

Offline participation freshness means **last observed, currently unverified**.
Known true/r or false/r stays readable, including after long offline periods.
`participation:null` means never observed/unavailable, not stale known state.
Neither reconnect nor elapsed time resets the pair. No user disappearance or
network-dependent launch/logout is introduced.

Expose snapshot-level freshness separately from `TripPerson.participation`:
last server observation, certificate availability, and verification outcome such
as unverified/offline, verified-at-observation, mismatch/refresh-needed or error.
These are conceptual outcomes, not a new business enum or UI implementation here.
Persist last successful observation; online status and “checking” are transient.
A timestamp is evidence of age, never an ordering or correctness substitute.
Long-offline recovery checks the digest then reboots the scope if needed; server
CAS, not a freshness label, governs a future lifecycle command.

## J. Omission/deletion semantics

| Observation                        | Meaning / response                                                                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Present false/r                    | Inactive Person, fully retained and historically valid.                                                                                                                                                                                                        |
| Absent in partial/delta            | No new fact; preserve cache and certificate.                                                                                                                                                                                                                   |
| Absent in coherent complete set    | Absent **from current server projection at this observation**, not inferred inactive/access-revoked/soft-deleted. Retain old local Person and references; exclude from a future current-server selection set only through explicit snapshot presence metadata. |
| Legacy removal confirmed elsewhere | Historical removal evidence may explain absence; freshness does not create a tombstone, undo deletion or recreate the Person.                                                                                                                                  |
| Trip read forbidden                | No vector returned or applied; separate Account admission outcome.                                                                                                                                                                                             |

`listTripPersons()` remains the complete admitted **local retained** Person list,
not a promise that every historical cached row still exists on the server. A fresh
participation vector is the last complete returned ID set, not every retained row
in `ledger_members`. Missing referenced Persons never cascade out of money/history.
No soft deletion or deletion command is designed. Retention/cleanup of absent
identities requires a separate historical-reference policy; indefinite retention
is safer than destructive roster reconciliation in this slice.

## K. Local projection

Keep `ledger_members`. Necessary future metadata is one optional participation
snapshot certificate **per Account/Trip**, attached to existing scoped sync metadata:
encoding/contract version, digest, complete snapshot ID set and server observation
time. Count derives from unique IDs. The shared cursor binds the same digest.
No per-row timestamps, Person mirror or persisted global bootstrap generation.
Request generation is process-local; restart starts a new request context.

The ID set is necessary: digest alone cannot classify P3 absent while retaining
its cached financial identity. A certificate must reflect exactly the accepted
snapshot, never be recomputed over all historical cached rows. Before claiming
matching local observation, recompute against its recorded ID set and current
pairs. A newer shared-cache pair from another admitted Account or command makes
an old certificate unverified, without rewinding it or copying another Account's
checkpoint. Serialized per-Account/Trip refresh and digest-at-apply checks prevent
late snapshots from reinstating obsolete presence certificates. Cross-Account
shared-cache changes must invalidate derived freshness views.

Apply Member rows, ID-set certificate, actor admission and shared checkpoint in
one existing SQLite transaction. If any local row is newer than the supplied
snapshot, retain it but do not certify/advance that snapshot as current; retry a
fresh coherent snapshot. Ordinary legacy hydration can still apply valid old
metadata per I2A, without earning a new participation certificate.

Read split: keep `listTripPersons()` unchanged. A future separate
`listParticipationCandidates()` may use snapshot presence plus observed ACTIVE
and I2A's unobserved compatibility policy; it must never silently redefine null
as ACTIVE, delete references, or hide inactive Persons from complete reads. This
preflight does not authorize that picker/filter implementation (I2D).

## L. I2C interface

Consume future successful desired-state/CAS/idempotent outcomes as scoped evidence
containing exact Trip/Person and resulting Boolean/revision. Validate request
ownership and reconcile monotonically in the same local command-result handling
boundary. An old replay cannot overwrite a later state. Receipt evidence is not
a complete-roster certificate: updating one row invalidates verification until
shared pull/bootstrap checks the full vector.

After success, request one scoped refresh; mismatch obtains a complete snapshot.
If response/refresh is lost, keep the same command key for the future I2C replay
contract and let the next eligible shared pull discover committed state. A CAS
conflict also requests current observation; it does not synthesize success or
invent revision +1 locally. No command schema, receipt/audit, optimistic queue or
mutation implementation is designed here beyond this read-side interface.

## M. Failure recovery

| Failure                                            | Required recovery                                                                                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Response received, transaction fails               | Roll back rows/certificate/cursor; retry from last committed checkpoint.                                                                                       |
| Rows applied, checkpoint write fails               | Same transaction rolls back all; never publish memory success before commit.                                                                                   |
| Checkpoint advanced before rows                    | Forbidden ordering/state; transactional acceptance test must prove impossible.                                                                                 |
| Fingerprint mismatch                               | One scoped coherent bootstrap; preserve cached reads while retry/backoff proceeds.                                                                             |
| One malformed pair/duplicate/count/digest mismatch | Reject certified aggregate; retain old checkpoint/certificate, mark error without falsifying freshness.                                                        |
| Stale lower revision or late older snapshot        | Preserve newer pair, refuse new verification/checkpoint and refresh; digest is not ordered.                                                                    |
| Equal/opposite revision                            | Invalid evidence; fail atomically and diagnose, no LWW.                                                                                                        |
| Interrupted pagination                             | Financial committed pages remain valid with original lifecycle binding; next page checks again. Incomplete Member snapshot never commits completeness/absence. |
| App killed during refresh                          | Uncommitted transaction rolls back; restart reads last committed rows/certificate/token and rechecks.                                                          |
| Server changes continuously                        | Bounded attempts then existing retry/backoff; keep last observations unverified, no endless immediate loop.                                                    |
| No complete-capability backend                     | Legacy financial mode; preserve pair and explicitly unverified lifecycle.                                                                                      |

## N. Golden multi-device scenarios

These are resolved protocol scenarios, not executed device tests. I2C transitions
below are hypothetical future guarded writes; none is enabled now.

| #   | Scenario                                   | Required result                                                                                                                                                  |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A observes P1 true/0                       | Complete snapshot stores true/0 and Account-A certificate/token.                                                                                                 |
| 2   | B deactivates P1 → false/1                 | Server authority changes same ID/revision; digest changes, financial feed need not move.                                                                         |
| 3   | A offline during change, reconnects        | Cached true/0 remains readable but unverified; eligible shared pull checks digest.                                                                               |
| 4   | A receives rev1                            | Mismatch bootstrap coherently stores false/1 and new certificate/token atomically.                                                                               |
| 5   | Old rev0 arrives after rev1                | Request ownership/stale-snapshot checks prevent verification rollback; pair remains false/1.                                                                     |
| 6   | true/0 → false/1 → true/2; A sees 0 then 2 | New digest/revision detects ABA; A stores true/2 without needing intermediate event.                                                                             |
| 7   | P2 added elsewhere                         | ID changes digest, including baseline true/0; complete refresh adds P2.                                                                                          |
| 8   | Server complete P1/P2; local also P3       | Accepted ID set is P1/P2; P3 retained as absent-at-observation historical cache, never set inactive or deleted. Complete local list still resolves P3.           |
| 9   | Partial page omits P2                      | No absence/completeness assertion, no replacement certificate; interrupted complete read retries.                                                                |
| 10  | Switch Accounts during refresh             | Captured generation/Account mismatch rejects old result, actor, rows and checkpoint even on shared Trip.                                                         |
| 11  | Shared Trip opened by A/B on one device    | Shared cache usable under each own cached admission; independent tokens/certificates. B performs own check, never consumes A's request.                          |
| 12  | Old backend omits pair                     | Preserve known pair or null; lifecycle certificate unavailable, financial legacy mode remains finite.                                                            |
| 13  | New backend returns partial/malformed pair | Entire certified bootstrap rejected, checkpoint unchanged; cached reads survive.                                                                                 |
| 14  | Long-offline cached inactive Person        | false/r remains readable in complete list, marked unverified; no logout or deletion.                                                                             |
| 15  | Future I2C succeeds, refresh response lost | Same command key/replay semantics stay I2C-owned; next successful shared check detects committed revision and converges. Receipt alone never certifies full set. |

## O. Financial non-interference

No participation predicate or fingerprint enters Expense participants/payer/splits,
Settlement inputs/history/source digests, Adjustment/correction, Review, FX,
Personal Payment endpoints/read grants or financial Member validity. Complete
historical joins remain unchanged, including inactive and absent-retained Persons.
Shared cursor metadata is transport evidence, not financial source evidence.
Private payment admission/cursor is not reused for participation.

B-T1 whole-group assignments remain the explicit Person set recorded at authoring;
new Persons or inactivation never rewrite schedule participant sets. B-T2 future
itinerary projection stays separate. C-I1 associations/provenance grant no access;
a participation digest neither identifies a Source/Person nor mutates confirmed
outputs. Freshness convergence updates observation only, not money, links, planned
attendance or canonical evidence. Future implementation must rerun relevant
financial/source regressions and before/after safety evidence; none was rerun or
claimed as runtime proof in this documentation-only task.

## P. Implementation slicing

| Future slice                                | Smallest deliverable / gate                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I2B1: server complete read + shared binding | Complete single-snapshot Member read, canonical digest/certificate, coherent bootstrap guards, shared-only cursor adapter and mismatch recovery. Tests: over-cap roster, zero-sequence token, malformed/duplicate set, ABA/concurrent insert/delete, old/shared/private cursor separation. No commands.                  |
| I2B2: local atomic projection               | Scoped certificate/ID-set persistence through existing metadata, explicit request context propagation, monotonic validation and atomic rows/certificate/checkpoint. Tests: stale Account request, A→B→A, shared-cache newer pair, omitted legacy fields, stale set and transaction failure/restart. No picker filtering. |
| I2B3: refresh integration                   | Reuse central eligible scope/lifecycle scheduling and INVALID_CURSOR bootstrap, bounded retry and freshness read exposure. Tests: no queue work, foreground/reconnect/auth recovery, empty financial delta, mid-page change, legacy backend finite recovery, no recursion. No new perpetual polling.                     |
| I2B4: convergence acceptance                | Two device/two Account online/offline/restart and all 15 scenarios; historical financial non-interference. Actual transitions need separately approved I2C or isolated fixture-only setup; do not enable commands to test I2B.                                                                                           |

Slices are recommendations for later authorization, not approval to implement or
deploy. Server read migration/API format, local metadata migration and supported
build transition require concrete review before I2B1/I2B2 work.

## Q. Risks/unknowns

- No performance/payload measurements yet. Aggregate JSON avoids row truncation,
  but server/body limits must produce explicit errors; large rosters may justify
  stable snapshot pagination or a feed later, not silently incomplete authority.
- Member display/role/status updates are outside this digest. Bootstrap continues
  to hydrate them, but lifecycle convergence does not certify their freshness or
  repair existing authorization races.
- Legacy hard deletion remains permitted where existing FKs allow it. Absence
  lacks deletion evidence and cannot restore server history. Retention/cleanup and
  any UUID reuse require separate review.
- Current end-to-end Account request context and eligible refresh triggers need
  implementation proof. Existing I2A/read/coalescing tests do not supply it.
- Private/shared helper isolation, version rollout/rollback and nullable old backend
  certificates need explicit compatibility tests. No remote capability verified.
- Hash collision freedom, instant offline freshness and indefinitely idle-client
  convergence are not claimed. A bounded coherent read requires retry progress.
- Exact physical metadata layout, DTO naming and helper API are future specification
  choices; proposed meanings/boundaries here are sufficient for review, not frozen
  migrations. No Trip counter or deletion policy is left implicitly approved.

## R. Acceptance matrix

| Criterion                             | Evidence                                                    | Result |
| ------------------------------------- | ----------------------------------------------------------- | ------ |
| One mechanism selected                | A/C: F, complete snapshot + shared cursor-bound digest      | PASS   |
| No unapproved Trip-level revision     | G: derived vector only                                      | PASS   |
| Omission semantics defined            | D/J/K: complete presence set versus retained local identity | PASS   |
| New Person detection                  | D/G/N.7: include IDs in digest                              | PASS   |
| Stale/ABA behavior                    | D/M/N.5–6: monotonic pairs, no stale certification          | PASS   |
| Complete versus partial distinguished | D/E/J: explicit certificate, no page omission inference     | PASS   |
| Bootstrap/checkpoint atomicity        | E/K/M: coherent source and one local transaction            | PASS   |
| Account-generation behavior           | B/H/N.10–11: request context captured before network        | PASS   |
| Offline stale-state behavior          | I/N.3,14: known pair retained, separate freshness           | PASS   |
| Old backend omission                  | G/K/N.12: finite legacy mode, no reset/certificate          | PASS   |
| Future I2C interaction                | L/N.15: scoped result then complete verification            | PASS   |
| Financial behavior untouched          | O and document-only Git scope                               | PASS   |
| All 15 scenarios resolved             | N.1–15                                                      | PASS   |
| No migration/code/config change       | Only this document added                                    | PASS   |
| No remote access                      | Local source/Git/files only                                 | PASS   |

**15 PASS / 0 PENDING / 0 BLOCKED** for design coverage. Human and independent
review remain PENDING; implementation, device and deployment evidence are not
claimed. Validation: startup Git gate, scoped source/contract inspection,
changed-document Prettier and `git diff --check`/new-file whitespace check. No
runtime tests, database commands, network access, migration or config changes.
No commit. Current-state/ADR remain unchanged under the explicit one-file rule.

Production accessed: **NO**. Hosted Dev accessed/mutated: **NO**.
Deployment performed: **NO**. I2B implementation: **NO**.
Lifecycle command/receipt/audit implementation: **NO**.

**STOP — A1-I2B-P PREFLIGHT COMPLETE — REVIEW PENDING.**
