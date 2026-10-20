# CP-FLIGHT-PDF-AUTH-01 Implementation Report

2026-10-12 · scoped CLOSED implementation · Owner integration pending.

Implemented a Source-owned immutable PDF derivative seal and reused the existing
Publisher2/Admission/Writer. The finite accepted profile produces two independently
qualified Flight Items through actual disposable PostgreSQL and existing read2,
SQLite54 and production Day reader. General supplier PDF support is not established.

- Branch: `codex/cp-flight-pdf-auth-01`.
- Authority implementation: `da1a8a7082a94242107172527426666f231337ba`.
- Capture catalog acceptance supplement / implementation tip: `ee7569228e61a774dcd33d22965af7d3a3933fd9`.
- Starting local/remote canonical main: `12693e3c1513d678bd3fe0190bb830d79f262b49`.
- Handoff read: local main advanced concurrently to `c0a69204fab3e663356a7f34406d580147869aeb`;
  remote remained12693e3. Increment is Day Lab; no authority code overlap. The
  current-state heading needs reconciliation at future integration. No rebase,
  main write, merge/push or concurrent checkout modification was performed.
- Exact19-path implementation manifest plus3 handoff paths (22 total):
  [CP_FLIGHT_PDF_AUTH_01_MANIFEST.json](CP_FLIGHT_PDF_AUTH_01_MANIFEST.json).
  Synthetic records/checks: [CP_FLIGHT_PDF_AUTH_01_EVIDENCE.json](CP_FLIGHT_PDF_AUTH_01_EVIDENCE.json).

## Implemented interface and authority

[Derivative authority contract /1](../contracts/CP_FLIGHT_PDF_DERIVATIVE_AUTHORITY_V1.md)
is the shared DTO/trust source for Agent A/B. Request schemas are strict; caller
JSON cannot declare a producer, conversion proof or qualification. Source backend
`createSourcePdfAuthority(connection, hash, readOriginal).seal(actor, trip, request)`
reads actual retained bytes, independently decodes and compares original hash/length,
derived text/hash/length and transform metadata before SQL commit. Source/Input/Run
identity, observed revisions and existing canonical hashes remain pinned.

Profile `OTR_PDF_LITERAL_TEXT_V1` is complete canonical PDF1.4: fixed Courier,
1–32 full pages, one printable ASCII line≤70 characters/page. Every object, stream,
xref and EOF byte is reconstructed; executable/extra objects, filters, images,
Unicode and arbitrary/Quartz output reject. Text is LF-joined, with exact zero-based
page byte ranges. The retained950-byte fixture is independently selectable in PDFKit.
No external parser, execution service, additional dependency or native trust delegation.

Additive migration `20261012000200_source_pdf_derivative_authority.sql` provides
CHECK-CLOSED gate, immutable private seal satellite, owning context/commit/lookup
functions and scoped Core read policy. No historical migration/function is rewritten.
One seal per current Source/material/derived/original-row epoch; exact same-operation
replay survives a committed lost response. Changed content or duplicate new-operation
seal rejects. Membership/Trip/Source access is checked on receipt lookup.

Core accepts only single-PDF/single-derived coverage of the complete original roster,
checks actual current custody/revisions, reconstructs profile bytes from certified
text and binds the exact seal digest into private Candidate bodies. Full page map,
whole-Source sibling/purpose coverage, airport registry and strict SOURCE_INSTANT
remain necessary. Existing UNKNOWN/REVIEW and protected manual SET/CLEAR behavior
are retained. Original TEXT follows its existing path and hashes.

Historical receipt recovery is separate from fresh qualification: LOST custody
blocks fresh catalog/admission and hides private Core audit as STATUS_ONLY; accepted
Items remain. Recovered/current custody cannot silently upgrade stale Candidate seals.
No HTTP route/startup activation or deployed binary registration is added here.

## Actual acceptance evidence

Final PDF scenario Source `8f718afe-5a9b-4108-b61c-45ff610b42ec`, Run
`7332bf6b-0ada-44c7-adc7-e52c6f89f5ae`; original PDF SHA256
`badf69a3f4607d9a7bb25da9847e38f57d76cd4a9fa98865190d8ce0d3c8e6da`.
Seal `26156f81925e908746f38da91ec07d667cbafc2583b324a368cfd01670bf8581`
binds page ranges `[0,62)` and `[63,125)` to the exact125-byte derived text.

| Candidate                              | Qualified Item                         | SQL/read2/SQLite54/Day revision |
| -------------------------------------- | -------------------------------------- | ------------------------------- |
| `afd7048e-1234-80f2-a7a7-be538ceb0ee9` | `3ab65c50-53fb-4518-9177-ffac0ded0d54` | 2                               |
| `ebefdabc-24dd-8fed-a06d-bf080ca86bb9` | `dc0f8467-8367-48be-a097-17f0a2732d70` | 2                               |

Capture reinterprets the admitted PDF/DERIVED catalog and rebuilds its publication;
Candidate IDs remain stable and Set/Run/Input catalog hashes match. Both candidates QUALIFIED; four legitimate CREATE/QUALIFY command receipts APPLIED;
Source plan COMPLETE and four associations. Same-ID duplicate import creates zero
new Items. First seal COMMIT response is actually discarded/throws; cold authority
recovers exact receipt without re-reading bytes. Four Core lost responses, collection
loss and file-backed SQLite cold offline reopen recover accepted results. Subsequent
manual protection/visibility checks deliberately advance one Item beyond revision2.

Negative assertions cover CLOSED/ACL/NOLOGIN/direct-DML/immutability, altered PDF
bytes and alternate valid PDF, altered text, forged map/producer/body, Source row/
material/original row revisions, operation mismatch/duplicate seal, wrong actor/Trip,
LOST custody and private audit redaction. Airport/ambiguous sibling REVIEW and manual
SET/CLEAR protection use existing combined tests. Other-member collection and joined
reader checks include private original, seal, Source/Run/Candidate/evidence identifiers.

Verification:

- `python3 scripts/trip/core-v2-sql-acceptance.py --pdf-authority`: PASS;
  Core85–92 plus additive PDF migration (runner label93); default/restored CLOSED.
- `python3 scripts/trip/core-v2-sql-acceptance.py --flight`: ORIGINAL TEXT regression PASS.
  Both disposable clones preserve all329 historical function definitions and clean up.
- Four focused suites /46 tests PASS: Source profile, Core Candidate publication,
  Core Source plan and Capture→Core adapter.
- Typecheck, touched-file ESLint, UI guard, backend build, formatting and staged diff PASS.
- `swift -module-cache-path /private/tmp/pdf-auth-swift-cache scripts/trip/verify-source-pdf-fixture.swift backend/src/__fixtures__/source-pdf/synthetic-roundtrip.pdf`:
  PASS, read-only PDFKit fixture check; no Native runtime activation.

SQL scenarios use the existing psql adapter against actual isolated network-none
PostgreSQL. Source root/representation fixture seeding, temporary grants and gate/
deny-trigger relaxation are test-only; they do not establish deployed binary custody,
Hosted Auth or PDF Node pg/TLS transport. No private supplier files were processed.

## Minimum integration requirements / remaining gates

Agent A: reuse the exact request/receipt DTO and fixed owning Source principal;
provision private original custody and actual Source-controlled VERIFY/CAS registration
for PDF and derived TEXT. Its bounded custody reader must read the registered object
by owning account/Trip/Source/Representation and verify exact bytes. Create the seal
before existing Run/Publisher orchestration and retain operation IDs for recovery.
Current TEXT HTTP and PNG-only binary admission do not supply this PDF custody path.
Never expose producer-private SQL commit or accept client bytes as custody authority.

Agent B: retain original identity/hash/length/revision; consume the Source-admitted
profile text/catalog and exact UTF-8 locators. Existing PDFKit/Quartz preparation stays
REVIEW. Native adaptation must not redefine DTO, transform or trust, self-certify
qualification or mint replacement IDs to upgrade an immutable REVIEW publication.
No SQLite/native schema change is made by this authority checkpoint.

Implemented and tested in isolated CLOSED scope; not integrated/deployed. General
supplier/Quartz PDF grammar, Hosted custody/principals/Auth/gates/deployment, actual
PDF HTTP/Node pg/TLS composition and Native handoff/device acceptance remain gates.
The accepted DEV ORIGINAL TEXT E2E is unblocked. Expanding conversion/trusted execution
requires separate reviewed authority; no new custody/trusted-worker deployment decision
was taken here.
