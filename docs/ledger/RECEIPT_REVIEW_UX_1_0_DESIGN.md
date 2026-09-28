# Expense Capture UX 1.0 — Receipt Review UX Redesign

Approved specification, 2026-09-28. Implement against this canonical document.

## Context

Receipt OCR 1.0 functional implementation C1–C4 is complete and accepted.

Existing capabilities that MUST be preserved:

- on-device Apple Vision OCR
- candidate/evidence parser
- ReceiptScanSession
- ReceiptEvidenceSet
- 1–3 receipt images
- combined multi-document parsing
- candidate-first Review
- USER_EDITED protection
- Scan another part
- remove/retry receipt parts
- Confirm -> New Expense draft
- offline behavior
- attachment draft lifecycle
- max 3 total Expense attachments

This work is a UX redesign.

Do NOT change OCR/parser semantics merely to fit the UI.
Do NOT integrate Foundation Models.
Do NOT add live DataScanner.
Do NOT add remote AI.
Do NOT modify Backend/Supabase/Production.
Do NOT redesign Expense Detail.
Do NOT commit or push.

## 1. PRODUCT GOAL

Receipt Review is NOT an OCR diagnostic screen.

Its purpose is:

"Look at the receipt, quickly verify three important values, correct them if
necessary, and continue."

OCR 1.0 Review contains exactly THREE user-facing semantic fields:

- Title
- Amount
- Currency

Date is intentionally excluded.

The page must hide OCR/parser implementation complexity.

The normal user should not need to understand:

- OCR
- parser confidence
- evidence IDs
- recognition state machines
- candidate scoring
- document processing state

The target experience is:

Scan
-> Review three fields
-> optionally compare against receipt image
-> optionally scan another part
-> Confirm

## 2. REMOVE CURRENT ENGINEERING UI

Remove from normal Receipt Review UI:

- "Check the detected details before continuing."
- "1 receipt image"
- "Part 1 · completed"
- "Read"
- standalone "Use suggestion"
- "More titles"
- "More amounts"
- parser scores/confidence
- OCR completion terminology
- evidence/debug terminology

Debug Mode may retain bounded diagnostics elsewhere if required.

Normal Receipt Review must feel like a consumer product.

## 3. TOP-LEVEL REVIEW STRUCTURE

Portrait/default collapsed state should conceptually contain:

Header:
Cancel Review receipt Confirm

Primary action:

- Scan another part

Then exactly:

Title
[ editable current value ]
[ candidate tags, maximum two rows ]

Amount
[ editable current value ]
[ candidate tags, maximum two rows ]

Currency
[ editable/selectable current value ]
[ candidate tags, maximum two rows ]

Receipt images exist as a collapsible stack/drawer on the RIGHT EDGE of the
same Review surface.

Do not create a separate receipt-preview workflow for OCR verification.

## 4. SCAN ANOTHER PART

"+ Scan another part" is a PRIMARY Review action.

Place it prominently near the top of Review, immediately below the header or
in another equally obvious location.

It must not be buried below receipt status/debug information.

When fewer than 3 total Expense attachment slots remain:

- enabled according to remaining capacity

When total attachment capacity reaches 3:

- keep the control in the same location
- render disabled/muted
- do not remove it and cause layout shift

Do not display a large warning.

A very small capacity indicator such as:
2 of 3
or
3 of 3
may be used if useful.

Preserve the existing multi-part ReceiptScanSession behavior.

## 5. UNIFIED FIELD PATTERN

Title, Amount and Currency should use the SAME basic interaction language.

Pattern:

FIELD LABEL

[ editable/current value ]

[ suggestion ] [ suggestion ] [ suggestion ]
[ suggestion ] [ suggestion ] [ overflow-chevron ]

Candidate suggestions must be visually compact tags/chips.

The user should quickly learn:

Large field = current value
Small tags = detected alternatives

Do not create three unrelated candidate-selection UIs.

## 6. CANDIDATE TAG LIMIT

Candidate tags must occupy at most TWO ROWS in the normal Review layout.

Fit as many useful candidates horizontally as reasonably possible.

Do not allow candidate lists to expand the page indefinitely.

If more candidates exist than fit within two rows:

The final visible tag/control should contain a compact downward-chevron /
overflow affordance.

Do NOT show standalone buttons such as:

More titles
More amounts

The overflow affordance belongs to the candidate tag group itself.

## 7. CURRENT/SELECTED CANDIDATE

If the current field value corresponds to one of the parser candidates, the
matching tag may appear selected.

Conceptually:

[✓ 95.85] [0.97] [3.88]

Do not add textual explanations such as:
"Selected suggestion"
or
"User edited"

If the user manually changes the field to a value not matching a candidate:

- candidate tags become ordinary unselected alternatives
- internal USER_EDITED semantics remain intact

Explicit candidate selection continues to count as user ownership and must not
be overwritten by later scans.

## 8. TITLE

Title remains a normal editable text field.

Use merchant/title candidates as compact tags below it.

The current parser may return imperfect merchant candidates.
Do not attempt additional parser tuning in this UX slice.

If there are no useful candidates:

- show no candidate area
- do not show "No suggestions"

If there are many candidates:

- maximum two rows
- final overflow-chevron opens the remaining candidate list

Overflow may use a compact sheet/menu appropriate to the existing UI system.

Selecting a candidate:

- updates Title
- marks it as explicit user selection
- closes overflow if open

## 9. AMOUNT

Amount remains directly editable.

Use exact existing money semantics.

Below it, show parser monetary candidates as tags.

Examples:

[✓ 95.85] [0.97] [3.88] [6.50⌄]

Do not expose parser scores.

Do not automatically select unsafe ambiguous values merely for presentation.

The existing conservative suggestion policy remains authoritative.

If no safe initial amount exists:

- Amount may remain empty
- candidate tags may still be available

Manual editing remains available.

Candidate values should be formatted clearly and compactly.

Avoid unnecessary currency duplication on every amount tag if the active
Currency field already makes the meaning obvious, unless candidates genuinely
represent different currencies and the distinction matters.

## 10. CURRENCY

Currency must use the same candidate-first presentation rather than hiding all
detected alternatives behind "Choose".

Current value:

Currency
[ JPY ]

Candidate tags:

[✓ JPY] [CNY] [TWD] [HKD] [⌄]

Candidate sources may include:

- explicit receipt currency
- region-qualified receipt evidence
- ambiguous symbol candidates
- Journey currency hint
- accepted parser evidence

Do not expose those evidence-source distinctions to normal users.

Explicit receipt currency still outranks Journey hint according to existing
logic.

IMPORTANT:

The final overflow-chevron for Currency is different from Title/Amount.

Currency overflow opens the FULL existing currency picker/search experience,
because the user may need a currency that OCR did not suggest.

Remove the current normal-Review requirement to tap "Choose" merely to see OCR
currency alternatives.

## 11. NO-SUGGESTION BEHAVIOR

Absence of OCR/parser suggestions should create LESS UI, not more.

Examples:

Title
[ empty editable field ]

Amount
[ empty editable field ]

Do not display:

- No title detected
- No amount found
- OCR failed to suggest...

unless a genuine blocking error requires communication.

Manual input is always valid fallback behavior.

## 12. RECEIPT DRAWER / RECEIPT STACK

Introduce a Receipt Drawer / Receipt Stack as part of the SAME Review surface.

This is NOT a separate attachment preview.

PURPOSE:

Allow the user to visually compare the original receipt against Title, Amount
and Currency without leaving Review.

Default portrait state:

- Form occupies most of the screen
- receipt images are collapsed against the RIGHT EDGE
- enough of the image/card stack remains visible to clearly communicate that
  receipt images are available

Target exposed width should be visually discoverable but compact, approximately
24–40 pt or another device-appropriate value determined during implementation.

Do not use a tiny invisible gesture-only affordance.

## 13. MULTIPLE RECEIPT STACK

For 1–3 receipt images:

Show them as a layered/stacked set of receipt cards on the right edge.

Each card must have a small visible identity.

Use simple numbering such as:
1
2
3

or another compact equivalent.

Internal logical order remains:
Part 1
Part 2
Part 3

Visual stack may place the most recently added receipt on top.

Do not expose technical document IDs.

The stack itself communicates receipt count, so remove the old large
"1 receipt image / Part 1 completed" block.

## 14. OPEN RECEIPT / COMPARE MODE

Tapping a collapsed receipt card opens that receipt into COMPARE MODE.

The receipt should animate horizontally from the right toward the center/left.

CRITICAL:

Do NOT cover the entire Form.

The user must continue seeing a meaningful left portion of the Form.

Target portrait comparison proportions:

Form:
approximately 35–45%

Receipt:
approximately 55–65%

Use actual device layout testing rather than blindly hard-coding percentages.

The core psychological goal is direct comparison:

LEFT:
Amount
95.85

RIGHT:
TOTAL
95.85

The user should not need to:

- memorize a number
- close preview
- return to form
- then edit

The field and receipt should be visible at the same time.

## 15. COMPARE-MODE FORM

When Receipt is expanded:

Keep the important Form fields visible on the LEFT.

They must remain LEFT-ALIGNED.

Show:

Title
[current value]

Amount
[current value]

Currency
[current value]

These fields should remain editable where practical.

Candidate tags may be hidden/collapsed in Compare Mode to preserve space.

The user's task in Compare Mode is verification, not candidate browsing.

Do not move fields to centered/right alignment.

Do not show unnecessary explanatory text.

## 16. COMPARE-MODE RECEIPT

Expanded receipt should:

- preserve image aspect ratio
- use available height effectively
- allow user to inspect small printed text
- support pinch zoom/pan where safely available
- optionally support double-tap zoom if the chosen viewer supports it reliably

Display a compact identity such as:

Receipt 2 of 3

Do not show OCR controls over the receipt.

## 17. CLOSING RECEIPT DRAWER

Compare Mode must be easy to exit.

Support:

- swipe RIGHT to collapse the receipt back to the right edge
- tapping the visible Form edge/pane to return to Form-focused mode
- another obvious affordance if required for accessibility

Do not require navigating to another screen.

The transition should feel like moving a panel, not opening/closing a new
modal.

## 18. FORM EDGE IN COMPARE MODE

Even when Receipt is expanded, preserve a visible Form pane.

Do not leave only a tiny 10 pt edge.

The user should be able to read at least the current:

Title
Amount
Currency

This is a comparison workspace, not a full-screen image viewer.

## 19. MULTIPLE RECEIPTS WHILE EXPANDED

Avoid conflicting gestures.

Swipe RIGHT has one stable meaning:
collapse Receipt Drawer.

Do NOT also use the same horizontal gesture as the primary image-switch
mechanism if it creates ambiguity with collapse/pan.

Preferred behavior:

Keep other receipt-card edges/tabs visible where practical.

Tap another numbered receipt card/tab:
-> switch expanded receipt

The Form pane remains stable.

If a safer native gesture architecture is available without ambiguity, document
it before deviating.

## 20. REMOVE RECEIPT IMAGE

Do NOT use an undiscoverable immediate "swipe up = delete" action.

Deletion is destructive.

Preferred v1:

- small explicit trash/remove control associated with the active receipt

Alternative:
a swipe-up interaction is acceptable only if it has clear progressive feedback
such as:

Remove
Release to remove

and cannot conflict with image zoom/pan/scroll.

Do not delete immediately from an ambiguous gesture.

Removing a receipt must preserve existing C3 semantics:

- remove draft
- invalidate OCR evidence
- reparse remaining ReceiptEvidenceSet
- refresh system-owned suggestions
- preserve USER_EDITED values

## 21. SCAN ANOTHER PART + RECEIPT STACK

After adding another receipt part:

- new image appears in Receipt Stack
- stable document identity is preserved
- combined evidence reparses
- SYSTEM_SUGGESTED values may update
- USER_EDITED values remain protected

Do not open a second Review screen.

Remain in the same Review workspace.

## 22. SOURCE PICKER

Redesign the existing generic Scan Receipt source chooser into a small
explanatory receipt-scanning sheet.

Current generic buttons:

Camera
Photo Library
Files
Cancel

do not explain the capability.

New sheet should communicate:

Title:
Scan receipt

Guidance:
Scan one receipt, or add multiple parts of a long receipt.

Sources:

Camera
Take one photo

Photo Library
Select one or multiple photos

Files
Select receipt images

Capacity:
Show remaining capacity appropriately, for example:

Up to 3 images per expense

or dynamically:

2 attachment slots remaining
1 attachment slot remaining

Do not imply PDF OCR support.

Camera remains single-capture.

Photo Library should support multi-select up to remaining attachment capacity.

Eligible image Files may support multi-select where safely supported.

All images selected from ONE Scan Receipt action belong to ONE
ReceiptScanSession / ReceiptEvidenceSet.

Each remains an independent attachment draft.

After OCR:

- combine successful documents
- parse complete evidence set
- open ONE Review workspace

Partial OCR failure must not discard successful receipt images.

## 23. PORTRAIT LAYOUT

Portrait default:

Form-focused mode.

Form uses nearly full width minus visible Receipt Stack.

The user should normally be able to see:

Scan another part
Title
Amount
Currency

within one screen or very close to it.

Candidate areas are limited to two rows each specifically to support this goal.

Avoid unnecessary vertical scrolling.

## 24. LANDSCAPE LAYOUT

Landscape is an intentional part of this UX.

When the phone rotates to landscape, use the wider screen as a natural
side-by-side review workspace.

Preferred landscape concept:

LEFT:
Form

RIGHT:
Receipt

Do not merely stretch the portrait form across the screen.

Conceptually:

┌────────────────────┬────────────────────────┐
│ Title │ │
│ Woolworths │ │
│ │ Receipt │
│ Amount │ │
│ 95.85 │ TOTAL 95.85 │
│ │ │
│ Currency │ │
│ NZD │ 1/3 │
└────────────────────┴────────────────────────┘

Landscape should make direct visual comparison especially comfortable.

Receipt image should use the available vertical space efficiently.

Candidate tags may remain visible where space permits, but field/image
comparison takes priority.

Do not require landscape for functionality.

## 25. FUTURE TABLET / ITINERARY PATTERN

Implement the layout cleanly enough that the underlying interaction concept can
later generalize to:

LEFT:
structured fields

RIGHT:
source material

Potential future uses include:

- iPad
- Itinerary Import
- booking confirmation review
- PDF/screenshot extraction

Do NOT implement those features now.

Avoid receipt-specific layout hacks that make the pane architecture impossible
to reuse.

## 26. HEADER

Keep:

Cancel
Review receipt
Confirm

Do not redesign global navigation styling in this slice.

Confirm continues to use accepted C4 behavior:

- validate Review
- transfer confirmed Title/Amount/Currency
- transfer receipt drafts
- return to New Expense
- do NOT save Expense automatically

## 27. USER-EDIT PROTECTION

Preserve existing ownership semantics.

SYSTEM_SUGGESTED:
may update after new receipt evidence.

USER_EDITED / explicitly selected:
must not be overwritten automatically.

The redesigned UI must not regress this behavior.

Do not display internal ownership labels.

## 28. OCR/PARSER FAILURE

If OCR returns no useful suggestion:

The Review workspace remains usable.

The user can:

- inspect receipt
- manually enter Title
- manually enter Amount
- manually select Currency
- Confirm

Do not turn OCR failure into a blocking error.

## 29. ACCESSIBILITY / INPUT

Preserve usable touch targets.

Candidate tags may be compact, but must remain tappable.

Amount keyboard should remain appropriate.

Keyboard must not make Confirm or active field impossible to use.

Receipt Drawer must have accessible labels/actions for:

- open receipt
- close/collapse receipt
- receipt number
- remove receipt

Do not rely exclusively on gestures.

## 30. PERFORMANCE

Receipt Drawer animations must remain smooth.

Do not repeatedly decode full-resolution receipt images during every animation
frame.

Reuse existing normalized/local receipt representations appropriately.

Do not create unnecessary long-lived image derivatives.

Do not change accepted attachment normalization/storage behavior.

## 31. TESTS

Add/update focused automated coverage for at least:

FORM:

- only Title/Amount/Currency are semantic Review fields
- old explanatory/debug UI removed
- candidate tags render
- max two-row/overflow model
- selected candidate state
- manual edit clears selected-match state where appropriate
- Title overflow
- Amount overflow
- Currency candidate tags
- Currency overflow opens full picker
- no-suggestion compact state
- USER_EDITED protection

SCAN:

- Scan another part prominent
- enabled with capacity
- disabled at max capacity
- multi-select Photo Library respects remaining capacity
- selected images form one ReceiptScanSession
- partial OCR failure preserves successful documents

RECEIPT STACK:

- one image
- two images
- three images
- stable numbering/document identity
- open selected receipt
- compare mode preserves Form pane
- collapse behavior
- switch active receipt
- remove active receipt
- removal reparses
- edited fields remain protected

C4:

- Confirm behavior unchanged
- Cancel behavior unchanged
- receipt drafts transferred exactly once
- no OCR persistence added

LANDSCAPE (acceptance checklist completed from approved sections 23–24):

- rotate portrait to landscape and back without losing review edits or active receipt;
- fields and source remain side by side, readable and left aligned;
- receipt uses the available height, preserves aspect ratio and can be enlarged;
- keyboard, larger text and VoiceOver retain reachable controls.

## Implementation decisions

- Reuse existing Scan receipt source sheet, multi-select import/OCR queue,
  ReceiptScanSession, review ownership, money validation and C4 transfer.
- Measure native candidate chip widths, pack into at most two rows, and reserve
  a 44 pt overflow control. Title/Amount overflow uses a compact in-workspace
  list; Currency opens the existing full searchable CurrencyPicker. No parser changes.
- Number receipts from stable draft scan order (not array position); removing a
  part does not renumber surviving parts. Tabs switch by document identity.
  The expanded identity is `Receipt N` using that same stable number; capacity
  remains in the separate slot indicator, avoiding a misleading ordinal after removal.
- Portrait exposes a 36 pt image stack. Compare mode starts at a 42% form pane;
  landscape starts with side-by-side panes automatically and still supports collapse.
  Rotation restores the landscape comparison default. Layout follows actual workspace
  bounds, and device visual acceptance must verify the proportions.
- iOS uses native ScrollView pinch/pan (1–5x) over the normalized local image.
  Collapse swipe belongs to the panel's header/edge, outside the zoomable image,
  so image panning cannot dismiss the panel. Numbered tabs switch images.
  Close and remove are explicit accessible controls; retry is in receipt actions,
  outside the image. No immediate swipe deletion or separate preview workflow.
- Review uses a full-screen native modal with the unchanged global header;
  pageSheet presentation cannot reliably honor phone landscape orientation.
- Enable iOS landscape eligibility in Info.plist, retain portrait on the main
  navigation stack, and allow the Review modal to rotate. No other screen redesign.
- Animate only receipt translation with the native driver; no image copies or
  derivatives, no new dependency, schema/API/backend change, commit or push.

## Validation status

- Implemented the three-field candidate presentation, two-row measured tags,
  selected-value matching, overflow lists/full currency picker, persistent capacity
  action, stable receipt stack, same-surface comparison, native zoom/pan,
  numbered switching, explicit removal/retry and orientation configuration.
- Reused the accepted multi-select source sheet and C1–C4 lifecycle without
  changing OCR/parser, repository, backend, schema or money rules.
- Focused regression: 14 files / 213 tests passed. The new checks cover layout
  models and source wiring; they are not native rendered interaction tests.
  TypeScript, affected ESLint, formatting and diff checks passed.
- iOS Release compilation and signed Release build passed; the generated app
  signature verified. Artifact: `/private/tmp/otr-receipt-review-build/Build/Products/Release-iphoneos/OTRMobile.app`.
  Installed/launched on the authorized iPhone 16 Pro with existing data retained.
  No commit or push.
- Physical portrait observations passed: 1/2/3 images; first and subsequent
  multi-select into one session; measured two-row tags; Title/Amount overflow;
  full Currency picker; manual edits clearing selection and remaining protected
  after additional OCR; stable capacity action disabled at three; editable form
  beside the receipt; numbered switching; header right-swipe collapse; retry and
  removal; Confirm applying three values and retained attachments without Save;
  Cancel leaving the original empty form and no attachments. No Expense Save
  occurred, source Photos were unchanged, and acceptance drafts were discarded.
- Removal revealed that the header used array position while tabs used stable
  scan order. The header now uses the stable `Receipt N`; the corrected Release
  was rebuilt/reinstalled and a surviving Receipt 2 header/tab verified after
  removing Receipt 1. Final fix regression: 3 files / 35 tests, TypeScript and
  affected ESLint passed.
- Native visual acceptance remains open for narrower devices, rotation both
  ways/landscape proportions, pinch/pan, software keyboard, larger text and
  VoiceOver. iPhone Mirroring cannot drive rotation/multi-touch and uses hardware
  text input. Existing Debug Mode was enabled during these checks; the normal
  no-debug display was not observed. Do not label the entire UX visually accepted
  until the outstanding physical checks pass. The app was left on Ledger.

## Owner feedback — 2026-09-28

- Replace the ambiguous Form/chevron collapse controls with a filled Hide image
  action and an explicit close symbol. Comparison keeps Title/Amount suggestions
  available through compact dropdowns below the inputs; Currency suggestions open
  the existing picker. Lists retain parser ranking order (ranking points, not
  statistical probabilities), with no parser or money semantics change.
- Show Currency as an overlay over the retained Review workspace, preserving the
  same native image ScrollView and its zoom/pan when returning to the same receipt.
- Replace the one-item actions menu with a direct Re-read button, which runs OCR
  again for the active image. Remove the OCR count/parser-version text entirely.
- Currency mismatch means the selected amount candidate is associated with a
  different currency, sometimes inferred from a bare symbol and Journey context.
  It is not a currency lock. Explain both remedies: choose the candidate currency,
  or manually edit Amount to use the chosen currency. Existing confirmation guard
  and explicit manual ownership remain unchanged; no exchange-rate conversion.
- Feedback regression: six files / 59 tests, TypeScript, affected ESLint,
  formatting/diff checks and signed Release build/signature verification passed.
  Owner subsequently authorized installation. The feedback Release was installed
  and launched on iPhone 16 Pro. Physical portrait checks passed for candidate
  dropdown selection, Currency return to comparison, Hide image/reopen, direct
  Re-read busy/completion with chosen values retained, and no OCR diagnostics.
  A temporary one-image Review is left open for owner zoom-return acceptance;
  no Confirm/Expense Save occurred. Actual pinch zoom retention, rotation,
  software keyboard and accessibility checks remain pending.

## Owner feedback — translucent suggestions and Recent ordering

- In split comparison only, suggestion lists use translucent surfaces without a
  dark scrim. Rows fade horizontally from a near-opaque text surface on the left
  to no additional tint on the right, matching the underlying sheet transparency.
  Other layouts use opaque sheets/rows. The sheet omits the field heading and
  places a solid Close button at the left. Currency Suggestions lists only the displayed
  candidate codes; the Currency value field still opens the full searchable picker.
- Hide image uses a neutral icon/text control with a divider, visually distinct
  from the filled Scan another part action. Re-read retains its existing recovery
  function: retry OCR on the same image, not improve or reinterpret identical text.
- Recent Expenses uses descending Expense updated_at before its limit. Search
  keeps occurrence-date ordering; no Expense dates or financial values are edited.
