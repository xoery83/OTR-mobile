# Apple Native Place Search — bounded Stage B adapter

Owner21Oct Morning Lock; source base `fb5023e8`. Transient provider handles only. No Canonical/SQLite/Sync/permissions changes, Google API/token, location permission/GPS or second Place model.

- `OTRPlaceSearch` Expo module: complete(max5), search(max20, one search/no pagination), resolve(completion→one MapKit search, map item→no new search), generation-scoped cancel.
- MinimumiOS16.4. `regionPriority.default` guarded18+; no `.required` restriction. Qualified explicit coordinates are soft bias; no context means no explicit region. Native system locale determines Apple result language.
- iOS26+ uses MapItem.location/addressRepresentations; guarded placemark fallback for16.4–25.
- Retained completion/map item handles are session+generation-scoped, memory-only, at most16 sessions/128 handles,15s deadline. Native cancellation watermark handles cancel-before-start; a JS account-generation/editor binding rejects stale responses. Closing or clearing search cancels handles; choosing a resolved map item does not require a second API fetch.
- `normalizePlaceQuery` is an exact function port from accepted Lab query.ts SHA `c01057e1647cd2e2cd58a166a0e1cd1efffdee3fc8a2510bd79103dfaaeaecf5` (format/name only). Verified Lab core/query/retrieval/contexts bytes against baseline `2fb43b98`; no Google-shaped interface, mock rows, Web UI, alias/geo fixtures or provider credentials copied. Higher-level bounded relaxation/fill-policy integration remains the P1/P3 UI owner's stage after actual iOS adapter qualification.
- Existing Form Location remains authored text; candidate address/coordinate/category are transient inputs, not a new saved Place authority. UI must keep manual input and existing legal save on unavailable module/network/error; Name changes require the existing approved explicit policy.

Checks:9 TypeScript adapter tests and6 zero-query Swift state assertions; iOSSDK27.1 target16.4 engine/diagnostic typecheck. macOS native MapKit four sample searches outside the command sandbox returned genuine results; this is not iOS/Expo/Form Native PASS. Diagnostic app described in `diagnostic/README.md` is separate from OTR and uses identical engine bytes. Full OTR host bridge still needs isolated, capability-preserving build and Root-coordinated preview.
