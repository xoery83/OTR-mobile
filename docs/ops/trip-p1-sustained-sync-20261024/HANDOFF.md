# Sustained Trip / P1 / authored Person candidate

Status: **SYNC_CONTRACT_PASS; CLOUD_PENDING; Native L1 and real DEV L3 NOT_RUN for this sustained candidate.** This replaces the previous finite 24-hour normal candidate. No remote SQL, deployment, permission activation, Auth, Provider or AD5 operation was performed.

## Executable path

Current Add Traveler slots are explicitly authored as `cloudTravelers: {dataOwnership: "CLOUD_SHARED_AUTHORED", slots}` at the originating Create action. Old `travelers` and retained v1 name-only intents remain Local-private, never scanned or promoted. Trip V2 request/hash is unchanged. Repository atomically retains separate stable Person/op IDs and the existing Create dependency. SQLite74 stores immutable Person request/result receipts; Root must register it after Source73.

The existing owning normal selector, timer and queue run accepted Create → authored Person → qualified P1, with account/generation fencing. Person uses normal Auth, GET result before POST, independent GET canonical qualification after POST, and immutable receipt retention. UNKNOWN reconciles before retry; no replacement identities or name merging. Accepted Person is unlinked with no User ID or new Account role. P1 continues the five existing MANUAL Core commands, full hashed collection readback and creator-only edit restriction. Local-private selected participants remain blocked rather than dropped or silently shared.

Pending Create edits retain full before/after destination lists and stable wire operation IDs. Actual accepted revision/snapshot is required before materialization. Readback continuation refreshes full server Metadata and owning Core collection; newer dirty values survive older confirmations. Claims/leases and AUTH pause use the existing worker, not another engine.

## Root serial integration

- Apply `ROOT_ONLY_CLOUD_TRAVELER_ORIGIN.patch` to Root-owned LocalTripWorkspace. It uses Root's `nativeTripAuthoredCloudTravelers` helper and does not alter old intents or add a UI workflow.
- Register `tripPersonCloudCreateMigration` (74) in the existing registry. Preserve Source73.
- Root owns the existing Native version2 configuration, scheduler and generic-worker quarantine. Person kind is excluded from default engines; deferred/readback local actions never go to transport.
- Root owns `tripPersonCloudCreateHttp.ts`, existing app/startup routes and private Backend version3 composition. The Pg candidate imports that reviewed HTTP port/error; the local untracked HTTP copy is only a TypeScript dependency, excluded from this commit.
- Use `createPersonPgConnection` with the fixed existing `otr_trip_person_command_gateway`, then `createTripPersonCloudCreatePgPort`. Routes: POST `/v2/trips/:trip/people`; GET `/v2/trips/:trip/person-create-operations/:op`.
- Existing sustained ports require the actual SQL capabilities reader option, not fabricated capabilities. Continue default CLOSED until the exact combined Gate below is approved.
- Three deferred-metadata cover files in this commit reproduce the earlier Root-reviewed integration patch (atomic cover CAS/local Ledger caption); Root already has identical content. They are not a new independent scope.

## Evidence

- Eight targeted suites: 67 tests PASS. Five roster/Person/wake suites: 61 PASS (overlapping, not additive).
- Network-none real PostgreSQL17: 37 checks PASS (including 21 malformed SQL requests) plus 8 actual typed PgPort/Core checks. Includes full structured Create/Edit, Person command/replay/independent canonical qualification, five P1 commands, permissions, revocation, exact rollback and retained accepted data.
- Originating UI patch: 36 component tests PASS in an isolated scratch tree using Root's Native config module; no actual Native claim.
- Typecheck, scoped production lint and UI guard PASS.
- Broader affected Core/local-manual suites: 62 PASS, one known baseline floating-time `DAY_ZONE_INVALID` failure. This is not a full-suite PASS.
- Actual DEV parent guard c493b32972679e7aba510132103b0dd9 and unmodified Source helper were loaded into the isolated fixture. Source Review early branch survives the new patch and rollback. Source functionality itself was not activated or accepted.

## Data path checklist

1. Ownership: Trip metadata/destination identities, explicitly current authored Person and P1 are Cloud-shared; historical names/creator display label remain Local-private; form state Draft; scheduling claims Transient.
2. Storage: existing Trip/Person/Core repositories and outbox; SQLite74 receipts only.
3. Contract: existing Trip V2 / Metadata V3 / five MANUAL P1 operations; new narrow Person request/result functions and HTTP adapter.
4. Offline/conflict: immutable original requests, dependency-blocked materialization, real revision CAS, no guessed rebase, dirty-value protection, collision rejection and account fencing.
5. Evidence: isolated L2 PASS; UI patch component PASS; sustained Native L1 / real DEV L3 pending Root serial integration and exact deployment Gate.
6. Remaining delta: approve/install SQL/ACL and normal service activation; integrate Root composition; run normal App Create → pending edits → Person → P1 with independent DEV reads and cold recovery. No claim that prior fixed-QA receipts prove this new persistent service policy.

Complete People/Invite/Claim/Profile and new start-date/entitlement rules are outside this candidate. Existing Source formal Review/Admission remains independently BLOCKED. A Source role TTL incompatibility was initially suspected but is **not established**: the actual Source scope does not check rolvaliduntil or require gateway NOLOGIN. Any future simultaneous Source activation must qualify its own operator/reader conditions; this candidate preserves existing Source functions.

Independent Review null correction: see `PERSON_SQL_NULL_FIX.md`; original 8e773ef SQL must not be deployed.
