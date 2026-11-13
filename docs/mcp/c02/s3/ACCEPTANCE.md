# C02-S3 — simple manual Place editing

Package MCP-C02. Level **LOCAL_CORE_RECEIPT_READBACK_PASS / HOSTED_NOT_RUN**.
No Consumer, Hosted, qualified-place or all-C02 completion claim.

Code: mcp/fieldAdapter.ts prepares existing SET_ITEM_PLACE for P1/P3/P6 simple
TEXT_ONLY label/address. Omitted address is retained, explicit null clears.
Family endpoints/rental places, qualified places and meaningful hidden/structured
place facts are not reconstructed from the lossy DTO.

mcp/mutation.ts enforces the full authorized EditBase record check inside execute,
including without the optional host preservationGuard. Fresh DTO/base/revision
must match; non-null extra place leaves, missing provenance or SOURCE/evidence
state reject. Existing Core Authority/CAS remains final. One redundant DTO read
is skipped only for PLACE; the collection+DTO full guard remains mandatory.

Core's SET_ITEM_PLACE reasserts the entire place group's MANUAL/protected field
state at the new revision. This is explicit in Preview and is NOT sparse source
preservation. Other root fields/provenance and children remain unchanged. This
scope is intentionally narrower than qualified/source/structured place editing.

Evidence: mutation.test.ts S3 real local Core Create→PLACE→simulated lost response
→original receipt recovery→same Item rev2, no duplicate POST, room/stay/time and
unrelated root/provenance preservation; full expected place receipt/readback via
goldenReadback.ts; omitted address retention then explicit-null clear at rev3.
Mandatory-guard negatives cover source state, hidden address and unavailable full
reader after Preview. Existing lossy/qualified regression remains closed.
Focused selection5 PASS; independent reviewer additionally verified stale/source
room guards (6 focused PASS), Typecheck PASS; final tiny duplicate-read skip
review NO_BLOCKER. No old S1 model/Gate/regression rerun.

Met prerequisites: existing lawful full reader, Core command/receipt, trusted
confirmation, revision CAS. Local implementation has no remaining blocker for
simple manual text places. Hosted result is NOT_RUN: S1's restricted P3 profile
does not expose field tools, and its eventual authorization does not activate S3.
Next: use this adapter only in a separately qualified/authorized field-edit slice;
keep source/qualified paths unavailable until their own preservation contract.
Event ID: mcp-c02-s3-manual-place-20261103-local-pass-001.
