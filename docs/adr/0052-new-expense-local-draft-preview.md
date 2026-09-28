# ADR 0052: Local preview for unsaved Expense attachments

Status: Accepted for Expense Capture UX 1.0 Slice 1.1.

New Expense previews its already verified local image drafts directly from their existing file URI. It does not create a thumbnail derivative or change draft persistence. For PDFs, the existing iOS native receipt module exposes a narrow Quick Look presentation function. It accepts only existing PDF files under the app's `ledger-receipt-drafts` directory. This keeps preview local and avoids routing a draft through the Share Sheet or adding a PDF rendering dependency.

Saved Expense attachment viewing remains a separate later UX slice. Upload, hashing, recovery, and maximum attachment count are unchanged.

Slice 1.2 adds an explicit Close button to the native PDF navigation wrapper. The New Expense image preview supports horizontal navigation among local image drafts and a separate Close; mixed image/PDF swipe navigation remains deferred. Neither preview path displays attachment size in routine entry.
