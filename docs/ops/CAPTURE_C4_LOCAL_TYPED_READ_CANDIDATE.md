# C4-L local typed read candidate — 2026-10-16

- Same owning C3/C4 Repository queue now accepts TEXT through bounded exact UTF-8
  decoding; PDFKit/Vision extraction and optional Apple calls are unchanged.
- `localResults` adds current-parser items/fragments/deferred/ignored observations,
  using the formal Flight item and locator schemas. Every raw field and deferred
  locator resolves to the same Input's exact UTF-8 span. Account generation,
  Input identity, original SHA/bytes and retained text SHA are checked on read.
- The projection is explicitly `CURRENT_PARSER_READ`, bound to Account/generation
  and text SHA. It neither rewrites immutable schema67 result JSON nor claims
  historical model execution. Model hints remain separate advisory evidence.
- Real retained Native component outputs: PDF3 items/20 fields; JPEG4 items/8 fields;
  exact field evidence PASS. Evidence:
  `/private/tmp/otr-c4-ios265-component-20261016/typed-read-projection-validation.json`.
  This is current TypeScript read-projection validation of previously measured
  Native output, not a new Native extraction/model or normal App/Repository run.
- TEXT queue/cold reopen, unsupported passenger deferred evidence, Apple failure
  preservation, UTF-8/BOM/limits, fingerprint rejection and Account ABA fences are
  controlled tests. No third real input or TEXT Runtime is claimed.
- Formal `interpretFlightBatch` requires an admitted Trip, Source/Representation,
  Catalog/matching scope and Run. The unassigned Account/Input Batch lacks these
  owning bindings. Source authority remains NONE; Review remains unavailable.
- No schema migration, Source/Trip/Core publication, remote inference, upload,
  Auth/session migration, Swift change or Native build. Isolated26.5 has no OTR
  login/session; normal authenticated App/Repository Runtime and physical iPhone16Pro
  validation remain pending.
