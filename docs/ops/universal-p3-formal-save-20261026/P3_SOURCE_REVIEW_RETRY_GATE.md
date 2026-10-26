# P3_SOURCE_REVIEW_RETRY_GATE — prepared; approval pending

Request exactly one new nonrenewable15minute window to resume the same already-sealed P3 through normal Native confirmation→Source Plan→Admission→Core. No parsing/new test input. Old Gate200ef78c window remains consumed/closed and is never reset.

## First window and minimum repair

Old remote window10:51:30Z→11:06:30Z,2026-10-26; closed early10:59:50Z with policyfalse/scope null and healthy defaultoffc2d4 restored. Independent900second watcher subsequently ROLLBACK_VERIFIED. Source Candidate sealed, Core not reached: Candidate1/Item0/Receipt0/Slot0/association0. Native UNKNOWN was followed by independent readback, no blind retry.

First actual failure: universal-p1-candidates HTTP response guard required P1 after P3 publication had committed. Fixed3f57ddf9005388f16ef5bdc4507c2e7f49d05f15 now matches exactly request.family??P1. P1 default preserved; both cross-family responses rejected. Directed first2FAIL/3PASS→5PASS; related4files18assertions/types and independent Review NO_BLOCKER. No Source/Core/Authority redesign.

Fixed replacement image sha256:025010435515fd3451920ec1c62cca16df1e3c29093b8cff0fb0256f838235b9, bundlefd0a57191b84a799be8e08c77ee6a132401cb0fe61e995d32ed3b020e7bd8a8c. Ordinary defaultoff deployment uses existing Standing Authorization; actual deployment health/protected401/same normalQA Results200 and observer HANDOFF_VERIFIED PASS. Healthy defaultoff container193df1d3615c166d09040cafecb95e8958c9c38291630f99dd7ddd52c5a92ba3, Config SHA9c4124865add362f8bfacbadee99d1f531711f3ef209ac388af3946635354602; unchanged HostConfig SHAe89fe490cfd0a143b4751e761cebbbe8deaaacabc3ac53b27fa5c95cd525d2d7 and mounts SHAa1ebc180de952af45e7870f4b22b497315c24eb64c3a06d20de778af94b99361. Staging script fixes this baseline; stopped business candidate is created only after approval. Same DEV otr-dev-backend /178.105.151.143 /api-dev.xoery.art; Supabase tuqigdxrvrerfewsxqgm only.

## Exact immutable scope

- Actor f4b059c5-8241-4ffb-aa15-37fa25474543; Trip825f79b2-4a9d-4535-a62e-43000ca50c4a.
- Batch b290fa7f-44a4-431a-8aa2-2adf63fe938e; Task46945250-bfd8-8fcf-af74-f2e56bf85f7d; Run5015f4ad-99bb-8878-8926-2561d19710c8.
- Source97e9a866-6c28-456d-a385-ed2b236d059d /revision1; original336bytes SHA9c5d31bd56d3961726f5be39362b059694bcad9b7ed8b555c9554cce9bf878e7.
- Result SHA f762ec135e7a96216463917d1a77b06e8c59b8901216b7d5d5f8e52c0e5e5a88; tokeni1.
- Sealed Candidate ebee124d-9a68-8fcd-919c-46d5157cffda; exact SHA75db2d2c1daefb75c437c159255dd9b97de502c6e7d48c449d2b3f819a3b3349. Input catalog SHAd99729b5aa56931b39c9f5961b812617f999cefbe704579b72d24c744f0ad88b.
- Existing proposed Plan 54a5e914-d4e0-8581-9169-699a1fde9780; slotf7d1d2e0-ab82-80e3-97bc-d6686a63e845.
- Sole Item1397477b-db1f-8d5e-9ffe-3c6c037d78a9; operationa98856b8-209a-8bc0-9e2b-e0919bb73181.
- Harbour QA Hotel; check-in2026-11-02/check-out2026-11-03; exact original spans121..137/153..163/180..190. PRIVATE/SELF, clocks/zones unknown. No Place, Guest Person, Booking, Ticket, entitlement or Journey mutation.

Reuse the sealed owning Source Review/NEW and same proposed Plan; normal Native re-confirms retained original/current Trip/name/dates. Replay must return the exact Candidate/Plan, not reseal or change IDs. Existing Source qualification and original/result/current-actor checks still required.

## Protected request and preconditions

No new DDL/functions/columns/Schema, RLS, GRANT, Role/member, Secret access, crossAccount/Trip, Batch/Source/Task/Attempt, Provider call/budget or other type Save authority. Previously approved3functions remain installed/default closed. This request is only a new bounded duration for the identical business authority and identities.

P3_RETRY_ACTIVATE.sql requires closed policy, exact sealed Candidate SHA/schema/account/trip/source/batch/task/token/result and current Source/Run. Existing Item or operation receipt means reconcile-only, never another Create. P3_REVIEW_CLOSE.sql remains unchanged. Package hashes are P3_RETRY_PACKAGE_SHA256.json. New controller uses separate unique runtime directory/window files and a new explicit Owner receipt; old window files remain unchanged.

Before arm: explicit Owner approval of this precise retry, independent SQL/controller review and isolated real PG proof; prior business watchdog final ROLLBACK_VERIFIED; new ordinary defaultoff deployment HANDOFF_VERIFIED; exact healthy rollback container/image/config/mount/bundle recorded; readback Candidate1 exactSHA/Item0/Receipt0/Slot0; Source/Actor/Trip unchanged; AD5 GUI coordinated and normal original/Trip/NEW/name/dates ready. No clock runs while waiting on GUI or approvals.

## Execution and rollback

1. Remote independent runtime watch armed once, absolute deadline start+900seconds, no accept/renew path. Local controller reads that same deadline and fixes SQLexpiresAt to it; local close begins deadline-240seconds(+660). No rolling reset.
2. Start the same fixed software image with only the existing Source Review opt-in added; exact runtime plan/config/mounts and health/protected401 verified. Activate only exact P3_REVIEW_SCOPE.json plus fixed expiresAt. It does not reactivate P1.
3. Normal App confirmation resumes owning publisher/Plan/Admission/CREATE_ITEM(P3). Persist actual full receipt and Item ID, independently read back Supabase and finalize Source association. UNKNOWN always reads fixed operation first; no new IDs, repeat parsing or unsupported alternative Save.
4. Close promptly on success/error/UNKNOWN or+660seconds: exact Scope CAS→false/null independent readback→rollback to retained healthy defaultoff new-image container. Remote watch independently restores defaultoff by+900; SQLexpiry independently blocks new writes. Preserve all original/Candidate/accepted Item/receipts, no data deletion.
5. Finish Day Feed, full AD5 Restart recovery and duplicate confirmation/readback with same Item after Gate closed. Unselected candidates remain unsaved. Independent review and serial main integration/smoke follow; isolated/HTTP200/Plan PASS are not Save PASS.

Exact three-function reversal remains P3_REVIEW_DEV_ROLLBACK.sql (closed policy + postimage CAS); normal duration closure does not remove installed functions or business evidence. Software failure rolls back to retained healthy defaultoffc2d4cda0 as needed, with4979 still retained. Final controller/runtime hashes and actual health plan must be fixed before arm. Approval is recorded separately; this file grants none.
