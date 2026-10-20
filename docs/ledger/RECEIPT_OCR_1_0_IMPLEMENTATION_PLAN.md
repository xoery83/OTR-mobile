# Receipt OCR 1.0 — Phase A0 audit and implementation plan

Date: 2026-09-28
Status: C4 Confirm-to-New-Expense integration functionally accepted

## Phase C4 — Confirm into New Expense (2026-09-28)

Review Confirm validates the current session revision, Title, exact Amount,
supported Currency, document identities and shared three-attachment capacity
before changing the form. Existing nonempty New Expense Title/Amount are shown
as user-owned Review starting values, with the current Currency, so the user
can see and edit what Confirm will apply. Confirm then updates exactly those
three form fields and transfers one to three scan image drafts into the normal
attachment collection. Date, notes, splits, category and other form inputs
remain unchanged. Existing split validation reruns from the new money fields;
Save remains a separate action.

The same temporary image files are retained. Their local recovery records are
reclassified from pending scan parts to ordinary New Expense drafts before the
in-memory form transition; a failed reclassification attempts rollback and
keeps Review open. Successful Confirm clears the OCR/session semantic state
without deleting the transferred files. Cancel Review still deletes only
Review-owned drafts. After Confirm, New Expense Cancel cleans all unsaved
drafts; Save uses the existing Expense and receipt-asset repository transaction
and upload/link queue. On restart before Save, attachment drafts recover but
unsaved Title/Amount/Currency do not, matching existing New Expense behavior.
No OCR observation is persisted, and no Backend, Production, native OCR or
Foundation Models code changed.

Parser/OCR/Review/draft/Expense/receipt repository regression passed 200 tests
in 13 files. TypeScript, affected ESLint, Prettier and diff checks passed. A
signed Release build was installed and launched on the authorized iPhone 16
Pro without clearing app data. The device owner confirmed the single- and
two-image Confirm flows, editable fields afterward, unchanged Date, and New
Expense cancellation without a saved Expense. Existing manually entered
values remained visible while OCR candidates were offered for explicit
selection, as intended. Offline Save retained one Expense and one attachment
through restart. Initial upload failed while OTR Mobile cellular data remained
disabled; bounded on-device diagnostics reported
`AUTH_REFRESH_UNAVAILABLE` for Expense create and the receipt waited for that
create. After cellular data was enabled, both durable operations completed
without duplication, and reopened Expense Detail showed one Available
attachment. The configured Dev API health endpoint returned development/ok.
Review now shows ambiguous `¥` as JPY/CNY alternatives and offers tentative
currency choices from OCR text without auto-selecting: kana suggests JPY,
while Han-only text offers JPY/CNY/TWD/HKD. A same-photo Japanese receipt
rescan on the iPhone showed the JPY hint and JPY in the Currency picker;
the temporary test draft was cancelled.
Functional UX observation for the later Expense polish phase: a user initially
expected OCR candidates to replace fields manually entered before scanning.
The current protected-field behavior was clarified and is functionally correct;
a brief Review cue could make that ownership clearer later.
Expense Detail's Open attachment currently opens the iOS share sheet; later
visual polish should show a preview first, with sharing as a separate action.

## Phase C3 — multi-part Review (2026-09-28)

The same Review Sheet can add up to three receipt images, also bounded by the
shared three-attachment Expense limit. Camera, Photo Library and image Files
reuse the existing picker/import path. Each verified image is recorded with a
transient scan session ID and order in its local recovery record. A restart
reconstructs document IDs from draft IDs and offers Resume or Discard; Resume
opens Review with explicit per-part Read, without persisting OCR text or
unconfirmed field edits.

Adding, re-reading or removing a part reparses every currently successful
document. System-owned Title, Amount and Currency can change or clear when
evidence changes; user-edited and explicitly selected values stay unchanged.
Candidate lists still refresh. A per-field Use suggestion action returns that
field to system ownership. If a selected candidate disappears after removal,
Review shows a short cue. Failed or no-text parts can be read again, removed,
or replaced by removing then scanning a new image. Removal invalidates late
OCR and deletes only that part's temporary draft; Cancel deletes all remaining
drafts from this Review session and leaves the original Expense form alone.
No Expense field, Backend, cloud, or Foundation Models behavior changed.

The parser/OCR/draft/C1–C3 suite passed 170 tests in 11 files. TypeScript,
affected ESLint, Prettier and diff checks passed. A signed Release build was
installed over the existing app and launched on the authorized iPhone 16 Pro;
the device owner confirmed the main C3 interactive flow passed: same Review,
combined amount from a second part, edited Title protected through a third,
edited Amount protected through removal, candidate refresh, full-capacity
block and Cancel preserving the original form. After force-close and restart,
Resume offered the two recovered images and per-part Read worked without a
duplicate; the images stayed until the user later exited or re-entered New
Expense. A read-only device file listing then confirmed that the two new
temporary scan drafts were removed. The two-ordinary-attachment capacity case
passed automated coverage but was not separately observed on the device.
C3 is functionally accepted for the C4 handoff.

## Phase C2 — functional Receipt Review (2026-09-28)

New Expense's explicit Scan receipt path now holds its image draft in a
transient `ReceiptScanSession` and opens a Review Sheet with exactly Title,
Amount and Currency. Ordinary Add Attachment and Edit Expense do not open it.
The sheet works during OCR, after no text, and after failure; manual entry is
always available. Cancel clears OCR/parse state and discards only the pending
scan draft, leaving existing form values and attachments untouched. The
existing currency picker is reused. No Date value is exposed or changed.

`receiptReview.ts` keeps parser suggestions separate from editable values.
Each field has `SYSTEM_SUGGESTED` or `USER_EDITED` ownership. Typing, clearing
or choosing a candidate marks `USER_EDITED`. Initial values use three product
classes: `STRONG_SUGGESTION`, `CANDIDATES_AVAILABLE`, `NO_SUGGESTION`.
Title prepopulates only a clear, reasonable merchant; alternatives remain
selectable. Currency uses a unique explicit/qualified receipt code first,
then Journey currency, then the existing default. The Journey value is shown
as a default, not OCR evidence.

Amount prepopulates only a same-line explicitly final labeled value with an
exact supported currency/minor-unit interpretation, clear parser status, no
separator/currency ambiguity and no competing strong final value. A parser
`clear` flag alone is insufficient. Weak or conflicting amounts stay blank
with selectable alternatives. Explicit candidate selection keeps its currency
association; Confirm rejects a mismatched Currency until corrected. Review
validation reuses the Expense exact integer minor-unit parser.

Confirm returns only `{ title, amount, currency, sessionId, documentIds,
draftIds }` to transient caller state. C2 does not apply it to New Expense or
save/upload an attachment. A pending confirmed scan can be reopened; explicit
New Expense discard or successful Save discards that unattached image.
C4 applies a confirmed result and image drafts to the Expense form. Optional
Foundation Models remain a separate future experiment.

The affected parser/OCR/session/draft suite passed 166 tests in 11 files;
TypeScript, affected ESLint, Prettier and diff checks passed. A signed Release
build was installed and launched on the authorized iPhone 16 Pro without
uninstalling the app. Functional screen observations are pending from the
device owner because the device screen is not reliably available to these
tools. The user confirmed all C2 checks passed with non-sensitive test images:
strong Title/Amount/Currency suggestions, ambiguous amount alternatives,
manual edits of all three fields, currency picker and keyboard, no-text manual
entry, Cancel preserving the New Expense form/attachments, and no Review from
ordinary Add Attachment or Edit Expense. C2 is accepted for C3 handoff.

## Phase C1 — multi-document evidence and transient session (2026-09-28)

`parseReceiptEvidenceSet({ documents })` accepts one to three distinct,
provider-neutral `{ documentId, document: OcrDocument }` entries. The existing
`parseReceipt(OcrDocument)` entry point and B4.2 synthetic behavior remain
unchanged. B1 extracts each image independently; the union is reranked by B2
and B3 with line adjacency, metadata position, relative line position, and
date-token counts kept document-local. All transient line, observation,
numeric, currency and token IDs are prefixed by stable document ID, such as
`d_receipt1:o4`. Evidence is never saved to Ledger data. Only a unique explicit
receipt ISO code, with no conflicting receipt currency code/symbol, may link
to otherwise unmarked amounts in another image. Journey hints alone do not
make that cross-image link.

Matching amount/merchant candidates retain evidence from all parts. Cross-image
copies do not earn B2 duplicate-final or B3 repeated-name points; conflicting
strong totals remain separate and ambiguous. This is bounded semantic
deduplication, not image overlap matching. Parser status and points remain
review hints, not automatic financial decisions.

`ReceiptScanSession` is an in-memory New Expense session with owner/Journey,
stable document IDs derived from verified temporary draft IDs, per-document
OCR state/revision, a session revision and one combined parse. Every add,
remove, replace, OCR start/completion reparses all currently available OCR
documents. Late OCR completions are ignored after retry, removal, replacement,
background suspension or cancellation. A removed draft ID cannot re-enter the
same live session; a recovered draft gets the same deterministic document ID
in a new session and requires OCR again. Session cancellation clears OCR/parse
state and returns draft references for C3 cleanup. C1 does not copy, promote,
upload or delete image files. `assertExpenseAttachmentDrafts` enforces the
shared three-attachment limit across preexisting drafts and session parts.

C2 can consume ranked candidates, evidence and ambiguity without adding
review-field ownership to the parser. C2 still needs the Review Sheet display
and conservative suggestion policy; C3 needs UI orchestration, draft cleanup,
session recovery metadata and USER_EDITED protection. No SQLite, Supabase or
Backend migration is needed for C1.

The later user-approved C0 product direction treats this parser as a
candidate/evidence engine inside a mandatory Review of Title, Amount and
Currency. That design, including its separate implementation gates, is in
docs/ledger/RECEIPT_OCR_1_0_PHASE_C0_REVIEW_DESIGN.md. The B4.1/B4.2
measurements and automatic-selection safety conclusion below are unchanged.

## Parser Phase B4.2 — safety tuning and fixed-set reevaluation (2026-09-28)

The B4.1 baseline below is unchanged. Version receipt-b4.2 made general rules
only: B1 admits integer values immediately after a bounded Chinese
final-payment label and colon; B2 limits same-line label association to a
short span with no intervening digit, treats a second plausible labeled
amount as a conflict, and requires explicit total/due/paid or reinforced
final evidence for clear status. B3 recognizes calendar-valid French
AOU/AOÛ month text and excludes common gratitude and screenshot-control lines
from merchant candidates. Existing explicit referenceDate and Journey/draft
date hints remain optional; the fixed comparison deliberately passed no new
context. Currency rules did not change because the receipts supplied no newly
proven unique code evidence. The public parser still takes one OcrDocument.

The same 14 photos were selected in the same order exactly once after tuning;
13 purchase receipts were scored and the bank-slip negative control was
excluded. All 14 returned valid Apple Vision documents. Top includes an
ambiguous top candidate; it does not imply an automatic selection. Wrong
clear counts are subsets of lower/missing/no-acceptable groups.

| Field    | B4.1 top | B4.2 top | B4.1 lower | B4.2 lower |          Correct abstention on unknown/absent truth | Known answer missing B4.1 → B4.2 | Wrong clear B4.1 → B4.2 |
| -------- | -------: | -------: | ---------: | ---------: | --------------------------------------------------: | -------------------------------: | ----------------------: |
| Amount   |        7 |        7 |          5 |          5 |  0; five known-amount cases remain safely ambiguous |                            1 → 1 |               **3 → 3** |
| Currency |  3 clear |  3 clear |          0 |          0 | 0; ten known-currency cases remain safely ambiguous |         10 → 10 lack unique code |               **0 → 0** |
| Date     |        5 |        6 |          0 |          0 |                            4 truly undated receipts |             4 → 3 dated receipts |               **0 → 0** |
| Merchant |        5 |        5 |          4 |          4 |                         1 cropped, unknown merchant |            3 → 3 known merchants |               **2 → 2** |

The French month change resolved one parser-format date miss. The recognized
two-digit date still has no candidate without the deliberately absent
referenceDate; this is caller context, not OCR. The other known date
absences need separate OCR-text triage before parser changes. One Chinese
final amount is visible in Vision text but remains absent from B1 candidates:
the remaining failure is parser extraction/geometry, not missing OCR text.
Several correct final amounts are present as lower candidates, so their
failures are B2 ranking. A dropped decimal in one OCR duplicate is extraction
noise; inventing a decimal would be unsafe. Currency abstentions reflect
insufficient or ambiguous receipt evidence. Merchant errors remain mostly
ranking/exclusion: slogans, item lines, screenshot UI, and legal/header text
can still outrank a recognized brand; some brand text is cropped or misread
by Vision. The bank slip still yields an institution-name merchant candidate,
confirming that a future document-type gate is needed.

The synthetic suite has 126 passing focused parser/OCR tests, including
invented Chinese/Japanese integer, label-distance/conflict, French month,
slogan, and screenshot-control cases. TypeScript, affected ESLint, Prettier,
git diff --check, and signed iPhone Release build passed. The local evaluation
route held results only in memory, deleted copied temporary images, and was
restarted after scoring to clear memory. No private image, OCR transcript,
or per-receipt answer was added to the repository.

Multi-part preparation is a documented extension path only. A future
ReceiptEvidenceSet can accept 1–3 OcrDocuments, prefix observation and line
IDs by document (for example d1:o4 and d2:o7), retain document-local
geometry, and rerank combined evidence across all parts. B4.2 does not
change the single-document input or add image merging/UI.

**Decision:** B4.2 did not materially reduce wrong confident amounts. Parser
B cannot be frozen as v1, and this evidence does not support beginning Phase
C field suggestions. A separately scoped safety pass must address
false-clear amounts and candidate extraction before another bounded
acceptance check.

## Parser Phase B4.1 — real-receipt blind baseline (2026-09-28)

`src/domain/receipt/parseReceipt.ts` is the pure, versioned `receipt-b4.1` entry point composing B1 extraction, B2 amount ranking, and B3 date/merchant ranking. It exposes ranked candidates, separate `clear`/`ambiguous`/`none` status for all four fields, warnings, and transient candidate evidence/reasons. No accepted parser rule was tuned against the real set. The existing B1–B3 synthetic fixtures run through the wrapper; 118 focused tests, TypeScript, affected ESLint, Prettier, and the device Release build pass.

The user authorized 14 private iPhone Photos items. Visual ground truth was recorded before parser output and the user resolved uncertain fields. Thirteen are purchase receipts; one redacted bank withdrawal slip is a negative control and is excluded from purchase-field denominators. The set spans NZ supermarket/retail and long receipts, US supermarket, Simplified/Traditional Chinese, Japanese retail/convenience, French decimal receipts, low-resolution/thermal photos, multiple monetary values, and a screenshot with surrounding UI text. A temporary local evaluation route invoked the existing Apple Vision path, displayed transient results on the phone, and deleted temporary OCR file copies. The route was removed after acceptance. No real image, OCR text, name, payment identifier, or per-receipt ground-truth value is in Git or normal logs.

The initial pass returned 12/14 valid OCR documents; two repeatable `MALFORMED_RESULT` failures occurred at the native geometry contract. `ReceiptOcrModule.swift` now clips Vision boxes to image bounds. This is an OCR contract repair, not parser tuning. With the same frozen parser and fixed photo order, the full rerun returned 14/14 documents. The following bounded-set counts use that rerun; they are **not population accuracy**. “Top” includes an ambiguous top candidate, so it does not mean an automatic selection. Incorrect confident selections are subsets of the non-top/no-acceptable groups.

| Field    | Eligible |   Correct/acceptable top | Correct/acceptable candidate lower |            Correct abstention on unknown/absent truth | Known answer absent from candidates | Incorrect confident selection |
| -------- | -------: | -----------------------: | ---------------------------------: | ----------------------------------------------------: | ----------------------------------: | ----------------------------: |
| Amount   |       13 | 7 (5 clear, 2 ambiguous) |                                  5 | 0; additionally 5 known-amount cases abstained safely |                                   1 |                         **3** |
| Currency |       13 |                  3 clear |                                  0 |           0; 10 known-currency cases abstained safely |     10 lack a unique code candidate |                         **0** |
| Date     |       13 | 5 (1 clear, 4 ambiguous) |                                  0 |            4 receipts without a reliable printed date |                    4 dated receipts |                         **0** |
| Merchant |       13 | 5 (3 clear, 2 ambiguous) |                                  4 |                           1 cropped, unknown merchant |                   3 known merchants |                         **2** |

All six amount misses (five non-top correct candidates and one absent parser candidate) had the correct value in Vision text, so their primary owner is parser extraction/ranking. In the candidate-absence case, B1 did not extract a Chinese integer near an unrecognized final-payment label. All three **incorrect confident amount** outputs had the correct amount elsewhere in their candidate lists. A duplicate OCR amount with a missing decimal in another receipt also ranked above the correctly read duplicate, but the field abstained. For currency, only three receipts supplied an unambiguous recognized code; bare `$`/`¥`, missing symbols, and national context appropriately did not become confident guesses. Of four known-date misses, two are explained parser/context gaps (a recognized two-digit-year date without explicit reference context and a recognized French month abbreviation); two remain untriaged between OCR and parser. Merchant gaps include at least five parser-owned ranking/eligibility cases with recognized brand text, plus a likely cropped/unreadable brand; one remaining miss needs OCR-versus-parser triage. The negative-control bank slip abstained on amount but produced a clear institution-name merchant candidate; document-type gating remains a later safety concern.

Observed failure categories: parser `UNKNOWN_TOTAL_LABEL`/integer extraction (1), amount `WRONG_LABEL_ASSOCIATION` or competing-payment layout (at least 3 confident errors), `NUMERIC_SEPARATOR`/OCR decimal corruption (1 non-confident case), currency `CONTEXT_INSUFFICIENT`/`AMBIGUOUS_SYMBOL` (10 abstentions), date `UNKNOWN_DATE_FORMAT` or missing explicit reference context (at least 2), merchant `GENERIC_HEADER_SELECTED`/`TOP_LAYOUT_COMPLEXITY`/brand placement (multiple), and `OCR_MERCHANT_ERROR` where the brand was cropped or misread. The initial `MALFORMED_RESULT` category affected 2 images and was eliminated by native box clipping. No image preprocessing or language tuning was attempted. Vision revision 3 took approximately 139–561 ms per image (median about 238 ms); the two long NZ receipts yielded 64 and 97 observations. The low-resolution Chinese and French images yielded readable monetary text; the screenshot's non-receipt UI text contaminated merchant ranking. EXIF rotation was not established by this set.

### Proposed B4.2, ordered by safety impact

| Priority | Evidence and owner                                                                                           | General change to evaluate                                                                                                                                                               | Regression fixture needed                                                       | Risk                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1        | 3 incorrect confident amounts; B2                                                                            | Require stronger final-payment/value association and abstain when another plausible total or separator interpretation remains; never promote a weak integer solely by proximity.         | Invented conflicting tender/final-value, decimal-comma, and yen-marker layouts. | Medium: may reduce answer rate.                         |
| 2        | 1 missing Chinese integer candidate plus several non-top correct totals; B1/B2                               | Recognize a bounded set of final-paid/current-price integer label relationships, preserving negative quantity and change evidence.                                                       | Invented Chinese final-paid integer with quantity/change distractors.           | Medium: could admit non-money integers.                 |
| 3        | At least 4 merchant rank/availability gaps and 2 wrong clear merchants; B3, with OCR triage for cropped text | Suppress slogan, item, address, and surrounding screenshot UI text; accept an OCR-recognized brand outside the strict header only with strong evidence. Preserve abstention on ties.     | Invented brand+slogan, footer brand, and screenshot overlay cases.              | Medium to high: generic text may resemble names.        |
| 4        | At least 2 explained date gaps; B3/context caller                                                            | Pass an explicit deterministic reference date for two-digit years; add only calendar-validated French month abbreviations observed in this set. Triage the two other dated misses first. | Invented two-digit rollover and French abbreviated-month receipts.              | Low to medium: ambiguous date order must still abstain. |
| 5        | 10 currency abstentions; B1/context                                                                          | Investigate explicit local-language currency words and document evidence before adding any inference. Keep bare symbols unresolved.                                                      | Invented `$`/`¥` cross-country conflict and explicit word variants.             | High if country is inferred from language alone.        |

B4.1 stops here. No Expense prefill, final OCR UI, Backend/cloud path, or broad B4.2 tuning was added. The three confident amount errors mean Phase C field suggestions should not proceed before a separately approved B4.2 safety pass.

## Parser Phase B3 — transaction date and merchant candidates (2026-09-27)

`src/domain/receipt/receiptParserB3.ts` exports pure `parseReceiptDateMerchantB3(ReceiptDocumentB1, ReceiptParseContextB3?)`. It reuses B1 lines, normalized boxes, and transient observation/line/span evidence. Its `receipt-b3` result keeps ranked ISO calendar dates and OCR-recognized merchant display names separate, with integer semantic scores, reasons, `clear`/`ambiguous`/`none` status for each field, and warnings. No source image, Expense state, persistence, native call, or network is involved. Scores are ranking points, never probabilities.

Date extraction covers `YYYY-MM-DD`, `YYYY/MM/DD`, day/month or month/day slash, dash, and dot forms, English month names in either order, and Chinese/Japanese `YYYY年M月D日`; adjacent time is ignored. Every candidate passes exact UTC calendar validation without timezone inference. Four-digit years are bounded to 1900–2099. A two-digit year is accepted only with a valid explicit `referenceDate` and a unique 1900/2000 interpretation within 20 years; otherwise it is omitted. Numeric dates such as `03/04/2026` preserve both valid interpretations. Optional Journey range, draft date, and locale give bounded ranking hints, never rewrite receipt text or hide the alternative. Transaction/purchase/sale/payment/receipt date labels in English and initial Chinese/Japanese variants are positive; expiry, promotion, DOB, statement period, hotel check-in/out, and explicitly printed/generated labels receive penalties. Same-line date labels attach to the nearest date; a tightly adjacent label-only previous line may also provide evidence. A unique unlabeled date can rank clearly when calendar, position, and OCR evidence are sufficient. Conflicting distinct explicit transaction dates abstain even when context favors one. Stable date reasons are the exported `DateReasonB3` union, including `VALID_CALENDAR_DATE`, explicit/date labels, bounded context hints, `AMBIGUOUS_NUMERIC_DATE`, and named negative penalties.

Merchant means a useful display name, not a formal legal entity. B3 considers short-to-moderate Latin, Chinese, or Japanese text near the top, high OCR confidence, measured header height, and placement before contact/tax metadata. It preserves recognized spelling and does no transliteration or external lookup. Exact repeated names merge evidence with a bounded bonus. Generic receipt/copy/approval headings, addresses, contact details, tax/business IDs, transaction/terminal/store IDs, payment lines, dates, and monetary lines are excluded; transient `merchantExclusions` retains only their evidence IDs and named `MerchantReasonB3` codes, without excluded text. One plausible brand can be clear; similarly ranked brands remain ambiguous. B1 already joins touching same-line OCR fragments. Combining separate merchant lines is deferred to B4 because the current synthetic fixtures do not justify a safe rule. All merchant names and raw receipt text remain transient.

The test-only structured evaluation uses 27 invented date fixtures: 20 correct clear tops, 0 correct value present but not top, 7 correct abstentions, 0 incorrect confident selections. Twelve invented merchant fixtures yield 8 acceptable clear tops, 0 acceptable candidate present but not top, 4 correct abstentions, 0 incorrect confident selections. Additional tests cover source-span evidence, context preserving alternatives, explicit date conflicts despite Journey hints, deterministic ordering, and measured header prominence. These numbers are regression checks, not real-receipt accuracy. B4 should evaluate noisy OCR, actual multilingual labels, two-line brands, uncommon date formats, and overly generic top text against user-approved real receipts before Phase C proposes UI thresholds. B4 is safe to begin as the next isolated evaluation/tuning slice.

## Parser Phase B2 — total amount candidate ranking (2026-09-27)

`src/domain/receipt/receiptParserB2.ts` exports pure `rankReceiptAmountsB2(ReceiptDocumentB1)`. It does not select a canonical Expense amount. Its `receipt-b2` result contains ranked exact decimal values, currency and safe minor units when supported, B1 candidate IDs, observation/line/span evidence, separate deterministic semantic scores and reasons, plus `clear`/`ambiguous`/`none` status and warnings. B1 extraction scores never become total scores. An explicit total/due label adds 60–65 points, final paid/payment adds 40–60, same-line relation 15, tightly adjacent next-line relation 8, and right-column relation 10; OCR confidence adds at most 5. Generic `AMOUNT` adds only 25. Subtotal, tax/GST/VAT, change, tendered/cash, discount/savings, loyalty, unit price, quantity, separate tip, and separate surcharge each subtract 70 for their own associated value. No amount arithmetic or largest-value rule is used. The B1 card-contact filter was narrowly amended to retain `CARD PAYMENT`/`CARD PAID` amounts while still filtering card identifiers.

The initial label set includes English final/negative terms; Simplified and Traditional Chinese `总计/總計`, `合计/合計`, `应付/應付`, `实付/實付`, `小计/小計`, tax, change, tender, and discount; and Japanese `合計`, `お支払`, `お会計`, `ご請求額`, `支払額`, `小計`, `消費税`, `お釣り`, `お預り`, and discount. Long labels own overlapping words, so `SUBTOTAL` does not produce `TOTAL`. Same-line labels attach to the nearest value; an amount may use the immediately previous label-only line only with one value and a small vertical gap. Distinct occurrences of the same exact value and currency merge with evidence from both and one bounded duplicate bonus. Explicit USD/NZD values remain separate; a Journey hint can interpret an adjacent bare `$` or compatible `¥` but never overrides an explicit code. Minor units use integer arithmetic and ISO scale, not floating point.

Stable B2 reason codes are the exported `AmountReason` union: `EXPLICIT_GRAND_TOTAL`, `EXPLICIT_TOTAL`, `AMOUNT_DUE`, `AMOUNT_PAID`, `PAYMENT_MATCH`, `GENERIC_AMOUNT`, `SAME_LINE_VALUE`, `ADJACENT_LINE_VALUE`, `RIGHT_ALIGNED_VALUE`, `DUPLICATE_FINAL_AMOUNT`, the named negative `*_PENALTY` codes, `WEAK_UNLABELED_AMOUNT`, `EXPLICIT_CURRENCY`, `JOURNEY_CURRENCY_HINT`, and bounded OCR-confidence codes. A top value is only `clear` with at least 60 points, positive final-total/payment evidence, a 15-point lead, and no unresolved currency/separator or conflicting high-ranked explicit amount. Otherwise it stays ranked but `ambiguous`; no candidate is `none`. Warnings include `NO_RELIABLE_TOTAL`, `CONFLICTING_TOTALS`, `AMBIGUOUS_AMOUNT_SEPARATOR`, and `AMBIGUOUS_CURRENCY_SYMBOL`. Unlabeled values are ranked conservatively and currently abstain even when they look monetary.

The structured B2 test-only evaluation uses 30 invented fixtures: 24 correct clear top candidates, 0 correct amount present but not top, 6 correct abstentions, and 0 incorrect confident selections. Tests also check evidence merging, spatial isolation, two numbers on one line, currency separation, exact JPY minor units, deterministic semantic ordering, and a B1 card filter regression. These synthetic counts are regression coverage, not real-receipt accuracy. Split numeric fragments such as separate `86`, `.`, and `40` observations are deferred: B2's current fixtures do not require a bounded repair, and concatenating unrelated observations would need real-layout evidence. B4/real-receipt evaluation should revisit split fragments, broader language variants, noisy labels, more complex columns, and unlabeled-only totals. B3 date/merchant parsing is safe to begin as a separate pure slice; no Phase C/UI decision is implied.

## Parser Phase B1 — pure extraction implementation (2026-09-27)

`src/domain/receipt/receiptParserB1.ts` exports `parseReceiptDocumentB1(OcrDocument, { journeyCurrency? })`. It is a pure TypeScript module with only type-level reference to the OCR provider and a call to the existing ISO currency-scale helper. No React, Expo runtime, SQLite, Supabase, Backend, network, image pixels, or Expense state enters this parser. Its intermediate `ReceiptDocumentB1` contains ordered lines/fragments, transient observation IDs (`oN`) and line IDs (`lN`), monetary `numericCandidates`, independent `currencyCandidates`, and structural warnings. The full amount/date/merchant `ReceiptParseResult` designed in B0 remains for later slices; B1 does **not** identify a receipt total.

Grouping uses A1's top-left normalized boxes: observations are sorted by vertical center and x; near-identical overlapping duplicates are removed; fragments with sufficient vertical overlap and baseline proximity share a line; line boxes are unions of fragment boxes. Fragments are ordered left-to-right, joining touching Latin fragments and neighboring CJK characters without inserting an artificial space. Evidence spans refer to character offsets in the original observation text and remain valid only for this invocation. Input work is bounded to 512 observations and 2048 characters per observation; invalid observations are ignored with a warning. It is deliberately a minimal line representation, not a table/layout engine.

Numeric candidates retain exact normalized decimal **text** and the original token. Point/comma decimal, valid grouped thousands, and mixed US/European formats are accepted. A single separator followed by three digits emits both integer-grouping and three-decimal alternatives with `AMBIGUOUS_AMOUNT_SEPARATOR`; `12,50` has one decimal-comma interpretation. No JS float or universal cents conversion occurs. Obvious date/time, phone/reference/card, percentage, quantity, malformed grouping, and oversized digit runs are filtered. B1 retains separate `75.13`, `11.27`, `86.40`, `86.40` occurrences from Subtotal/GST/TOTAL/EFTPOS; it does not score those labels. Repeated values keep distinct evidence for B2 merging.

Currency candidates recognize supported ISO codes (including `RMB → CNY`), region-qualified `NZ$`, `A$`/`AU$`, `US$`, `CN¥`/`JP¥`, and `€`, `£`, `円`, `元`. Bare `$` has no assumed code; bare `¥` retains possible JPY/CNY. A supported Journey currency produces a separate low-score context candidate and never overrides explicit receipt evidence. Numeric ↔ currency links are made only for the nearest same-line token within four characters in one observation or a small normalized inter-fragment gap; hints do not create a global association. Candidates keep OCR confidence separate from deterministic extraction scores. Implemented reasons: `NUMERIC_FORMAT_STRONG`, `NUMERIC_FORMAT_AMBIGUOUS`, `NUMERIC_INTEGER`, `EXPLICIT_CURRENCY_CODE`, `REGION_QUALIFIED_CURRENCY_SYMBOL`, `DISTINCT_CURRENCY_SYMBOL`, `AMBIGUOUS_CURRENCY_SYMBOL`, `JOURNEY_CURRENCY_HINT`, `ADJACENT_CURRENCY`, and bounded high/low OCR-confidence reasons. Scores describe evidence strength, never probability or final-amount likelihood.

`src/domain/receipt/receiptParserB1.test.ts` uses structured synthetic `OcrDocument` data. It covers NZ English amounts, bare dollar plus NZD hint, explicit USD against that hint, Japanese/Chinese and mixed-script evidence, European and US/NZ separators, ambiguous grouping, prefix/suffix/adjacent currency, duplicate monetary values, Subtotal/GST/TOTAL coexistence, non-money filters, split line fragments, empty/noisy input, deterministic geometry ordering, and no fetch. The parser and relevant existing OCR contract tests pass. Known B1 limits: split **numeric digits** across separate Vision observations are not reconstructed; a bare `$`/`¥` may remain unresolved; some unlabeled integers remain candidates for B2 to down-rank; no total/date/merchant selection, ISO minor-unit pairing, or UI integration exists. B2 can begin as the next isolated slice.

## Parser Phase B0 — read-only design and fixture plan (2026-09-27)

**Boundary.** A local, deterministic, pure parser consumes the existing transient `OcrDocument`; it does not open images, call network/native APIs, persist results, mutate an Expense, or choose canonical values. B covers only total amount, currency, transaction date, and merchant/description. Subtotal, tax/GST/VAT, tip, change, tendered, discount, quantity, and unit price are negative or contextual evidence, never output Expense fields. Category, line items, payment method/card number, Review, and automatic mutation are outside B. Phase C alone decides whether/how to show editable suggestions.

### Input, grouping, and output contract

Input is the A1 `OcrDocument`: observation `text`, OCR `confidence`, normalized top-left `boundingBox`, oriented analyzed dimensions, engine/revision. The parser assigns ephemeral IDs `o0`, `o1`, … from observation array indices; a character span disambiguates multiple tokens within one observation. IDs are meaningful only for that input document and are not persisted. Ignore native observation order for layout. Collapse near-identical overlapping observations, group fragments into a line only when their vertical overlap/baseline and horizontal separation support it, then order lines top-to-bottom and fragments left-to-right. Preserve CJK text without inserting spaces between adjacent characters. Detect a label and amount on the same line or an immediately adjacent line, and right-aligned amount columns by geometry. Avoid tables, perspective correction, and a general document-layout engine. Keep all rules independent of image-pixel access.

Proposed provider-neutral, in-memory shape (exact TypeScript names may be finalized in B1):

```ts
type ReceiptParseResult = {
  parserVersion: string; // starts "receipt-b1"; bump when rule semantics change
  amountCandidates: Candidate<{
    decimal: string;
    currency: string | null;
    minorUnits: number | null;
  }>[];
  currencyCandidates: Candidate<string>[]; // supported ISO 4217 code
  dateCandidates: Candidate<string>[]; // YYYY-MM-DD, no timezone conversion
  merchantCandidates: Candidate<string>[];
  warnings: ParseWarningCode[];
};
type Candidate<T> = {
  value: T;
  score: number; // deterministic ranking points, never a probability
  source: "explicit" | "inferred";
  evidence: { observationId: string; start: number; end: number }[];
  reasons: ParseReasonCode[];
};
type ReceiptParseContext = {
  journeyCurrency?: string;
  journeyStartDate?: string;
  journeyEndDate?: string;
  draftDate?: string;
  locale?: string;
  referenceDate?: string; // explicit clock input when needed for two-digit years
};
```

Candidate arrays are ranked, may be empty, and retain competing interpretations. `source` describes **receipt evidence**: a recognized label/code/symbol or text value is explicit; a value derived only from a hint is inferred. `score` is separate from Vision confidence; OCR confidence contributes bounded ranking evidence. In B1, keep exact decimal text even when currency is unknown; set `minorUnits` only after pairing a supported currency and verifying its `currencyScale`, fractional precision, positivity, and `Number.isSafeInteger`. Do not use JavaScript floating-point arithmetic for money. A candidate's evidence can be resolved against the transient input for local development, but diagnostics emit only counts, scores, reason codes, and structural positions, never raw text or receipt paths.

### Amount and numeric normalization

Extract amount-like tokens only from bounded receipt-shaped numbers, a currency marker, or a monetary label/value relation. Reject telephone/card/reference-like long digit runs, dates, percentages, quantities, and negative/refund amounts from the **positive total** candidate set. Normalize Unicode full-width digits/punctuation and surrounding currency symbols, but preserve the raw span for evidence. Decimal `86.40` or `86,40` becomes `86.40`; valid grouped `1,234.56` or `1.234,56` becomes `1234.56`; `¥8,520` becomes integer `8520` when comma is a valid three-digit group; `86.40 NZD` retains the code as cross-evidence. A single separator followed by three digits is ambiguous until currency scale/locale and other receipt tokens resolve it; produce alternatives or abstain rather than silently choosing a decimal/thousands convention. Reject malformed grouping and excess nonzero fractional digits for the paired ISO currency; trailing zeros beyond scale may be removed only when exact. Cap normalized digits and minor units to the existing safe-integer Money domain.

Rank `TOTAL`, `GRAND TOTAL`, `AMOUNT DUE`, `TOTAL DUE`, `BALANCE DUE`, and final paid equivalents, with initial Chinese `合计/合計/总计/總計/应付/應付/实付/實付` and Japanese `合計/お支払金額/ご請求額/支払額` equivalents. Distinguish a nearby numeric value on the same or next line. `SUBTOTAL/小計`, `TAX/GST/VAT/税/消費税`, separate `TIP`, `SURCHARGE`, `CHANGE/找零/お釣り`, `CASH`, `TENDERED`, `DISCOUNT/SAVINGS`, unit price, quantity, and loyalty balance receive strong negative evidence. A total/paid pair with the **same normalized value and currency interpretation** merges evidence into one candidate rather than two competing answers; differing plausible totals stay separate with an ambiguity warning. The largest printed number has no special priority.

### Currency and date

Currency candidates are independent of amount candidates, then cross-checked. Explicit supported ISO codes (`NZD`, `AUD`, `USD`, `EUR`, `JPY`, `CNY`) and `RMB → CNY` are strongest; decorated `NZ$`, `A$`, `US$` and `€` are next. Bare `$` is weak. `¥` alone stays ambiguous between JPY and CNY; nearby `円`, `元`, language, and an optional Journey hint can rank but do not make a symbol an explicit ISO code. A receipt's explicit code always wins over a conflicting Journey hint. If no receipt currency appears, return at most a clearly marked low-score inferred Journey-currency candidate, or no candidate when there is no useful hint. Unsupported codes are warned about, not coerced to a supported currency. A paired amount must satisfy that currency's scale, e.g. JPY integer, NZD two decimals, KWD three.

Parse calendar-valid `YYYY-MM-DD`, `YYYY/MM/DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD-MM-YY`, textual months, `YYYY年M月D日`, and Japanese `YYYY年M月D日`. Return local calendar strings without `Date` timezone conversion. If both day/month interpretations are valid, emit both and `AMBIGUOUS_DATE_ORDER`; Journey range, draft date, or locale may rank them, never erase receipt evidence. Expand two-digit years only against an explicit `referenceDate`/Journey window, retaining ambiguity if multiple plausible centuries remain; the parser must not read the ambient clock. Prefer nearby `DATE`, `TRANSACTION DATE`, `PURCHASE DATE`, `日期/交易日期`, `日付/取引日`. Exclude `MM/YY` expiry without a day, and penalize dates near `EXPIRY/VALID UNTIL`, loyalty, invoice/reference, or promotion labels. Multiple plausible full dates remain separate if the transaction date cannot be established.

### Merchant and context

Merchant is a conservative heuristic: favor a distinctive text line in the upper receipt region with sufficient OCR confidence and relative height, then consider a nearby second line for a shop name. Do not assume `o0` is the merchant. Exclude generic `RECEIPT`, `TAX INVOICE`, `THANK YOU`, their common CJK equivalents, addresses, phone/URLs, tax numbers, transaction/reference IDs, dates, and lone currency/amount lines. Normalize whitespace and Unicode presentation forms without inventing a name. An empty merchant array is correct when no line is reliable; Phase C may use a candidate as editable description, never as canonical truth.

Hints are optional ranking evidence only. `journeyCurrency` may break a bare `$` or `¥` tie, not override an explicit receipt code. Journey dates, `draftDate`, `locale`, and explicit `referenceDate` may rank ambiguous date formats, not replace a clearly labeled transaction date. Missing context must produce deterministic output. No user locale/Journey setting is treated as proof of receipt language or merchant location.

### Deterministic ranking and evidence

Use fixed integer points per field, published with `parserVersion`, not statistical confidence. Start at zero and clamp each candidate score to `0..100`. Initial weights are deliberately coarse:

| Field    | Positive points                                                                                        | Negative or veto evidence                                          |
| -------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Amount   | explicit total `+60`, final paid `+40`, same-line value `+15`, right-aligned value `+10`               | subtotal/tax/tip/change/tendered `−70`; card/reference number veto |
| Currency | explicit ISO code `+70`, decorated symbol or `円/元` `+45`, bare `$`/`¥` `+15`, same-line amount `+10` | conflicting explicit code outranks hints; unsupported code veto    |
| Date     | valid full calendar date `+30`, transaction-date label `+45`, upper receipt region `+5`                | expiry without day veto; promo/loyalty/reference context `−70`     |
| Merchant | upper region `+25`, relative header height `+15`, distinctive letters `+15`                            | generic header/contact/ID line veto                                |

High OCR confidence (`≥0.8`) adds at most `+5`; low confidence (`<0.5`) subtracts `10`. A matching Journey/date/locale hint adds at most `+10` and never defeats conflicting explicit evidence. These are first-version rule values to test and freeze in B1–B4, not measured likelihoods. Keep an otherwise valid low-score candidate for explanation, but mark a field **unclear** if its best score is below `60`, lacks positive field-specific evidence, or leads the next incompatible interpretation by fewer than `15` points. Incompatible explicit receipt evidence remains ambiguous regardless of gap. A field with no valid candidate abstains. Phase C must not treat an unclear top candidate as a decided value. Fixtures assert ranking, ambiguity, and abstention before exact point totals; any later weight/reason change bumps `parserVersion`. No `0.93 = 93% correct` claim. OCR confidence remains a separate input.

Stable reason families: `EXPLICIT_TOTAL_LABEL`, `PAID_AMOUNT_LABEL`, `SAME_LINE_VALUE`, `RIGHT_ALIGNED_VALUE`, `SUBTOTAL_PENALTY`, `TAX_PENALTY`, `TIP_PENALTY`, `CHANGE_PENALTY`, `TENDERED_PENALTY`, `REFERENCE_NUMBER_PENALTY`, `EXPLICIT_CURRENCY_CODE`, `DECORATED_CURRENCY_SYMBOL`, `CURRENCY_SYMBOL`, `CURRENCY_WORD`, `JOURNEY_CURRENCY_HINT`, `VALID_FULL_DATE`, `DATE_LABEL`, `JOURNEY_DATE_HINT`, `EXPIRY_DATE_PENALTY`, `PROMOTION_DATE_PENALTY`, `TOP_OF_RECEIPT`, `DISTINCTIVE_HEADER`, `GENERIC_HEADER_PENALTY`, `CONTACT_LINE_PENALTY`, and `LOW_OCR_CONFIDENCE`. Warnings include `AMBIGUOUS_AMOUNT_SEPARATOR`, `CONFLICTING_TOTALS`, `AMBIGUOUS_CURRENCY_SYMBOL`, `AMBIGUOUS_DATE_ORDER`, `MULTIPLE_DATES`, `NO_RELIABLE_TOTAL`, `NO_RELIABLE_CURRENCY`, `NO_RELIABLE_DATE`, `NO_RELIABLE_MERCHANT`, and `UNSUPPORTED_CURRENCY`. Codes describe evidence, not private content; changing their semantics requires a parser-version change.

### Synthetic fixtures and evaluation

Commit structured, fully invented `OcrDocument` fixtures with observation text/confidence/bounds and expected ranked values, evidence, and abstention. Reuse one compact fixture builder in B1; include deliberately shuffled observation order and split label/value observations where layout matters. No fixture uses a real merchant, card, phone, address, or receipt image.

| ID                    | Synthetic case                           | Required assertion                                  |
| --------------------- | ---------------------------------------- | --------------------------------------------------- |
| `nz-market`           | NZ English supermarket                   | Labeled total, NZD, date, distinctive header        |
| `nz-cafe`             | NZ cafe/restaurant                       | Final paid amount over separate tip/line prices     |
| `subtotal-tax-change` | Subtotal, GST, total, cash, change       | Total wins; negatives never top                     |
| `duplicate-paid`      | TOTAL and EFTPOS same amount             | One reinforced amount candidate                     |
| `bare-dollar-nzd`     | `$` with NZD Journey                     | Currency inferred/weak, not explicit code           |
| `usd-vs-journey`      | Explicit USD, NZD Journey                | USD wins                                            |
| `jp-yen`              | Japanese labels and `¥`/`円`             | JPY integer candidate                               |
| `yen-no-context`      | Bare `¥` without code or hint            | JPY/CNY ambiguity retained                          |
| `cn-yuan`             | Chinese labels and `¥`/RMB/CNY           | Explicit CNY wins                                   |
| `zh-traditional`      | Traditional Chinese `合計/應付`          | Total label and CNY code survive script variant     |
| `zh-en-mixed`         | Chinese/English fragments                | Label/value grouping and CNY total                  |
| `ja-en-mixed`         | Japanese/English fragments               | Label/value grouping and JPY total                  |
| `eu-decimal`          | `€86,40`                                 | EUR 8640 minor units                                |
| `eu-grouped`          | `€1.234,56`                              | EUR 123456 minor units                              |
| `us-grouped`          | `NZ$1,234.56`                            | NZD 123456 minor units                              |
| `eu-label`            | European-language total label            | Label relation works without English `TOTAL`        |
| `separator-ambiguous` | Single separator/three digits            | Alternatives or abstention                          |
| `date-order`          | `03/04/2026`                             | Both interpretations; hint may rank                 |
| `textual-month`       | English month-name transaction date      | Calendar-valid ISO date                             |
| `two-digit-year`      | `27-09-26` with/without reference date   | Plausible expansion or abstention                   |
| `many-dates`          | Transaction, expiry, promotion           | Transaction date wins; expiry excluded              |
| `header-contact`      | Store header, address, phone             | Header merchant; contact lines excluded             |
| `no-merchant`         | Generic headers only                     | Merchant abstains                                   |
| `no-total`            | Only unit prices/subtotal                | Amount abstains                                     |
| `noisy-total`         | OCR typo in total label                  | Conservative fallback/ambiguity, no false certainty |
| `rotated-normalized`  | Shuffled observations with upright boxes | Geometry order wins over input order                |
| `blank`               | Zero observations                        | Empty candidates and no-answer warnings             |

Later device/local evaluation uses approximately 10–20 diverse user-approved real receipts across CJK/Latin, currencies, restaurant/retail, poor print, and layouts. Never add images, OCR transcripts, merchant names, or per-receipt private labels to Git or normal logs. A temporary local evaluator may compare human-marked expected amount/currency/date/merchant to ranked candidates in memory; discard the detailed sheet afterward. Retain only aggregate counts by fixture class, top-candidate correct/incorrect, candidate present/absent, ambiguity and failure category, structural timing, and parser version. Do not transmit receipts or OCR text. Report separate metrics: top-1 amount accuracy, amount candidate recall, currency/date top-1 accuracy, merchant acceptable-match rate (human judged), and abstention precision on ambiguous/no-answer receipts. Include denominators and report both false-positive and false-negative abstentions; do not optimize for always returning a value. Synthetic fixtures are regression tests, not a real-receipt accuracy estimate.

### Implementation slices and stop points

1. **B1 — pure input and extraction:** deterministic line grouping, evidence references, bounded numeric normalization, and currency candidate extraction/pairing; fixtures for separators, codes/symbols, mixed-script geometry, and empty input. No UI, persistence, or amount winner.
2. **B2 — total ranking:** positive/negative multilingual receipt labels, same/adjacent-line and right-column evidence, duplicate paid/total merge, conflict/abstention rules; amount fixtures. No field prefill.
3. **B3 — date and merchant:** calendar-valid date interpretations, context tie-breakers, conservative merchant ranking and abstention; date/contact fixtures. No Expense write.
4. **B4 — language and evaluation:** expand EN/ZH/JA label variants plus selected European labels from synthetic failures, run the full fixture matrix and privacy-safe local real-receipt evaluation, freeze reason codes/parser version. Stop for review before Phase C.

**Recommended first coding slice: B1 only.** It can be tested as a pure TypeScript module against structured synthetic observations without changing A1/A2, native code, New Expense UI, SQLite, Backend, or Production.

## Phase A2 integration decision (2026-09-27)

New Expense invokes A1 only after `selectExpenseReceiptDraft` returns its verified temporary image. The latest image explicitly chosen through **Scan receipt** is the sole OCR-active attachment; ordinary Attachment selection and existing Expense additions never invoke OCR. OCR observations stay in the screen's process memory, keyed by receipt draft ID and request generation. Replacing/removing the active draft, discarding the form, unmounting, or backgrounding cancels and invalidates its result. Recovered drafts can be explicitly rescanned without copying them again. PDF remains attachable but has no A2 OCR path. Debug Mode shows structural metrics only. No persistence, parser, field prefill, upload, or Backend OCR is added.

The signed A2 Release build compiled, installed, and launched on the authorized iPhone 16 Pro. Focused OCR/receipt-draft tests cover the scan-only guard, stale-result invalidation, cancellation, no-text/error/PDF outcomes, recovered-draft rescan, and no network call. The New Expense page has compact status and retry/manual-entry affordances; its receipt lifecycle and Save path are unchanged. The user directly confirmed that a non-sensitive New Expense scan displayed an OCR outcome, manual amount/title entry remained usable, and removing the receipt cleared the status. With OTR Mobile cellular data off and no phone Wi-Fi, the user confirmed that Scan receipt OCR still completed. After a force-close/restart, one temporary attachment recovered and explicit **Read** ran OCR again without a duplicate; the user restored cellular data afterward. The user also confirmed a second Scan receipt completed, removing it cleared OCR status, and a blank/solid image reached **No text found** while manual fields remained usable. Device Hub cannot share the iOS 26.6 physical screen with this Mac, so these interaction results rely on the user's direct observation. A2-specific Chinese/Japanese/mixed UI checks were not repeated; A1's accepted physical direct-provider fixtures covered those image classes. Low-contrast/thermal and EXIF-only rotation remain quality checks for later acceptance.

## Phase A1 implementation and acceptance (2026-09-27)

- `modules/receipt-ocr/` is an iOS-only local Expo Module with one Swift `VNRecognizeTextRequest` revision 3 provider. Expo autolinking and CocoaPods discover it; generated `ios/` stays ignored. The selected iOS floor remains 16.4 after native build. No new OCR dependency or Backend/API/schema change was made.
- Swift uses `.accurate`, automatic language detection, and language correction; it queries `supportedRecognitionLanguages()` for the request's selected revision. It accepts only JPEG, PNG, HEIC, or HEIF files under the app's receipt draft/durable directories, caps source bytes at 50 MiB and pixels at 60 MP, and uses Image I/O to decode an orientation-corrected in-memory image with a 3200 px maximum edge. No OCR derivative is retained.
- `src/native/receiptOcr.ts` exposes `createReceiptOcrProvider().recognize({uri, signal?})` and `capabilities()`. Its transient `OcrDocument` adds `engineRevision`, `durationMs`, and `supportedLanguages` to the A0 contract. Native output maps Vision lower-left boxes to normalized top-left; TypeScript validates dimensions, finite confidence, and bounds. Empty text is a successful empty array. Stable error categories: `INVALID_FILE`, `UNSUPPORTED_IMAGE`, `VISION_FAILURE`, `CANCELLED`, `UNSUPPORTED_PLATFORM`, and `MALFORMED_RESULT`.
- Expo `AsyncFunction` runs off the JS thread. An AbortSignal asks the native `VNRequest` to cancel when active, and TypeScript discards any late result. Native cancellation before registration is best effort; A2 must still invalidate stale draft/form results. No UI, Expense, repository, sync, or network path invokes the provider.
- During A1 evaluation, the isolated `otrmobile:///receipt-ocr-a1?auto=<fixture>` Release test route used bundled synthetic fixtures and recorded structural-only diagnostics: dimensions, milliseconds, counts, confidence range, in-bounds boolean, known-line count, and supported language IDs. It never recorded recognized text or receipt bytes. Its comparison JPEG used the existing 2200 px / 0.83 values without changing attachment normalization. The route and bundled fixture images were removed after device acceptance; the report is test diagnostics, not an OCR result store.
- TypeScript, affected ESLint, Prettier, four focused tests, Expo autolinking, CocoaPods, unsigned generic iOS Release, and signed iPhone Release builds passed. The signed build was installed on the authorized iPhone 16 Pro with CoreDevice, without iPhone Mirroring. No production data or Backend OCR was touched.

Physical iPhone 16 Pro synthetic results (source analyzed image is capped at 3200 px; `known` is matched checks/expected checks; milliseconds measure Vision execution only and are single runs, not latency targets):

| Fixture                   | Source dimensions; ms; observations; known | 2200 px JPEG dimensions; ms; observations; known |
| ------------------------- | ------------------------------------------ | ------------------------------------------------ |
| English (input 2400×3600) | 2133×3200; 318; 4; 2/2                     | 1467×2200; 84; 4; 2/2                            |
| Chinese                   | 1200×1800; 301; 4; 2/2                     | 1200×1800; 85; 4; 2/2                            |
| Japanese                  | 1200×1800; 324; 4; 2/2                     | 1200×1800; 97; 4; 2/2                            |
| Mixed                     | 1200×1800; 254; 3; 1/2                     | 1200×1800; 92; 3; 2/2                            |
| Rotated                   | 3200×2133; 222; 4; 2/2                     | 2200×1467; 89; 4; 2/2                            |
| Blank                     | 1200×1800; 64; 0; 0/0                      | 1200×1800; 30; 0; 0/0                            |

All nonempty results reported confidence in `[0.5, 1]` and all boxes passed the top-left `[0,1]` bounds check. The device reported 30 language IDs, including `en-US`, `zh-Hans`, `zh-Hant`, `ja-JP`, French, German, Spanish, Italian, and Portuguese. That proves availability for this revision/device; the synthetic checks give initial recognition evidence, not broad travel-receipt accuracy. The 2200 px JPEG was equivalent or better on these fixtures and faster in single runs. **Keep the temporary source as A2 input for now:** it already exists before Save, while the archival JPEG is only created during Save. Adding pre-Save JPEG creation would change the accepted lifecycle; revisit if real fine-print receipts or measured performance justify it. Peak memory, perspective/thermal/low-contrast coverage, and EXIF-only rotation remain open. The provider itself contains no network call, and the TypeScript test asserts no fetch use.

With the user-confirmed OTR Mobile cellular-data switch off and no phone Wi-Fi connection, the installed Release build repeated two fixtures while the phone hotspot kept the Mac online. English returned 4 observations, 2/2 known lines, and in-bounds boxes from both source and archive (Vision execution 290/95 ms). The mixed-language fixture returned 3 observations, 1/2 source and 2/2 archive known lines, with in-bounds boxes (298/91 ms). These are app-level offline checks based on the user-confirmed network setting; CoreDevice cannot independently inspect per-app cellular permission. The user was told to restore OTR Mobile cellular data after the runs.

## Contract and current flow

OCR is local assistance for **New Expense** only. Phase A extracts text observations; parsing, suggestions, and draft-field changes belong to later slices. OCR never edits a saved Expense, creates Review findings, or becomes Ledger truth. A user can save manually if OCR fails. The selected image may become an attachment through the accepted draft-to-durable lifecycle.

The active entry is `LedgerExpenseEntryScreen`: its New Expense `Scan receipt` button opens an iOS action sheet for Camera, Photo Library, Files, or Cancel. Camera/library use `expo-image-picker` and permission checks; Files uses `expo-document-picker` with a cached copy. Picker cancellation returns without a draft. `selectExpenseReceiptDraft` rejects an existing Expense, checks the three-attachment limit, copies the selected bytes into an account-scoped temporary draft file, verifies MIME from the file signature, computes SHA-256, and records a journey-scoped recovery JSON. Only then does the screen add the `TemporaryReceiptDraft` to component state. The draft remains a local file, with no OCR or upload operation. The form's ordinary state is in memory; after restart it restores verified receipt draft files, but not unsaved Expense field edits.

Removing a selected receipt deletes its draft image and recovery record. Explicit Cancel/back-discard does the same; picker Cancel has nothing to delete. On Save, `prepareReceiptDraft` verifies the draft and makes a durable normalized attachment copy, normally JPEG with 2200 px maximum long edge and quality 0.83 (transparent PNG stays PNG); the Expense repository atomically commits Expense, attachment metadata, and upload intent to SQLite. Successful commit deletes the temporary duplicate and starts normal operational sync. Failed preparation/commit retains the draft for retry. The receipt route's `mode=scan` is currently a placeholder; the route used from Expense Detail adds attachments with `requestOcr: false`. Existing Expense entry can attach a file, but it has no Scan button. An older `receiptId` route parameter can still read a persisted server `ocrSuggestion` into a New Expense draft; this is legacy compatibility, not the proposed path. [Source: `LedgerExpenseEntryScreen.tsx`, `expenseReceiptDraft.ts`, `receiptFileStore.ts`, `ledgerExpenseRepository.ts`, ADR 0048.]

**OCR handoff:** consume the verified `TemporaryReceiptDraft.localUri` immediately after `selectExpenseReceiptDraft` succeeds, keyed by its draft ID and current form instance. The screen can retain the attachment even if OCR returns no text or fails. Do not wait for normalization, Save, backend upload, or an asset queue. In A2, reject PDFs from OCR with a clear manual-entry fallback; the picker may still attach them. A separate OCR file is unnecessary. Run an image dimension preflight (the existing 50 MiB source check is insufficient for decompression memory), reject excessive pixel counts, and use Image I/O downsampling in memory when needed. Compare the accepted 2200 px archival JPEG against the source in device tests before adding any persistent OCR derivative.

## Native architecture and Vision choice

`package.json` specifies Expo SDK `~57.0.21`, React Native `0.86.3`, Expo Router, Expo image/document picker, image manipulator, and file system. `eas.json` has a development client, preview, and production profiles. `app.json` declares picker/secure-store/router and other config plugins; `plugins/withUserScriptSandboxing.js` is the only project-specific plugin found. Generated `ios/` is ignored and regenerated by prebuild. Its current Xcode project and Podfile use **iOS 16.4** as the deployment target; `app.json` does not pin that target, so A1 must make it regeneration-safe or verify the SDK default remains 16.4. `AppDelegate.swift` is generated Swift, not an app-owned OCR bridge. No checked-in local Expo module or app-owned Vision code exists. Debug builds need Metro; physical offline/force-close acceptance needs a signed Release build with an embedded bundle. [Sources: `package.json`, `app.json`, `eas.json`, `ios/Podfile`, generated Xcode project, `docs/ENVIRONMENT_AUDIT.md`, `docs/IOS_DEVICE_RUNBOOK.md`.]

The least invasive supported integration is **one iOS-only local Expo Module** in `modules/receipt-ocr/`, autolinked by Expo, with a small `src/native/receiptOcr.ts` adapter. Pass a validated local file URL, not base64 or image bytes through JS. The Swift module calls `VNRecognizeTextRequest` through `VNImageRequestHandler` on a background queue and returns observations. Keep the generated `ios/` directory out of Git; native additions require a rebuilt dev client/Release app, not just Metro. Android gets an explicit unavailable adapter until its own on-device provider is approved. No third-party OCR dependency, custom React Native bridge, config plugin for OCR, or Backend transport is needed. Expo documents local modules as its supported app-specific native-code path: [local module guide](https://docs.expo.dev/modules/get-started/), [autolinking](https://docs.expo.dev/modules/autolinking/).

`VNRecognizeTextRequest` works within the iOS 16.4 floor. Use `.accurate` for small receipt print and screenshots; Vision says its accurate path is the default and can return line or line-fragment observations for Chinese. Return the top candidate's `VNRecognizedText.confidence` (0–1) rather than inventing a document-wide confidence. Use `observation.boundingBox`, converting Vision's normalized **lower-left** origin to our normalized **top-left** origin. Use the oriented image dimensions for the returned geometry, and pass an explicit image orientation to Vision when EXIF indicates rotation. Do not assume the picker or image decoder already made pixels upright. Perspective and low contrast are acceptance cases; do not add a rectification/enhancement pipeline before evidence shows it is needed. [Apple: [text recognition](https://developer.apple.com/documentation/vision/recognizing-text-in-images), [confidence](https://developer.apple.com/documentation/vision/vnrecognizedtext/confidence), [Vision coordinates](https://developer.apple.com/documentation/vision), [oriented image handler](https://developer.apple.com/documentation/vision/vnimagerequesthandler).]

## Transient TypeScript contract

The minimal provider boundary is `recognizeLocalImage({ uri, signal? }): Promise<OcrDocument>`; it must neither import Expense repositories nor request network access. This is useful now because the iOS module needs a testable adapter and Android must fail safely. It is not a cloud-provider framework.

```ts
type OcrDocument = {
  engine: "apple-vision";
  engineVersion: string; // Vision request revision; platform version in diagnostics
  imageWidth: number; // oriented pixels actually analyzed
  imageHeight: number;
  observations: OcrObservation[];
};
type OcrObservation = {
  text: string;
  confidence: number; // top candidate, finite 0..1
  boundingBox: { x: number; y: number; width: number; height: number };
};
```

Coordinates are normalized to `[0,1]`, origin **top left**, `x` rightward, `y` downward, relative to the image dimensions returned in the same document after orientation/downsampling. Transform from Vision as `x = box.minX`, `y = 1 - box.maxY`, `width = box.width`, `height = box.height`; clamp tiny float drift at the boundary, reject nonfinite values. An empty observation array is a successful no-text outcome. Preserve the native observation order; do not promise reading order or parse amount/currency/date in A. No SQLite table, API DTO, Review record, analytics text field, or durable queue entry is added.

## Languages and receipt quality

Use accurate recognition with `automaticallyDetectsLanguage` where supported by the selected request revision. At runtime query `supportedRecognitionLanguages` for that revision and recognition level, and report capabilities in diagnostics without receipt text. Candidate coverage to verify on the actual iOS 16.4+ device: `en-US`, `zh-Hans`, `zh-Hant`, `ja-JP`, and relevant Latin languages (`fr-FR`, `de-DE`, `es-ES`, `it-IT`, `pt-PT`, etc.). Do **not** assume every code or mixed-language pairing is supported: Apple's language support varies by revision/path, and its documentation specifically calls out Chinese pairing restrictions and no Chinese language correction. Prefer automatic detection initially; use only supported, prioritized hints if device fixtures show a measurable gain. Journey currency or UI language is not proof of receipt language, so neither should hard-gate recognition. Keep language correction on for supported languages as a measured default; test disabling it for prices, merchant names, and CJK. Do not build a language selector in A. [Apple: [language support and Chinese caveats](https://developer.apple.com/documentation/vision/recognizing-text-in-images), [Vision revision/language detection](https://developer.apple.com/videos/play/wwdc2022/10024/), [language correction](https://developer.apple.com/documentation/vision/vnrecognizetextrequest/useslanguagecorrection).]

Test thermal print, e-receipt screenshots, 90/180/270-degree rotation, mixed scripts, perspective, and low contrast. Currency symbols, decimal separators, and thousands separators must survive as literal text; semantic interpretation is deliberately B/C work. A0 cannot establish actual language accuracy or 2200 px sufficiency without synthetic physical-device measurements.

## Execution, privacy, and failures

OCR runs asynchronously off the UI thread after local draft selection. Track one request per selected draft ID plus a form generation token. On removal, navigation away, account change, or draft cancellation, request cancellation if the native API can interrupt the active request; always ignore a late result when the token or draft ID no longer matches. App backgrounding should cancel/ignore the result and leave the image draft intact. Provide a visible Skip/manual path in A2; use a short UI wait budget (proposed 8 seconds) then release the form to manual entry while native work is cancelled/ignored. The budget is not a guaranteed native kill. Measure p50/p95 duration from invocation through mapping, input/oriented dimensions, observation count, confidence buckets, and peak resident memory during repeated scans on the physical iPhone. No target latency or memory ceiling is claimed before measurement.

Native input accepts only an app-owned, existing image file with supported MIME and bounded dimensions; no arbitrary remote URL. Bad/unsupported image and Vision errors become non-sensitive categories. No text yields `observations: []`. Cancellation is distinct from failure and must not show an alarming error. In all cases, the attachment remains removable/keepable and Save/manual entry stays available. Retain no OCR result beyond the form lifetime in A; recovered image drafts can be rescanned after restart in A2. Persisting proposed fields would require an actual recovery need and a separate local-only, account/journey/draft-scoped decision; a permanent OCR table is unjustified.

Phase A extraction makes **zero OCR network requests**. Never log recognized text, file paths, merchant/card/address strings, or raw native error descriptions in normal logs. Diagnostics may include only elapsed time, image dimensions, observation count, confidence distribution, engine/revision, and a sanitized error category. After user Save, the existing attachment pipeline may upload the chosen receipt under its accepted privacy contract; that upload is independent of OCR. Do not send observations or suggestions in its payload.

## Existing Backend OCR disposition

The Backend still exposes `POST /v2/trips/:tripId/receipts/:receiptId/ocr` and a provider interface. It reads an **uploaded** object through the storage provider and persists `ocr_status`/`ocr_suggestion`; its default provider returns null suggestions, except an explicit acceptance fixture. The route rejects a receipt linked to an Expense. Mobile transport and worker still implement `OCR_RECEIPT`, and the receipt repository can enqueue it when `requestOcr: true`; the audited New Expense and existing-attachment call sites use the temporary-draft path or `requestOcr: false`, respectively. No active Mobile UI call to Backend OCR was found. Leave this code dormant in A; later deprecation should be a separate compatibility task after confirming no external clients or persisted OCR operations require it. Do not repurpose its suggestion schema for structured local observations. [Sources: `backend/src/app.ts`, `backend/src/supabaseGateway.ts`, `backend/src/receiptOcrProvider.ts`, `ledgerReceiptRepository.ts`, `ledgerReceiptSyncWorker.ts`, `LedgerExpenseEntryScreen.tsx`, `useReceiptCapture.ts`.]

## Tests and physical iPhone acceptance

- A1: one focused contract/mapping test for finite confidence, empty text results, top-left coordinate conversion, orientation dimensions, invalid native payload, and unsupported platform. Native fixture test uses synthetic images and verifies offline extraction without a network mock standing in for Vision.
- A2: New Expense-only invocation, picker cancellation, late-result discard, draft removal, app background, OCR error/no text, manual Save, and existing Expense no-invocation. Assert the OCR path has no authenticated API/transport call; existing attachment upload behavior remains covered by its accepted tests.
- Use generated, non-sensitive fixture receipts with English, Simplified Chinese, Traditional Chinese, Japanese, mixed language, rotated, and low-contrast variants. Do not commit personal receipts or OCR transcripts from real receipts.
- On a physical iPhone, use a signed Release app (embedded JS) without iPhone Mirroring. Scan each synthetic fixture online and with network denied to OTR Mobile (per-app cellular off and no Wi-Fi, or Airplane Mode); record duration, observations, selected known-text accuracy, dimensions, and memory. Force-close/restart to confirm the image draft recovers while unsaved OCR output is transient; rescan if wanted. Save offline, then verify the existing durable attachment/upload lifecycle after reconnect. Repeat with OCR failure and no text. Compare source-draft OCR to the 2200 px archive on fine thermal print before changing the input path. Device results are an acceptance gate, not an A0 claim.

## Implementation slices and stop points

1. **A1 — native extraction foundation:** regeneration-safe iOS floor check, iOS local Expo Module with Vision, TS adapter/contract, orientation/coordinate/confidence mapping, synthetic checks. No Expense UI invocation, parser, DB/API/schema change, or network use. Stop after native build and contract verification.
2. **A2 — New Expense scan extraction:** invoke A1 only after a verified image draft exists; hold raw observations transiently in a Debug/test-only surface, add cancellation/late-result and manual fallback behavior. Preserve the accepted Save/attachment path. Stop for device acceptance.
3. **B — semantic parser:** deterministic, offline parser over observations for candidate merchant/title, amount, currency, and date. Money remains integer minor units; ambiguous results stay unset. No line items or tax parsing.
4. **C — editable draft integration:** apply candidate values only to New Expense draft with clear review/edit behavior; user Save is the sole canonical write. No OCR on existing Expenses.
5. **D — international acceptance/tuning:** device fixture matrix for CJK/Latin/mixed languages and poor receipts; adjust Vision language/correction or source downsampling only from measured results.

**A1 is accepted; A2 is implemented and stops before parser Phase B.** Neither slice required a migration, Backend/Supabase change, Hosted Dev deployment, Production access, or final Expense UI polish.
