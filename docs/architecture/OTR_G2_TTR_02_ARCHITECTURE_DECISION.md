# G2-TTR-02 — Actionability & Controller Content Bridge

2026-10-13 · Owner decision: **ACCEPT — BOUNDED G2 EXTENSION**. This archives the explicit Experience/G2 decision and subsequent Owner clarification; no additional architecture approval is required.

Verified canonical baseline `e091b60e0527766bf6a055a4280e21f61933da5c` includes G2-FLEX-02 and accepted CP01B/G2. TTR archival source `6a1c80b0d327172c4bbc4ffa2257ab6473beebd9`, tree `0f27c49cdd992fc20e2d9bcb6cb6a6bb430f9e0e`, is the accepted 13-file package based on `54ecb4b`. Its history remains immutable.

## Existing interfaces

- G2 `composeDayStream` owns current rendered Transition eligibility, Flexible nesting, Focus and NOW. `DayFeed.onOpenTtr(intent: ComposedTransition["openTtr"], context: Pick<ComposedTransition, "key" | "inputFingerprint">): void` is preserved.
- `ttr-presentation/1` contains relation/occurrence identity, publication version, input fingerprint, anchors and authorized Open intent. G2 consumes this presentation; Core retains authoritative occurrence/continuity/endpoint/person applicability.
- Accepted TTR `useTtrLabInteraction(TtrLabInteractionInput)` consumes context (Account/Trip/generation/traveller/date/visit), versioned authorization, `resolve(identity): TtrInteractionSource | null`, stable repository, clock, synchronous `publish(projection, key): boolean`, and host dismissal. It returns view/Open/Preview/Confirm/Recover/Dismiss/Invalidate/Dispose.
- TTR `TtrLabSheetContent` supplies the entire themed body and its own canonical SheetHeader. The existing G2 Lab Modal owns mounting and dismissal; no second header/controller/navigation stack.
- Accepted `openTtrLabSelectionRepository` explicitly opens a separate fixed DEV-only SQLite file, enforces approved synthetic Account/Trip/generation, and returns a repository/close handle. No Canonical tables, Core migration or startup registration.

## Authorized G2 responsibilities

1. Expose versioned current actionability from existing composition output, retaining scope, relation/occurrence, fingerprint, publication/input version and available reason. Do not independently qualify TTR or infer visual adjacency.
2. Revalidate queued Open intents against latest composed eligibility and scope/visit/overlay. Reject mismatches and fence A→B→A callbacks without changing the accepted signature.
3. Notify active TTR sessions of versioned actionability loss from nesting, scope, permission or projection replacement; Controller invalidates/closes without changing personal selection, invoking Providers or reopening automatically.
4. Mount TTR-owned Sheet Content inside the existing DEV TTR host; G2 owns Sheet lifetime and preservation of the Feed.
5. Accept copied/frozen immutable TTR presentation replacement only after durable-local Confirm and current scope/relation/version validation. Recompose the same mounted Feed; failed Confirm cannot display false success.
6. Preserve shared Focus, NOW, selected date, nonzero scroll and existing Experience behavior.

The additive G2 Session Bridge API will be implemented and recorded with exact exports in the implementation report. It is not an assertion that missing G2 exports already exist. TTR-owned accepted files retain exact bytes; only a proven narrow adapter incompatibility permits a separately attributed correction. New localized Sheet copy uses approved injected proposals, canonical UI tokens and terminology.

## Validation and stop

Use an isolated G2 worktree and a fresh anonymous DEV/Test Simulator container/bundle, with isolated TTR SQLite. Validate Controller/repository, composition/actionability, stale taps, invalidation, publication, all 14 TTR fixtures, Flexible Focus/snapshot, P1/P2/P3, Core read compatibility and Release isolation. Compare full regressions with exact clean main; run typecheck, lint/UI guard and formatting. Native evidence covers durable Confirm/failure/reopen, Preview/Dismiss non-persistence, isolation/fencing/nesting/no-reopen, NOW/Focus/date/nonzero scroll and Light/Dark.

No Core authority/schema/migration, routing/MapKit/Apple ETA/cache, Provider/Supabase, production admission/storage/runtime, Flexible CP02 gesture or additional renderer work. No merge/push/deployment/production activation. Stop for G2-TTR-02 Owner Review.
