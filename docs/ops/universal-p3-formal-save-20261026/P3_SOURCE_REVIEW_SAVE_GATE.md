# P3_SOURCE_REVIEW_SAVE_GATE — approval pending; default closed

Request: install the fixed three-function replacement package, then open exactly one nonrenewable 15-minute reviewed-source window for one private SELF P3. The P3 input Gate authorized parsing only; P1's consumed Gate grants no P3 authority.

## Exact target

- DEV only: otr-dev-backend, 178.105.151.143 / https://api-dev.xoery.art; Supabase tuqigdxrvrerfewsxqgm.
- Actor f4b059c5-8241-4ffb-aa15-37fa25474543; Trip 825f79b2-4a9d-4535-a62e-43000ca50c4a.
- Batch b290fa7f-44a4-431a-8aa2-2adf63fe938e; Task 46945250-bfd8-8fcf-af74-f2e56bf85f7d; Run 5015f4ad-99bb-8878-8926-2561d19710c8.
- Source 97e9a866-6c28-456d-a385-ed2b236d059d; representation c2ad6902-bcce-40dd-9697-6c63d9654818; revision1.
- Original P3_MINIMUM_SYNTHETIC_QA.txt,336bytes, SHA9c5d31bd56d3961726f5be39362b059694bcad9b7ed8b555c9554cce9bf878e7.
- Result SHA f762ec135e7a96216463917d1a77b06e8c59b8901216b7d5d5f8e52c0e5e5a88; token i1.
- Candidate ebee124d-9a68-8fcd-919c-46d5157cffda (not yet sealed; no claimed Candidate Save PASS).
- Item 1397477b-db1f-8d5e-9ffe-3c6c037d78a9; operation a98856b8-209a-8bc0-9e2b-e0919bb73181; slot f7d1d2e0-ab82-80e3-97bc-d6686a63e845.
- Explicit normal Native original/Trip/NEW confirmation: Harbour QA Hotel, check-in2026-11-02, check-out2026-11-03. Exact original UTF8 spans121..137/153..163/180..190. Clocks/zones remain unknown; no Place, Guest Person, Booking, Ticket or entitlement creation.

- Code98251fcc8a1a3e6afab6be74da10d76a2d34cb9b; default-off candidate image sha256:29f6db22c6c92d461ddffb65bf8190165cf14e525ce8d077fa19839b9764e425, capture bundle7d20ed5bc218041d6a1d91887fb07e69d393c20a07a1e7807ffd97e0caca3537. Built locally; not yet deployed.

## Protected change requested

P3_REVIEW_DEV_INSTALL.sql replaces exactly three existing functions: trip_sustained_import_p1_capabilities(uuid,uuid), trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid), trip_core_guard_historical_source_association(). Existing function names and owning authority are reused. P1 semantics remain; exact scope.family P3 enables only CREATE_ITEM/REVIEWED_SOURCE, never Manual P3 or P2/P4–P6. P3 uses explicit reviewed NEW, three original fields and P3_ITEM proof. Existing Core and stay detail storage/Reader are reused.

No new tables/columns, RLS, GRANT, roles/memberships, Secret access, Account/Trip scope, Batch/Source/Task/Attempt or Provider call/budget. Existing legacy policy columns hold the exact P3_REVIEW_SCOPE.json plus one absolute expiresAt. Installation checks all three saved function hashes and closed policy in one transaction; unexpected drift aborts. CREATE OR REPLACE preserves function ownership and ACL. No hosted SQL has been applied.

## Preconditions and execution

1. Explicit Owner approval; independent code and SQL review; isolated real PG qualification and negative tests PASS.
2. Standing-authorized code image fixed by Commit/build/Digest, deployed default off and healthy. Record exact retained healthy container/image/config/mounts before activation. A changed image uses normal deployment preflight and rollback, never changes this business scope.
3. Normal QA Results200; exact source/text/hash, actor/Trip eligibility and pinned result unchanged. Candidate/Item/operation receipt absent. If any exists, reconcile its immutable identity; do not reopen or choose another ID.
4. Coordinate short AD5/8097 use. Native original+Trip review ready before arming timers. Do not copy Auth/Keychain or alter another Worktree.
5. Before activation arm independent remote runtime watchdog with fixed deadline start+900seconds; clamped SQL expiresAt equals that outer deadline. Local closer starts+660seconds. No extension/reset/replacement scope. Stage controller and self-test before arming. P3_REVIEW_ACTIVATE.sql receives only that validated fixed UTC deadline; a fresh run directory prevents local rearming. Activation refuses already-started Candidate/Item/operation.
6. Normal App confirmation→existing Source publish/Plan→Admission→Core CREATE_ITEM(P3). One target/operation only. Record Candidate SHA, full Mutation Receipt and Item ID; independent Supabase readback and existing Source finalization. UNKNOWN requires fixed-ID readback before retry, never new operation or Provider resend.
7. Close immediately after accepted/readback; Day Feed/cold restart and same-operation duplicate confirmation/readback can finish closed. Unselected candidates remain unsaved.

## Closure and rollback

- Success/error/UNKNOWN/+660s: execute P3_REVIEW_CLOSE.sql with exact scope CAS; independently verify enabled=false/scope=null. Restore retained default-off healthy runtime; verify health/protected401 and exact config/mounts.
- Independent remote watchdog restores default-off service no later than+900s. Absolute SQL expiry independently blocks new writes after deadline. Do not extend for diagnosis.
- P3_REVIEW_DEV_ROLLBACK.sql restores exact three function preimages after policy closure, with postimage hash CAS. It does not delete Source/Candidate/Item/receipts or remove policy columns. Preserve accepted data even on software rollback. Installer/rollback are mutually checked; function drift requires a new precise review.
- Retained known healthy baseline image sha256:4979d4450ab6bf3eedb6faf18663e34e12d77e1dcc632cad96959f780d145597, container481bd4f930cb1caa173660f5b4d2d42c3cd94bcce2ad8d0e9de2ef66819c741c. If an ordinary default-off P3 image becomes current, retain both and record fresh exact runtime rollback preflight; no timers until verified.

## Evidence and acceptance

P3_INPUT_RESULTS.json and P3_INPUT_TERMINAL.json prove one actual paid attempt SETTLED with complete minimum facts, not formal admission. P3_REVIEW_SCOPE.json fixes business identities. P3_REVIEW_FUNCTION_PREIMAGES/POSTIMAGES.json and paired INSTALL/ROLLBACK SQL pin the requested authority change. Validation/review receipts are separate. Approval authorizes this bounded slice only; it is not a Save PASS.

Close only after actual SERVER_ACCEPTED, independent SERVER_VERIFIED, same Item in AD5 Day Feed and cold restart, duplicate confirmation no second Item, all temporary Gates closed, independent review and serial main integration/smoke. P2 remains separate and unqualified.
