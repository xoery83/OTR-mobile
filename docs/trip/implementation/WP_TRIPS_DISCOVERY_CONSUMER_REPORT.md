# WP-TRIPS-DISCOVERY-CONSUMER — isolated UI packet

The existing My Trips list reads the account-scoped SQLite61 merged snapshot through `readLocalTripDiscoveryRepository().readMerged()`. Local containers retain their existing grouped cards, pending state, user-selected cover and workspace behavior. A remote-only cached summary appears in a separate image-bearing section and its card opens the existing Trip route. That route now displays a read-only summary workspace when no local container exists. It does not show Add, manual cover, Open Today, Capture or Ledger contextual actions for that cached-only case. There is no automatic refresh, direct Supabase access, new router, accepted Core Day assertion or local CREATE inferred from the summary.

The consumer is intentionally partial: remote-only detail/permissions cannot be elevated from cached metadata; an actual fresh DEV discovery read, server-only Native card/workspace observation, revocation behavior and all-accessible inventory completeness remain unverified. The cache is an account-scoped prior snapshot, not a current Core admission certificate. If the snapshot read fails, existing local Trips remain available. Account-generation and remount guards discard late results.

Cached remote date strings are validated before formatting; malformed bounds are omitted or shown as dates to be decided, so an invalid snapshot cannot crash the list or summary workspace.

Workspace resolution is scoped to the requested Trip ID and account generation. During a route change, Capture, Ledger, validation and DEV Lab actions remain hidden until the new Trip resolves as local or has a visible accepted read; a cached-only result never enables those actions. A focused transition regression covers a local-to-cached route and account generation change.

Author checks: focused My Trips/Local workspace/route tests **7 PASS**, TypeScript, UI guard, scoped ESLint/Prettier and diff-check PASS. Independent connected review and applicable Native Visual are pending. Existing local R3 Trip QA evidence is unchanged; this packet does not claim a real remote-only Trip was shown on A1A.
