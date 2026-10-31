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
