# Active continuation — 30 October 2026

Fresh iPad normal OTP Account/Trip/P1/APPLIED/independent readback/cold recovery PASS on Build114; Auth independently verified and integrated main2033e6c4. Start gate OPEN. The initial audit below is retained as bounded historical inventory, not a new architecture audit.

Current local implementation reuses certified Core collection and accepted mirror install, existing lifecycle timer/notifications and normal committed Account identity. No new queue, Schema or protected privilege. External-client DEV Golden A/B/C and revocation remain unverified; see IMPLEMENTATION_STAGE1.md.

# Native-04 Downstream contract inventory

30 October 2026. **Prerequisite preflight only; downstream implementation and its
Golden Slices have not started.** Authoritative integrated baseline: main
`b2bbfe59576381ef267081d5cc3b283fb5b8384f`. Native handoff `51bd3e0b`;
the directly inspected Core Repository, normal Coordinator, Bootstrap and Backend
Core Read files have no difference from that main. Unmerged Enrichment is excluded.

## Start gate

| Owner prerequisite | Actual evidence | Status |
|---|---|---|
| Existing Google / Hosted Email OTP normal Cloud sync | Existing Google recovery; existing OTP first Profile/Trip and P1–P6 Create/Edit, 14 APPLIED receipts, independent DEV readback, phone110 cold recovery | PASS within those receipts |
| New registered Google / OTP Account → Trip/P1 without QA enrollment | Auth independently confirms both Accounts were registered on 28 October, before General rollout. No later fresh-signup + Trip/P1 receipt exists. No approved unused Hosted mailbox or Google identity available to Auth | **NOT VERIFIED; implementation start held** |
| P1–P6 minimum normal Account Core eligibility | General scope function OID66180/hash0f3b; six Manual families accepted under OTP; Sparse P2 only, P5 TRAIN | PASS for approved minima; not Qualified/extra subtypes |
| Old Queue/SQLite/Session/data preserved | Previous normal in-place phone110 and main publication receipts | PASS within existing preservation checks |
| Safety gaps explicitly recorded | Fresh signup, new real Backend A/B negative, physical offline not newly covered; historical reliability receipts remain separate | Recorded, not promoted to PASS |

Owner has been asked once for an unregistered mailbox they can receive OTP for.
Do not delete/recreate an existing Account, assume a Provider creates a new
canonical identity, invent a mailbox/Session, or substitute local Mailpit.
A new Google identity likewise needs a legitimate Owner-controlled normal flow.

## Existing ports and gaps

| Concern | Reusable owning implementation | Evidence / minimum missing work |
|---|---|---|
| Account lifecycle | `src/data/bootstrap/defaultBootstrapDependencies.ts`: cold/account activation, AppState foreground, Expo Network restoration, single-generation in-flight coalescing; selected Journey Ledger refresh and read retry | Existing code + Bootstrap tests. It is primarily Ledger discovery, not proven external Core change discovery. `discovery.complete` suppresses repeated list bootstrap in a generation. The 15-minute timer schedules Data Health, not a Core delta feed. |
| Normal Manual recovery | `src/data/sync/tripNormalCoordinator.ts`, `tripNormalSync.ts`, `tripNormalReadbackRepository.ts` | Actual own-upload recovery PASS. Readback is tied to local Trip Create IDs and local completed/attempted operations; `coldReadbackSeen` plus trigger versions are not remote-change versions. Graph refresh currently depends on an APPLIED local intent. It cannot certify the requested no-local-Create slice. Reuse scheduling/retry, not a second queue. |
| Trip discovery | `src/data/sync/tripDiscoveryTransport.ts`, `src/data/repositories/tripDiscoveryRepository.ts`; `GET /v2/trips?cursor=<uuid>&limit=25` via `backend/src/tripDiscovery.ts` | Account-scoped keyset scan, max40 pages/1000 Trips, no partial cache replacement, atomic final replace; local pending container fields merged by stable UUID. No global snapshot token, durable change cursor or removal reason in this response. A page omission is not deletion/revocation. Automatic binding to all Native-04 triggers is missing. Concurrent page writes need a precise no-loss discovery contract. |
| Core read | `src/data/api/tripCoreV2Transport.ts` `collection()` → existing `GET /v2/trips/:tripId/core/collection` | Full certified collection bundled as manifest+1–100 pages, up to65MiB; validation includes Actor/Trip, hashes, epoch, revision, access revision, Person binding/roster. This is a complete snapshot, **not an incremental cursor**. No `updated_at` cursor is used here. |
| Consistent Backend snapshot | `backend/src/tripCoreV2PgRead.ts` | Existing REPEATABLE READ transaction, owning principal/finite scope/Actor/gate, graph/bindings, actor-filtered collection, recheck before COMMIT. `trip_core_read_state` supplies epoch/revision/access_revision. Reuse this authority. Need verify live read/cancel/ACL branches and revision coverage for all external mutations, not infer from a successful upload. |
| SQLite accepted Apply | `src/data/repositories/tripCoreV2Repository.ts` `beginRefresh/install/refresh`; migration54+later existing mirrors | Account apply gate + SQLite transaction; stale generation/access/epoch/revision rejects. Only that Account/Trip's accepted mirror tables are replaced; bindings+certificate committed atomically. `trip_core_pending_intents`, receipts, outbox, drafts, Guest/local UI stores are separate. Receipt reconciliation only marks covered committed revisions. No new upload is generated by `install`. Existing deterministic coverage; no external-client Native-04 E2E yet. |
| Pending/UNKNOWN/CAS | Core Repository, existing `tripCoreV2SyncWorker`, `sync_operations`, `trip_core_pending_intents` | Receipt-first/original IDs retained; local predicted/committed projections separate from certified accepted base. Must execute external edit vs pending conflict, DB close/reopen, recovery; cannot assume snapshot replacement alone passes it. |
| Cancellation / visibility | Core `SET_ITEM_STATUS`, `HIDE_OBJECT` / `RESTORE_OBJECT` and existing projection rules | Use existing legal status/visibility commands, no hard-delete design. A complete actor-filtered snapshot can remove accepted visibility material; it must not discard pending/drafts or relabel an absent record as a deleted object. Exact cancellation and access semantics need live checks. |
| Trip revocation | Core Repository `revoke(context, accessRevision)` sets scope revoked and blocks unfinished Core queue; read paths withhold revoked cache | Existing tests PASS. Need authoritative server observation/contract for access loss and restoration; do not invent an access revision from a generic404/503, treat network failure as revocation, or restore rights from stale discovery. Person changes and private-item filtering remain Core-owned. |
| Native UI | `tripDayFeedRepository.ts` and P1–P6 owning Reader/Details; `TripViewContext.tsx` generation-scoped invalidation | Existing accepted own-upload and Import display/cold evidence. Need Pull completion → existing read notification/local invalidation wiring; no per-render network request or duplicate ID. Existing own-upload cold is not automatic downstream PASS. |
| Import | `src/data/operations/universalP1AdmissionConsumer.ts:241` `deps.core.refresh`; `onAccepted` later in same file | Import Owner confirms formal Save invokes existing Core refresh; original P1 and five-type receipts in `docs/ops/universal-product-20261028/`. This is post-local-Save refresh, not external change discovery. No reparse, new Provider call or Source permission needed for ordinary accepted Pull. |
| Auth / Adoption | Accepted Account generation/apply ports and `defaultAccountSwitchCoordinator.ts`; Auth Owner confirmation | Ordinary Pull must require committed ACCOUNT+that Account/generation. PREPARED/provisional token is not installed Account. PUBLISH_REQUESTED/UNKNOWN keeps Guest source locked and uses formal status/Receipt; NOT_FOUND does not unlock it. Do not read Guest localId or dispatch its pending as Account. Auth remains sole Session/Guest/People/Invite writer. |
| Notifications | Inspected mounted data/bootstrap/Core paths have no Supabase Realtime change subscriber | No Realtime dependency needed for first slice. Foreground/network/Trip entry hints must pull through ACL-validated Core read; never apply notification payloads as authority. This is a bounded path finding, not a claim that no unrelated realtime code exists anywhere. |

## Smallest continuation after the start gate

1. Prove new registered normal Account Trip/P1 first, with independent canonical
   Account/created_at, no QA enrollment change, normal receipts and cold recovery.
2. Reuse existing lifecycle, Trip discovery cache and certified Core refresh.
   First test external normal-client P3 Create while iOS does no local Create.
   Separate the normal pull trigger from local upload receipt triggers.
3. Prefer existing complete certified snapshots for initial correctness. Do not
   introduce a delta cursor/table before proving it necessary. Resolve the Trip
   discovery consistency/removal/access-restoration contract with the unique Core
   Writer if current ports cannot provide a safe complete enumeration.
4. Existing accepted mirror+certificate transaction is the apply boundary; durable
   cursor, if later needed, must advance in that same owning transaction. Preserve
   pending/UNKNOWN/drafts and use existing CAS/conflict paths.
5. Add independent bounded Account/Trip scheduling, notification and revocation
   handling only after proving the first actual failure. Reuse existing retry and
   single-flight mechanisms; no second Sync Engine or private Native API.

Native owns ordinary Core/Reader/Sync and Startup/DI. Import retains Source
PgAuthority/UniversalCoreSourceRead; no conflicting Core Writer reported. Auth
retains Session/AuthRepository/Guest verification/recovery/publication codecs;
new identity ports require a minimal Auth-owned call contract. No live Host, SQL,
Schema/RLS/GRANT or Authority changes were made during this preflight.

## Validation and acceptance status

Five directly relevant existing suites: **99/99 PASS** (Core Repository, Trip
Discovery transport/cache, Bootstrap, Backend Core PgRead). These are deterministic
regressions; they are not Cloud→Native automatic E2E or a real Backend ACL test.
All nine Native-04 final matrix rows remain **Not Tested** for this task. Existing
Manual/Import receipts remain valid only for their original bounded claims.
