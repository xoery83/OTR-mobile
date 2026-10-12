# Core ordinary ordering → TTR input /1

CP04A3-CORE-ORDER-02. CLOSED isolated implementation; Owner Review pending.
Implements the corrected CORE-ORDER-01 and AUTH-01 Revision 2 contract.

## Authoritative carrier and command

`trip_person_ordinary_orders` holds one private, revisioned ordinary branch per
Trip/Person. `SET_ORDINARY_ORDER` uses the existing Core v2 command envelope,
MANUAL admission, ORDER target, CAS base vector, operation UUID and exact receipt.
Only the actor bound to the active participating Person may author it. Trip,
read permission and Person applicability are checked for every referenced Item.
No shared-author permission or automatic sequencing is introduced.

Payload: `{personId, branchId, nodes, gaps}`. Each node is
`{eventId, entry, exit}`; roles are START, END, ENTRY, ORIGIN, DESTINATION or null.
Each consecutive gap is `{from, to, coverage, transportId, complete}`.
Coverage is NONE_PROVEN, EXPLICIT_TRANSPORT or UNKNOWN. Known coverage requires
an explicit complete declaration; only EXPLICIT_TRANSPORT accepts a Transport
Item ID. Each leg may cover one gap and cannot also be a node. Duplicate Event
UUIDs are rejected. Nodes are limited to 30; the existing 32-entry command base
vector also bounds total referenced nodes/legs plus ORDER. Every referenced Item
must have an exact ITEM base revision. Order resubmission edits the whole finite
carrier under CAS; it does not write any Item.

`core-visit/1:<Event UUID>` is the edit-stable one-visit token. Reschedule preserves
it. Explicit branch rebinding changes traveller authority; Person is immutable.
Repeated visits to the same UUID, split/rejoin and cross-day relations are deferred.
DayRow keys are presentation anchors, never occurrence identity or order authority.

## Read2 negotiation and privacy

Existing authenticated collection accepts `X-OTR-Ordinary-Order-Version: 1`.
Transport call: `collection(context, 1)`; owning read call:
`collection(actor, tripId, 1)`. The response retains read2 and adds manifest
`ordinaryOrderVersion: 1`, an ORDER roster and ORDER records. Default collection
retains the seven original rosters and omits ORDER. Unsupported negotiation fails.

The owning full graph qualifies gap completeness before actor projection. Hidden
intermediates become a generic UNKNOWN gap without their UUID, count, endpoint or
Source evidence. Unplaced applicable Items that could belong to the relation day
prevent a completeness claim. Unknown date/zone cannot exclude such an Item merely
by visual position or schedule sort. This can fence all plausible day spans when
its authoritative position is absent. Placed unresolved nodes fence incident spans;
other independent qualified pairs remain usable. Relation-specific accepted
Transport coverage prevents an additional ordinary movement suggestion.

SQLite56 atomically mirrors negotiated ORDER records with the existing accepted
collection/certificate. A default unnegotiated collection preserves physical ORDER
rows but disables their authority via certificate version 0. No second sync lifecycle.

## Local read and checker

`repository.readTtr(context, orderId, fromEventId, toEventId)` owns the existing
Account gate and serialized SQLite transaction. It returns `otr-core-ttr-input/1`
with QUALIFIED input, opaque authorityKey and spatial assessment, or typed UNAVAILABLE.

Inside a caller-owned Account gate and transaction, use
`ttrWithinTransaction(...)` and
`revalidateTtrWithinTransaction(context, orderId, fromId, toId, capturedQualifiedResult)`.
Neither reacquires a gate/transaction or calls public acceptedSnapshot. Revalidation
compares current authority, input and spatial assessment, including Account/Trip,
generation, access/certificate revisions, Person binding, branch/order revision,
Item semantic revisions, operative endpoint/location revisions and time facts.
Collection refresh can conservatively invalidate otherwise unchanged qualifications.
Offline accepted snapshots remain readable; an active refresh/access mismatch fails
closed. Unknown B ENTRY date/zone is non-destructive UNAVAILABLE. Core never deletes
personal selections, route caches, ETA or presentation state.

## Endpoint and spatial qualification

Transport EXIT is DESTINATION/arrival; ENTRY is ORIGIN/departure. P1/P6 POINT
root-site endpoints use START; accepted P6 ENTRY is supported for entry. Unproven
multi-location exits and other unsupported mappings return unavailable. Both
boundaries require the same accepted local date and valid IANA zone for ordinary
Beta qualification. B ENTRY supplies expiry. Exact comparable backwards boundaries
fail; imprecise time never fabricates an instant or mode. Flight connections remain
deferred. Accepted coordinate pairs qualify without Place ID; TTR also requires
location-input revision. TEXT_ONLY/pending/inferred coordinates are not promoted.

Spatial assessment currently returns equivalence UNKNOWN and GEOMETRY_ONLY,
with accepted operative terminal/entrance/access annotations. Existing Core has no
accepted operative equivalence carrier: coordinate equality, proximity or shared
venue ID cannot prove SAME_LOCATION. Core sets no trivial-distance threshold.
A real TTR adapter must preserve this assessment and semantic exceptions before
presentation suppression; the existing synthetic consumer is unchanged.

## Invalidation and runtime boundary

Insert/delete/cancel, participation edits, reschedule, endpoint edits, branch
rebinding and access changes are observed through existing owning collection
revisions and fresh local qualification. Completeness is recomputed from accepted
facts; no inference from order_index, DayRows or timestamps. There is no automatic
planning-operation hook because current operations establish no authoritative
personal order; explicit SET_ORDINARY_ORDER is the sole new authoring command.
Hosted installation, runtime command activation, G2/TTR real-data adapter, Provider,
paid LLM, Production and unrestricted Native activation remain CLOSED.
