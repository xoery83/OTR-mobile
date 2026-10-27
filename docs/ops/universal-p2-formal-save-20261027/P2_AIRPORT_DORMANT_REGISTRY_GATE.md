# P2_AIRPORT_DORMANT_REGISTRY_GATE — PREPARED, NOT APPROVED OR INSTALLED

## Exact proposed action

On existing DEV `tuqigdxrvrerfewsxqgm` only, install `P2_AIRPORT_DORMANT_INSTALL.sql` once after independent review, fresh preimage/ACL/row-absence checks and isolated PostgreSQL acceptance. No Backend image change or restart.

- Replace only existing `public.trip_core_resolve_airport(text,text,text,date)`: MD5 `1bfcf2b5daabcab72dd75036ad49122e` → `666ff90bad5c706a6007691a3328df75`. Preserve OID, owner `postgres`, SECURITY DEFINER, principal checks and exact existing ACL. The only new predicate restricts the proposed registry version to QA Account `f4b059c5-8241-4ffb-aa15-37fa25474543`, Trip `825f79b2-4a9d-4535-a62e-43000ca50c4a`, service date `2026-11-02`. Every other existing registry version retains its prior behavior.
- Insert exactly two **disabled** rows into existing `trip_core_airport_identities`: `AKL / IATA_AIRPORT:AKL` and `CHC / IATA_AIRPORT:CHC`, namespace `IATA_AIRPORT`, issuer namespace `IATA`, version `otr-dev-universal-p2-airports/20261027/1`, both `valid_from=valid_until=2026-11-02`, `enabled=false`.
- Registry manifest SHA256 `19066b80cbd09c04b365b175e41d7f3a6cbd0f36fe79172187f28756bf8c00e9`. Full executable hashes are in `P2_AIRPORT_PACKAGE_HASHES.json`.

This explicitly proposes Owner-reviewed admission of these two real airport-code identities as an OTR-owned, dormant registry version. It is not an assertion that a licensed IATA dataset was supplied. The single-date range bounds synthetic QA qualification, not airport operating dates or an independently verified future flight schedule.

## Evidence and reason

Same retained Batch9 `a9be165b-5a90-4244-add7-d4977c9e7ba5`, Task `7338329a-46eb-8050-9bec-96376f08b296`, P2/i1 `89e5df16301d7691c84d2755`. Owning result SHA `7300e350f5e93ec77b833a4f7d65c44b88fdee4208c7ed001d47375d7244bf94`. Task PUBLISHED; one Attempt SUCCEEDED/COMPLETE/INSTALLED. Actual original 27 bytes and the candidate remain unchanged. AD5 normal Check recovered the result. No new Provider call is needed.

Read-only DEV catalog has zero AKL/CHC rows. Existing FLIGHT_OCCURRENCE purpose requires actual date-bound owning airport identity even for `CREATE_SPARSE_FLIGHT`; text codes, HIGH and Native Form reference cannot supply this authority. Native explicitly confirmed its AIRPORT-REF-01 data is descriptive only and has no Core qualification.

Primary public references directly identify the code/name pairs: [Air New Zealand Auckland](https://www.airnewzealand.co.nz/flights/en-nz/flights-to-auckland) and [Air New Zealand Christchurch](https://www.airnewzealand.co.nz/flights/en-nz/flights-to-christchurch). They corroborate airport identity only. They do not prove flight NZ501 operates on the QA date, an accepted Place, timezone, clock, arrival, Booking, Journey or Ticket. No website token, credentials or private content is used.

## Closed boundary

This Gate authorizes **dormant installation only**. No row activation, P2 Source publication, Source Review/Admission/Core Mutation, target creation or live resolver use is authorized here. No automatic activation or timer is arranged. The future exact P2 Save Gate must separately pin and authorize activation of these same disabled rows, the owning Published Task/Run/result, candidate/publication/plan/proof, unique target/operation, finite window and closure. The existing P1/P3 windows cannot be reused.

No new table/column/RLS/GRANT/Role/role membership/LOGIN/Secret scope, budget, input object or Provider call. No Production, real-user data or cross-Account/Trip authority. Same original DEV service stays healthy with current image0d50d567. No CP14 maintenance grant renewal is required or permitted by this Gate.

## Installation verification and rollback

One transaction, existing management maintenance mechanism, lock timeout3s / statement timeout20s. Installer requires original function MD5/owner/ACL and no preexisting AKL/CHC rows or proposed-version rows; any drift aborts. After commit independently read back post MD5/unchanged OID/owner/ACL, exact two rows disabled, current P1/P3 business gates closed and DEV health. A dormant resolver must return no airport authority.

`P2_AIRPORT_DORMANT_ROLLBACK.sql` accepts only the exact original/post MD5, owner/ACL and no active/drifted proposed version. It restores original function bytes; retains the two immutable rows disabled. It neither deletes evidence nor changes unrelated rows. If a later separately approved window has activated the rows, rollback refuses to overwrite it. UNKNOWN installation requires independent same-row/hash readback; never a blind install replay. No live permission can remain open from this inactive package.

Later activation must require the exact post-resolver MD5/SHA and full two-row manifest. Restoring the pre-resolver never authorizes later enablement.

Status: independent Review NO_BLOCKER;19 focused actual isolated-PG checks PASS. Exact Owner authorization still pending; not installed. Existing protected resource Gate02a061e1 did not authorize this new registry package.
