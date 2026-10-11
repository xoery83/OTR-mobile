# G1 — Relationships and lifecycle

Date: 2026-10-11 (Pacific/Auckland). Status: **G0/G1 audit complete; proposed changes require Owner Review.**

Implementation baseline: canonical main `5076174`, `/Users/xoery/Project/otr-mobile`. Paths below are relative to that checkout unless marked **chat-only**. Source inspected directly; no live database accessed. IMPLEMENTED describes the named capability, not blanket product readiness. Tests, runtime wiring, historical DEV evidence and real-file E2E are separate dimensions. This audit authorizes no implementation or activation.

## Nine target business cases

These are acceptance scenarios, not imported data. Verdicts distinguish old physical cardinality from admitted end-to-end support.

| Scenario                                                            | Current support / gap                                                                                                          | Proposed acceptance invariant                                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Air NZ order → two dated Flight segments                            | PARTIAL: one reservation can be pointed to by several Events; CP13B discovers multiple Flight candidates; no Booking admission | one Booking identity, two leg identities, exact per-leg date/service/evidence; no PNR-as-flight ID                       |
| Two Thrifty reservations → two cars, same pickup, different returns | PARTIAL legacy structures; MISSING Rental typed records/commands                                                               | two Rental Items, two Bookings, retained separate Dec20/Dec22 returns; pickup grouping never merges identity; due ≠ paid |
| DOC order → three Hut stays                                         | PARTIAL single FK supports one Booking→many Events; no canonical STAY typed import                                             | three continuous stays at separate places/dates, one Booking with explicitly scoped links                                |
| DOC supplement → existing Stay                                      | MISSING supported N:M Booking augmentation and match                                                                           | new Booking links exact existing Stay/base revision; no new Stay from new file/order alone                               |
| Water Taxi order → different-day return/outbound                    | PARTIAL endpoint vocabulary, no P5 writer/Booking admission                                                                    | two independent visible/clickable segment Items; shared Booking and exact service applicability                          |
| SNCF ticket → multiple train segments                               | MISSING Ticket root/link/API; table TRAIN enum not command support                                                             | one ticket/original, links to each actual segment; segment time/seat applicability retained                              |
| Group Ferry ticket → multiple rights/users                          | MISSING group entitlement/access policy                                                                                        | capacity and explicit/unknown holder mapping; one original QR, no fabricated per-person tickets                          |
| Long-valid Pass → Wallet, no Items                                  | MISSING entitlement-only admission                                                                                             | no automatic dated Item; explicit later use can link existing pass without changing validity                             |
| Complex Source → multiple Items, no Booking                         | PARTIAL: CP13B Flight N:M/lineage; closed runtime                                                                              | true schedule evidence yields multiple Items, shared provenance only unless actual reservation evidenced                 |

**No case is certified real-file E2E by this audit.** Synthetic Flight and Day regression tests cover constituent safety, not these complete commercial relations. Minimum relation graph is Item↔Booking, Item/Segment↔Entitlement, Entitlement↔holder/capacity and owner-authorized Document↔objects; Ledger links are explicit and do not imply payment.

## Identity, matching and lifecycle commands

Booking identity is opaque and independent of confirmation reference, source, file or passenger. A new commercial commitment means a new Booking; same reference text without issuer/party/service evidence cannot merge. Each association must validate same Trip or an explicitly approved cross-Trip rule; this plan proposes Trip-scoped Beta objects. Unresolved evidence remains outside canonical links.

| Intent                         | Proposed minimal behavior                                                                          | Transaction/recovery                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Cancel this arrangement        | cancel Item/service applicability; shared Booking/other Items preserved                            | parent CAS + exact receipt; distinguish partial applicability from whole order cancellation      |
| Cancel entire reservation      | mark Booking canceled in OTR and explicitly selected affected associations; no supplier call       | bind complete affected-set revisions and authorization; changes conflict if graph drifted        |
| Delete mistaken Item           | reversible tombstone/hide; exclusive mistaken Booking may hide only under explicit link-aware rule | exact affected set; preserve source/history/references and never cascade Ledger                  |
| Restore                        | clear authorized tombstone while retaining original revisions/history                              | new explicit intent; do not replay stale pre-delete updates                                      |
| Replace Booking                | new Booking ID with predecessor link; stable Item only with qualified continuity                   | receipt-bound new identity and link change; unknown predecessor outcome blocks competing creates |
| Retime Flight                  | reviewed same-occurrence change through complete parent-CAS payload                                | CP13A current exact selected fields/proofs; no silent rebase                                     |
| Reschedule onto another flight | new service association/history at stable Item if continuity supported                             | do not mutate operating-flight identity into a different occurrence                              |
| Append Instructions            | new source-linked entry/amendment, never erase user correction                                     | bounded append plus correction provenance; entry visibility may be narrower than Item            |

Current `UPDATE_STATUS` supports cancelled/planned/etc. only behind CLOSED writer; it does not implement shared Booking cascades, undo or restore. Existing baseline Event/Reservation DELETE and FK cascade behavior are not the recoverable business lifecycle contract. Do not call old delete RPC/policies as a shortcut.

## Offline and reconciliation

Persist stable local identities, original command/body/key, affected object revisions and dependencies in one repository transaction before returning saved state. Local optimistic view must be separable from accepted mirrors. Two clients modifying shared Booking applicability require explicit conflict or deterministic non-overlapping merge; do not use silent LWW for cancel/replace, privacy or evidence-bearing changes.

Server transaction is atomic for supported aggregate changes with one receipt. N:M import across different objects uses an explicit result vector and dependent slots when no reviewed aggregate transaction exists. Do not promise all-file rollback by deleting committed objects. Recover exact uncertain keys after restart; missing receipt, timeout, expired lease or new Candidate are not no-commit proof. CP13A lineage, proof coverage and transitive ancestry remain mandatory.

Revocation disables new fetch and sensitive access under a defined trust policy. Retained private originals and unresolved operations cannot be purged by a UI hide. Documents retained if referenced; operational cache eviction differs from canonical deletion. Booking financial evidence stays commercial evidence; explicit Ledger actions alone create financial facts.

## Required synthetic suite

Cover all nine graphs; supplement with shared-vs-exclusive cancel/delete, graph drift conflict, response loss/replay, A→B→A generation races, revoked reader, same PNR/different issuer, user-edited schedule surviving later supplement, one ticket/no holder vs group capacity, pass/no Item, source/no Booking, preservation with FK ON/OFF and unknown slot outcomes. Private exemplars come only after separate Owner authorization; no personal names/PNRs/QR payloads enter tracked fixtures.
