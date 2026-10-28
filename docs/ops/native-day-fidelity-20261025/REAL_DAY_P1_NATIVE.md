# Real Day Shell + P1 Native candidate — 25 October 2026

Owner requested real CreateTrip/Create/Edit P1 after the fixture interaction converged. This candidate stays on `codex/native-forms-p3-delivery`; no merge into main or Universal's active branch.

## Delivered scope

- Normal TripScreen uses the approved Day heading/badge/empty state/gutters, semantic day surfaces and Trip introduction. Native top date control continues to show actual viewport first–last dates. Existing Open Today/resume/header anchors and global navigation destinations remain owning behavior.
- Existing `LocalManualRead` P1 Items use the same P1Row Browse/Focus/Immersive component as the approved fixture. Its small display-only adapter creates no Event, certificate, Core Item or Reader. Mixed accepted/local content retains one Focus; the explicit mixed scenario is regression-tested.
- Native `/p1-detail` rereads existing actor-filtered Trip Reader facts. Real Item ID, Trip ID, generation and revision stay pinned. Historical, hidden, wrong-family, wrong-scope and stale-generation facts fail closed. The native Back/Edit buttons replace the old P1 preview. Repository.read qualification alone enables Edit; existing P1PlanEditor and Repository handle persistence/conflict/retry.
- Eligible current Core P1 insertion callbacks open the canonical transparent chooser, pass clicked date and suggested time to normal P1 Create and reload after Save. Directional70minute defaults are separately fixed in09a71ee8. Pending/Floating eligibility is unchanged. Other form families receive no invented P1 time default.
- P3/P2 candidates, existing QA Trip and all fixture files are preserved. Real Trip pages import no WebLab synthetic fixture.

## Actual Forms QA acceptance

Only `C0C23E00-5016-4289-B806-92C5484BD5BA` / OTR Forms QA, own Metro8096 and existing normal synthetic Session were used.

Normal Create Trip produced `b15408f3-5bda-4a09-a95c-37b9f475871f`, name `Forms QA Day P1 1025`, dates25–30October2026. Normal P1 Create produced `802ede7a-3fc5-4330-b3c4-5b20800d886e` with authored title Morning garden walk, location Queen's Gardens,Nelson and start23:31. Day Browse→Focus→native Immersive→Edit changed the same Item title to Garden walk — edited; the normal detail reread showed that title and original time/location/Everyone.

Process terminate/relaunch restored normal My Trips; opening the same Trip and Day retained the edited P1. Creating a second draft from26October correctly prefilled that date; Cancel→Discard returned to Day. Read-only business receipt after cold launch/Cancel exactly matched the prior receipt:1CREATE_TRIP +1CREATE_ITEM +1SET_ITEM_TEXT queue rows,2manual intents, all attempt_count0. No extra Item/operation was created by Cancel. No Backend or cloud acceptance occurred.

Actual Light/Dark real Day/Focus, native Back/Edit and detail were observed. No new localized copy was introduced. This stage does not claim a fresh full Chinese/Dynamic Type/offline-network matrix or an injected native error acceptance; existing targeted Repository/editor recovery tests passed.

Evidence folder: `/Users/xoery/.codex/visualizations/2026/10/25/01a17101-8b2d-7240-ab67-f4c34a5d90d9/native-day-fidelity/real-day-p1/`. PNGs detail/chooser/focus-light/focus-dark, two private-scoped business receipts, stored P1 time facts and SHA256 manifest. No credentials, Auth tables or other simulator data were read for these receipts.

## Exact remaining integration boundary

Existing ManualPlanRepository writes authored clocks with qualityESTIMATED, zone_idnull, civil_resolutionPENDING and instantnull. This real P1 therefore remains pending and Floating. Its raw23:31 is truthfully shown in Immersive with timezone-not-confirmed; DS12 still hides an unqualified clock in Browse/Focus. No zone or instant is inferred from the synthetic location text, Trip date or device timezone.

The converged move interaction remains in the gated DEV fixture and is not a real save port. Real Manual P1 time qualification and move mutation must be integrated serially through the owning Temporal/Core/Repository contract; do not copy the fixture preview writer, invent a second resolver or downgrade pending eligibility. The current real data slice is `LOCAL_NATIVE_CREATE_EDIT_READ_READY`; real qualified insertion/move and all Cloud E2E remain `PENDING / BLOCKED_BY_OWNING_INTERFACE`.

Minimum owning interface request: normal P1 Create/Edit needs a lawful authored civil date/time + explicit IANA zone qualification path (DST gap/fold policy, interpretation proof and revision pins); the real move adapter needs a qualified same-Item schedule update preserving a known duration, optimistic revision, conflict/recovery and pending state. Reuse existing Temporal/Core authority; this lane did not modify it.

## Checks and review

168 directed tests across8files, TypeScript, UI guard and scoped lint pass. Tests cover algorithm cutoffs/missing ends/zones/overlap, renderer callback identities, scoped/deferred detail reads, denied Edit, normal editor/repository, Trip entry anchors and mixed single Focus. Independent review found a mixed accepted/local Focus invalidation bug; fixed it and the reviewer independently reran35tests PASS. No remaining finding in this bounded review; no full repository regression or Cloud PASS claim.

Device Hub GUI was yielded immediately when Universal requested its StageII AD5 window. Only Forms QA's own window was minimized; it retains real P1 Focus for Owner. Wait for explicit GUI return before further Device Hub input or foregrounding Forms QA.
