# Lane C — Import / Documents / Form AI: V4 handoff

**PREPARED / IMPORT WRITER FROZEN / RECEIVER ACCEPTANCE PENDING.**
Owner directed the split on3Nov2026. First measured freeze time:
**2026-11-03T09:23:05Z /22:23:05 NZDT**. Root1 keeps Core/Main integration;
no new Import business coding, Batch submission, paid call, Source/Task mutation,
UNKNOWN replay or Gate activation is permitted by this package.

## Start here

1. Read `docs/CURRENT_IMPLEMENTATION_STATE.md`'s latest handoff pointer, then this
   package. Do not reconstruct the whole history or rerun the six Golden Slices.
2. Verify actual local/remote main and Hosted identity against
   `evidence/SNAPSHOT.json`, `HOST_AND_TASKS.json`, `PG_SCHEMA_AND_SOURCE.json`
   and `PROVIDER_CURRENT.json`. Snapshot base main was
   **b16c2d932ce602e86db83796eefe20d94b215aed**. Later Root1-only commits may exist;
   compare the affected interfaces rather than resetting another worktree.
3. Use a stable independent `codex/` worktree. Preserve all historical worktrees,
   unsubmitted device draft, originals, attempts, holds, receipts and private evidence.
4. Distinguish product targets, local tests, actual device observations and real
   Hosted acceptance. A local/mock result or ordinary software deployment is not
   fresh AI/Admission E2E. Old Root approvals are **not execution authority for the
   receiving Agent**, even when their original conditional quota was unused.
5. Confirm the owning interfaces and current permitted actions before submitting
   `LANE_C_HANDOFF_ACCEPTED`. Root1 must acknowledge that actual acceptance before
   marking the business DRI transfer complete.

## Package map

| File | What it settles |
|---|---|
| [PRODUCT_SCOPE.md](PRODUCT_SCOPE.md) | Owner-approved Beta targets versus implemented and Post-Beta scope |
| [ARCHITECTURE_AND_OWNERSHIP.md](ARCHITECTURE_AND_OWNERSHIP.md) | Real code path and Import/Core/Auth/Native ownership |
| [CURRENT_STATUS_AND_EVIDENCE.md](CURRENT_STATUS_AND_EVIDENCE.md) | Pass levels, exact historical receipts and remaining failures |
| [IN_FLIGHT_CANDIDATES.md](IN_FLIGHT_CANDIDATES.md) | Fixed SHAs, worktrees, changed files, review, main/push and conflict limits |
| [QA_FIXTURES_AND_RECOVERY.md](QA_FIXTURES_AND_RECOVERY.md) | Exact synthetic identities/originals, device state and safe recovery |
| [PROVIDER_AUTHORIZATION.md](PROVIDER_AUTHORIZATION.md) | Actual expired/closed qualification, caps and non-transferable approvals |
| [NEXT_EXECUTION_QUEUE.md](NEXT_EXECUTION_QUEUE.md) | C01 first; other focused slices and their acceptance/dependencies |
| [INTERFACE_DEPENDENCIES.md](INTERFACE_DEPENDENCIES.md) | Unique Writer ports, no parallel canonical systems |

Small safe evidence/original copies are under `evidence/` and `fixtures/`, with
SHA256/provenance in `evidence/ARTIFACT_MANIFEST.json`. Large histories/private
catalogs are referenced, not copied. No Secret, Token, Keychain, session vault,
raw auth environment, real-user material or database copy is included.
For historical objects not on main, use `git show <fixed-SHA>:<repo-path>`; do not
merge a private evidence branch. Local preserved paths are listed for missing
remote objects. Raw Source definitions remain private and are not authorization.

## Current user-visible position

Historical P1–P6 minimums, text PDF and one PNG Vision formal Save passed.
Retained Batch794b can reopen Results/original and accepted Item; the first cold
Photo503 remains unproven. Current merged Activity/Documents/P3 recovery fixes
have local evidence, not new current-main Native acceptance.

AD5 is in normal Import for the existing QA Trip. A file named
`universal-photo-activity-qa.png` (UI43KB) is selected in an **unsubmitted local
draft**. Submit Batch was not clicked. The expected fixture is42,630B/SHA078de8…;
this specific device draft's bytes/hash were not independently reread. Its cold
persistence and installed binary/JS parity are not established. Do not close the
retained session or submit it on this handoff's authority. No new Beta Batch,
Source, Task, paid Attempt or Save exists from this draft.

## First executable slice

**IMP-C01 pre-Gate readiness**: verify the normal AD5 Account/Trip and installed
version, inspect the unsubmitted draft against the portable exact PNG, consume
merged Activity/Documents/Updates/Review adapters with local fixtures and prepare
one current-source qualified execution package. New protected/paid execution
requires Owner authorization explicitly covering the receiving Agent. Once
qualified, one new PNG Batch→real processing/results→explicit review/save→independent
cloud readback→Day/Documents/Updates/cold restore; preserve IDs on UNKNOWN.
Do not turn readiness into a new architecture or repeat the old Golden matrix.

## Acceptance record to return

Return one actual `LANE_C_HANDOFF_ACCEPTED` event containing:

- handoff commit and actual main/remote inspected;
- actual DEV service/project/image/CID and qualification observed;
- candidate set retained and the Import files the new Agent owns;
- Source/Provider/Actor/Price expired/closed state and no old-Gate reuse;
- first chosen slice, precise blocker/dependency and needed Owner Gate;
- evidence pointer and receiving chat/Agent identity.

An MC ACK, review PASS or this package's commit is not receiver acceptance.
Root1 remains preservation/integration contact until that event is received and
acknowledged. Root1's Auth/MCP/Core/Enrichment requests are not transferred here.
