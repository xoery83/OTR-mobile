# P5 Native fidelity candidate — 27 October 2026

Parent serial intake: isolated commits `d1ae57cb` and `202d9f31` are now included
in the Native feature branch as `e7cd4e2a` and `e7510461`. The reviewed host patch
has been applied there, including both mixed local/accepted Focus qualifications.
Parent seven-suite317 assertions, TypeScript, UI guard and scoped ESLint PASS.
The previous Home inline-editor regression now checks the real `/p5-detail`
handoff and verifies that Home itself never grants Editor authority. This is
`LOCAL_HOST_INTEGRATED / NATIVE_VISION_PENDING / CLOUD_PENDING`; no main merge or
device acceptance is implied. Historical candidate-only statements below describe
the isolated delivery before this serial intake.

Status: **LOCAL_CONTENT_CANDIDATE / HOST_INTEGRATION_PENDING / NATIVE_VISION_NOT_TESTED / CLOUD_PENDING**.

Base `7a546aff9cf60cd800243201a693b256c43fcc35`; isolated branch `codex/native-p5-transport`.
Source: `OTR_P5_TRANSPORT_NATIVE_FIDELITY_V1`, frozen 27 October, source commit `3e34cc3a15f8702202e234b2fd855156e00e284b`. Package verification: 68 hashes, 46 PNGs, 43 Native rows still NOT_TESTED. Exact fixture JSON retained under `src/features/day-feed-lab/fixtures/p5-fidelity-v1.json`.

## Owning content delivered

- P5 Browse/Focus/whole-Segment Immersive content: compact two-ended route, explicit service/source-duration only, sparse name-first fallback, authored calendar offset, arrival-only End rail. No Browse Boarding/Booking/photos. No new DayFeed shell or scrolling implementation.
- Nine semantic transport groups, P1/P2 canonical glyph/insertion controls, Future/Today departure-only Focus map intent; Past no map/call/insertion. Native SF shapes require device calibration; Water Taxi uses outline ferry and Taxi uses car-side, so their exact silhouette remains a documented visual delta.
- Conditional source-language boarding facts, instructions/passengers, original Ticket selection and four access states. Capability callbacks own real original access. Neither confirmation nor matching ref manufactures a Ticket. Conditional notes/photos/counts/Ledger data and the existing four-action Immersive footer; synthetic color swatches are not copied as real photos.
- `transportReadPresentation.ts`: pure existing Core-to-P5 view mapping, including optional unknown arrival and known Floating clocks. No fabricated duration/service/People/custody. `coreScheduledTransportRenderer.tsx` retains Trip/event-revision guards and exposes only open/insert intents.
- `P5Detail.tsx` / `p5DetailRead.ts`: existing normal Reader and ManualTransportRepository, account-generation fences, readable details before slower Edit qualification, native Back/Edit, existing editor, Save refresh, existing Expense flow with Trip/date/name defaults.
- Existing P5 Manual Create/Edit and durable local Repository are reused, not reimplemented. Persisted fields: type/title, departure date/place, optional departure/arrival clocks/date/place, description, participation. Operator/service/dynamic boarding/Tickets are not promoted from Fixture to this Form.

## Serial host candidate

`HOST_INTEGRATION.patch` (including the mixed-Focus follow-up) is **not applied**. It adds only P5 to existing LocalManual rows, Core experience open/insert callbacks, TripScreen route handoffs, `app/p5-detail.tsx`, DEV `day-feed-lab?fidelity=p5` and a P6 import of the unchanged pure map helper. No Shell algorithm, Reader Authority, public Core, SQLite registry, Auth, Backend, Import, Schema/RLS or DEV change.

Apply the patch after cherry-picking this candidate, format changed host files and refresh Expo typed routes if enabled. Patch applies cleanly to this fixed base (`git apply --check` PASS). The P5 DEV preview renders 21 scenarios and all nine states; original opens/calls are explicitly synthetic intents, never real execution.

## Validation

- Six directed suites: **235 assertions PASS** (202 final-package content/arrival/privacy/locale cases, 9 detail-read cases, 24 existing P5 Row/Form/Repository/DayReader cases).
- TypeScript, UI guard, scoped ESLint, diff whitespace and host-patch applicability PASS. Vite runner/no-cache mode keeps final test output isolated in `/private/tmp/p5-sealed-*`; no Metro, device, simulator or live Backend used.
- Two broader P6/fixture-registration suites could not start in the bare Node harness (`Expo __DEV__`/native module setup). They are not marked PASS. The serial patch moves the P6 map import to the pure helper to avoid a new P5 UI dependency; rerun those suites with their owning Native mocks after integration.

## Remaining acceptance / owning gaps

1. Parent serially applies shared host patch, reviews it and runs host regressions. No automatic merge/main update.
2. Native screenshot/interaction Vision against 46 source references: 402×874 layout, Dynamic Type, EN/中文, Dark, native Back/Edit and Focus restoration. No physical performance/VoiceOver/access verification claimed.
3. Existing ManualTransport/Core currently admits six type enums (`TRAIN/BUS/FERRY/WATER_TAXI/SHUTTLE/TRANSFER`). Taxi/CableCar/Custom presentation works; their formal Manual/Core enum expansion belongs to the unique Core Writer. No new mutation/schema invented here.
4. Real dynamic boarding edit mapping, Ticket custody/access, Documents, related-Segment authority, Media and Ledger associations require their accepted owning ports. The Form's local tests do not establish Cloud E2E. No P5 backend/Supabase/Provider permissions were changed.

All attached acceptance rows remain Native NOT_TESTED until the actual device window. P1–P4 and existing QA data are untouched.

## Independent review follow-up — mixed accepted/local P5 Focus

Reviewer `day_header_destination` found a real host blocker: `DayFeed.tsx`'s
local-Focus preservation guard admitted P1–P4 but omitted P5 in **both** its
row-family and Item-family qualifications. With accepted v2 plus a pending local
P5 of the same identity, `pendingIds` correctly removes the accepted Event; the
remaining local Focus was then cleared on the next render.

The unapplied host patch now adds P5 to both existing qualifications and includes
`P5MixedFocus.test.ts`. No unavailable-Item check is relaxed. Exact preimage in a
disposable `/private/tmp/otr-p5-focus-host-20261027` shadow reproduced the issue:
**1 failure / 4 passes**, failing precisely on the second Focus render. The same
harness with only the two whitelist additions: **5/5 PASS**. It proves stable
mixed Focus, original Item/role/date detail handoff, hidden/cancelled/skipped
Focus removal, and row-withdrawal cleanup. The local renderer is an explicit
port double, while the real AcceptedDayFeed/pendingIds/Focus guard executes.

The new regression is carried in the patch, not installed into `src` before its
required host fix. The isolated branch remains locally green without silently
applying shared ownership changes. Existing six P5 suites are rerun separately;
this adds five host-candidate checks, not device/Cloud acceptance.

Offline runtime used: existing `/Users/xoery/Project/otr-mobile/node_modules`,
Vitest `--configLoader runner --no-cache`; no dependency download. The tracked
worktree dependency link is restored after verification, so a reviewer whose
old target is unavailable must point to this existing runtime temporarily before
running tests. Logs: `/private/tmp/p5-focus-red.log`,
`/private/tmp/p5-focus-green.log`, `/private/tmp/p5-focus-existing.log`.
