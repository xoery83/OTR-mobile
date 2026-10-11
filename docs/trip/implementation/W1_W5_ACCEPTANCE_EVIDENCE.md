# Core v2 acceptance evidence — 2026-10-12

Status: INCOMPLETE. This is a trace ledger, not20 passed targets.
Base741579c; isolated branch codex/trip-core-v2-w1-w5. Runtime/Hosted/native/provider CLOSED.

## Executed checks

- Full Vitest:3584 passed,17 skipped,2 failed. Both failures reproduce on unchanged
  base741579c: architectureBoundary UI-test scan and navigationLayout wrapper assumptions.
- Typecheck, lint, UI guard, Backend build and all81 touched formatted files PASS. No UI changes or new dependencies.
- Focused read/HTTP/transport/SQLite/sync/lifecycle84 PASS; reducer/lifecycle16 PASS.
- Owned synthetic PostgreSQL Core85–89 scenario PASS: P1–P6 root/child writes, sparse
  exact receipt/replay/operation reuse/CAS, complete collection/Item, Person invalidation;
  rollback-only RLS and closed-gate/role/private-locator negatives PASS.
- Source owning SQL scenario PASS separately: actual sealed legacy two-Candidate publication,
  exact hash/pins, durable cold REVIEW replay, request reuse/stale/actor/Trip/principal
  denials, no canonical/receipt/Ledger/membership/asset row-hash changes; no qualified READY.
- All329 prior public function fingerprints unchanged. Only additive migrations; no
  existing or Hosted DB mutation. Node pg TLS/primary lease tests use mocks, not deployment.
- SQLite53→54 preservation, interrupted upgrade rollback, durable sparse restart,
  A→B→A fencing, damaged collection rejection, revocation and lost-response receipt recovery
  execute with Node SQLite. The response-loss backend is synthetic authority, not SQL/native E2E.

## W0 target trace

PARTIAL means relevant executable mechanics exist but at least one target outcome is
unverified. BLOCKED means a required owning authority implementation is absent. Neither
label is PASS. Domain tests are under src/domain/trip; service tests under backend/src;
repository tests under src/data/repositories.

| Target                               | Executed evidence                                                                          | Remaining target evidence                                                     | Status  |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------- |
| A01 two Flights/one Booking          | Source28 same-ID/sibling orchestration; Booking N:M reducer                                | Actual sealed two-leg Source qualification and full accepted fixture          | BLOCKED |
| A02 Rentals                          | P4 independent identities/Returns in Views; SQL family/places                              | Complete W0 exact shared-pickup fixture and Booking due facts                 | PARTIAL |
| A03 three Stays                      | Calendar Stay/nights/Base Views and P3 SQL                                                 | Full three-Stay order admission fixture                                       | PARTIAL |
| A04 supplemental Stay Booking        | Generic independent N:M links                                                              | Execute complete accepted supplementary-order fixture                         | PARTIAL |
| A05 Water Taxi                       | Independent P5 endpoints/subtype/Day tests                                                 | Full outbound/return Booking fixture                                          | PARTIAL |
| A06 connected train/shared Ticket    | Generic entitlement/segment relation codecs                                                | Exact coach/seat/shared-original fixture and custody                          | BLOCKED |
| A07 group Ferry                      | Optional holders/quantity finite codec                                                     | Full group-ticket original face/custody fixture                               | BLOCKED |
| A08 zero-Item Pass                   | Entitlement validity schema/zero-Item relation shape                                       | Full authorized Pass read/Wallet target (W6 UI independent)                   | PARTIAL |
| A09 one Source/many Items/no Booking | Multi-output Source28; zero-Booking domain                                                 | Actual sealed Source outputs and full accepted fixture                        | BLOCKED |
| A10 sparse offline/qualification     | SQLite reopen/receipt; Source synthetic same-ID exact prerequisite                         | Authoritative qualification and native restart/reconnect                      | BLOCKED |
| A11 user edit/clear                  | Protected room/source overwrite; explicit Rental clear; CAS                                | Complete source-resolution workflow                                           | PARTIAL |
| A12 lifecycle                        | Shared cancellation exact scope; finite scoped hash                                        | Replacement transfers/history/hide/restore complete adversarial SQL           | PARTIAL |
| A13 replay/partial outputs           | Source28 partial success/evidence-pending/exact receipt; SQLite lost response              | Actual Source publication/finalization SQL                                    | BLOCKED |
| A14 CrossTrip/SELF                   | Reducer/actual RLS negatives; SQLite account switch                                        | Operational Document independent authority                                    | PARTIAL |
| A15 Document/Ledger noncascade       | No physical root delete; relation-retention reducer                                        | Owning custody/grants/Ledger associations and immutable byte retention        | BLOCKED |
| A16 static/dynamic originals         | Read flags fail closed                                                                     | Verified bytes/hash/eviction/revocation/dynamic original acceptance           | BLOCKED |
| A17 temporal/missing/Base            | Minute/fractional precision; P1 date-only; unique/overlap Base; P4/P5 Views                | Full GAP/FOLD owning resolver target and full accepted missing-field fixtures | PARTIAL |
| A18 Flight identity/codeshares       | Strict purpose/retiming/legacy UNKNOWN Source tests                                        | Real sealed identities/whole-Source authority/cache separation                | BLOCKED |
| A19 certificate/interruption         | Atomic complete install; incomplete-page rejection; zero Person revision; upgrade rollback | Native interruption and complete ACL-change SQL adversaries                   | PARTIAL |
| A20 corrections/alone entitlement    | Private predecessor mirror; protected instructions; optional holders                       | Full correction/Pass/wallet target and original provenance authority          | PARTIAL |

## Actual remaining gate

See W1_W5_SOURCE_AUTHORITY_GATE.md for sealed publisher ownership. Existing Capture
publication has labels but no qualified airport IDs or whole-Source identity authority.
Core cannot safely admit that data by inventing proof. Custody/Ledger and the partial
acceptance rows remain implementation work; they are not reclassified as Owner approvals.
No canonical-main integration or production readiness is claimed.
