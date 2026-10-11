# G1 — Owner material decisions

Date: 2026-10-11 (Pacific/Auckland). Status: **G0/G1 audit complete; proposed changes require Owner Review.**

Implementation baseline: canonical main `5076174`, `/Users/xoery/Project/otr-mobile`. Paths below are relative to that checkout unless marked **chat-only**. Source inspected directly; no live database accessed. IMPLEMENTED describes the named capability, not blanket product readiness. Tests, runtime wiring, historical DEV evidence and real-file E2E are separate dimensions. This audit authorizes no implementation or activation.

Product P1–P6 intent is accepted for audit. The following **four** items alone need substantive Owner resolution before implementation contract freeze. Recommended choices are proposals, not consent inferred from elapsed time or this report.

| ID  | Decision and conflict                                        | Recommended minimal resolution                                                                                                                                                                                                                                                         | Impact / evidence                                                                                                                              | Gate                      |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| D1  | Single schedule authority and real Flight-instance sharing   | preserve accepted Event/root or transport-endpoint boundaries as schedule writer; typed extensions own additional attributes; Booking retains source/commercial observations. Decide whether Beta needs a shared canonical operating-instance root or only qualified lookup reuse      | B-T3A root/endpoint contract; Owner v0.2 §12 notes Booking-vs-details tension; service PK is Event-local. Prevent double writers/false merge   | W0 schema/read contract   |
| D2  | Immediate flight-number+date save vs strict Flight admission | save unqualified dated plan at stable Item identity with bounded partial intent; qualify same Item through a separately reviewed command. No qualified Flight occurrence claim and no relaxation of current EXACT/proof rules                                                          | `flightAdmission.validateFlightCommand`; v0.2 P2. Existing Capture draft/legacy create alone cannot satisfy canonical saved Flight             | W1 save/qualification     |
| D3  | Shared Item/Booking/ticket access and SELF sensitive rights  | explicit object-level visibility separate from participation; dynamic group/self defaults under versioned permitted read/certificate contract. Share operational original only through its owning access contract; do not disclose private Source or credentials merely by association | UNASSIGNED row/collection/Day checks; baseline group RLS; C-I3A private owner/current-trip access; custody design                              | W1/W2 security and mirror |
| D4  | Automatic high-confidence creation and N:M atomicity         | preserve reviewed v1; approve future narrowly deterministic automatic policy only with actual actor/proof/version/admission contract. Atomic per supported aggregate, explicit dependent partial outcomes across objects; no file-wide compensating delete                             | CP12 explicit human disposition; CP13A reviewed intent/claims; v0.2 automatic creation target. Confidence/publication is not command authority | W4 activation semantics   |

## Implementation authorization after decisions

Owner review can authorize W0 exact contract drafting first, or a bounded W1–W5 implementation once concrete contract/schema/capability changes are reviewed. It must specify whether new migrations and DEV mutation are included; this audit includes neither. Provider activation, private originals, production, deploy/merge/push and native installation require their own applicable authorization.

## Agent-owned choices, no additional review queue

Ordinary field/table/method names, file placement, finite validation grammar, internal read adapters, test helpers, additive migration allocation at integration time, and package ordering within dependencies are implementation choices. Existing product decisions on one Booking↔many Items, Ticket↔many segments, Wallet as view, cancel meaning, Ledger separation, no Other renderer and Phase2 exclusions need no repeated reconfirmation.

Missing full Flexible/F0/F1 artifacts limit conformance certification, but do not block Core fixed-item contract work. Seek those authoritative artifacts when integrating the affected adapter; do not ask Owner to redesign their lines or claim UNKNOWN as MISSING implementation.

## Review outcome

Implementation readiness: **conditional**. Blocking gaps: canonical sparse save, participation/privacy and certificate evolution, Booking N:M and lifecycle, independent entitlements/operational attachments, P3–P6 typed admission/sync and runtime convergence. Core can settle the full contract once and implement in bounded additive packages. Capture's first canonical E2E can use qualified Flight with deferred commercial dimensions; it need not await all P3–P6 renderers. Experience may continue fixture-based work. Flexible/TTR remain independent with explicit shared adapters.

**STOP at G0/G1 Owner Review.** No accepted contract, production code, database or runtime gate was changed.
