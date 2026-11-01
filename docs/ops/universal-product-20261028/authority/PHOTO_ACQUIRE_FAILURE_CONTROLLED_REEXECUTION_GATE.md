# Photo acquire failure — one controlled DEV reexecution

Status: PREPARED, NOT AUTHORIZED, NOT EXECUTED.
Code: `5e325506` (safe diagnostics, independently reviewed; 17 focused tests and scoped lint PASS).

## Actual reason

Same Batch `f1533073-0cd5-4514-824f-03f779a852b7` / Source
`c9fe6fd2-3713-4e37-9e72-ede6db7b093d` completed normal ACQUIRE/PREPARE/UPLOAD/VERIFY.
Task `ea78041f-f90f-836e-b205-14f1647ea2af` expired at `2026-11-01T03:09:08.339Z`.
Attempt `803f2a52-42d4-8857-8a9e-c691da2bf1b3` / ledger call
`32b7fe02-9c6f-88a9-b400-446a4491b8a9` failed at Provider ACQUIRE, before its SEND phase.
The recorded error message is empty; underlying cause is NOT proven. No response was
retained. The ledger remains MAY_HAVE_STARTED/RUNNING and cost UNKNOWN. This packet
neither claims a root-cause repair nor treats the old call as uncharged.

Prior scope's single Vision allowance is now conservatively occupied. Its expired Task
cannot be reset. A new object/call is outside that single-use allowance, hence this exact request.

## Exact additional scope

Only DEV Supabase `tuqigdxrvrerfewsxqgm` / approved `otr-dev-backend` service.
Actor/Account `f4b059c5-8241-4ffb-aa15-37fa25474543`.
Trip `825f79b2-4a9d-4535-a62e-43000ca50c4a`.

Through normal App, at most ONE additional Batch, ONE Source, ONE Run/Task, using the
same retained `universal-photo-activity-qa.png`, 42630 bytes, SHA256
`078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515`.
Record new IDs before dispatch. Repeat normal relevance check and current explicit AI
choice, never transfer or fabricate consent. At most ONE additional original-image Vision
attempt using the existing approved DeepSeek profile; all old UNKNOWNs and holds remain.

No increase to $0.05/call, 20/day, $1/day, existing total budget or existing hard expiry
`2026-11-01T08:48:56Z`. Both old and new calls count conservatively; insufficient remaining
budget stops execution. No automatic third attempt/replacement, including if this attempt
also fails or becomes UNKNOWN. No refund, reset or relabeling of the old call.

Successful interpretation may proceed through existing normal Review/Plan/Admission to
ONE PRIVATE/SELF minimal P1 or P6 supported by actual evidence, independent readback,
Native Day/cold recovery and same-ID duplicate confirmation. No speculative values or
other business types. Original Gate's actor/Trip/business authority boundaries unchanged.

## Activation preconditions

- Auth returns actual resources CLOSED; fresh DEV identity/version/hash/config CAS.
- Reconcile old Task/call/retained response first. If legally recoverable results exist,
  STOP replacement and use recovery; never run both paths.
- No active or unresolved new Photo worker operation; controller and independent close drill pass.
- Code-only compatible image contains 5e325506 diagnostics and preserves latest approved
  Auth/Native/MCP artifacts. Build, focused checks and independent receipt BEFORE opening.
- Record actual current healthy image/commit/config/mount hashes and rollback; no stale image restore.
- Existing normal QA auth, Source/Provider/usage scope and current user selection verified.
- New Task uses existing ten-minute, attempt1 rules; no deadline reset or extension.

## Closure / rollback

Reuse existing reviewed controller. One session <=60 minutes, bounded by original hard
expiry: start close at +45 minutes, independent watchdog at +50, SQL absolute expiry +60
or original hard expiry, whichever is earlier. Do not open without enough time for closure.
Any failure stops further dispatch and closes Source scope/worker, independently verifies
CLOSED and EMPTY, and retains evidence. Code rollback uses freshly fixed compatible healthy
image; restore only exact authorized runtime CAS. No protected SQL/function reverse install.

All old/new originals, Source operations, journals, markers, Tasks, calls, UNKNOWNs, holds,
accepted Items and receipts remain. No delete/recreate, identity swap or SQL bypass. Accepted
Item/receipt means read/reconcile only, never create another identity.

## Explicit exclusions

No new/modified SQL function, Schema, RLS, GRANT, Role/member edge, Secret purpose/access,
Provider/model, cross-Account/Trip access, Production, real-user data, budget uplift or
permanent authority. Any such finding stops only that protected step for separate decision.

This is a single controlled reexecution with better diagnostics, not a claim that Photo
E2E has passed or that an additional attempt is guaranteed to succeed.
