# Source-owned PDF derivative authority /1 — CLOSED

Owner scope: CP-FLIGHT-PDF-AUTH-01, baseline12693e3.
Single existing Source/Publisher/Core writer. No runtime activation or generic PDF support.

First profile OTR_PDF_LITERAL_TEXT_V1 admits only canonical PDF1.4 with fixed Type1
Courier, one printable ASCII line≤70 characters per page,1–32 pages, no images,
additional objects, metadata, annotations, encryption, filters or executable content.
The Source server independently parses literal streams and reconstructs every byte,
including object roster, stream lengths and xref offsets. Any difference is REVIEW.
This decoder has no subprocess/network/native dependency and never trusts PDFKit output.
Derived text is exact page lines joined with LF; pageIndex is0-based, spans address UTF-8.
Existing arbitrary/Quartz PDFKit outputs stay unqualified; no claim of general supplier support.

Original and derived Representations must already be admitted by owning Source custody.
Agent A owns their registration/upload/VERIFY integration. This authority writes only
a private seal/receipt satellite; no direct Source/root or Canonical DML. Trusted
server-only Source command principal reads actual retained original bytes through
an injected owning custody reader, verifies exact hash/length and independently decodes.
A public client cannot submit a producer proof or flip a verifier flag. Constructors
are dormant; absent actual custody or CLOSED gate never grants qualification.

Seal /1 binds actor/Trip/Source/material revision and observed Source row revision;
original Representation ID/row revision/hash/length and VERIFIED private custody;
derived Representation ID/hash/UTF-8 length, transform key/version/options SHA;
profile digest, fixed trusted producer, complete page mapping/map digest; stable
operation ID/request hash/result hash. Immutable exact replay precedes fresh checks.
Changed operation content rejects. Lookup rechecks current membership/Source access.
Fresh qualification rechecks exact current Source/custody/representation state; old
receipts cannot revive LOST, revoked, stale or replaced material.

Core accepts certified DERIVED TEXT only when its closure covers all originals of
the Source revision. Private candidate proof binds exact seal digest. ORIGINAL TEXT
path unchanged. Publication2, purpose certificates, registry/temporal and claim guards
remain authoritative. Unsupported derivatives stay REVIEW; no client-declared authority.

Agent B must obtain the admitted derived catalog/text and its Source seal; current
apple-pdfkit metadata alone does not meet this profile. Stable IDs and existing Core
queue/finalization/read2 paths remain. SOURCE_INSTANT is never inferred from local clocks.

SQL migration/profile gate remains CLOSED/NOLOGIN. Disposable synthetic acceptance only.
Hosted binary custody, real Node pg transport and native handoff remain separate scopes.

## Versioned integration surface

Shared DTOs: `src/domain/trip/sourcePdfAuthority.ts` exports
`sourcePdfSealRequestSchema`, `sourcePdfSealSchema`, `sourcePdfReceiptSchema`
and their TypeScript types. Request has exactly:
`derivativeVersion=1, operationId, sourceId, sourceRevision, sourceRowRevision,
originalRepresentationId, originalRowRevision, derivedRepresentationId`.
Actor and Trip come from authenticated backend scope, outside caller proof JSON.
Receipt: `{derivativeVersion:1, operationId, sealSha256, body}`.
Hash domains are `otr-source-pdf-request-v1` and `otr-source-pdf-seal-v1`, using
existing newline-prefixed canonical JSON hashing. Map digest is SHA256 of exact
UTF-8 canonical JSON page array. Profile digest is
`dbd7dcc780685a57f16175a85d7161b87730874577ea1992490623508575d338`;
options digest is `618d1115d203c2d2112beb1ad185374480e2a60a4ab9682b4a985c3aec34a9b1`.

Backend-only constructor: `createSourcePdfAuthority(connection, hash, readOriginal)`;
call `seal(accountId, tripId, request)`. `connection` uses fixed owning Source
command principal. `readOriginal` receives account/Trip/Source/Representation/hash/
byteCount and must read the registered private custody object, with bounded IO,
under owning scope. It cannot accept client bytes/URL/proof as trusted custody.
No HTTP endpoint or production composition is introduced in this checkpoint.
SQL internals: `trip_source_pdf_context`, `trip_source_pdf_commit`,
`trip_source_pdf_lookup`; immutable `trip_source_pdf_seals` and CHECK-CLOSED
`trip_source_pdf_gate`. Commit is producer-private, never a client HTTP operation.
Only one seal per Source/material/derived/current Source row/original row epoch;
reuse the same operation ID for replay. A changed epoch requires a new seal and
an explicitly reviewed new Capture publication; immutable REVIEW candidates cannot
be silently upgraded by replay. Private `derivativeSeals` are added only by Core.

Agent A must first admit original PDF and derived TEXT through the existing owning
Source registration/CAS path, provision real private binary custody and establish
VERIFIED state through owning verification. This checkpoint never treats SQL fixture
seeding as deployed custody proof. Derived transform must be
`otr.pdf.literal-text` / `1`, the options digest above, exact independently decoded
text and full-page map. Produce the seal before Run/Publisher orchestration; keep
exact Source/Input/Run pins and existing lost-response operation recovery. Current
TEXT-only HTTP composition and PNG-only acquisition proof do not provide PDF custody;
extending that integration must reuse this authority and needs its own verification.

Agent B must retain original byte identity/revision, consume the admitted derived
catalog/text and exact UTF-8 locators; PDFKit output is a preview, not authority.
Existing Native `apple-pdfkit` transform / Quartz PDF is outside profile /1 and remains
REVIEW. No SQLite/native schema change is required here; handoff adaptations belong
to Agent B. General supplier support, any expanded producer/grammar and Hosted
credentials/gates/deployment remain separate decisions. First DEV TEXT E2E is unblocked.
