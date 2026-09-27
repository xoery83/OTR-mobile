# Receipt OCR 1.0 — Phase C0 review-flow design and local semantic audit

Date: 2026-09-28
Status: Design only; no Phase C implementation authorized by this document

## Decision and boundary

Receipt OCR 1.0 helps a person confirm **Title, Amount, and Currency** in a
compact Review Sheet before copying them to New Expense. It is a
candidate-first flow. OCR and parsing never save an Expense. The existing
Expense date/default remains unchanged; parsed dates may remain available
internally but are not shown or applied in OCR 1.0. No remote AI is planned
for v1. Vision OCR, deterministic candidates, editable Review, and ordinary
manual entry work without an on-device semantic model.

This C0 decision supersedes the direct OCR-to-Expense prefill and date-field
examples in the earlier attachment design. Existing Expense attachment
storage, upload, and Save rules remain authoritative.

## Existing implementation constraints

- New Expense already has editable title/amount/currency, an existing
  searchable CurrencyPicker, currency-scale and positive-minor-unit
  validation, and a three-attachment cap.
- A2 OCR state holds only the latest document and scan immediately appends
  its temporary draft to the form's receiptDrafts. A Review cancel therefore
  needs a separate pending-scan area before promotion into form attachments.
- The parser takes one OcrDocument and assigns observation/line IDs local to
  that document. B4.2 clear is insufficient proof for automatic financial
  selection: the bounded 13-receipt set still had three wrong-clear amounts.
- Temporary image drafts have owner/Journey metadata and are recoverable.
  Their OCR text and parser results are intentionally transient. No schema or
  Backend change is needed for the proposed Review flow.

## Review Sheet state and presentation

C2 implementation detail: `ReceiptReviewState` holds the three editable values,
their `SYSTEM_SUGGESTED`/`USER_EDITED` owners, suggestion classes and bounded
candidate lists. Candidate selection is `USER_EDITED` so a later reparse cannot
silently overwrite it. The C2 Confirm contract is a transient
`ReceiptReviewResult` with Title, exact decimal Amount, Currency, session ID,
document IDs and temporary draft IDs; C4 owns applying it to New Expense.
C2 Review Cancel discards its single pending draft. Multi-part controls and
restart recovery metadata remain C3 work.

Open after the first image draft is copied and local OCR completes, fails, or
returns no text. During recognition show progress and allow cancellation.
Use one accessible modal/bottom sheet with a compact part count and exactly
three editable fields: Title, Amount, Currency. Beneath a field show at most
the useful alternative candidates in a short selectable list; a "More"
action can reveal the rest. Never show scores, confidence percentages, raw
OCR, dates, tax/line items, or technical reason codes to normal users.
Actions: Scan another part (while capacity remains), remove/retry a part,
Confirm, Cancel. Manual typing works without OCR evidence.

Conceptual state:

| Element            | Stored while sheet is live                                                                                                  | Meaning                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ReceiptScanSession | session ID, owner/Journey, up to three ordered pending image draft IDs, per-part OCR state, combined parse result, revision | Pending Review only                                                          |
| Review field       | value, SYSTEM_SUGGESTED or USER_EDITED, selected candidate ID if any                                                        | USER_EDITED includes typing, clearing, or explicitly choosing an alternative |
| Form snapshot      | Title, Amount, Currency and already selected attachments at sheet open                                                      | Restored unchanged on Cancel                                                 |

Suggested values are not canonical. A field can be blank even when candidates
exist. A small "Use detected suggestion" or "Reset to suggestion" action
returns one field to SYSTEM_SUGGESTED and applies the current combined result.
Candidate IDs are presentation references, not saved financial provenance.

### Title

Use merchant candidates as editable Title suggestions. A single useful
candidate may prepopulate the Review field; an ambiguous or suspicious
candidate is offered as a tap target without forced prepopulation. Show a
short list of alternatives when available. Manual editing and an empty field
remain possible. No merchant lookup or generated title is required.

### Amount

Show ranked, distinct positive monetary candidates as an easily tapped list,
with currency beside a candidate only when the receipt supports it. Do not
use parser clear status or numeric score alone to prepopulate: B4.2 still
has wrong-clear outputs. Prepopulation is reserved for corroborated final
evidence with no plausible conflicting value; that policy and its tests
belong to C2. Otherwise keep Amount editable and present the best candidate
as the first tap target. Choosing a candidate copies its exact decimal into
the field and marks USER_EDITED. The user can always type a different amount.
No model performs money arithmetic; validation uses existing integer
minor-unit rules and the selected currency's scale.

### Currency

An unambiguous explicit receipt code/symbol may suggest Currency and outranks
the Journey default. Bare dollar/yen does not become a proven ISO code.
With ambiguous or absent receipt evidence, show the Journey currency as a
clearly identified default/hint and any supported alternatives. Reuse the
existing searchable CurrencyPicker for the full list. Currency is always
editable. Changing it revalidates Amount precision without silently
converting the numeric value or exchange rate. If the selected amount has a
different explicit currency, show that mismatch for correction before
Confirm. A user-selected currency wins over later rescans.

C4 acceptance refinement: display ambiguous `¥` as JPY/CNY choices. OCR text
may add clearly tentative choices without changing Currency: kana suggests
JPY; Han-only text leaves Japanese/Chinese origin unresolved and offers
JPY/CNY/TWD/HKD. The user must choose and verify against the receipt.

## Multi-part evidence and edit ownership

C3 implementation: Review shows a part count and per-part Read/Remove controls,
with Scan another part gated by the shared attachment limit and active scan
status. A recovered local draft records only session ID and order; the user
explicitly resumes or discards it after restart. Review values and OCR
observations remain transient. Remove then Scan another part serves replacement
without a separate image editor.
The authorized iPhone 16 Pro passed the same-Review, combined-evidence,
USER_EDITED, removal, capacity and Cancel checks. Restart offered Resume with
both images and working per-part Read; the two temporary scan drafts were gone
after the user later exited/re-entered New Expense. C4 can now apply confirmed
values and images to the form without changing the C3 ownership rules.

One Review session may contain one to three images, limited further by
already selected Expense attachments. Every confirmed image becomes one
attachment; no PDF merge. Ordinary PDF attachments do not enter OCR.
Each pending part has a stable opaque document ID independent of array
position and OCR status, bound one-to-one to its verified attachment draft ID,
and optional in-memory OcrDocument. C1 derives the transient ID from the draft
ID so a recovered draft can be re-OCRed without a duplicate identity.
Evidence identity is document-scoped, conceptually d1:o4 and d2:o7.
Removing a part never reuses its ID during that session.

C1 should accept a ReceiptEvidenceSet of one to three documents and preserve
each document's geometry and evidence IDs. It may reuse B1 extraction per
document, but B2/B3 must rerank the **union** of candidates. Same/adjacent
line label association and metadata position must stay within one document;
global amount conflicts and matching total/payment evidence may cross
documents without cross-image duplicate-score reinforcement. A unique explicit
receipt ISO code may pair with an unmarked amount from another part only when
no receipt currency evidence conflicts. A recognized merchant on part 1 and final total on part 2 must
both remain eligible. Do not merely fill empty fields or concatenate raw
texts without document boundaries. The original single-document entry point
can delegate to this contract for compatibility. No cross-part image
alignment or line-item matching is needed.

Every add/remove/rescan increments a session revision, invalidates an
in-flight parse, and recomputes from all currently successful OCR documents.
For each field independently: SYSTEM_SUGGESTED may take the newly computed
suggestion; USER_EDITED keeps its exact value. An explicit candidate choice
counts as USER_EDITED. If that candidate's source part is removed, retain
the value but show a brief source-removed cue and let the user reset it.
Late OCR/model responses tagged with an older revision cannot modify state.
The optional semantic resolver, if ever added, follows the same ownership
rule.

## Remove, retry, cancel, restart, and Confirm

C4 implementation: Confirm validates the current Review revision and shared
attachment capacity before changing New Expense. It reclassifies the same
verified temporary image drafts as ordinary attachment drafts, applies only
Title/Amount/Currency, then discards transient OCR/session semantics. Existing
nonempty form Title/Amount and current Currency start as user-owned Review
values. The existing New Expense Save remains the only durable create/upload
entry point. Unsaved form fields still do not survive restart; confirmed image
drafts do. Device acceptance is tracked in the current-state handoff.

- Removing one part deletes only its pending draft, cancels its OCR, and
  reranks remaining documents. Zero parts leaves manual Review fields usable;
  Confirm with zero parts is allowed only if the three values validate,
  creating no receipt attachment.
- Failed OCR and no-text images remain visible as pending attachments.
  Retry reruns Vision on that verified local draft. The user can still type,
  add another part, remove it, or confirm.
- Cancel Review discards **only drafts created in that Review session**,
  clears transient OCR/parse data, and restores the pre-sheet form and its
  preexisting attachments. Picker cancellation leaves the session untouched.
- Cancel New Expense retains the existing discard-confirmation behavior and
  cleans pending Review drafts plus selected temporary attachments.
- Backgrounding cancels in-flight work and keeps the live session state if
  the process survives. After process termination, do not autoapply OCR or
  Review values. Recover verified image drafts using owner/Journey/session
  metadata, offer Resume Review or Discard, and re-OCR only on explicit
  resume. Unconfirmed edits to Review fields are transient, like other
  unsaved form edits; no OCR text or parser result is persisted. A tiny
  session ID/order addition to the existing draft record is the preferred
  recovery mechanism over a new SQLite table.
- Confirm requires nonempty trimmed Title, supported Currency, and a
  positive exact Amount valid at that currency's scale. Apply all three
  values to the New Expense form together, move the pending image drafts
  into its selected attachments, and close the sheet. It never calls Save.
  C4's explicit scope leaves Category unchanged by Confirm. Existing exact
  split values must be revalidated
  after an Amount/Currency change; Save stays blocked until valid.

## Parser v1 contract and acceptance

Formally treat Parser v1 as a deterministic candidate/evidence engine.
Reuse B1 lines/numeric/currency evidence; B2 ranked amount candidates with
exact decimals, currency, minor units, reasons and evidence; B3 ranked
merchant candidates; and separate status/warnings as hints. Date output
stays internal. The minimal contract addition is ReceiptEvidenceSet plus
document-scoped evidence IDs. Amount and merchant candidates currently lack
public IDs; C1 can expose revision-scoped candidate keys from field, value,
currency and source evidence for UI selection. Review preserves the selected
value, not the key, across reparses. A Review suggestion adapter may expose
only display values, alternatives, and evidence class. It must not treat
scores as calibrated confidence or mutate Expense. C1 tests must cover cross-part
merchant/total evidence, conflicting totals, duplicate totals, order
stability, document-local adjacency, removal and stale responses.

The previously observed three wrong-clear amounts do not require freezing
Parser B as an automatic decision engine. C2 still needs a conservative
prepopulation policy and device acceptance: no unconfirmed suggestion may
be written into the Expense form, and Review must make wrong suggestions
easy to correct.

## On-device semantic capability audit

**Feasibility:** Apple's Foundation Models framework exposes
SystemLanguageModel.default, an on-device text model with entity extraction
and structured/guided generation. OTR could send bounded Vision text/layout
and deterministic candidate IDs to a small Swift adapter and receive a
structured choice of Title/Amount/Currency candidate IDs. Using this
specific system model keeps the model request on device and can work
offline once the model is installed and ready. Guided output guarantees a
type/shape, not factual correctness; candidate-ID membership and financial
validation still need deterministic checks. Do not silently substitute
Private Cloud Compute or another remote model.

The app currently targets iOS 16.4 and also supports Android. Foundation
Models APIs begin at iOS 26, so any adapter needs an availability guard and
cannot be the baseline. The iPhone 16 Pro is an eligible device, but actual
use also depends on Apple Intelligence being enabled, the model being ready
and downloaded, region, language, and available storage. Query
SystemLanguageModel availability and supportsLocale at runtime; do not
infer model support from the phone model, OCR languages, or app locale alone.
Apple's current language list includes English, French, Simplified and
Traditional Chinese, and Japanese on applicable OS versions, but runtime
support and mixed-language receipt quality still need physical tests.
An Apple Intelligence-capable Mac can run the simulator model for
development; acceptance and latency must be measured on an actual device.
OS model revisions can change output, so an optional resolver needs
versioned prompts and repeatable local evaluations.

Apple documents a 4,096-token context window for the iOS 26 system model;
three long receipts may exceed it, especially in CJK. Pass only bounded
relevant lines/candidates, count tokens, and fall back to deterministic
Review on overflow or any unavailable/error state. Apple provides an
Instruments template for latency/token/resource profiling. No meaningful
receipt-specific latency or battery estimate is available without a spike.
The system model does not add an app-bundled model file. Other custom
on-device models would add packaging, platform, and maintenance cost.
Apple publishes Foundation Models acceptable-use requirements and normal
App Store privacy guidance. No receipt-specific App Store entitlement was
identified for SystemLanguageModel in the checked documentation; a future
implementation must verify its signing and disclosure details. Keep the
person's confirmation before any financial write. The separately documented
Private Cloud Compute entitlement is irrelevant to this local-only option.

**Recommendation:** Do not make semantic inference a dependency of C1–C4.
Consider a separate, opt-in C-semantic proof only if the deterministic
candidate Review proves too slow or error-prone in measured device use.
Limit that proof to ranking/selecting existing candidate IDs and an abstain
choice; never invent an amount or override USER_EDITED fields. Compare
human-corrected taps, false suggestions, offline availability, languages,
latency, and memory against the no-model baseline. Remote LLM integration
is excluded from OCR 1.0 because it adds privacy transfer, network
dependency, latency, and operating cost without demonstrated need.

### Authoritative sources checked 2026-09-28

- [Apple: SystemLanguageModel availability and supported languages](https://developer.apple.com/documentation/foundationmodels/systemlanguagemodel)
- [Apple: guided Swift data structures](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation)
- [Apple: multilingual support and runtime locale checks](https://developer.apple.com/documentation/foundationmodels/supporting-languages-and-locales-with-foundation-models)
- [Apple: model limits and fallback](https://developer.apple.com/documentation/foundationmodels/generating-content-and-performing-tasks-with-foundation-models)
- [Apple: offline operation and model size](https://developer.apple.com/videos/play/wwdc2025/286/)
- [Apple: eligible devices, storage, settings and languages](https://support.apple.com/en-asia/121115)
- [Apple: simulator and simulated availability](https://developer.apple.com/videos/play/wwdc2025/259/)
- [Apple: runtime profiling and sensitive traces](https://developer.apple.com/documentation/foundationmodels/analyzing-the-runtime-performance-of-your-foundation-models-app)
- [Apple: acceptable use](https://developer.apple.com/support/terms/acceptable-use-requirements-for-the-foundation-models-framework)
- Local Xcode 27.0 iPhoneOS SDK FoundationModels.swiftinterface marks
  the base API available from iOS 26.0; local app deployment target is 16.4.

## Proposed implementation slices

| Slice               | Deliverable and acceptance boundary                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1                  | ReceiptScanSession and ReceiptEvidenceSet with stable document IDs, bounded 1–3 parts, combined reranking, no UI or Expense writes; synthetic cross-part, conflict, removal and stale-result tests. |
| C2                  | Functional Review Sheet for Title/Amount/Currency, candidate alternatives and manual edits, conservative prepopulation, existing CurrencyPicker; no field write until Confirm.                      |
| C3                  | Scan another part, per-field ownership, remove/retry/no-text/cancel/restart recovery and capacity interaction; offline device tests.                                                                |
| C4                  | Confirm trio into the New Expense form and promote image drafts as attachments; validate splits and ordinary Save/restart/cancel behavior on device. No automatic Save.                             |
| Optional C-semantic | Only after measured need: an iOS 26+ local Foundation Models candidate-ID resolver behind runtime checks, with deterministic fallback and real-device quality/latency tests.                        |

**Recommended first coding slice: C1 only.** No UI, parser heuristic changes,
Backend/Production change, or final Expense visual redesign is part of C0.
