# OTR Capture C1 Implementation Review

Date: 2026-10-07 (Pacific/Auckland). Independent reviewer: separate `c1_review` agent.
Worktree: `/Users/xoery/Project/otr-mobile-capture`, branch `trip/capture`.
Base/retained HEAD: `92b87bd20f0d4baf23d3b4da8934d3142133e765`.

## Initial independent findings

**0 CRITICAL / 3 IMPORTANT / 0 MINOR.** Locations describe the initial diff, not final line numbers.

- **IMPORTANT F1 — StrictMode lifecycle.** `CaptureContent.tsx` retained a store with `useState`, but effect cleanup permanently disposed it. Effect replay left source actions silently unusable. Required reversible attach/detach, epoch invalidation and a production-hook lifecycle regression.
- **IMPORTANT F2 — Account transition admission.** `app/(tabs)/capture.tsx` read SecureStore after the generation notification but while Account installation could still hold the transition gate. Rejection could leave an authenticated new Account on Sign in until refocus. Required waiting on the existing apply gate and a held-transition/release regression; no gate across picker I/O.
- **IMPORTANT F3 — Invocation prior.** `CaptureContent.tsx` fixed the first staging/currentness closure but displayed the latest `tripName` prop. A host rerender could label old selections with another Trip. Required executable initial-context pinning and a rerender regression. The root route supplies no Trip and had no activated Trip disclosure.

Checked staging, route focus/generation, native API options, UI primitives/palette/catalogs, Account request/coordinator/session dependencies and accepted Capture/readiness/UI terminology direction. No accidental repository/domain writes, fake success/progress, durable URI assumption, Guest model, canonical IDs, unbounded byte reads, Ledger persistence reuse, Photos→Documents classification, dependency, schema, scheduler, runtime activation or final Experience-shell change was found.

Initial independent default Vitest invocation failed before collection because the sandbox denied Vite's symlinked `node_modules/.vite-temp` write. Builder's first 11 files / 160 tests PASS was separate evidence, not the reviewer's run.

## Targeted final recheck — PASS

The same independent reviewer rechecked final code and regressions after all three fixes:

- F1: `staging.attach()` restores the store; cleanup clears choices and increments epoch. Hook/event harness executes production setup→cleanup→setup, rejects an earlier callback, allows fresh selection and checks unmount.
- F2: `withAccountApplyGate(readLocalSession)` waits for transition completion. Production route harness proves A hides immediately, B admission follows release without refocus, and late blurred reads are rejected.
- F3: initial `invocationTripName` is retained in session state; Japan→Korea rerender retains Japan prior and old selections without rebinding. Host-context invalidation continues to reject stale callbacks. Hosts must remount for a new invocation and provide a predicate that fences the original scope.

Independent command:

```sh
npm test -- --configLoader runner src/features/capture/captureStaging.test.ts src/features/capture/CaptureContent.test.ts src/features/capture/captureLifecycle.test.ts
git diff --check
```

**3 files / 13 tests PASS; whitespace PASS. 0 remaining CRITICAL / IMPORTANT / MINOR.**
This is static, SSR presentation and production hook/event-harness verification; it is not an actual React renderer StrictMode, native picker, VoiceOver or device visual acceptance claim. No owner shipping/activation approval is inferred. C1 is ready for owner review only.
