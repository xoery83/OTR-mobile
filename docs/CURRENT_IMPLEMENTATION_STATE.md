# Current implementation state — 29 October 2026

## Active delivery

Universal Import product completion is active in the stable worktree
`/Users/xoery/.codex/worktrees/universal-product-20261028/otr-mobile-canonical`.
The `universal-product-p2-host` checkout is an older image host (`e973ffe0`), not
the delivery checkout. Reuse the attached delivery worktree; preserve untracked
Python caches and other worktrees. Start from this handoff and the specific
receipts below, not a new historical audit. Previous detailed handoff prose is
recoverable in Git `72331060`; all underlying receipts remain in `docs/ops/`.

Universal owns Source/Task/Provider/Admission, Import Activity/Results/Review,
Documents custody and Import event projection. Native owns shared Navigation,
Day Feed, Core/Queue/Sync and manual forms. Auth owns identity. Public interfaces,
DEV service/SQL changes and main updates require serial Writer coordination.

## Verified Import behavior

- Historical minimal P1–P6 formal Save Golden Slices remain accepted. Sparse P2
  only; no Qualified Segment/Journey/Booking/Ticket. These do not certify all-user
  Beta or binary interpretation.
- Normal restricted-QA product P1 and the five-file P2–P6 Batch completed real
  Source Review→Plan→Admission→Core, independent readback, Day Feed and cold
  recovery. The five accepted Items each have their own legitimate Source;
  no Cartesian Batch-to-Item links. P5 is TRAIN. The account/Trip, exact supported
  types and original 2026-11-01T08:48:56Z expiry remain the approved boundary.
- Current mixed Batch `c31cd292-bb97-4902-857c-d5cc63c86d2c` / Task
  `bcff4ba9-5136-886f-a214-00b75229c745` has one real Attempt
  `401a0382-221c-84c9-9c05-53d678c18dc6`: SUCCEEDED, Task PUBLISHED, wake COMPLETED.
  The Result is ABSTAIN/zero candidates: the Plan text does not establish a legal
  kind/subtype. Do not invent Review or Save. PDF is retained/Not processed and
  absent from the sole TXT Source binding.
- Actual normal AD5 JS101 refresh and cold My Trips→same 19:27:30 Batch→Results
  passed under the read optimization. Original/input IDs and both blob hashes
  remain exact; no Analyze/Save on recovery. Independent call count remains one:
  1506 input +75 output tokens, cached1280; recorded estimate165480nanos
  (US$0.00016548, not invoice). No new Item was created from ABSTAIN.
- Explicit Start can coalesce one user click behind a status GET; hidden,
  Account/generation or Batch transitions cancel the intent, including leave and
  return before GET completes. It is not a second queue or automatic retry.
- PDF/image Local Durable original viewing, background cleanup and normal cold
  reopening have separate Native acceptance. Local originals are not permanent
  cloud backups. Trip Documents, Personal Inbox and Import Activity remain
  separate. Saved Updates use real completion receipts and Batch event identity.

Authoritative receipts under `docs/ops/universal-product-20261028/`:
`CONTINUOUS_PRODUCT_P1_SERVER_VERIFIED.json`,
`MULTI_SOURCE_FIVE_ITEMS_SERVER_VERIFIED.json`,
`MULTI_SOURCE_FIVE_ITEMS_NATIVE_E2E.json`, `MIXED_FRESH101_INTERPRETATION_RECEIPT.json`,
`RESULT_READ_REUSE_REVIEW.json`, `RESULT_READ_REUSE_NATIVE_RECEIPT.json`,
`PDF_LOCAL_NATIVE_READER_PASS.json`, `IMAGE_LOCAL_NATIVE_READER_PASS.json`.

## Code, DEV and integration

- Read optimization source `1822be4c`: same authenticated GET reuses the manifest
  already validated by the canonical two-read/hash guard, instead of running that
  guard twice. Material tampering, second snapshot drift and Auth revocation during
  receipt read still reject; no cross-request cache. Three suites20 tests,
  typecheck/lint0errors and independent NO_BLOCKER. Native recovery above is real;
  it is not a precise latency benchmark or proof of every earlier failure cause.
- Last Import-verified DEV image:
  `sha256:c8f9dbce0b15c13ab46a921d7fed4a467812606a59d84d56672a423714df7f9a`,
  container `d32e8370295c0d3622bcf3c8be76e234c6eb1574f612fd7617ccd09452a852af`.
  Server bundle1098…, capture9c0915…, Configc91f…, HostConfige89…, Envab5…,
  original six mounts/four config hashes, health200/unauth401 independently passed.
  Previous750a/4847 is stopped/retained rollback. No SQL or permission change.
  Native now owns its next diagnostic deployment: always obtain its newest actual
  image/config before deployment or rollback; do not restore an older image over it.
- Root read receipt uses only Synthetic QA Account
  `f4b059c5-8241-4ffb-aa15-37fa25474543` / Trip
  `825f79b2-4a9d-4535-a62e-43000ca50c4a`. Source sustained scope and Provider
  budget/expiry have not been enlarged. Fresh-check actual gates before mutations;
  no Root temporary admin or Provider window is open.
- Last completed Import main push: `11c7feaa`; original primary six dirty entries,
  full tracked/index diff and untracked bytes were preserved. Auth subsequently
  integrated its local-only Source/journal work through main `72331060`.
  Root privately joined that main at `c66d968b`. Public main integration of the
  read optimization/evidence is next, after fresh remote and serial lease checks.
  Latest main is not automatically the source of the curated DEV image.

## Remaining checkpoints

1. Close the expired zero-Attempt lifecycle through the existing continuation
   Repository and real owning queue claim. GET must continue projecting persisted
   Task state. Do not fake FAILED in the client, reset a deadline/identity, terminate
   UNKNOWN/existing attempts or release their budget. Stop invalid terminal-task
   wake actions while preserving read-only recovery. This is the next local slice.
2. PDF/OCR Source→Task/Admission remains NOT_READY. Reuse the restored V4
   preparation/causal/storage ports, V2 proof reader and fixed qpdf/Poppler worker.
   They remain unbound/default closed. Existing V4 scope is pinned to historical
   objects and cannot be borrowed. Global PDF gate remains closed; normal scoped
   binding, legitimate ORIGINAL/DERIVED identities, exact evidence qualification
   and isolated Host execution need a precise reviewed owning packet. No evidence
   currently justifies new Schema/RLS/GRANT.
3. Complete the remaining input failure/offline/Account/Document permission matrix;
   distinguish LOCAL_PASS, SERVER_VERIFIED and NATIVE_E2E_PASS. No repeated model
   benchmark or full six-slice audit. Preserve all older expired Batches, UNKNOWN
   calls, holds, originals and receipts; no blind replacement or automatic resend.

## Other lanes and resource safety

Native thread `01a17101-8b2d-7240-ab67-f4c34a5d90d9` owns its manual E2E and current
normal TripCreate diagnostics. Its separately approved two-account rollout updated
`trip_sustained_dev_scope_allowed` OID66180 to MD5
`8b7e35a4e6f8512f1aa90c5cb98f9ed7`, preserving Owner/ACL and Source scope. Never
reverse it to the former account literal. Its next software image must retain the
Import read change. Root does not inspect those users' data or copy credentials.

Auth thread `01a1803b-c5a7-7ab0-a90f-fb4f87609201` owns Guest journal v3/source
projection and the separate normal-JWT self-profile port candidate `2b2fd000`.
That Profile port is not an Import acceptance result or broad authority. Native
owns its Backend mount/DI. Do not integrate unaccepted private candidates for them.

AD5 `AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A` is Import; Forms QA/phone are Native.
Use short coordinated Device Hub access, preserve My Trips root, original Native95
binary compatibility and SQLite74. Do not copy Session/Keychain, operate Production
or real-user data from this lane. Keep heavy builds serialized and bounded.
