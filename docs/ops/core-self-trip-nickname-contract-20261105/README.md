# Self Trip Nickname producer contract

Request: `AUTH-C03-TRIP-NICKNAME-OWNING-PORT-20261105-01`.

This is a bounded **Root1 technically accepted producer contract, pending independent review**, not an installed owning port or an enabled write capability. Fixed source baseline: `3ab5fbd8c284c1234b6f2b63780b981cc0cc80f1`.

- Existing Trip Person `displayName` is the Trip nickname; Account private Profile and participation revisions do not qualify its mutation.
- Proposed canonical storage remains `journey_members.display_name`, with one independent `nickname_revision`. Explicit Clear maps to empty canonical string/null wire value; no second nickname/fallback identity. Root1 accepted this storage/Clear/revision choice; bounded independent review and blank-name consumer compatibility remain required.
- Auth can prepare its consumer from `PRODUCER_CONTRACT.json` without manufacturing CAS or borrowing Profile authority. Routes are proposed contracts, **not existing endpoints**.
- Only two new pure canonical codec/test files are authored while bounded producer review runs. No PG/backend mutation implementation is started. Protected SQL installation and activation belong to Root2 under a later exact package.

`SOURCE_MANIFEST.json` pins direct inspected source bytes. No repository-wide absence claim is made. Metadata creation was blocked by two automatic-review deadlines; parent authorized this new docs-only folder in the existing stable tree. No Git commit, main merge, SQL install, Hosted execution or cloud PASS is claimed.
