# OTR Mobile 2.0 — FLIGHT-PARTIAL-01 Product Delta V1.1

**Date:** 2026-10-17  
**Status:** Owner direction captured; compatibility and engineering gates OPEN. **Not authorization for coding, schema, migration, or relaxing admission proof.**  
**Owners:** Flight / P2 domain design; implementation orchestration by Beta Coordinator.

## 1. Problem and non-negotiable product intent
Real airline screenshots may show a trustworthy multi-leg journey but omit PNR, intermediate local dates/times, or year. Example evidence: MDW → DTW → LAX → SYD → AKL; flight identifiers DL4688, DL0852, DL0041, QF0003; first departure Oct 15 1:27pm Chicago Midway; final arrival Oct 17 3:10pm Auckland; three layovers. The screenshot **does not independently establish every flight-to-leg mapping, every intermediate departure date/time, the year, or a commercial PNR**.

**Owner direction:** Admit the minimum *lawful, useful, evidenced* flight information; keep unresolved facts unresolved; progressively enrich; minimize user interruptions. Never turn a visual grouping into unproved commercial booking identity.

## 2. Identity and evidence layers
- **Source / extraction evidence:** retain the original file, spans/regions, asserted fields, confidence/provenance and version.
- **Candidate:** can be incomplete, unresolved or linked to other candidates; not a canonical Trip Item.
- **Journey association:** UI-level or evidence-backed relation between legs of one continuous itinerary; **not automatically one Booking**. Reuse existing lineage/association if available; no new table assumed.
- **Booking:** commercial booking identity only if established under existing contract; PNR is useful but optional as a *product goal*, pending validator/DB authority audit.
- **Flight Segment / Canonical Trip Item:** preserve existing canonical identity and separate segments. Grouped UI must not collapse them into one object.

### Minimum Useful Admission — proposed bounded policy (D1)
Flight number + **credibly linked local departure date** is the Owner-preferred minimum useful anchor, not a guarantee of legal admission. Before approval, the Coordinator must map required actor/Trip permission, source provenance, segment identity, date/year certainty, collision/duplicate checks, output-slot proof, confirmation authority and current CP12/CP13 constraints. Never pair an arbitrary flight number with a nearby date. Missing airport/time is enrichment, not automatically a blocker; unknown year cannot be silently inferred.

If the evidence cannot establish the minimum anchor, preserve candidate/Journey association and explain what remains unresolved. No fabricated canonical item or invented date.

## 3. Reference-less journey grouping (D2)
Allow a reference-less **journey association** when one source reliably links the route and its segments. Do not assert all legs share one commercial Booking; multiple airlines and codeshares may coexist. Commercial Booking identity and durable association must use an existing authorized mechanism or remain an open interface requirement. Group membership is provenance-backed, editable/correctable and does not cause deduplication across unrelated trips.

## 4. Partial segments (D3)
- Segment with flight number + credible local departure date: candidate for partial admission after all existing proof gates.
- Segment with date but no clock: eligible for existing **NTC** presentation after lawful admission.
- Segment with clock but unresolved timezone: retain original floating local time; do not compute UTC or exact NOW.
- Segment with no credible date: remains linked candidate/unknown-date fact, **not a fake dated canonical item** unless owning contract explicitly supports date-less canonical transport.
- An overall journey's endpoints and layovers do **not** prove all intermediate segment clocks. Duration arithmetic may support a suggestion, never a silently confirmed fact.
- Partial success must not roll back already lawful admitted segments when enrichment of another segment fails; preserve batch/lineage atomicity and existing admission boundaries.

## 5. P2 grouped presentation (D4)
One **visual Journey Card** may represent multiple linked canonical Flight Segments, with the route MDW → DTW → LAX → SYD → AKL, leg count and known endpoints. It is a presentation grouping, not a merged canonical record. Only qualified segments are clickable canonical destinations; unresolved legs are clearly labeled as pending/partial evidence. Do not show an inferred year or missing segment clock as fact.

**Day Feed placement:** keep existing Day Feed grouping, NTC and transport ordering authority. Group anchor should be a proven departure-local date of an admitted lead segment, where available. For cross-day travel, preserve the existing single canonical transport-item identity and do not create automatic Arrival Continuations. A grouped card should not duplicate canonical items across Day pages; exact cross-day discoverability remains a compatibility gate with P2/TTR.

**Immersive:** journey overview with segment rows, endpoint-local date/time and timezone where known, evidence status, layover details where supported, direct access to existing segment details, and nonblocking enrichment. Do not invent a new Booking Immersive or replace the existing P2 immersive contract.

## 6. Review policy (D5)
- **Automatic/low-friction:** proven minimum anchor, lawful admission proof, unambiguous Trip and no material conflict; no forced form to fill optional clocks/airports.
- **Nonblocking enrichment:** missing intermediate time, gate, terminal, optional airport, unresolved low-risk detail. Show small status/action only when useful; no recurring red badges.
- **Blocking Review:** contradictory flight/date association, identity collision, wrong-trip risk, ambiguous year when necessary for admission, competing booking association, permission or required proof. Present the exact question, source excerpt, direct options, and `Keep unresolved` where lawful.
- Confirming one review does not imply all segments are admitted; reuse current Review → applying → resolved/canonical link feedback.

## 7. Progressive enrichment (D6)
Enrichment sources: new user evidence, manual edits, later imports, deterministic airport/flight reference data, optional third-party flight API. Maintain original evidence and field authority; update same canonical identity through owning correction/update contracts, not blind duplicate create. Never silently overwrite user-confirmed facts. If enrichment conflicts, surface focused Review; if provider unavailable, preserve existing admitted records. Idempotency, source lineage, privacy and cost caps are mandatory. Provider selection and polling are separately scoped.

## 8. TIME-01 interoperability
Four distinct states: complete endpoint-local date/time/zone; date + no clock (NTC); date + floating clock/unknown zone; date unknown. Departure and arrival can each have different IANA zones, local dates and offsets. DST/IDL must use event date. Phone zone cannot substitute airport zone. Exact TTR, NOW, reminders and countdowns require trustworthy absolute time; ordinary P2 display does not.

## 9. Existing contracts to preserve / audit
| Contract family | Compatibility questions | Protected boundary |
|---|---|---|
| CP12 / CP13 Source, Candidate, Confirmation, Admission | Which validator demands reference, date, airport, proof, output-slot? | Do not bypass admission or weaken proof |
| Booking/Segment/Canonical identity | Can a reference-less journey association exist without fabricated Booking? | Stable canonical IDs and lineage |
| P2 Day Feed / Immersive | How are partial clocks, NTC and grouped card represented? | Reuse P2 renderers and navigation |
| TTR / transport | How are layovers, departure/arrival zones, date crossing computed? | No duplicate arrival item |
| TIME-01 | Floating, local-first, DST/IDL, mixed sort | Do not invent UTC |
| Review / Updates | Required vs optional attention; resolved link | No new parallel Review workflow |
| Flight provider / sync | Query authority, stale updates, cost, offline | No provider prerequisite for admission |

## 10. Acceptance matrix
1. Single flight with full date/time/zone: normal admission/display.
2. Flight number + proven departure date only: lawful partial admission **if gate allows**, NTC.
3. Clock given but zone unknown: floating local display; no false UTC/NOW.
4. Multi-leg journey complete: grouped P2 card and independent canonical segments.
5. Delta screenshot: no invented year/PNR/intermediate clocks; useful association and eligible partial items.
6. Intermediate leg missing date: remains unresolved candidate unless owning schema supports it.
7. Reference-less association does not imply one commercial Booking.
8. Conflicting flight/date evidence: focused Review, no silent merge.
9. Enrichment later updates same item without duplicate or silent authority override.
10. Cross-date / IDL: endpoint-local date labels, no synthetic arrival item.
11. Offline: admitted local items remain visible; pending sync status honest.
12. Return from P2 Immersive to Day Feed preserves reading position and group state.

## 11. Scope and staged delivery
**Beta candidate required:** lawful partial admission where current proof can be preserved; NTC/floating display; reference-less journey association if existing identity model permits; nonblocking Review; safe same-identity enrichment by later import/manual correction; truthful grouped display when evidence allows.

**May defer:** flight API live status, gate/terminal refresh, provider failover, advanced historical schedule lookup, auto-deduced intermediate clock, broad itinerary clustering beyond a single source. No provider-dependent admission.

### Coordinator gates
A. Read-only impact audit of CP12/13, canonical models, P2, TTR, TIME-01 and Review.  
B. Identify minimal compatible interface contract; flag schema/proof conflicts for Owner approval.  
C. Vertical slice: single partial flight, then reference-less multi-leg group, then enrichment.  
D. Native VQA across 12 scenarios and regression tests.  
Do not interrupt existing NZ5069 C5/C6 vertical slice for speculative broad redesign.
