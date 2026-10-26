# P1_SOURCE_REVIEW_FINAL_SAVE_GATE — prepared; approval pending

## Requested action
Approve exactly one new, nonrenewable **15-minute** Source Review → Plan → Admission → Core window for the same sealed P1. Previous windows remain closed and are not reset. This requests duration only; it does not authorize new interfaces, DDL or broader business authority. Do not arm or activate before explicit Owner approval.

## Fixed code and DEV service
- Code: `d83ec6b3bf841cd9c9365f6363a0d5d682371db8`.
- Service: `otr-dev-backend` at `178.105.151.143`, `https://api-dev.xoery.art`; Supabase DEV `tuqigdxrvrerfewsxqgm` only.
- Fixed image: `sha256:4979d4450ab6bf3eedb6faf18663e34e12d77e1dcc632cad96959f780d145597`.
- Healthy default-off container: `481bd4f930cb1caa173660f5b4d2d42c3cd94bcce2ad8d0e9de2ef66819c741c`; Config SHA `940e07a9a4fe13ad0c8363f900dd88f2f1d12d3c59515a0b975b1ab3a429d334`.
- Stopped activation candidate: `d436921b318ef6058fe5ca7c0eda38af089770a4c5a175d7d2ee009f1b804fbd`; same image, mounts and HostConfig, with only `OTR_DEV_UNIVERSAL_P1_SOURCE_REVIEW=enabled` added; Config SHA `45059178d4e688933b9e23e6538995d02538c14e5f12face605f7bb67eb47e4a`. Not started or armed.
- Docker created-container OomKillDisable null→false normalization is verified before swap; no operational HostConfig change is allowed after start.
- Deployment health, protected401, same normal-QA Context/Results200 and default-closed Source capabilities PASS. Ordinary image observer reached HANDOFF_VERIFIED after its fixed deadline 2026-10-26T05:15:19.282871Z; final receipt retained. Recheck before business activation.

## Exact identity and business scope
Use unchanged `P1_REVIEW_SCOPE.json` and existing hash-verified `P1_REVIEW_ACTIVATE.sql` / `P1_REVIEW_CLOSE.sql`:

| Binding | Fixed value |
|---|---|
| Actor Account | f4b059c5-8241-4ffb-aa15-37fa25474543 |
| Trip | 825f79b2-4a9d-4535-a62e-43000ca50c4a |
| Batch5 | bd0d6ea6-7870-48a9-b74b-779a46783609 |
| Task | 861a9d47-a35b-87a6-99f1-98422493d76b |
| Source | 0c71927f-3f3b-4612-a49e-333761e90441 |
| Candidate / token | 44e7b9b4-c46d-83f4-8ad1-2c5fd08f4a67 / i1 |
| Candidate SHA | 8e00c75508b15f8efc72446d09579db6803f962b80973e560136f86e0a1a7494 |
| Result SHA | 596f244c81110efb459524c4d5eff78fe5a1bee135fc97b1fa49e31605672198 |
| Target Item | 34dece59-61ae-8716-a976-7d3da49b51d0 |
| Operation | b1406697-47aa-8780-846c-37f4796cb52b |
| Plan | 628753a7-26a1-8aa6-810c-ed812f18701f |
| Slot | 1952c59b-114e-8636-8799-fe90e2f38d36 |

Normal AD5 QA user reads retained original, acknowledges current Trip, explicitly selects NEW and confirms **Walk in Auckland Domain / 2026-11-01**, date-only, private SELF. Original title bytes143..166; raw date bytes130..141 is “Nov 1, 2026”. No inferred clock, venue, booking or ticket rights; REVIEWABLE remains REVIEWABLE. Existing Source owning qualification and current material/hash checks remain required.

Create **at most one** P1 with the fixed target/operation. Source Plan/slot/intent/association and Mutation Receipt are only those required by that same formal save; no alternative operation or target. Repeated confirmation, retry and UNKNOWN recovery use immutable same-operation receipts and independent readback before any retry. Other candidates are not selected or saved.

## Preconditions and execution
1. Explicit Owner approval of this exact renewal; independent narrow review and controller self-test PASS.
2. Ordinary deployment observer HANDOFF_VERIFIED; fixed image/Config/HostConfig/mounts healthy; P1 database policy false/scope null; stopped activation candidate unchanged.
3. Independent exact-ID preflight confirms Candidate1 with exact SHA, Item0/receipt0, actor/Trip/source qualification current. If a receipt/item already exists, reconcile that identity instead of issuing another Create. A changed candidate or binding is a stop condition.
4. Short AD5/8097 resource coordination; App and original/Trip review ready before any timers. No reset, uninstall, credential copy or Native Feature worktree changes.
5. Arm remote runtime watchdog, then local controller in a fresh private run directory. Fixed outer expiry start+900s. SQL expiresAt is clamped to that deadline, single claim, no renewal. Local independent closer starts at +660s, leaving 240s for reconciliation. Remote operator has no accept or indefinite handoff mode and always restores default-off runtime by its own deadline.
6. Normal Native confirmation → Source Plan → Admission → Core. Obtain actual Item/Mutation Receipt, independent Supabase readback and Source slot finalization. Close promptly after write/readback; Day Feed and cold restoration can finish with the Gate closed.
7. Verify no duplicate target, unchanged unselected candidates, final Source association/receipt, Native Day Feed and full AD5 Restart recovery. Keep item identity unchanged.

## Closure and rollback
- On success, error, UNKNOWN, or planned +660s close: run hash-verified `P1_REVIEW_CLOSE.sql`, independently read enabled=false/scope=null, then runtime operator rollback to healthy default-off `481bd4f9...` / image4979d445.... Verify health, exact Config/HostConfig/mounts and protected401.
- UNKNOWN means readback/reconcile the fixed operation; no new operation, blind Create or Provider resend. Deadline is not extended for diagnosis.
- Independent remote runtime watchdog at +900s and SQL absolute expiresAt prevent an indefinite open authority if the local agent stops. Local closer retries bounded cleanup and reports any unconfirmed closure.
- Preserve Candidate, original materials, P1 if accepted, Source records and immutable receipts. **No business-record deletion.** Existing full DDL rollback file remains available but is not executed by a duration closure; previously approved SQL remains installed and dormant.
- If the software image itself fails, the standing image-deployment rollback target is the retained healthy container `3afeb1699b2feced486487e427e31bcfe96e723307ca54d9adcd015d967f039e` / image `sha256:4e0d2689d39b0bedb020d6e02b561a96c1b7826edabe41793137ac8cf81ff0ee`. First close business policy and reconcile the fixed receipt; rollback does not delete accepted data.

## Boundaries and evidence
No new Batch/Source/Task/Attempt, DeepSeek call or Provider budget; caps remain5/6/3. No new Schema, RLS, GRANT, role/member, Secret access, cross-Account/Trip access, P2–P6 Save authority, production or real-user data. Runtime restarts only the same shared DEV Backend.

96 focused tests, TypeScript and independent code review PASS. Actual isolated PG with 290ms SQL delay +1s connection reserve: Prepare18.438s/59SQL, Core25.424s/83SQL, Finalize13.064s/41SQL, all under unchanged30s deadline. Real DEV read-only 83-roundtrip calibration27.362s; **not a business Save PASS**, network jitter remains a risk. Latest business readback Candidate1/Item0/receipt0.

Evidence: `P1_TRANSACTION_BUDGET_REPAIR.json`, `P1_BUDGET_DEPLOYMENT_RECEIPT.json`, `P1_BUDGET_IMAGE_MANIFEST.json`, `P1_BUDGET_IMAGE_CLOSED_STARTUP.json`, `P1_REVIEW_WINDOW2_RECEIPT.json`, `P1_FINAL_SAVE_OPERATOR_SHA256.json`, `P1_FINAL_SAVE_INDEPENDENT_REVIEW.md`. Approval is recorded separately; this document grants none.
