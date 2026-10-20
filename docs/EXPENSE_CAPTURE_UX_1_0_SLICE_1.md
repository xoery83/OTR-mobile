# Expense Capture UX 1.0 — Slice 1

Status: implemented, signed Release installed and launched on Leon's iPhone 16 Pro; owner visual acceptance pending.

## Scope and information architecture

New Expense now presents Amount, Currency/Scan receipt, Title, a Category/Date pair, one Sharing summary, Attachments, and compact Notes. The More Details disclosure is removed. Receipt Review, Expense Detail, OCR interpretation, persistence, upload, and backend behavior are unchanged.

Category and Date remain separate controls. Date is formatted with the device locale, omitting the year for dates in the current year; the saved `YYYY-MM-DD` key is unchanged.

Sharing shows `Just you` for the default single-person case. Otherwise it shows the payer (`You` for the actor), participant count or single participant, split method for multiple participants, and Included/Excluded only when group settlement applies. Tapping Sharing exposes the existing payer, participant, split, and settlement controls. The summary reflects draft changes immediately.

Attachments shows an informational Optional label and a distinct Add attachment action using the existing Camera/Photo Library/Files chooser. Drafts, including images transferred by Receipt Review Confirm, use the same simple Image/File rows with Remove. The existing three-attachment capacity hides Add attachment when full. Notes starts as an Add a note row and expands into the existing input; existing text remains visible and editable.

## Acceptance and remaining work

Automated checks cover summary variants, date presentation, and the relevant entry-screen control connections. Seven focused test files (54 tests), TypeScript, affected ESLint, Prettier, diff check, and signed Release build passed. The Release app was installed over the existing app and launched on the authorized iPhone 16 Pro. Physical acceptance should check the default layout, both compact controls, Sharing edits and summary changes, ordinary and scanned draft add/remove, Notes with keyboard, and Save/Cancel. Record the device result here after the owner reviews it.

Later slices: Receipt Review layout, Expense Detail viewer, top Amount/Currency/Scan layout, and final typography/color polish. Device Storage remains separate.

## Slice 1.1 interaction cleanup

- Amount permits intermediate typing such as `234.` while the focused field is edited. The existing integer-minor-unit parser still controls committed validity and Save; excess precision or malformed typing is rejected by the input filter. On blur, an incomplete nonempty amount gets a field border and accessibility hint. No validation row changes the form height.
- Attachment rows use the draft's original filename and MIME type. Generic camera/scan names fall back to `Receipt N`; PDF rows show a document icon and PDF type. Image rows render the existing local draft URI as a thumbnail and open a local full-screen image preview. PDF rows open iOS Quick Look through the existing local native module. Remove remains separate, and the three-item cap still hides Add attachment.
- Sharing is one scrollable editor with inline payer, participant, split, exact-amount, and conditional Include/Exclude controls. It stages changes while open; Done applies sharing fields, while Cancel or sheet dismissal discards staged changes. The main summary updates after Done.
- The Date picker now uses a stationary, full-screen transparent Modal. Backdrop opacity and sheet translation animate separately; date selection and storage remain unchanged.

Slice 1.1 device review: seven focused test files / 57 tests, TypeScript, affected ESLint, Prettier, diff check, and signed Release build passed. The final Release was installed over the existing app and launched on the authorized iPhone 16 Pro. Owner visual interaction acceptance remains pending: check intermediate Amount typing and stable layout; image/PDF/confirmed-scan attachment rows and previews; Sharing Done/Cancel and summary; repeated Date open/dismiss with no moving gray backdrop. Remaining design slices listed above stay deferred.

## Slice 1.2 Sharing clarity and attachment experience

- Sharing keeps payer/participant/split text concise and presents applicable `Included in settlement` or `Excluded from settlement` in a compact reusable tag. An information icon explains that included Expenses help calculate who owes whom. The Sharing sheet uses wrapping 44-point minimum chips for payer, participants, and split selection; Include/Exclude stays inline.
- Exact amounts shows the selected Expense currency's Total, Assigned, and Remaining in minor-unit-safe calculations. The existing Ledger exact allocator gates Done, including missing total, incomplete, under-assigned, and over-assigned states. Only selected participants receive inputs.
- New Expense attachment rows show a local image thumbnail plus useful title; PDF rows show a document icon, filename, and `PDF`. Routine entry does not show file size or an image format label. Optional appears only when empty. Remove is a separate icon button. Normal attachment rows contain no OCR Read action or visible Preview text.
- Image preview has an explicit Close, current image count, horizontal swipe between images, and vertical swipe dismissal. PDFs use a separate local Quick Look viewer with an explicit native Close. A unified mixed image/PDF swipe viewer is deferred to the later saved-Expense viewer slice.
- Photo Library and Files support multi-selection within the remaining three-attachment capacity; Camera remains single capture. Selection above remaining capacity is rejected. Each selected item still uses the accepted draft validation and persistence path. If a later item fails, earlier validated drafts remain available and the error is shown. At three attachments Add attachment disappears while the top `Scan receipt` control stays visible and disabled; no large maximum-warning row appears.

Slice 1.2 device acceptance: seven focused test files / 59 tests, TypeScript, affected ESLint, Prettier, diff check, and signed Release build passed. The Release app was installed over the existing app and launched on the authorized iPhone 16 Pro. Owner interaction review remains pending: check several-person Sharing and Exact accounting; 2–3 image import, thumbnail/title/icon removal and image swipes; local PDF preview and Close; Scan receipt disabled at three; no Read action or file size in routine entry.

## Slice 1.2 owner feedback corrections

- Sharing Exact inputs and New Expense Notes use native automatic keyboard insets. The main form's duplicate KeyboardAvoidingView and forced scroll-to-end behavior are removed; only the focused field needs to move above the keyboard.
- Group settlement is a separate heading, wrapping Include/Exclude chips, and an explanation of the selected option's effect on who owes whom.
- Scan receipt opens a compact explanatory sheet: one receipt or multiple long-receipt parts; Camera / Take one photo, Photo Library / Select one or multiple photos, Files / Select receipt images. Remaining shared attachment capacity is shown. Camera stays single capture; library/image Files can select multiple parts. Files excludes PDF for every scan entry, including the first part. Ordinary attachments still accept PDF.
- Newly selected image parts enter the existing scan session and are read one at a time. Review edits remain protected; removal, cancellation, background suspension and confirmation stop or skip queued work. Restart recovery still requires manual Read. Review retains Scan another part. Source selection dismisses before presenting the native picker, including when opened over Review.
- Attachment filenames are vertically centered beside thumbnails; no file size is added.

Correction validation: seven focused files / 62 tests, TypeScript, affected ESLint, Prettier and diff check passed. Signed Release built with zero errors and one existing build warning, then installed and launched on the authorized iPhone 16 Pro. Owner physical acceptance remains pending: Exact and Notes fields above the keyboard without overscroll; Group settlement heading/chips/explanation; attachment title centering; source sheet initial/add-part capacity, library and image Files multi-select, Camera single capture, and protected Review edits after sequential recognition. Owner authorized a consolidated local Git commit of the UI changes through this checkpoint; no push requested.
