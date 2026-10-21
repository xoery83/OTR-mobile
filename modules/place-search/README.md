# Apple Native Place Search — bounded Stage B adapter

Owner21Oct Morning Lock; source base `fb5023e8`. Transient provider handles only. No Canonical/SQLite/Sync/permissions changes, Google API/token, location permission/GPS or second Place model.

- `OTRPlaceSearch` Expo module: complete(max5), search(max20, one search/no pagination), resolve(completion→one MapKit search, map item→no new search), generation-scoped cancel.
- MinimumiOS16.4. `regionPriority.default` guarded18+; no `.required` restriction. Qualified explicit coordinates are soft bias; no context means no explicit region. Native system locale determines Apple result language.
- iOS26+ uses MapItem.location/addressRepresentations; guarded placemark fallback for16.4–25.
- Retained completion/map item handles are session+generation-scoped, memory-only, at most16 sessions/128 handles,15s deadline. Native cancellation watermark handles cancel-before-start; a JS account-generation/editor binding rejects stale responses. Closing or clearing search cancels handles; choosing a resolved map item does not require a second API fetch.
- `normalizePlaceQuery` is an exact function port from accepted Lab query.ts SHA `c01057e1647cd2e2cd58a166a0e1cd1efffdee3fc8a2510bd79103dfaaeaecf5` (format/name only). Verified Lab core/query/retrieval/contexts bytes against baseline `2fb43b98`; no Google-shaped interface, mock rows, Web UI, alias/geo fixtures or provider credentials copied. Higher-level bounded relaxation/fill-policy integration remains the P1/P3 UI owner's stage after actual iOS adapter qualification.
- Existing Form Location remains authored text; candidate address/coordinate/category are transient inputs, not a new saved Place authority. UI must keep manual input and existing legal save on unavailable module/network/error; Name changes require the existing approved explicit policy.

Checks:9 TypeScript adapter tests and6 zero-query Swift state assertions; iOSSDK27.1 target16.4 engine/diagnostic typecheck. macOS native MapKit four sample searches outside the command sandbox returned genuine results; this is not iOS/Expo/Form Native PASS. Diagnostic app described in `diagnostic/README.md` is separate from OTR and uses identical engine bytes. Full OTR host bridge still needs isolated, capability-preserving build and Root-coordinated preview.

## Create Trip destination-area intent — 21 October hotfix

`ApplePlaceQuery.intent = "destinationArea"` is opt-in; omitted intent preserves the
existing P1–P6 general POI completion/search behavior. The intent is part of the
transient query cache and retained-handle context. Area quick suggestions use the address-only MapKit completer (5 results), with
an iOS18+ address-area filter. A completion is not yet area-qualified and cannot be
saved as a resolved result. Explicit selection resolves that retained completion
through one bounded address-only MapKit lookup and then applies raw qualification.
Search More stays 20/address-only; already resolved items reuse their handle.
General POI completion/search is unchanged. There is no parallel query/fill-up fanout.

The original path requested address+POI for all callers, omitted raw geographical
components during normalization, and the Create Trip caller rejected any resolved
result without an optional Apple Place ID. Those are separate gates: a city need
not have a POI identifier. The new transient `area { kind, label, qualifier }` is
emitted only when the actual MapKit name matches a raw locality, administrative
component, country or water feature without street/business evidence, or the raw
category is specifically nationalPark. Label/qualifier equal visible title and
secondary; qualification precedes result limiting. No category alone, missing ID,
query wording, opaque handle or invented geocoder taxonomy proves a city.

Unqualified results remain absent. Islands with a genuine matching geographical
component qualify; an island with only a display name and no reliable component
is deliberately not inferred. Such cases keep explicit custom text fallback.
`area` is transient display eligibility, never Canonical geographical proof; only
an actual optional Apple identifier may populate providerPlaceId. A user-selected
qualified area without that ID can use the already approved MANUAL authored-label
path in the owning Create Trip UI. No Core/schema/storage fields change here.

`tests/AreaChecks.swift` validates raw-fact city/country/state/national-park/water/
island, street/POI rejection and homonym qualifiers without provider requests.
SDK typecheck and these checks do not establish actual iOS retrieval or Native VQA.

### Actual city-recall correction

The first area candidate combined address, nationalPark POI and physicalFeature in
one quick lookup. Actual iOS testing returned Ladies Bay for Auckland and Sydney
Harbour National Park for Sydney, missing both cities: this was FAIL. The corrected
quick path uses Apple's address completer and address-area filter, and only the
user-selected completion is resolved/qualified. Region/city recall must be verified
in the normal App again; static raw-fact fixtures cannot substitute for that check.
Natural destinations without reliable address-area completions keep explicit custom
fallback rather than an extra speculative provider request. The one authorized
macOS standalone two-query comparison returned MKErrorDomain:1 for both queries;
no raw rows were available, and it is not evidence of iOS retrieval behavior.
