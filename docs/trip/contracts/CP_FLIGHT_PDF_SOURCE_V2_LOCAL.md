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

The future trusted producer must independently reread exact Source custody,
validate the full PDF under a reviewed decoder profile, then reproduce exact
text/page mapping under a pinned executable/OS/options/resource manifest. Required
reviewed ceilings include object/xref recursion32, objects20,000, expanded streams
64MiB, metadata64KiB, memory256MiB, wall20s and output1MiB; these are deployment
requirements, **not controls enforced by this local PDFKit component**. Unsupported,
encrypted, scanned/empty-page, malformed, ambiguous, resource-failed or mismatched
material fails closed. Diagnostics contain fixed codes, no raw errors or text.

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
