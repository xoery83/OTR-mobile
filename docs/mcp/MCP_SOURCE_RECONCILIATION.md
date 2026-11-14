# Source reconciliation — executable candidate

`review_travel_materials` is opt-in/read-only. Client submits bounded source
inventory and extracted candidate claims with source ID/locator/certainty. No PDF,
OCR, Provider or permanent Source writer. Documents remain untrusted evidence.

`reconcile.ts` reads one verified authorized Core collection plus bounded legal Item details (max100
Items; older fixture readers retain bounded paging), then produces field coverage, proposed
CREATE/UPDATE/NO_CHANGE/NEEDS_INPUT/BLOCKED, exact identities/revisions and a plan
digest. Incomplete reads fail; no absence inference. Sequential collection/detail
reads are not an atomic snapshot; execution later rechecks base/CAS.

Only accepted amendments/user-assertion claims may supersede only an existing claim of
the same field in the same candidate. Reject cycles, missing/unreadable sources
and duplicate claim IDs. Same-level disagreement asks for input. Original and
superseding provenance remain visible. Potential duplicates require identity
choice; multiple candidates for one target cannot silently become separate edits.
Unknown fields (including embedded tool commands) are not executed or put in Notes.

Fixtures: `mcp/fixtures/nelson-assistant-materials.md`; focused cases in
`reconcile.test.ts`. These prove deterministic handling of client-supplied claims,
not AI extraction accuracy, official evidence admission or consumer acceptance.

Pending changes preserve accepted field values and expose PENDING_CHANGE separately.
An ordinary planned fact with UNKNOWN booking status is not an unaccepted amendment.
Optional missing facts do not block an otherwise valid Create; wrong-family fields
are explicit mismatches. P2 routes map to sparse Create plus a distinct follow-up
FLIGHT_DETAILS operation after real Create receipt/current read, never guessed time.
Expense-only/unrelated/unreadable inventory can contain zero Item candidates.
Authorized connected roster/Expense readers enrich review; client-provided IDs or
a document's claimed previous save never substitute for real reads.

Clock comparison normalizes canonical HH:MM:00 only for explicitly minute-precision
boundaries; exact/instant/seconds precision remains intact. This prevents unchanged
Source times from becoming spurious edits, including both flight endpoints.
