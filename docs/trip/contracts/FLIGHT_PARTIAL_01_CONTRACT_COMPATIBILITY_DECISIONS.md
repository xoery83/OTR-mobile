# FLIGHT-PARTIAL-01 — Contract Compatibility & Decision Register
**2026-10-17 · Design review, not implementation authorization**

## Approved product direction
- Minimum useful lawful admission, not full-data-or-nothing.
- PNR optional as user-facing aspiration; commercial Booking identity cannot be fabricated.
- Original source fields preserved; no guessed year/clock/timezone.
- Stable canonical Segment identities; grouped presentation does not merge records.
- Missing optional data is not a reason for repetitive Review.
- Progressive enrichment never silently overrides user-confirmed fields.
- TIME-01 floating/date-only semantics and local-first display apply.

## Decisions pending contract/code verification
| ID | Recommended resolution | Status / approval gate |
|---|---|---|
| D1 Minimum admission | Flight number + credibly linked local departure date **plus existing authorization/proof and unique identity requirements** | Owner direction; validator mapping OPEN |
| D2 No PNR | Evidence-backed Journey association separate from commercial Booking | Product recommendation; persistence authority OPEN |
| D3 Partial legs | Admit qualified segments; retain undated/unqualified legs as candidates | Product recommendation; current atomic admission compatibility OPEN |
| D4 Grouped P2 | One visual group, canonical segments remain separate, no arrival duplication | Owner direction; P2/TTR route & cross-day placement OPEN |
| D5 Review | Block only genuine identity/proof conflicts; optional enrichment nonblocking | Owner direction; existing Review taxonomy mapping OPEN |
| D6 Enrichment | Idempotent updates with field provenance and conflict review | Owner direction; existing correction API/field ownership OPEN |

## Required audit output from Coordinator
For each CP12/CP13 and P2/TTR owner contract: file path, rule/validator, present behavior, Delta impact, least-invasive change, tests, migration necessity, owning agent, evidence status. Do not treat this design note as evidence that any schema currently supports undated canonical segments or reference-less Booking.

## Suggested rollout gates
1. Inventory and source/proof safety check.
2. Minimal partial segment admission using existing contracts or explicit approved amendment.
3. Reference-less association without invented commercial booking.
4. P2 grouped presentation + NTC/floating cases.
5. Enrichment correction, review, dedup and offline regression.
6. Native screenshots for complete, partial, conflicting, cross-date and offline cases.
