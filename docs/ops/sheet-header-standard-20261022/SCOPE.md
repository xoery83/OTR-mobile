# Bottom sheet standard — first integration, 2026-10-22

Owner baseline: ../../architecture/BOTTOM_SHEET_HEADER_STANDARD_V1.md.

Applied: Start Trip, Trip Quick Add, manual itinerary chooser, Create/Edit Trip, nickname/traveler editor, travel range picker, Import composer and its Email/AI/context views. Shared SheetHeader opt-in preserves legacy callers. Existing dirty/save/account generation guards and writer contracts remain authoritative.

Quick Add: import full-width plus four action cards; Day Feed adds selected-day controls, Trip Home does not. Outside close is available on both action menus and the itinerary chooser; selecting an editor preserves its existing dismissal guard. Import replaces the menu and closes to its original page.

Remaining inventory: P1/P3/P4/P5 editors and P2 flight adapter still own their save CTA; no relocation in this patch. P6/Flexible remain unavailable under their owning interfaces. Ledger/Members/Photos legacy headers remain on the existing default pending gradual adoption. No blanket completion claim.

Existing boundaries: member invitation unavailable; photo callback currently adds Trip photos and does not change cover. Copy therefore says “Add photos to this trip”. Import text/mixed submit, Email/AI services remain unavailable. Clipboard image and Speech Native failures tracked separately; these UI checks do not qualify them.

Validation: 44 targeted tests; typecheck, UI guard and changed production-file ESLint pass. Native validation pending at this source checkpoint.
