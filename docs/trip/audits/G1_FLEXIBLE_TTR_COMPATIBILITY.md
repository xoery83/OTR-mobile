# G1 — Flexible / TTR compatibility

Date: 2026-10-11 (Pacific/Auckland). Status: **G0/G1 audit complete; proposed changes require Owner Review.**

Implementation baseline: canonical main `5076174`, `/Users/xoery/Project/otr-mobile`. Paths below are relative to that checkout unless marked **chat-only**. Source inspected directly; no live database accessed. IMPLEMENTED describes the named capability, not blanket product readiness. Tests, runtime wiring, historical DEV evidence and real-file E2E are separate dimensions. This audit authorizes no implementation or activation.

## Evidence limit

The full named Flexible contract is referenced in the Owner L1/L2 text but not found in inspected `docs/trip`, canonical architecture or relevant parallel workspace Markdown inventories. No independent Flexible implementation was certified. TTR available evidence is **chat-only** `docs/architecture/OTR_TTR_MAPKIT_FEASIBILITY_INVESTIGATION.md`; it describes provider feasibility and gated spike, not accepted route persistence. This audit reviews shared boundaries, without rewriting either workstream or verifying live provider behavior.

## Shared interface review

| Interface      | Current support                                                               | Compatibility finding / minimal adapter                                                                                                   |
| -------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Item identity  | stable canonical Event UUID + Trip + semantic_revision                        | compatible fixed-item reference; Pool/Block/Choice retain their own IDs. Extraction creates an independent Event through Core admission   |
| Date/TNS       | CALENDAR/local_date and Day nonComparable                                     | compatible dated no-time Item; undated Pool cannot be coerced into TNS. WINDOW shape alone is not a Flexible Block business root          |
| Time/timezone  | exact civil components/precision/quality/source instant, unresolved DST facts | TTR receives qualified anchors or explicit missing reason, never device-default zone or midnight                                          |
| Place          | authored text vs accepted Place/coordinates, independent transport roles      | TTR endpoint adapter accepts qualified coordinates/Place/version; unverified text permits map search, not claimed route endpoint          |
| Participation  | UNASSIGNED-only deployed source structures; dynamic group/self unavailable    | blocking for production personal Choice/route privacy. Adapter uses explicit unavailable scope, never treats UNASSIGNED as all travellers |
| Day Projection | certified saved roots/boundaries; timed/nonComparable/unresolved              | fixed events reuse read identity; Flexible content projects via separate versioned optional component, no Booking masquerade              |
| Mutation       | protected command/claim/receipt, CLOSED                                       | extracted Choice and chosen route suggestion need explicit supported Core intent; no direct canonical write                               |
| Read freshness | Account/Trip/generation + source/current-match/historical                     | TTR recommendation binds input Event revisions, place versions, requested departure/mode; stale suggestion never mutates schedule         |

## Proposed narrow compatibility ports

Use a versioned readonly fixed-item reference (Account/Trip/Event/revision, optional permitted Person scope), a qualified endpoint projection (accepted Place/coordinates, location_input_revision), and temporal observation (civil date/time/zone/quality/source instant, unresolved reason). Fields reuse existing snake_case contract meanings; adapters do not own accepted facts. Exact wire names can be chosen internally without Owner review.

Flexible owns resources/favorites, Block, Choice membership/publication and selection. Group-to-personal Choice copy transfers a selection association, not credentials/Booking/Ledger/private participants. Timeline extraction must preserve provenance with a new Fixed Item identity and explicit link; unlink/undo semantics belong to its future approved command. No prerequisite Pool row for manual save.

TTR owns route/ETA/suggestion identity, mode, provider observation/time/expiry and computation inputs. Suggestions never become P5 scheduled service merely because mode=train/ferry. User selection can propose a plan separately through supported Admission; no automatic operational truth. Missing time/place/capability yields unavailable result, preserving fixed plan and offline readability. Provider outputs are observations and may be stale.

Introduce additive optional read components/version negotiation while retaining current v1 readers. Two independent workstreams can consume stubs/fixtures now, then implement their adapters after Core facts/scope are available. Neither must synchronize a business-model rewrite with Core. Their runtime acceptance remains UNKNOWN, with participation/privacy as the common production blocker. No Flexible/TTR implementation, provider enablement or route schema is included in the minimal Core package.
