# AD5 bounded foundation regression — 24 October 2026

Actual AD5 `AD5CCF33-5907-4BE4-8F6C-B6FB20F32C5A`, original App identity/session/data retained. Dedicated synthetic Account `3a44420f-ec2b-4d7e-9770-410a5ed5e77e`; new QA Trip `ceae33ac-e6d5-42f3-a007-a5cef0fe7faa`. Raw receipts/screenshots: `/private/tmp/otr-ad5-regression-20261024/`. This is bounded functional regression, not complete Beta acceptance or arbitrary-account continuous Cloud sync.

## Cloud-shared paths

| Path | Native / Local | Queue | SERVER_ACCEPTED | Independent SERVER_VERIFIED | Cold recovery |
|---|---|---|---|---|---|
| Create, two structured destinations, two named travelers | PASS; Home and three people | Create COMPLETED; Person operations remain blocked | Actual POST 201, operation `bbcb1e5d-f5b7-4057-b2c6-fd422d0b6c65` | PASS: immutable receipt, name, null dates, Auckland/Wellington IDs and order | PASS: same name/list, people and P1 restored |
| Accepted Trip Edit: name, dates, add/remove/reorder destinations | PASS: Wellington → Christchurch, Nov 2–4, edited name | Metadata COMPLETED, expected revision 0 → 1 | Actual POST 200, operation `1ff959fe-3169-4cbe-9550-dd72f7e93f90` | PASS: full ordered list, IDs, name, dates and revision 1 | PASS: My Trips and Home match full list/name/dates |
| Ledger initialization | PASS: same Account/Trip, NZD, zero expenses | Existing Create transaction/transport | Actual Create receipt initialized Ledger | PASS: same Trip, NZD scale 2, revision 1 and owner link | PASS: Home NZD before currency change |
| Currency NZD → USD, zero expenses | PASS: actual Preview, confirmation, Commit, normal refresh/revalidation | Existing normal Auth Backend path; no new queue | Two POST 200; operation `journeyCurrency_mvldki0f_z0lurfba4m` | PASS: change `3f0fae46-3c7f-4eab-9acc-9a8fb6b871c8`, USD revision 2, 0 affected/unresolved | PASS: USD and edited Trip title after reopen/cold launch |
| Edit before initial Create acceptance | BLOCKED: confirmed cloud version not ready | No fabricated Metadata operation | None | None | Not applicable |
| Named Person / P1 Create and Edit | Local PASS, three participants and edited P1 retained | Existing Person/Core operations DEPENDENCY_BLOCKED | UNAVAILABLE | UNAVAILABLE | PASS locally through Trip acceptance and Ledger refresh |
| Arbitrary new Trip automatic Cloud sync | Not qualified by this finite test | Global historical queue remains quarantined | Not claimed | Not claimed | Not claimed |

Create window UTC 2026-10-23 18:58–19:13: three reads/one mutation. Metadata window 19:22–19:37: four reads/one mutation, including one failed read-only SQL query before corrected readback. Both closed early with independent watchdog exit, original service/config restored. Currency 19:40–19:55: two POST plus four GET and independent SQL = five reads/two POST; no Create/Metadata activation. Root verified all five Gates closed, four roles NOLOGIN, zero sessions and Backend health. Original receipts are not rewritten:

- `INDEPENDENT_CREATE_READBACK.json`, `CREATE_ACTUAL_CLOSE.json`, `CREATE_WIRE_LOG_PROJECTION.json`.
- `NATIVE_METADATA_SERVER_ACCEPTED.json`, Root Metadata readback/close receipts.
- `ROOT_CURRENCY_ACCEPTANCE.json`, `CURRENCY_LOCAL_OBSERVATION.json`.

## Native foundation coverage

| Scenario | Actual result | Limit |
|---|---|---|
| Cached session launch / cold restart | PASS; no login/session/Keychain changes | Account-switch/network-radio-off Native test NOT_RUN; existing deterministic fences unchanged |
| My Trips list / old QA isolation | PASS: original successful QA plus new QA survive cold launch | Stable view isolation cutoff is separate from dispatch windows; historical data retained |
| Create named travelers | PASS with two named people; six-person deterministic regression PASS | Name-only Person Cloud acceptance remains unavailable |
| Existing V2 Trip Day Feed | PASS; actual five date sections render after parser repair | No server certificate fabricated |
| New QA Day Feed / P1 anchor | PASS; Nov 2–4, P1 on Nov 2, edit return retained | P1 formal admission remains blocked |
| P1 Create/Edit | PASS: calendar, MapKit address, unchanged typed name, three participants, actual local Save/Edit | No Hosted Core claim |
| Location search | Actual MapKit result selected and populated | Search-more/Worldwide exhaustive rerun not required; prior scoped receipts apply |
| Trip Home / Day menus | PASS: consistent Members, disabled Documents/Photos, All Trips; no Edit/Open Day | Disabled future pages not implemented |
| Preparation destinations | PASS: complete ordered destination labels after edits/cold launch | No scalar substitution |
| Covers | PASS: six actual gallery photos; manual choice and automatic setting restored | Local-private. Original defect was stopped Metro asset server, not image identity/ACL |
| Create/Edit keyboard handled taps | PASS: Add traveler / reorder activate on first tap | Not every unrelated screen exhaustively replayed |
| Import attachment keyboard first tap | PASS after minimal patch: one tap dismisses keyboard and visibly opens Camera/Photos/Files | Screenshot `05-keyboard-first-tap-menu.png` |
| Import Photos cancellation / draft | PASS: actual picker opened, Cancel retained exact text and zero attachments; close/reopen retained draft | No private photo selected/uploaded |
| Import background / close | PASS: My Trips visible through scrim; back/close return safely | Fresh zero-Trip account not manufactured |
| Import text submission / AI | BLOCKED with truthful disabled submission message | Universal Host/Source integration belongs to active Import line; no fake Source/results |
| Import simulated voice | Start/preparing/cancel/error preserves text; terminal kLSRErrorDomain 300 unsupported | NO simulator Transcript PASS. Owner's prior physical-device success not repeated |
| Clipboard image paste / camera capture | NOT_RUN | No private clipboard access or new capture permissions |
| Expense basic entry / cancel | PASS: existing New Expense opened with NZD/zero amount and cancelled | Save not executed; kept zero-expense Currency case |
| Currency cached title | Initial screen retained older Ledger title until normal bootstrap/reopen | Cold reopen correct. Presentation snapshot staleness recorded, no new Cloud model |
| P2–P6 forms, Settings/Language, destructive actions | NOT_RUN in this bounded pass | No claim of coverage; no new saves/logout/deletion |

## Repairs and deterministic evidence

`36520f5` fixes two owning local proof readers to use the existing strict V1/V2 wire union. Original HEAD fails three new V2 regressions with `unrecognized_keys: destinations, formatVersion`; repaired targeted suites pass 31 checks. Account/Actor/Trip/operation constraints and server authority unchanged. Exact request-json reader check found no additional owning local reader requiring the same repair; legitimate version-specific execution handlers remain unchanged.

`c6d08a1` adds view isolation and the exact new-QA finite executor; helper differs from reviewed predecessor only in bound Trip constant. Eight finite fixture tests pass. `49883ea` adds stable view-only isolation time, ignored by dispatch; 17 view/dispatch tests pass. Root independently reviewed both.

CaptureComposer patch dismisses the keyboard within the original handled, unlocked attachment tap before toggling the existing menu. Twelve component tests, typecheck, UI guard (473 baseline / 139 checked files), scoped ESLint PASS; Root independently reran 12 tests and reviewed diff. Actual AD5 first-tap/menu/Photos-cancel PASS.

One pre-existing full manual-reader suite failure remains: floating 09:00 without travel timezone → `DAY_ZONE_INVALID`, independently reproduced with original production readers (`EXISTING_FLOATING_ZONE_FAILURE.txt`). This is not a full-suite PASS. Date-only Native P1/Day passed.

## Data path checklist / remaining deltas

1. Ownership: structured Trip fields Cloud-shared; covers Local-private; Import text Draft; observations are not Admission.
2. Storage: existing SQLite72 repositories; no migration/reset/deletion. Eight historical tables excluding only new QA unchanged after Create (`HISTORICAL_*_HASHES.json`).
3. Sync: existing targeted queue/Backend/receipt transport; immutable Create and Metadata CAS preserved.
4. Offline/conflict: Metadata was locally queued with Gate closed then finitely dispatched. Physical offline Native replay NOT_RUN; existing L2 fencing/idempotency/CAS receipts remain scoped evidence.
5. Acceptance: exact new-QA four paths L1/L2/L3 demonstrated; this does not grant permanent arbitrary new-Trip sync or Person/Core admission.
6. Remaining owning work: safe pending-Create Metadata edits with dependency on Create receipt and preservation of offline user values; ongoing general Native sync qualification; Person/Core/Universal owning interfaces; unrelated timezone edge above. No new framework introduced.
