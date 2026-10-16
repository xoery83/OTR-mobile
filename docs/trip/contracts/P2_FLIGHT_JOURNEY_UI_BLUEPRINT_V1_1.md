# OTR Mobile 2.0 — P2 Flight Journey UI Blueprint V1.1
**2026-10-17 | Target-state UI specification | Approval pending interface audit**

## Visual foundation
Use OTR native iOS controls, Ledger/My Trips typography and spacing, monochrome semantic icons, restrained teal primary action, compact two/three-line cards, no nested card stack. Avoid multicolored flight status decorations and oversized badges. Actual source data and permission determine visible fields. All labels below are illustrative, not asserted extracted facts.

## A. Day Feed P2 compact single-flight card
```
[plane] DL4688  ·  Flight                  [>]
        Oct 15  ·  Departure time 1:27 PM
        MDW → DTW  ·  Arrival time unknown
```
For time unknown: `Oct 15 · Time not confirmed` and existing NTC grouping. For floating time: `09:00 local · Timezone not confirmed`, never an invented UTC offset. Date unknown does not receive a fabricated Day Feed date.

## B. Multi-leg Journey group card
```
[plane] Chicago → Auckland                 [>]
        MDW · DTW · LAX · SYD · AKL
        4 flights · 3 connections
        Departs Oct 15, 1:27 PM local (MDW)
        Arrives Oct 17, 3:10 PM local (AKL)
        Some intermediate times not confirmed
```
The year in this illustration must remain **unresolved** if not supported by source/Trip context. Display one journey card only where an evidence-backed grouping exists; individual canonical segments remain separate and navigable. Do not imply PNR or one commercial Booking. Card taps use existing P2/Flight Immersive route, not a new Booking Immersive.

## C. Flight Immersive layout
1. Native back/close, title `Flight journey`, no new navigation controller.
2. Route summary + original first/last local endpoints, with local date, time, timezone only when trusted.
3. Segment list, each with flight identifier, proven route, departure and arrival data, source-confidence state and link to canonical item if admitted.
4. Unknown intermediate values show `Not confirmed` without an empty dummy timestamp.
5. Layover duration shown only where source actually supports it; label its evidence source.
6. Evidence/source affordance: tap to view document and relevant crop/section.
7. Optional `Complete details` action where editable; never gate existing admitted journey on completing the form.
8. Enrichment status is a compact inline note, not a permanent urgent badge.

## D. Review inline card
```
[!] Confirm which date belongs to DL0852
    Source: Delta journey screenshot · View evidence
    [Oct 15]  [Oct 16]  [Keep unresolved]
    [Confirm]
```
Only offer dates if supported as plausible alternatives, not invented. Review focuses on one uncertainty and reuses existing inline confirm/applying/resolved flow. Resolved review links to canonical Trip Item where created. Optional missing gate/terminal/time is not a mandatory Review.

## E. State matrix
| State | Compact card | Immersive | Action |
|---|---|---|---|
| Full single flight | Flight number, proven endpoints, local dates/clocks | Complete fields | Open |
| Date known, clock missing | NTC / Time not confirmed | No fabricated clock | Optional edit |
| Clock known, zone unknown | Local clock + timezone unconfirmed | Floating provenance | Confirm only if needed |
| Full multi-leg | Group route, count, endpoints | All qualified legs | Open |
| Delta partial four-leg | Group route + partial notice | Known endpoints, uncertain intermediate legs | Optional complete |
| Undated intermediate leg | Do not fabricate date placement | Candidate/unresolved association | Resolve if needed |
| Reference-less | No PNR displayed | Journey relation, no false Booking | Open |
| Identity conflict | Review status not silent merge | Evidence alternatives | Confirm |
| Enriched | Same item/card updated | New fields with provenance | Open |
| Cross-date/IDL | Proven local endpoint dates | Separate endpoint-local labels | No arrival duplicate |

## F. Interaction / accessibility
- Swipe in Day Feed remains owned by Day Feed; nested journey segment list must not hijack global navigation.
- Return from Immersive restores Day Feed scroll and context.
- Use native Dynamic Type and VoiceOver labels, 44pt practical targets, localization-safe two-line truncation.
- Offline and pending-sync state is truthful; lack of network does not hide legally saved local canonical items.
- No exact countdown, NOW, departure notification or layover arithmetic without trusted absolute-time basis.

## G. Implementation handoff boundary
UI Agent owns rendering, grouping visual affordances and source links after approved interfaces. Flight/Core owner owns candidate proof, grouping identity, admission, field provenance and enrichment. Coordinator owns conflict reconciliation and end-to-end verification. This Blueprint does not authorize schema changes or a new generic booking detail screen.
