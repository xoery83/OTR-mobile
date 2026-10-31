# Nelson import — staged execution plan

31 October 2026. Owner's real travel plan is not modified in this stage.

Implemented preview_trip_changes / apply_trip_changes accept at most12 explicit
Manual changes per batch. New targets derive stable UUIDs from verified Account,
Trip and retained request ID; edits retain existing Item ID and expected revision.
Preview scans bounded complete accepted Item pages for possible same-family/title
duplicates and reports identity, all changed fields, date-only/Booking uncertainty
and missing owning date-edit support. It creates no business object. Hash binds
Account/client/resource, exact prepared commands and duplicate observations.

Apply needs the exact preview hash plus trusted host user confirmation. It uses
ordinary Core commands sequentially, validates exact receipts and reports each
APPLIED/CONFLICT/REJECTED/UNKNOWN result. Stop on unresolved failure; unsubmitted
suffix remains PREVIEW with explicit reason. Repeating the same confirmed batch
queries original receipts first and never re-creates an accepted prefix. UPDATE
recovery precedes current-revision freshness; backend CAS protects a genuinely
stale unaccepted update. This is not an atomic server transaction or new queue.

Synthetic case in `mcp/fixtures/golden-slices.json`:

1. Existing registered normal QA Account1f3d; new structured Trip named explicitly
   MCP Synthetic Nelson QA 20261031, destinations Nelson and Abel Tasman,
   dates2026-12-10→13. Stable Trip creation request retained.
2. P3 synthetic unbooked lodge Dec10→13; P1 synthetic Abel Tasman walk Dec11;
   P6 synthetic Nelson gallery visit Dec12. No invented clocks, place IDs,
   reservation/ticket, route provider or paid admission.
3. Preview complete three-item set; explicit Owner-authorized synthetic confirmation;
   Apply, exact independent Supabase receipt/row/hash readback and Native passive
   downstream verification. Move only the synthetic date-only walk to Dec12 with
   its own stable operation and expected revision. Timed/qualified date moves fail
   closed until the owning temporal adapter can preserve/requalify existing facts.

First adapter Create supports P1/P3/P4/P6 date-only Manual forms; read retains all
P1–P6. SparseP2/typed P5 Create, time/zone authoring and supplemental edit fields
remain exact adapters to existing approved Core, not new model work. Their absence
must be reported, never flatten a Flight or invent a booked transport. First P3
and three-day QA evidence are not complete Nelson transport/flight delivery.

After the synthetic slice, accept Owner's actual plan as read-only input, identify
the exact existing Nelson Trip and accepted Items, propose day/type/location/time
changes, missing facts and duplicates. Show each batch; require explicit target
and operation approval before writing. Exact times and confirmation status follow
actual confirmation letters and booking emails; spreadsheet estimates remain
planned facts. Conflicting or absent evidence never becomes a booked object.
Retain the same operation set after partial
success. Do not upload original PDFs/screenshots through this Manual path: future
original-material handling reuses Universal Import Source/Interpretation/Admission.

Actual execution status is in MCP_E2E_ACCEPTANCE.md; this plan is not evidence.

## Phase 2 field adapter boundary

See MCP_NELSON_FIELD_COVERAGE.md. Extend the existing create/edit schemas and
conversion, keeping stable operations and the current receipt/confirmation/batch
logic. Explicit civil clocks follow the existing Native manual contract:
ESTIMATED/PENDING until owning qualification; local labels are retained formally,
not shifted into Notes or treated as exact instants. Preserve date-only inputs.
Support existing P3/P4 details and P5 water-taxi endpoint/check-in fields. P2
sparse create and authored details require separate formal operations; never hide
that dependency or call the first receipt a complete time-bearing Flight save.
Do not activate real Owner Apply without selected Trip + true snapshot diff +
exact operation confirmation. Existing synthetic date op remains NOT_SENT while
Native reports NOT_READY; no idle Session is retained.


## Structured review rows

Batch Preview/Apply additionally return `review` rows: each operation's typed
`proposed_change`, current legal `update_base` (UPDATE only), and possible duplicate
Item IDs from the complete bounded visible collection scan. `review_basis` names
the collection/detail basis; these sequential reads are not an atomic snapshot.
CREATE's null update_base does not assert that its deterministic target is absent.
Exact canonical operation digest, trusted confirmation, CAS and recovery remain
unchanged. A stale UPDATE base is visible and warned; no silent rebase occurs.
