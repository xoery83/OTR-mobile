# Checkpoint 12 — Independent Import Contract Red Team Review

Date: 2026-10-05 (Pacific/Auckland).
Reviewed worktree: `/Users/xoery/.codex/worktrees/cp12-import-contract/otr-mobile-canonical`.
Branch: `codex/cp12-import-contract`.
Verified HEAD/base: `dc580e790d6e0998e97f1dc17fa05a1f50c731ee`.

**Verdict: PASS WITH REQUIRED CORRECTIONS.** Three IMPORTANT findings require
contract corrections before separate builders implement matching/commit behavior.
No BLOCKER requiring architectural redesign was found. Design coverage is strong;
this verdict grants no CP13 implementation or runtime activation approval.

## Scope and evidence

Reviewed all seven CP12 documents and the CP12 current-state insertion against
existing authorities, rather than relying on the author's coverage checklist.
Existing authorities consulted:

- `AGENTS.md`, current handoff, PRODUCT, ARCHITECTURE, DATA_MODEL, API_CONTRACT,
  OFFLINE_SYNC, ENVIRONMENT_AUDIT and the saved legacy audit. The legacy checkout
  was not accessed.
- C-I1 §§C–D/J–M: logical acquisition identity, immutable Representation, proposal
  generations and confirmation; C-I3A §§H–M: private projections, pins, immutable
  publication, output-slot uniqueness, field support and receipt recovery.
- C-I3C §§B/D and lifecycle boundaries; accepted C-I3F/C-I3H parser/execution
  responsibility. Historical pending labels do not supersede the accepted handoff.
- A1 identity vocabulary and current participation/certificate boundaries;
  B-T1/B-T3A temporal, transport and reservation contracts; B-T3C §§I/J/M/N/O;
  B-T3G collection eligibility and current B-T3I application semantics.
- CP11 Capture and Day ADRs, Account request-context/generation implementation,
  and Ledger API financial/receipt boundaries.

This is a static contract/scenario review. No provider was called, database was
opened, migration was applied, production code was changed, or runtime behavior
was tested. Only this review file is created; CP12 inputs remain unchanged.

## Required findings

### I1 — IMPORTANT: Reprocessing lineage does not fence CREATE claims across Candidate identities

**Exact location:** `TRIP_IMPORT_CONTRACT.md`, **Identity and N↔M model**, **Entity
resolution and consolidation**, and **Confirmation and commit**;
`INTELLIGENCE_PLUGIN_CONTRACT.md`, **Neutral request** and **Neutral response and validation**.

**Failure scenario:** R1 publishes flight C1, the person confirms CREATE, and the
slot becomes OUTCOME_UNKNOWN after response loss. A later model or escalation
publishes C2 for the same occurrence with predecessor C1. C2 has a new Candidate ID
and can acquire a different intended Event ID/key. An offline/incomplete target
search cannot find the uncertain Event. Checking only C2's own create claim allows
a second CREATE. A model returning two differently grouped items on retry makes
this especially dangerous. Even a known successful predecessor can be missed by
an incomplete canonical lookup unless its slot result participates in matching.

**Existing authority:** C-I3A §K protects uniqueness only for
`(candidate_id, slot_key, intended_target_kind)` and retains unknown claims;
§L requires exact recovery without a fresh object/key. B-T3C §O explicitly does
not deduplicate by Candidate/title. CP12 correctly preserves these rules, but
predecessor references alone do not extend the uniqueness protection to C2.

**Smallest correction:** Require commit preparation to inspect relevant predecessor
and consolidation-lineage output claims before enabling NEW_ITEM/CREATE. An
unresolved predecessor claim blocks a competing CREATE for the same proposed output
purpose until exact recovery or authoritative no-commit proof. A successful claim
supplies its exact target/result for existing-item assessment. Splits, merges and
truly distinct outputs require explicit reviewed lineage disposition. This is a
review/dispatch invariant; it need not introduce a new global canonical identity
or change C's existing uniqueness tuple.

### I2 — IMPORTANT: Mixed actions do not specify execution against one target revision

**Exact location:** `TRIP_IMPORT_CONTRACT.md`, **Entity resolution and consolidation**
(the “independent per-field-group outcomes” / “combined reviewed plan” rule),
**Existing-item closure and review**, and **Confirmation and commit**;
`TRIP_RESERVATION_SCHEMA_REGISTRY.md`, **FLIGHT v1: scoped fact model**.

**Failure scenario:** At E1 revision 7, one document completes arrival, augments TX's
passenger facts, and supplies a reviewed departure change. One builder produces
three UPDATE slots, all at base 7; the first succeeds and the others conflict.
Another silently substitutes revision 8 after the first succeeds. Another makes
one generic patch including booking/passenger keys unsupported by B. Restart or
partial success produces different accepted behavior despite the same review.

**Existing authority:** B-T3C §§G/M/N require parent Event CAS, participant changes
in the same Event revision/receipt transaction when eventually admitted, and no
silent rebasing of bound/attempted operations. C-I3A §§K/L require one exact domain
operation/result per slot and preserve successful partial outputs.

**Smallest correction:** Specify that field-group outcomes are assessment labels,
not automatically separate executable commands. A combined same-Event action may
use one immutable operation only where an admitted typed command supports all
selected changes atomically. Otherwise retain separate reviewed actions with
explicit dependencies and successor preparation rules from B-T3C §N; recover the
predecessor first, and require fresh review where the changed baseline invalidates
the decision. Unsupported dimensions remain deferred. Never dispatch several
prebound same-base mutations and silently rebase the losers.

### I3 — IMPORTANT: Automatic item-continuity anchors lack an admitted minimum policy

**Exact location:** `TRIP_IMPORT_CONTRACT.md`, **Entity resolution and consolidation**,
particularly “sufficient jointly consistent evidence” and “exact segment identity
or reviewed acquisition relation”; `TRIP_RESERVATION_SCHEMA_REGISTRY.md`,
**Concrete synthetic Flight cases**.

**Failure scenario:** Two providers describe NZ289 on 18 December AKL→CHC with
different passengers/PNRs and no shared ticket/segment ID. One builder interprets
the service/date/endpoints tuple as an exact segment anchor and proposes
AUGMENT_EXISTING. Another requires a supplier-issued segment identifier and leaves
UNRESOLVED_MATCH. Conversely, treating a shared acquisition relationship as
sufficient equality merges outbound and return legs in the same PDF. A codeshare
or retimed flight can also change the very time/number used by one builder's anchor.

**Existing authority:** C-I1 acquisition identity is evidence continuity, not
business identity; B Event IDs are opaque. CP12 correctly forbids type/time/PNR/hash
alone as universal keys, but it does not define which qualified combination admits
automatic SAME_ITEM under its versioned matching policy.

**Smallest correction:** Add a small normative Flight anchor/negative-evidence
matrix. State precisely whether qualified service + occurrence date + route can
establish continuity, under what coverage/uniqueness conditions, and when explicit
human continuity review is required. Define identifier namespace/leg applicability
and the handling of codeshare, supersession and contradictory dates/endpoints.
Acquisition relation can support an anchor only with independently resolved leg
continuity. Until a combination is admitted, default to POSSIBLE_DUPLICATE or
UNRESOLVED_MATCH; neither model confidence nor a new key may resolve it.

## Clarifications and policy recommendations

### C1 — CLARIFICATION: Name the boundary quality and offset-only Flight predicate

**Location:** `TRIP_RESERVATION_SCHEMA_REGISTRY.md`, **FLIGHT v1: scoped fact model**,
Occurrence departure and CREATE predicates 2–3.

“Exact departure timeline anchor” should explicitly identify whether B quality must
be EXACT or whether a resolved ESTIMATED anchor is allowed. Also define how an
explicit civil clock/UTC offset without IANA zone satisfies the predicate. B-T3A
§B keeps `supplied_offset_seconds` independent, cannot infer IANA, and distinguishes
DERIVED_CIVIL from independently accepted SOURCE_INSTANT. Do not merely label an
offset-bearing clock SOURCE_INSTANT to evade the civil resolver gate. A supported,
evidenced/user-confirmed instant path can be admitted separately with original
civil/offset evidence retained. This needs a test vector, not a new time framework.

**Arrival recommendation:** Keep arrival **expected**, with validation
**conditional on selecting a supplied arrival fact or an affected invariant**.
Do not make absent arrival universally closure-critical for CREATE. B-T3A §F and
B-T3C §J explicitly allow an unknown destination boundary; CP11 Day then projects
milestones rather than inventing an occupied interval. A proposed known arrival
needs independent date/zone/quality and ordering checks. An invalid selected
arrival blocks that action; explicitly excluding it leaves evidence/rejection
visible and does not fabricate completion. Overnight/date-line travel compares
supported instants, not local clock strings. Unresolved DST/zone remains unresolved.

### C2 — CLARIFICATION: Keep 24 hours in configurable attention policy

**Location:** `TRIP_IMPORT_CONTRACT.md`, **Urgency and attention policy**;
ADR **Consequences and gates**.

The proposed default is reasonable as an initial parameter, not a universal
contract constant. Use versioned configurable policy with explicit now, horizon,
clock provenance and evidenced deadlines. Departure is not the only deadline:
check-in or boarding can require attention sooner. Unknown clocks/zones should
produce conservative possible-window attention without inventing an instant.
Changing attention policy must not mutate evidence, matching or closure truth.
CXE can select how/when to present eligible attention under the owning policy;
it cannot change the policy's urgency determination. CP12 largely says this;
label 24 hours as a configurable default consistently.

### C3 — CLARIFICATION: Distinguish intake completion from processing quiescence

**Location:** `TRIP_IMPORT_CONTRACT.md`, **Presentation-neutral progress**, sentence
“A Batch completes … even with failed/deferred items,” and **Offline durable continuation**.

A deferred remote resolver is still resumable. A generic terminal `batch_complete`
interpretation could prevent reconnect wakeups or hide later results. Define
completion as intake/current-pass disposition, with separate outstanding/resumable
work facts, or define a completed-with-deferred summary explicitly. It must not
cancel dependencies, release evidence or imply Source IO terminality. Keep this
within existing work owners; a new queue is unnecessary.

### O1 — OPTIONAL: Add a compact cross-provider conformance table

**Location:** `INTELLIGENCE_PLUGIN_CONTRACT.md`, **Neutral response and validation**
and **Deterministic routing policy**.

The neutral boundary is sufficient for future vendor adapters. A few shared
vectors would make malformed schema, fabricated fragment, partial coverage,
changed same-request response, unavailable vision and late-cancelled response
behavior easier to verify. Same Run changed READY publication must reject under
C-I3A §J; a different provider/config needs a new linked request/Run. Provider
idempotency, installation idempotency and billing replay remain distinct.

## Adversarial scenario results

| Area / attack                                                                       | Contract result and remaining condition                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One Capture reused; many Captures for one item; one Capture for twelve reservations | N↔M graph is coherent. Immutable observations feed new bounded Runs, never append to READY. I3 governs actual item continuity.                                                                                          |
| Repeated identical bytes                                                            | Capture payload dedup does not collapse acquisition/Source identity. Same-operation replay and deliberate new acquisition are distinct under C-I1/C-I3C. Useful new-document provenance can survive DUPLICATE_EVIDENCE. |
| Changed URL content                                                                 | Locator alone supports no booking facts. Fetch binds a new snapshot/Representation/revision; prior pins cannot silently advance. Fetch/multipart adapters remain future gated work.                                     |
| Email body and attachments                                                          | One logical message may eventually have several Representations and related Captures; partial/missing parts remain explicit. Current single-ORIGINAL C-I3C cannot implement this without extension admission.           |
| Different model or different Candidate Set                                          | New request/Run/version preserves earlier publication. Cross-generation canonical CREATE safety needs I1; overlapping Run scope generations alone are insufficient.                                                     |
| Outbound/return; same number different dates; unrelated simultaneous events         | Separate legs/opaque identities; type/time/PNR alone cannot merge. I3 must pin automatic continuity decisions.                                                                                                          |
| Partial Batch; one Capture fails                                                    | Successful inputs/Runs remain usable; counts/coverage do not claim all inputs succeeded. Work failure differs from closure. C3 clarifies resumable completion.                                                          |
| Context Paris; evidence London; device Auckland; viewed Day changes                 | Historical hints cannot overwrite evidence. Trip mismatch requires contextual review, not clipping, inferred device zone or proof the booking is invalid. Intake snapshot stays immutable.                              |
| Global/Share intake without Trip                                                    | Account staging/draft only; select/assign Trip before admitted Source/Run/commit. No invented unscoped Source.                                                                                                          |
| Membership changes; Account A→B→A                                                   | Fresh per-attempt Account context plus apply gate rejects stale callbacks; exact current admission/Person checks remain required. Cached roster/certificate is not access.                                              |
| Offline capture/local extraction; remote unavailable; missing critical field        | Preserve material/local results. Eligible bounded continuation waits; urgent attention can coexist with WAITING_FOR_NETWORK. Exhaustion exposes INCOMPLETE/NEEDS_REVIEW.                                                |
| Restart; in-flight request loses network; stale result                              | Durable pins, exact request/claim fences and fresh Account admission preserve intent; unknown execution does not imply safe competing attempt or cancellation. C-I3H responsibility survives independently.             |
| GPT/Claude/local disagreement; cheap model partial success                          | Observations retain contradictions; validation/closure remains OTR-owned. No age/confidence winner; PARTIAL coverage is explicit. Valid subsets need bounded immutable publication.                                     |
| Malformed constrained output; nonexistent fragment; timeout/cancel                  | Reject invalid envelope/evidence; safe failure and external execution certainty are separate. Late installation is fenced; timeout/abort does not certify resource cleanup.                                             |
| Expensive escalation offline; absent vision                                         | Capability/privacy/network/budget admission precedes routing. Wait or supported fallback; no unapproved transmission or escalation loop.                                                                                |
| Provider unavailable/no coverage/stale result                                       | Preserve usable booking evidence and prior facts; coverage/freshness are attributed. NOT_FOUND is not invalid booking/deletion.                                                                                         |
| Provider contradiction/schedule change                                              | Preserve provider and booking alternatives. Change requires scoped evidence/review/CAS, never provider overwrite. Weather/place failure cannot block otherwise resolved Flight closure.                                 |
| Financial total/deposit/paid/balance/currency                                       | Distinct Import observations and scoped Money. No implied payer, allocation, Expense, PaymentRecord, FX, Receipt or Settlement write. Future Ledger matching and explicit Ledger-owned approval remain required.        |
| CXE/adaptive presentation                                                           | May order/disclose/present attention using durable facts. Cannot redefine evidence, identity, match outcome, closure, canonical authority or financial truth.                                                           |

## Mandatory existing-item cases A–F

| Case                                                       | Required behavior supported by CP12                                                                                                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: E1 NZ289 / 18 Dec / AKL→CHC / Leon; new TX confirmation | Resolve occurrence continuity first. AUGMENT_EXISTING may add TX booking/passenger evidence to E1; no automatic duplicate Flight and no name-based Person mapping. I3 defines automatic versus reviewed continuity.                               |
| B: Three passengers, potentially three PNRs                | One occurrence can retain three independently provenanced booking/passenger groups. PNR namespace and passenger/leg applicability remain separate. No copied seat/baggage/price across people. Canonical scoped persistence is still future work. |
| C: Printed “L LI,” several plausible Persons               | UNRESOLVED_MATCH/NEEDS_REVIEW for association. Preserve raw token; select exact same-Trip Person only through explicit review/admission. A safe occurrence-only action may leave passenger evidence deferred.                                     |
| D: Arrival absent; new evidenced arrival                   | COMPLETE_EXISTING only if absence/unknown is proven at exact target base. Validate affected departure/arrival ordering and independent zones. No unrelated CREATE completeness demand.                                                            |
| E: Accepted departure 10:30; new evidence 11:15            | UPDATE_EXISTING with supported change/supersession and reviewed CAS; otherwise CONFLICT. Never COMPLETE_EXISTING or newest-source wins.                                                                                                           |
| F: New supporting document, no new fact                    | DUPLICATE_EVIDENCE preserves acquisition/provenance and may propose LINK_ONLY. C-I3A link-only has empty field support: attachment does not retroactively relabel the current accepted field origin.                                              |

A–F are conceptually coherent. Mixed cases need I2 before executable plans are built.

## Flight schema stress test

Flight number alone, or number/date alone, classifies FLIGHT but cannot CREATE READY.
Known route with unknown departure clock remains incomplete or eligible deferred
work. Unknown time is never midnight. Unknown zone/ambiguous airport remains
unresolved until supported resolution/review. Known departure without arrival can
be READY for the selected departure-based CREATE, with explicit unknown end.
Overnight and DST cases retain independent endpoints, exact precision and resolved
ordering. Cancellation is attributed source status; no automatic Event cancellation
or deletion. Changed schedule is UPDATE/CONFLICT. Open-time Flight is a preserved
partial proposal under this stricter CREATE policy; canonical B validity can still
represent partial TRANSPORT. Classification, closure READY, C Run READY, human
acceptance, sync and canonical receipt success are separate states.

## Exact future adapter/command prerequisites

CP13 cannot make a Flight canonical merely by storing a Candidate or calling the
legacy itinerary create route. Before executable Flight import, separately reviewed
work must provide:

1. **Capture-to-Source preparation:** exact Capture revision/bytes, current scope
   admission, stable acquisition replay binding and explicit new-acquisition/reuse/
   replacement intent. Use C-I3C lifecycle, verification and receipts. The read-only
   CP11 handoff supplies material, not Source admission or remote durability.
2. **Admitted proposal/support mapping:** bounded subtype/scoped fields mapped to
   C-I3A candidate kinds and approved field keys; reviewed schema/version extensions
   where needed. A dynamic booking/passenger path cannot enter B provenance maps.
   Respect 64 inputs/Candidates/fields and payload ceilings; a single oversized
   item must explicitly fail/defer rather than silently lose scoped facts.
3. **C preparation and private proof admission:** immutable reviewed Run/Candidate
   pins, fresh Source lifecycle observations, Confirmation/output purpose, intended
   Event ID, exact adapter/command/key/digest/base and selected edits. Provide the
   C-I3A/B-T3C locked read-admission interface and authenticated private projections.
4. **B TRANSPORT commands and civil resolution:** admit exact CREATE and applicable
   UPDATE_TRANSPORT shapes, both role rows even when destination time is unknown,
   approved core/service fields, endpoint proof maps, independent zones/precision,
   parent CAS and atomic domain receipt. A civil resolver needs B-T3C §H proof;
   an independent source-instant path must preserve its distinct basis.
5. **Booking/passenger capabilities:** define owning-domain scoped persistence and
   supported field commands before accepting PNR/ticket/seat/baggage augmentation.
   Existing B endpoint UPDATE does not write arbitrary commercial dimensions.
   Event Person-scope mutation requires its own admitted adapter, A freshness checks,
   and same-parent revision/receipt transaction. A SET_PARTICIPATION command changes
   Person lifecycle; it is not an Event passenger assignment command.
6. **Participant-aware read/certificate compatibility:** current B-T3G/H/I withholds
   the entire collection for ASSIGNED/WHOLE_GROUP or participant rows. Either retain
   UNASSIGNED and deferred passenger intent, or separately version/admit complete
   participant reads/fingerprints/certification and dependent projection behavior.
   A current certificate cannot certify new participant facts by scope label alone.
7. **Local intent/recovery:** lossless accepted mirror plus separate protected pending
   intent, existing queue ownership, Account fencing, exact receipt lookup/replay and
   atomic local reconciliation. C-only field support finalizes after verified domain
   success; EVIDENCE_PENDING never repeats CREATE or compensates by deleting Event.
   Apply I1/I2 lineage and mixed-action invariants.
8. **Runtime activation:** independent reviewed Source/parser/provider terminality,
   dedicated connector/principal, authorization, Event/proof/participation capability
   and deployment gates. CP12 opens none. Reservation evidence remains LINK_ONLY;
   reservation CREATE/UPDATE and new credential/booking targets need separate approval.

This lists prerequisites, not an authorization to implement all of them in CP13.
An observation-only first slice can leave them closed and explicitly report capability
blocks. Day is a derived certified read model; Import cannot write it or certify
completeness, infer absence from partial searches, or alter Ledger cursors.

## Explicit final verdict

YES below means conceptually coherent/preserved under the existing authorities;
it does not mean fully executable or free of the required corrections above.

| Required answer                                 | YES/NO |
| ----------------------------------------------- | ------ |
| Second canonical Source accidentally introduced | NO     |
| N↔M model coherent                              | YES    |
| Existing-item completion coherent               | YES    |
| Participant augmentation coherent               | YES    |
| Ambiguous Person mapping safely fenced          | YES    |
| Booking/occurrence/passenger scopes coherent    | YES    |
| Closure vs acceptance separated                 | YES    |
| Offline continuation coherent                   | YES    |
| Stale Account work fenced conceptually          | YES    |
| Plugin boundary provider-neutral                | YES    |
| LLM canonical authority leak                    | NO     |
| Data-provider authority leak                    | NO     |
| Trip/Ledger authority leak                      | NO     |
| CXE authority leak                              | NO     |
| Existing Source/Event command gates preserved   | YES    |

**PASS WITH REQUIRED CORRECTIONS.** Resolve I1–I3 in the contract before divergent
CP13+ builders implement matching/commit. Clarify C1–C3 before corresponding policy
and lifecycle code. Architecture redesign is unnecessary. Canonical commit and
runtime activation remain blocked by their existing independent gates.

**STOP — REVIEW COMPLETE.**
