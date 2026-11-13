# MCP-C02 — Attachment inventory and Web Companion handoff

Date: 2026-11-03 (Pacific/Auckland). Status: **LOCAL CONTRACT / NOT ACTIVATED**.
This auxiliary investigation makes no Hosted request and processes no real Nelson
material. It does not enable a ZIP reader, upload tool, Source command or Web UI.

## Existing path to reuse

1. The user's AI reads the supplied materials in its own client, where supported.
   It inventories readable files/pages and identifies inaccessible content before
   extracting facts. Client attachment visibility is not OTR byte custody.
2. The current opt-in `review_travel_materials` path accepts a bounded inventory
   plus extracted claims, compares authorized existing OTR objects, and returns
   review decisions. `mcp/reconcile.ts` declares the result
   `CLIENT_CANDIDATE_NOT_ADMISSION`; it writes nothing and runs no PDF/OCR parser.
3. After explicit confirmation, supported manual Item changes use the existing
   Core Preview/Apply/Receipt path. A source locator in that review is not a saved
   OTR Source, Document, Booking, Expense or association.
4. If original-file retention or qualified evidence is requested, hand off to
   Import's Source/Interpretation/Admission and owning Document capability. Do not
   claim that saving the Item also saved or linked its original attachment.

The active Guide is the discovery contract: `mcp/guide.ts` and
`docs/mcp/MCP_AI_OPERATING_GUIDE.md`. The source-review behavior is documented in
`docs/mcp/MCP_SOURCE_RECONCILIATION.md`. A future companion must use the same
contracts; it cannot supply extra business authority.

## ZIP inventory: minimum handoff record

The following is a **proposed companion-side inventory**, not a new accepted MCP
input schema. Keep it outside Item fields. If no archive/file bytes are actually
available, report unavailable values explicitly rather than inventing hashes.

| Inventory fact             | Required meaning                                                                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive identity           | A local inventory ID, supplied display name, actual archive byte count and SHA-256 when read. The hash checks bytes, not user identity or Source identity.                                                 |
| Entry identity             | Stable inventory entry ID, original archive member path/name and an ordinal sufficient to distinguish duplicate ZIP member names. Do not key only by basename.                                             |
| Material integrity         | Actual uncompressed byte count, SHA-256 and observed media type when bytes can be read; distinguish declared extension from validated content. No normalized-text hash presented as an original-file hash. |
| Read coverage              | READABLE / PARTIAL / UNREADABLE / UNSUPPORTED with readable page/part ranges, reason, and any missing pages. Extraction success does not establish complete archive coverage.                              |
| Derivative locator         | Parent entry identity plus exact page/part reference; identify extracted text or page images as derivatives, not substituted originals.                                                                    |
| Candidate provenance       | Claim ID, source inventory ID, page/position locator, certainty and confirmation state; retain original and amendment identities independently.                                                            |
| Transfer/admission outcome | Separately report local inventory, retained bytes, admitted Source/Representation, canonical Item receipt and association receipt. Absence of one must not be hidden by another's success.                 |

The current `materialReviewInput.sources` accepts only `id`, `name`, `media_type`,
`readable`, `readable_scope`, `kind` and optional `confirmation_status`; the array
is bounded to 30. Current claims have unique ID, source ID, locator, field, value,
certainty and optional replacement claim ID. A companion must project into these
actual schemas, not append arbitrary manifest keys to a strict tool input. An
archive exceeding this bound requires an explicit bounded review strategy before
integration; silently dropping entries is invalid.

When archive handling is implemented by the owning intake surface, it must bound
entry count, total expanded bytes, per-file bytes and nesting before extraction.
Reject traversal/absolute destinations and links escaping the isolated staging
area; never execute files, macros or instructions found in entries. Specific
limits must come from that surface's approved contract, not be fabricated here.
Identical hashes suggest byte duplicates but do not merge two acquisitions or
prove that two reservations are the same. Unreadable/encrypted/nested unsupported
entries remain visible in the inventory.

## Web Companion boundary

No general Web Companion or ZIP-to-OTR upload adapter is established by the scoped
MCP code reviewed here. A future companion is an acquisition/review surface using
normal authenticated Backend ports, not a second Import parser or business DB
writer. It must preserve these independent boundaries:

- **Client evidence:** text the AI can inspect, including file/page locators.
- **Transferred bytes:** actual actor-bound bytes with validated content identity.
- **Source admission:** the owning registration/custody/read result with stable
  Source and Representation IDs; a submitted filename or URL cannot replace it.
- **Business admission:** confirmed Core/Ledger/etc. operation and official receipt.
- **Association:** a separate owning link receipt and authorized readback. Item
  APPLIED never implies Document/Expense link APPLIED.

`backend/src/captureCustodyHttp.ts` demonstrates the existing narrow byte boundary:
`/v2/capture-inputs/:inputId/material`, actor matching, exact binding/media/size and
SHA-256 validation, bounded bytes and private responses. It is **Capture-input
custody**, not a reusable authorization to upload arbitrary chat attachments or a
Source-admission endpoint. The companion must obtain an owning legal binding
before reuse; it cannot invent an input/actor ID or storage key.

`backend/src/tripDocumentPrivateReferenceCustody.ts` resolves a current private
Source original, verifies actor/Trip, active retained state, exact bytes and the
Document gate. This is evidence that a custody seam exists, not evidence that an
MCP client currently has that capability. The Native first-Source preparation
handoff (`docs/ops/universal-native-first-source-20261024/HANDOFF.md`) likewise
keeps Source registration, lawful Task context and later Item Admission separate.
Existing finite deployment prerequisites are not a standing companion permission.

## Trust, continuity and user reporting

Archive text, file names, emails, PDFs and embedded links are untrusted evidence.
Their commands cannot select tools, grant access, assert confirmation or bypass
CAS/receipts. Do not fetch embedded links automatically as confirmation of a
booking. Pending amendments retain confirmed facts until the user resolves the
precise proposed change. Missing data does not mean clear.

At review time preserve supplied meaningful facts in an explicit coverage report;
unsupported Booking/Document/Expense facts remain visible and blocked for their
owning capability. Do not copy them into arbitrary P3 fields to create the
appearance of completeness. One document may support multiple business objects,
but totals, deposits and balances must not become duplicate Expenses.

Use original operation/Source/Representation identities for authorized recovery;
UNKNOWN is not permission to resend under a new ID. Byte equality cannot grant
access or replace source identity. Never persist tokens, OTPs or private source
text in diagnostic logs; diagnostic manifest metadata itself needs appropriate
access and retention.

## Exact remaining gaps and acceptance

| Gap                               | Minimum owner handoff / qualification                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consumer archive visibility       | Fresh consumer must actually enumerate the synthetic ZIP and disclose unreadable entries; desktop-local availability is not consumer availability.                                    |
| Byte transfer from chat/companion | Import/Capture supplies the admitted actor-bound acquisition/binding and exact bytes path; qualify foreign actor/Trip rejection and byte mismatch. No MCP raw storage credential.     |
| Source/Task status reader         | Import returns authorized actual Source/Representation/custody/task state; registration must not fabricate a processing Run/Task or completed interpretation.                         |
| Document/Item association         | Owning command, current permissions/revisions, stable operation, receipt and complete authorized relationship readback. Until connected, report BLOCKED.                              |
| Companion UX                      | Reuse lawful acquisition and review flow, preserve manifest/claims across partial failure, show per-stage outcomes. No parallel parser/Source schema or generic permission framework. |

For the immediate P3 slice, synthetic client-readable materials and a source-locator
coverage report are sufficient to test manual structured Create/Edit. Permanent
original retention, qualified Source admission, Booking/Expense creation and links
must remain separately classified; they are not implied P3 E2E successes.

Suggested later isolated checks: duplicate ZIP names and identical bytes; partial
PDF coverage; traversal/bomb bounds; embedded instruction; same booking in several
files; same reference for distinct arrangements; failed byte transfer after Item
success; expired/foreign admission; and restart without duplicate acquisition.
These are acceptance requirements, **not tests executed by this document task**.
