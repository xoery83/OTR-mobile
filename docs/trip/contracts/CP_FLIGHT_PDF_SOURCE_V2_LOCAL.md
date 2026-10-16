# Source selectable PDF /2 — local candidate, runtime CLOSED

Owner approved local code/tests/review on 2026-10-16. This is additive; finite
OTR_PDF_LITERAL_TEXT_V1, its hashes, receipts, limits and SQL remain unchanged.
JPEG/OCR is unsupported. No new store, Repository, upload or public endpoint.

## Profile and independent derivation

OTR_PDF_SELECTABLE_TEXT_V2 selects original application/pdf bytes, 1–10,485,760
bytes, 1–32 nonempty selectable-text pages, total UTF-8 text ≤262,144 bytes.
No OCR, normalization, punctuation repair, inferred content or model invocation.
Page indices are contiguous zero-based; nonempty UTF-8 byte spans cover every
page in order, separated by exactly one LF. Hash the entire original, entire
UTF-8 text and canonical page map. Retain exact source/account/Trip/representation
scope supplied by the existing owning Source custody reader. A fresh read after
extraction must still match the original pin. Client-supplied text, MIME, decode
success, page maps and claimed producer never constitute Source authority.

Reuse the existing production FlightPdfExtractor implementation in a separate
Mac process as the **local independent derivation component**, not a trusted
Source verifier. The local operator reads retained bytes and passes owned bytes;
the App's saved PDFKit output is never an input. The subprocess receives no
credentials, no model operation and no network request. Bound wall time20s,
stdout/stderr1MiB each, kill on timeout/output overflow, wait for process closure;
no surviving-child/OS-resource/sandbox guarantee is claimed. Existing Swift limits
apply before/while producing text; parsing may allocate before page-count checks.

## Explicit authority boundary

PDFKit parses and extracts text, but does NOT prove complete consumed container
structure, safe object/xref/stream expansion, absence of active/external/embedded
content, bounded decoder memory/CPU, or a reviewed deployment binary/sandbox.
A local derivation therefore always has grantsSourceAuthority=false and
runtimeStatus=BLOCKED_TRUSTED_DECODER. It is not VERIFIED, DERIVED registration,
a seal, a Core proof or Candidate admission. There is intentionally no constructor
that turns this result, a Boolean or a caller's attestation into one of those.

The subsequent production slice should select one executable versioned
decoder/producer profile, independently reread exact Source custody and reproduce
exact text/page mapping, then integrate with the existing retained-read,
registration and fresh seal path. The selected implementation and its evidence
determine its resource limits; this local candidate defines no additional future
numeric limits or universal sandbox/complete-container approval checklist.
The result's missingProofs describe limitations of this particular PDFKit local
component, not newly approved requirements for every producer. Unsupported,
encrypted, scanned/empty-page, malformed, resource-failed or mismatched material
fails closed. Diagnostics contain fixed codes, no raw errors or text.

After trusted runtime proof and separate protected authorization, reuse the
existing ACQUIRE/UPLOAD_ORIGINAL→independent retained GET→VERIFY→registerDerived→
fresh seal→Core path, including same-operation recovery, current ownership/CAS
and full original roster. Existing exact Source storage key remains unchanged;
Capture custody object is not an alias. No current /1 registration/seal validator
or SQL guard accepts /2. Future forward-only SQL/profile/producer/gate changes,
Hosted deployment and actual Provider IO require their separate reviewed packet.

Local adapter: backend/src/sourcePdfV2Local.ts. It only consumes the existing
SourcePdfCustodyReader plus an independently composed decoder, validates exact
pins with existing flightPdfExtraction validation, and returns a non-authoritative
derivation. Optional CLI scripts/source-pdf-v2-local.ts uses the existing Swift
runner's extract operation only. Its output directory is private; originals and
full extraction stay outside Git. No fixture test is Runtime/Source proof.

## Local registration preparation (2026-10-17)

`backend/src/sourcePdfV2RegistrationLocal.ts` composes the existing independent
local verifier with exact Source scope, retained ORIGINAL metadata, its row
revision, and a version-2 request draft using existing Source identity fields.
It rejects a Capture custody key, mismatched Source/representation, duplicate
original/derived ID and unexpected metadata before reader I/O. It independently
reads and rereads the pinned bytes, then returns the exact text/page mapping and
a domain-separated **preparation** digest. The output is not a verification,
registration, seal, authority or accepted Candidate; old `/1` consumers reject it.
No receipt IDs are fabricated. Supplied metadata cannot establish authorization.

This prepares a concrete registration body for review; it does not select or
approve a trusted producer. Production composition still needs a reviewed `/2`
producer/profile, authenticated current Source context, a real owning VERIFY
receipt and `/2` registration/seal writers. The current preparer has no DB, upload,
network, route, queue or writer port and cannot install itself at startup.
The existing `/1` verification/registration/seal functions remain unchanged.
