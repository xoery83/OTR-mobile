**Status:** W0 CONTRACT FROZEN / OWNER CONTRACT REVIEW; implementation and activation not authorized.  
**Date:** 2026-10-11. **Verified canonical source:** `741579c8bac3f898669ca331875a28efc645cfa2` at `/Users/xoery/Project/otr-mobile`.  
**Namespace:** `otr-trip-core/2` (business/read/command v2); existing temporal contract remains v1.

# W0 Compatibility and Rollback

## 1. Preserved contracts

| Existing authority                  | v2 compatibility rule                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event/Endpoint temporal1            | Reuse identity/typed columns; dispatch by business_contract_version. v1 row validators/UNASSIGNED assumptions unchanged. Date-only and new manual unresolved rules only v2. |
| CP13A/B command/confirmation1       | Original reviewed semantics, proof coverage/ancestry, hashes and receipts unchanged. New auto2 intent is separate. Never fake v1 scope or user confirmation.                |
| SQLite1–53 / Day47 / Capture48–53   | No historical edits/reinterpretation.54 additive account-partitioned v2; old accepted history remains.                                                                      |
| Source/Provider/Catalog collections | Their existing manifests/hashes and authorization kept. New actor-filtered core-read2 namespace; provider/candidate receipt not canonical admission receipt.                |
| Person / Ledger certificates        | Existing Person identity/current account binding reused; only core-read2 records access/roster hash; no change to Ledger snapshot/cursor/payment semantics.                 |
| Reservation legacy pointer/schedule | v1 remains historical. v2 reservation_id NULL; N:M commercial links sole authority, no synthetic primary Booking or writable schedule mirror.                               |
| Legacy service-role backend reads   | Cannot read private v2 through old direct select. Withhold v2 and require actor-qualified reader; unknown version refuses fallback.                                         |

No automatic conversion of existing Event/Reservation into v2. A future explicit ADOPT_LEGACY operation is outside this Beta command catalog until separately reviewed: preserves UUID, compares full source/base, establishes authenticated owner/ACL/field-protection history and replaces old read authority atomically. New sparse Flight is a canonical business2 Event, not a legacy bypass. Existing CP13A1 Flight objects stay on reviewed v1 path unless an explicit approved adoption gate exists. Source adapters negotiate which path they support; no implicit migration by read.

Historical v1 data already broadly shared cannot be retroactively called private merely by client filtering. New v2 SELF objects are protected from creation. Existing broad histories must not be rewritten to inferred owner privacy without authoritative ACL migration. This does not conflict with D3 for newly admitted v2, and is not permission to expose a private v2 object through legacy read.

## 2. Forward and migration integrity

Baseline HEAD/source digests and installed manifest are separate. Before implementation integrator checks fresh main and allocation, R3 frozen manifest/read-role forward dependencies, row/table preservation hashes and checked-in migration graph. Reserve54/85 but renumber only if taken, never change v2 contract namespace to match ordinal. Test empty and representative populated old schema; preserve all rows/receipts/source claims, account fences and old certificates. No destructive reset or Production migration. Migration transaction installs tables/checks/guards/read-state and CLOSED capabilities as one coherent foundation; a failure must roll back whole foundation. Byte-copy storage outside SQL transaction uses staged verified private custody with idempotent finalized receipt, referenced only after completed copy; abandoned staged bytes garbage-collected only by custody owner, not Item compensation.

## 3. Rollback stages

| Stage                            | Safe rollback                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Before any v2 admission          | Disable Core-v2 capability/gateway; retain additive schema. Revert new callers/transport wiring. No historical rollback migration necessary.                                                                       |
| After accepted v2 writes         | Disable new mutations/auto policy/dispatch, retain v2 actor-qualified read and immutable receipt-status recovery; old binary cannot show v2 as v1. Do not DROP tables, delete accepted objects or rewrite history. |
| SQLite install failure           | Atomic transaction leaves previous accepted generation and pending queue/source bytes; retry same manifest or newer complete one.                                                                                  |
| Unknown command result           | Query same operation/hash receipt before retry; do not create new UUID/key.                                                                                                                                        |
| Domain success + lineage failure | Keep accepted target; replay evidence finalization only; slot EVIDENCE_PENDING.                                                                                                                                    |
| Access revoke/account switch     | Lock/evict affected accepted view/cached bytes; preserve private durable intent/history under old Account partition. Never sync old intents under new actor.                                                       |
| Document format/custody error    | Mark unavailable, retain Source; no ticket-ready assertion; accepted unrelated Item/Booking persists.                                                                                                              |
| Provider outage                  | Keep authored sparse Item and historic accepted facts; block qualification until exact evidence, no synthesized schedule/cache identity.                                                                           |

Full rollback to pre-v2 binary is permitted only when there are no admitted v2 objects OR an accompanying compatible read-only v2 safety layer remains. Capability rollback does not erase sensitive authorization guards; legacy fallback must stay denied. New auto policy can be disabled independently from manual save/read and reviewed v1; per-family capabilities support bounded rollout without partial certificates. V2 collection always reports all ACTOR-visible admitted v2 objects regardless of currently enabled writer families; never hide accepted P3 from read just because P3 writes closed.

## 4. Retention and device limits

Hide/cancel/replace never purge Source/Document bytes, Ledger or accepted receipts. Source redaction/loss preserves identity/history per existing retention; new proof-dependent changes/original opens denied when evidence unavailable. Document authorized copy has separate explicit owner-derived custody rights/retention, not a loophole for a Source purge command. Copy revocation tracks its own ACL/owner security event; no claim that unlinking Source automatically purges independent explicitly authorized copy. Temporary/signed capabilities expire; local availability needs exact hash/version/current known access. Existing maximum trust/reauth rules apply; network failure pauses sync without blocking valid local access. Offline unknown remote revoke cannot be promised immediate. Device eviction affects readiness only and never server entitlement.

## 5. Stop and excluded scope

W0 ends at Owner Contract Review. No actual migration85/54/86, API function, RLS/policy, queue allowlist, storage bucket, provider activation, UI, private import or Flexible/TTR change is made here. No new global Flight root, generalized steps, mandatory Rental arrangement/Group, QR generator, payment allocator, transition Event or provider/cache redesign. Read/custody/security compatibility is a required implementation gate, not a deferred shortcut.
