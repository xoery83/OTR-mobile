# Accepted People Connections — client-only handoff

`createTripCoreV2Repository(...).readAcceptedPeopleConnections(ctx)` returns `Promise<CoreAcceptedPeopleConnections | null>`: accepted certificate and active `{personId, connected, isCurrentActor}` entries only. Missing cache returns null; missing/inactive persons are absent and remain UNKNOWN in Auth consumer4ca558f9. Participation is independent of account linkage. Other Account UUIDs never leave the reader.

Public method owns the non-reentrant AccountApplyGate and SQLite transaction. Do not await it while holding either. Existing acceptedWithinTransaction validates context/generation, certificate versions/accessRevision, revoked scope, unique active actor and accepted graph; final context checks remain. Denied/stale/corrupt cache rejects rather than asserting a false connection. This cache observation is not Hosted Claim or formal server revocation proof.

No UI consumer mounted, no new Repository/Sync/Schema/authority/device/backend change. Auth consumer is structurally compatible with exported CoreAcceptedPeopleConnections; Auth owns its integration/review.

Validation: repository entire61tests PASS, scoped TypeScript PASS, ESLint zeroerrors (eight existing import-order warnings), independent review NO_BLOCKER. Added tests cover no-cert, linked/unlinked/inactive, participation distinction, account/Trip scope, stalegeneration, malformedversion response, accessrevision/revoked and duplicateactor. Version fault is adapter-only because SQLite CHECK correctly disallows persisting version1; spy restored. No Hosted or device rerun.
