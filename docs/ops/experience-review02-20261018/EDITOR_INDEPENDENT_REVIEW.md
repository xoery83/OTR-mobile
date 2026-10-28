# Editor / Calendar — independent review

Fixed candidate `f572466cd8ac03d8ad931bbf3d267684e761e762`, baseline `f87e119f`; reviewed in `/private/tmp/otr-experience-review02-editor-20261018` by Track A Builder, not the author. Direct callers, owning metadata Repository commit/queue boundary, SheetHeader and Calendar grid helpers inspected.

**PASS: no P1/P2 findings in this bounded candidate.**

- LocalTripWorkspace awaits only the existing Repository update transaction. After success it fences older reads, patches the same selected Trip ID with the committed metadata/cover and closes; it does not await Hosted sync or a subsequent discovery read. Account generation and keyed Trip Workspace alive guards prevent a late result from closing or overwriting another Trip/account. No new business write path.
- TripBasicEditor retains the existing operation fingerprint/ID across a retry of identical intent, synchronous busy ref prevents double tap, failure retains draft and exposes the existing error. One canonical fixed SheetHeader Save replaces the bottom Save; fields remain within a themed keyboard-aware scroll body.
- Continuous Calendar uses existing date/grid semantics. Every rendered month has a fixed header, weekday row and six week rows matching getItemLayout. Edge extension is clamped to years0001–9999, and the terminal-month break prevents a clamped-loop. Cancel/Done/Clear keep draft-only changes; date-only values are not device-zone converted.
- Preparation now reaches setup with populated content; date/destination prompts are filtered to missing values without interpreting deliberate one-sided dates as invalid. Existing actual Ledger currency OWNER/lock checks and existing dirty-draft confirmation are preserved. No Membership or currency authority invented.
- Both local and cached Workspace Hero arrays now supply dates before destination, matching the reviewed Frame change.

Independent targeted run: **33 tests PASS** across TripBasicEditor, LocalTripWorkspace, TripCalendarRangeField, TripSetupRows and real SQLite Editor/Members integration. Includes success/close/same-ID/doubletap, failed draft, late Trip completion, continuous cross-year calendar, bounds, locks and transaction/reopen behavior. No broad repeated suite was run.

RENDERED / NATIVE VERIFIED remain **NOT VERIFIED**. Fixed-height Calendar geometry, Dynamic Type, month prepending/scroll restoration, native sheet close, keyboard and cold-start pending-sync display require integrated Native acceptance. This review does not mark UX Accepted. Cover Gallery/Tag Matching and multi-destination identities remain honestly PARTIAL; no Schema, Hosted or permission change was reviewed or executed.

## Shared TH-11 Hero header follow-up

Also reviewed the Coordinator's two-file uncommitted TripScreen diff at integration HEAD `6f094d4adebae967a910b56891fe3ddcba122f04`:

- TripScreen.tsx SHA-256 `6a44785bd7e0465509ac04a680464699f4026bd2551dbe3fb28681a3caaf9dee`.
- TripScreen.homeWidgets.test.ts SHA-256 `0cbcfe0d6d75e3392aa5d0e8ab97645e745e689e94d0e58e5739ffc2bd78a62f`.

PASS / no P1/P2 findings. Hero-visible title stays blank; beyond the measured Hero/navigation boundary a one-line title uses the current Trip/generation-scoped owning Quick Action name, so committed Editor changes can appear immediately. A different Trip's actions cannot supply the name; fallback discovery facts are already Trip/generation scoped. Native systemMaterial is enabled only for Day or collapsed Home, with existing native transparent header. No extra name state, Reader or navigation model is added. Tests cover actual owning name, same-Trip edit name, other-Trip rejection and return to blank Hero title. Coordinator's41-test result is retained without duplicate execution. Native visual/contrast verification remains outstanding.

## TH-13 integrated type correction / validation correction

Coordinator integration found TS2345 in `61d0d80`: `.then(local => local ?? reader.read(...))` inferred only the local-read result rather than the existing accepted-or-local result union. Track A's earlier TypeScript PASS statement did not correspond to the final `.then` rewrite: TypeScript had passed before that rewrite, while the final rerun covered tests/lint/guard only. The earlier claim is corrected here; `61d0d80` alone is **not TypeScript PASS**.

Independently reviewed the Coordinator's exact one-line correction `.then<AnyTodayRead | null>(...)`. PASS: it declares the already-existing result union, uses no cast, and preserves local-first fallback, null/error handling, Debug read, ticket and generation checks. No behavior, evidence or permission contract is relaxed. Coordinator must record a clean integrated typecheck result against the corrected bytes; prior component-test PASS does not substitute for it. No duplicate test run or code edit performed by this reviewer.
