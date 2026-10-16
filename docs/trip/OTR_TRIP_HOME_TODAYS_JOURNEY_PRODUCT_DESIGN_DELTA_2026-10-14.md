# OTR Trip Home — Today's Journey Widget Product Design Delta

Date: 2026-10-14
Status: OWNER APPROVED — product design; implementation requires Beta main product Chat review
Scope: Active Trip Home, Today Widget, navigation intent and conditional review preemption

## 1. Purpose and boundaries

Today's Journey is the primary Active Trip Home contextual workspace. It offers a highly visible route to today's complete Day Feed and compact, actionable, authorized information about today's itinerary. It is not a second Day Feed, NOW engine, Focus controller, or Ticket/Booking editor. It uses the shared Trip Home large-widget container (roughly 420–550 pt target on typical phones, adaptive for accessibility), top widget tags and horizontal paging. It does not alter the already approved P1–P6 renderers.

## 2. Approved decisions

| ID | Owner-approved behavior |
| --- | --- |
| HOME-TODAY-01 | Bottom Shell Day resumes the last browsed date, reading position and still-valid Focus; Today Widget explicitly opens today's Day Feed, using the same Day Feed surface. Keep the two navigation intents distinct. |
| HOME-TODAY-02 | Compact, information-rich today's command surface: prominent Open Today; primary/current-or-next relevant item; small later-today summary; conditional Ticket/Booking shortcuts and Tonight Stay. Support sparse/free days and absence of lodging. |
| HOME-TODAY-03 | Open Today always lands at the Day Header (start of the complete today view), **not** NOW, a remembered scroll offset, or an automatically opened Focus. This explicit navigation does not overwrite the Day tab's saved reading bookmark. |
| HOME-TODAY-04 | Primary and later items and Tonight Stay open their corresponding existing Immersive directly; Ticket and Maps reuse their existing authorized actions. Returning goes to Trip Home and does not modify the Day bookmark. |
| HOME-TODAY-05 | Select the primary item using today's authorized canonical items and trustworthy time facts, not a manually selected Focus from another date. Sparse/TNS/Flexible cases use neutral summaries; empty day uses a free-day state. Tonight Stay is independently conditional. Never infer actual participation. |
| HOME-TODAY-06 | Active defaults to Today's Journey as first widget. **Only** a newly imported batch that yields a review action for this user may temporarily place its Review widget first. After the user opens that Review, the next Trip Home entry returns Today to first position. Unresolved review remains available through Updates; the same batch must not repeatedly preempt. |
| HOME-TODAY-07 | One primary item, at most three later items, at most one Tonight Stay summary, and a prominent Open Today in the large fixed-height container. When content is sparse, use meaningful existing information/neutral copy rather than fake items; do not embed an infinitely scrolling timeline. |

## 3. Entry and return paths

- Trip Home > Open Today: selected Trip's local today, Day Header at top, no automatic Focus expansion, NOW remains correctly located within Day Feed.
- Bottom Shell > Day: restore per-Trip last-browsed date, valid Focus and reading position, subject to current access and data validity.
- Trip Home > individual item: direct existing Immersive, preserving item identity and actor permissions; return to same Trip Home widget without rewriting the Day bookmark.
- Ticket: use existing single-eligible direct open or chooser where applicable. Directions/Maps: existing external map intent only.
- Missing trustworthy today/Trip time context: safe honest fallback; never fabricate a date or NOW anchor.

## 4. Content selection and layout

- The header contains the current Trip-local date and an easily discoverable Open Today action.
- Primary item: prefer a relevant upcoming known-time item with the item's already approved meeting/boarding timing precedence; do not label it as actually in progress. If no trustworthy timed candidate exists, use a neutral Today’s plans summary from eligible entries.
- Later today: at most three authorized distinct canonical entries, in existing Day Feed order and respecting TNS/Flexible semantics. Do not invent times or attendance.
- Tonight Stay: derived from authorized Stay date coverage. If none or inaccessible, omit with no missing-hotel warning; if multiple, offer a truthful chooser/summary, not a guessed stay. No automatic check-in assertion.
- Conditional actions only where corresponding documents, ticket eligibility or map target and callbacks are genuinely available.
- Dense layout, restrained spacing; keep large-widget height visually consistent with other carousel pages. Dynamic Type may grow or scroll safely rather than clip.

## 5. Review preemption and ownership

This is a one-time **discovery promotion**, not a permanent unread reminder. A newly imported batch with one or more currently actionable user-authorized review units may become first in the Trip Home carousel. On opening the relevant review destination, mark that promotion as seen for the relevant user/batch (exact persistence and review-unit identity are to be resolved with Import/Updates owners). Next Trip Home entry starts on Today. Review remains actionable through Updates until resolved. A new distinct batch may cause a new one-time promotion. Background processing, ordinary successful imports, generic unread counts and unrelated updates do not preempt Today.

**Implementation dependency:** the final Review widget and promotion acknowledgement must be aligned with owning Import/Updates contracts; do not invent a parallel review system. Today's Journey baseline is independently deliverable without that promotion integration.

## 6. Acceptance scenarios

1. Day tab was on day +2 at a nonzero scroll offset; Open Today shows today's Day Header; returning via Day tab still restores the prior bookmark.
2. Clicking a featured/later item opens the same canonical Immersive, and back returns to Trip Home without changing Day state.
3. One-item day, all-TNS/Flexible day, and zero-item day remain coherent; Open Today works in all cases with a valid day.
4. No Tonight Stay does not create a warning or blank lodging section; multi-Stay does not guess.
5. Current or upcoming time label does not imply actual attendance or completion.
6. Only eligible authorized Ticket/Map controls appear; offline authorized cached facts are honest.
7. Dense day truncates to primary + <=3 later items, with full Day available from Open Today.
8. Newly imported actionable review preempts once; opening Review restores Today-first on next entry, while unresolved review remains in Updates; same batch does not repeatedly preempt; a new batch can.
9. Light/Dark, large text hot changes, Chinese/English, VoiceOver, touch targets and safe-area layouts do not clip or interfere with horizontal widget paging.

## 7. Handoff

Route first to OTR Beta main product Chat for Decision/Interface Register reconciliation, then to unified Codex Beta Delivery Coordinator. Baseline Today Widget may be queued separately from Import/Updates one-time review promotion. Do not mark unavailable owning Ticket/Booking/Photos/Review capabilities as implemented. Routine Visual QA details do not require Owner reapproval.
