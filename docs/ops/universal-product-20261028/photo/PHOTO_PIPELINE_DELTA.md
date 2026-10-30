# Photo Pipeline Delta — 30 October 2026

Owner decision: local OCR relevance → original-image vision → existing Results,
Review, Admission and Core. PDF remains the first execution priority. This is a
bounded implementation delta, not Photo E2E acceptance or authority activation.
Baseline inspected: b2534f3d. Existing-port regression: five suites38 tests PASS.

## Actual code and minimum differences

| Area | Existing implementation | Minimum work after PDF closure |
| --- | --- | --- |
| Local OCR | `src/native/captureLocalExtractionCore.ts` uses Apple Vision, original hash/size and boxes. Empty/failed OCR currently throws. `src/native/receiptOcr.ts` exposes reusable observations/cancellation. | Reuse OCR only as a lightweight relevance signal. Empty/poor/unsupported OCR must yield UNCERTAIN at the relevance boundary, never automatic IRRELEVANT. Do not use the local flight extractor/assembly as a second Photo parser. |
| Normal input selection | `src/domain/capture/universalInputSupport.ts` currently excludes IMAGE and non-TXT files. Mixed text can continue; excluded originals remain retained. | Add per-image preparation/decision through the existing Capture lifecycle after eligibility is real; retain independent skipped/waiting/failed reasons and original order. Never flip this predicate alone to claim support. |
| Model request | `backend/src/universalProviderRequest.ts` already builds inline base64 `image_url` content and pins image-byte hashes. Limit: one image/request,4MiB. `universalModelProfile.ts` declares TEXT,IMAGE. | Reuse this port and existing provider/usage admission, retain original pixels or a qualified full-layout derivative. OCR may be supplemental, never the sole image payload. No increased limits or new provider. |
| Task qualification | `universalRegisteredTaskDraft.ts` still pins Attempt descriptor `modalities:["TEXT"]`, despite the broader model profile. | Qualify IMAGE Task/Attempt descriptors and owning scope together; profile declaration alone cannot authorize image execution. |
| Material preparation | Current Universal B_PREPARED requires a qualified preparation receipt for images; its existing image conversion is PNG→JPEG. Original JPEG has no normal prepared-image qualification wired. | Supply owning identity/safe-derivative qualification; do not forge a receipt or relabel OCR text as the original photo. Preserve original/submitted hashes and region coordinates. |
| Interpretation | Frozen compact schema already supports0–N objects and image regions tied to submitted image hash/bounds. Booking/Ticket observations remain separate. | Reuse it; no P1–P6 parser rewrite or automatic Item creation. |
| Formal save | `universalP1Source.ts` requires text spans for selected minimal facts; `readP1SourceSnapshot` and the lifecycle material contract qualify text. Image regions are not yet qualified for this normal save path. | Extend only the owning evidence/Review bridge to existing image-region semantics with exact Source/representation pins. Do not turn a visual region into an invented text offset or use Manual Save. Any new protected issuer/SQL authority needs a precise Gate. |
| Relevance/recovery | No normal three-state Photo relevance/explicit-continue workflow is wired. Current Source binding fixes one Run/Task per Batch. | Persist the per-input decision in the existing owning lifecycle; relevant may proceed under normal paid-call authority, uncertain waits for explicit continuation, irrelevant stays retained. Completed calls and UNKNOWN identities must survive recovery without new calls. A deferred image needs a legitimate owning continuation without secretly replacing the Batch or resending successful sources. No second queue/Activity system. |

## OCR-only path finding

No enabled normal Universal Photo pipeline was found that sends OCR text alone to
DeepSeek: images are currently excluded from normal preparation. The existing
`importWorkbenchRun.ts` / `captureLocalInterpretation.ts` OCR→local flight analysis
is diagnostic/local and explicitly claims no Source or Admission authority. The
separate `captureRemoteProcessingHttp.ts` seam accepts extracted-text Model Tasks,
but is optional/default closed; it must not be activated as Photo's sole formal
interpretation path. OCR_TEXT acceptance in old local/flight contracts is not
proof of a conforming Photo Save. Historical diagnostic evidence stays archived.

## Provider and cost qualification

Official DeepSeek documentation checked30 October2026 states `deepseek-flash`
accepts image content; the Models reference describes DeepSeek-V4.1-Flash with
text/image modalities. The same model ID is already used by Universal. Therefore
the smallest candidate is the existing provider, not an alternate expensive one.
Public documentation and a static TEXT,IMAGE profile do not prove current DEV
credential/model eligibility or a real image call. Authenticated DEV qualification,
registered material/profile/scope and actual usage receipts remain required.
Image tokens consume the existing budget; no increase or Secret scope change is
authorized or performed by this delta. Prefer existing inline bytes, no public
image URLs or new Files/media-storage service.

Sources: [Vision](https://api-docs.deepseek.com/guides/vision/),
[Models reference](https://api-docs.deepseek.com/api/list-models/).

## Conservative gate and acceptance order

- RELEVANT is an interpretation hint, never field extraction or Admission proof.
  IRRELEVANT requires enough affirmative unrelated-content evidence; absence of
  travel words, no OCR, low confidence or complex layout is insufficient.
- An explicitly selected image with explicit AI-analysis intent may bypass the
  relevance result, but not Source qualification, paid-call authority or budget.
  UNCERTAIN has no automatic paid dispatch. Skip retains the original.
- A: booking screenshot → OCR relevance → actual original-image request → evidence
  and user confirmation → formal save → independent readback/Native cold restore.
- B: demonstrably unrelated content → no paid request and retained original. A
  textless everyday photograph cannot be auto-classified IRRELEVANT by OCR alone;
  it is UNCERTAIN, and explicit Skip still proves zero paid requests. Cover automatic
  IRRELEVANT separately with sufficiently clear unrelated OCR content. No extra
  classifier or paid triage call is introduced to force the B result.
- C: unreliable OCR/possible travel → UNCERTAIN → explicit Continue or Skip.
  Mixed text/PDF sources continue independently. Preserve completed/UNKNOWN calls;
  never expand a completed immutable Task just to append a waiting image.

Readiness: DELTA_FIXED only. Photo relevance, image Source qualification, formal
image evidence save and actual paid Image Input E2E are NOT_READY. Do not confuse
existing OCR/preview/text-model passes with Photo E2E. Implement after PDF closure.
