# Documents UX correction — interim evidence

Product cc706aa1 plus toolbar-unmount follow-up. Complete iPhone Release Native build succeeded and was installed in place; normal Trip→Menu→Documents shows top-right search and no inline search form. Dedicated full-screen search was entered and Boardwalk query returned actual authorized rows. Screenshot: screenshots/iphone-directory.png.

87 targeted tests pass across seven files, including architecture boundary; UI guard175 passes, scoped lint passes. Typecheck retains exactly three documented Main errors. No Provider/Analyze/Save, SQL, shared DEV or Main push performed.

Original availability diagnosis: this iPhone has synced metadata/relationships, not the B1 original bytes held on the original iPad. The owner can now reselect the exact original through normal Files; digest/length mismatch refuses before retaining bytes. Unit checks verify same metadata/associations and no new operations. Actual system Files picker opened and public synthetic JPEG/PDF were visible. Selecting a file did not complete through DeviceHub during this attempt: **actual local restoration/viewer completion NOT VERIFIED**, not PASS. No old private originals, Session, Keychain or SQLite were copied.

Scroll chrome pure gesture regression passes. Final complete Native directory is verified, but DeviceHub scroll/drag did not produce a reliable drag transition; **filter-only pinned runtime NOT VERIFIED**. Do not substitute unit tests for this UI acceptance. Original iPad adaptation is not rerun for this follow-up.

Full approved-source gap comparison: DOCUMENTS_BLUEPRINT_GAP_MATRIX.md. Overall Documents Blueprint conformance remains PARTIAL. Continued work is still required for actual scroll and Files completion; no request for Owner to troubleshoot ordinary simulator issues.
