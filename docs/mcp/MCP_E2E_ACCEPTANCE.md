# MCP E2E acceptance — 31 October 2026

Current: real finite-QA SDK OAuth Read/refresh/revoke PASS, and actual ChatGPT
OAuth + list_trips PASS. Consumer Item reads/Write, Claude and Native date edit
remain incomplete. Final independent Auth restoration passed; raw cleanup wrapper failure is retained.

| User outcome | Current evidence / limit |
| --- | --- |
| AI reads an OTR Trip/P3 | Public SDK OAuth own Trip/P3 and foreign denial PASS; ChatGPT actual OAuth/list_trips4 PASS. Consumer Item reads remain untested. |
| AI creates/edits cloud Item | P3 formal APPLIED rev1→2, independent expected full-row/receipt/unique1 and same-op replay PASS. New P5 CHECKIN attempt remains UNKNOWN/owning guard gap. |
| iPad sees same Item | P3 automatic Create property card and exact UUID cold Viewer PASS. Core-title Edit not directly observable; Nelson original Dec11 observed; date Edit blocked by pre-submit receipt read. |
| Nelson Preview/Confirm/Apply | Synthetic Trip/three Items APPLIED with independent expected receipts/rows; partial recovery retained. Existing P1 date Edit NOT_SENT. Real Owner25 candidates are private source preview only. |
| ChatGPT / Claude actual connection | ChatGPT real OAuth/list_trips4 PASS; exact Item/Write/revoke semantics incomplete. Claude NOT_TESTED. |
| Extended domains | Future owning interfaces only; no new domain authority. |

## Source and focused verification

Fresh fetched accepted main42652324 was the start base; no historical SHA chosen
as current architecture. MCP work remains in its independent branch/worktree.
Existing mandatory product/architecture/API/read/receipt contracts reused.

Phase1 focused tests32 PASS (historical checkpoint): official SDK loopback discovery/calls, signed JWT
issuer/audience/scope/client/grant negatives, actual Core command/receipt create/
text edit/CAS, response loss and same-operation replay; three-item partial Apply
and accepted UPDATE batch resume; full reviewable changed fields; timed-date loss
blocked and actual canonical date-only P3 schedule edit allowed. Scoped types/lint/build and UI guard PASS.
Independent review NO_BLOCKER for closed implementation after those repairs.
Golden live runner is separately reviewed before any actual call; no credential
or existing Session file was accessed during local testing.

## Live handoff / immutable synthetic identities

- Registered QA Account1f3d7935-1bdc-4952-8d7f-0f72077368c1, existing private Trip
  eb3a3e70-fe4d-4cff-81f8-9945bc804f28. Existing P3612d7e55-cfa8-4ba7-a625-
  5e0d622679da is read-only here and will not be edited.
- New golden P3 Item77dfc0f5-65c1-4f80-a780-b3aeeb0e4f3a, Create opfe996d83-
  359e-4fa3-a4bb-af8bd0232d14, text Edit opd6420993-1a5d-40f0-9929-1d96d14b4990.
  PRIVATE/SELF, date-only2026-10-31→11-02, explicitly synthetic lodge; no Booking.
- Fixed input is mcp/fixtures/golden-slices.json. Golden runner checks current
  capabilities, uses registered normal-OTP helper under its required Receiver/DEV
  lease, standard protocol Client, separate Backend comparisons and fixed read-only
  Supabase query. It never installs/copys Native Session/SQLite. Owning helper
  revokes only its new host Session and verifies refresh rejection.
- Root01a1753a owns Photo74530956 protected Host/SQL/deployment. Ordinary QA
  OTP/business calls were explicitly cleared alongside it; QA receiver released.
  Native owns passive iPad evidence; its brief observation window is now paused.

## Actual Read attempts — no business write

Five fresh normal registered-QA Read sessions were established through the existing
owning helper; all three ended with local-scope logout and refresh rejection.
No Native/other-line Session was reused. First standard SDK connect/discovery4
and list_trips succeeded, with the result matching an independent Backend read;
subsequent full Read did not complete. Attempts are retained separately under
`acceptance/READ_ATTEMPT_01.json`, `READ_ATTEMPT_02.json`, and `READ.json`.

Latest `2026-10-31T00:16:40.294Z`: phase DIRECT_P3_BASELINE, authenticated direct
GET `/v2/trips/eb3a3e70-fe4d-4cff-81f8-9945bc804f28/core/objects/ITEM/612d7e55-cfa8-4ba7-a625-5e0d622679da`
reached a15-second TIMEOUT with no HTTP response, bypassing MCP. This does not
establish the root cause. Native confirmed contract2 is the required object-read
header and that this route reuses full snapshot work; Core Reader/lease diagnosis
is pending. Original timeout remains evidence; no blind rerun, timeout increase,
Host change or permission expansion. Full Read, foreign denial, Create/Edit,
Nelson and new MCP iPad acceptance remain unqualified.

## Remaining integration delta

Auth owns real issuer/resource issuance, active grant/revocation and Backend bind.
MCP adapter remains unmounted when these are absent. Core Owner diagnoses the actual read failure before another coordinated
Read attempt; Native readiness precedes Create, then each actual receipt/readback
and downstream artifact. Serial main Writer receives reviewed exact candidate and checks joined
source; no push/merge or final main SHA is claimed yet.

A single owner-recommended bounded50s direct diagnostic then returned HTTP200
after13554ms (request00:21:50.472Z, first HTTP00:22:04.027Z), with contract2.
Its body was cancelled and own Session revoked/refresh rejected. This proves
current route reachability, not the timeout root cause or full Read PASS. Shared
client timeout remains unchanged. See `acceptance/READ_DIAGNOSTIC_50S.json`.

Fifth Read attempt retained in `acceptance/READ_ATTEMPT_05.json`: direct existing
P3 HTTP200/schemaPASS, four-tool standard discovery and independent Trip-list
hashMATCH; stopped at list_trip_items with REQUEST_OR_PROTOCOL. Own Session
cleanup/refresh rejection PASS, zero business POST. The list adapter performed
one collection plus N full-snapshot object reads. Focused local repair removes
that N+1 by projecting bounded typed SUMMARY rows from the validated visible
collection; complete detail remains get_trip_item. It preserves P2 qualification,
P5 service identity, same-snapshot pagination and explicit detail query. Directed
tests pass; actual repaired Read remains pending, not inferred.

## Actual repaired Read — PASS, internal auth only

`acceptance/READ.json`, observed2026-10-31T00:28:41.103Z through00:30:25Z:
standard SDK four tools, Trip list independent Backend MATCH, Item list3 typed
summaries, P3 full-detail independent hash
6560018a5b3ac9a0120129e7234d9565ffe80bfd2461f264200be12ae82d9b32, foreign private
Item404, own normal-session local logout and refresh rejection PASS. Initial direct
baseline503 remains in the artifact; later actual positive and negative reads
completed. This is INTERNAL_READ_GOLDEN_PASS, not public OAuth/consumer or SLO PASS.
Reviewed code49a14038; continue fixed synthetic P3 Create/Edit after Native ready.

## Controlled P3 — first pre-submit failure, no POST

`acceptance/P3_ATTEMPT_01.json`: normal QA Read and P3 Manual capability passed; exact
pre-submit receipt GET produced UNKNOWN/RECOVERY_UNAVAILABLE. That branch
returns before POST: businessPostCount0, no Edit. Own Session revoked/refresh
rejected. `P3_RECEIPT_DIAGNOSTIC.json` then queries only the same operation:
00:35:35.998Z start, HTTP404/NOT_VISIBLE after20786ms, own cleanupPASS, no POST.
MCP receipt GET now uses50s like other reads; POST stays15s. A directed20s receipt
read regression still permits only one controlled POST;29 focused tests and
independent review PASS. This is a local availability repair, not cloud write PASS.
P3 runner now asserts a real interactive stdin before opening any Session, so
a heredoc/EOF cannot accidentally skip the separate Native Create observation.

## Actual controlled Create — APPLIED and iPad display, Edit pending

One fixed Create POST in `P3_ATTEMPT_02.json` returned UNKNOWN/QUERY_SAME_OPERATION.
No automatic re-POST: normal standard MCP get_operation_status later returned
APPLIED/rev1 for the exact original operation; full new-object Backend GET200 and
independent Supabase validation match the expected command/receipt/all modeled
business fields, exactly one Item. Formal commit00:40:18.16509Z. See
`P3_CREATE_SUPABASE.json` and `P3_CREATE_CHECKPOINT.json`.

Native reports real same-page automatic property-card display at first AX sample
00:41:02.420Z, about44s after commit. Original Core-title-only monitoring missed
P3's canonical property-name-first display and was corrected; no downstream
failure is inferred from that missed match. Original612d remains untouched.
The existing recovery session waits before Edit. Day property label will stay
Synthetic QA Lodge when only Core title is edited; do not invent a Day text-change
PASS. Real Create re-APPLY idempotency remains pending in this recovery route; local
Core/receipt replay tests pass. No whole P3/Native-update/Nelson PASS yet.

## Controlled P3 cloud E2E — PASS with Native edit limit

`P3_VERIFY.json` records actual standard MCP Create APPLIED/rev1 and Edit
APPLIED/rev2, original Create APPLY replay returning its formal receipt through
a GET-only host port (own Create/Edit re-POST impossible), exact new Item/Trip/
rev2/title readback, independent full expected Edit receipt/intent/business row
and unique count1. Separate approved foreign write test returned404. Own session
local logout and refresh rejection PASS. Original UNKNOWN responses remain in
P3.json/P3_ATTEMPT_02.json; independent final proof P3_EDIT_SUPABASE.json.

Native authority: commit9c15ee9d,
`docs/ops/native05-06-20261031/MCP_P3_DOWNSTREAM_OBSERVATION.json`. Real automatic
Create card and exact UUID route cold Viewer/no-login PASS; edited Core title/
revision are not visible in UI and latest-title download remains explicitly
NOT_DIRECTLY_OBSERVABLE. This is not private Realtime or an SLO measurement.

Root Mobile typecheck PASS after isolating MCP source checking; separate MCP
types/29 directed tests/lint/build pass. No SDK dependency added to Mobile.

## Actual synthetic Nelson multi-item Apply — three Creates verified

New synthetic Tripcc44a705-6f43-41e0-a2f9-16f334b2a6b2 created formally. Complete
three-operation Preview/confirmation ran through standard MCP. Initial Apply lost
its response: original artifact `NELSON_ATTEMPT_01.json` retained. Standard same-op
status reads and independent DB found the first two APPLIED and the third UNKNOWN;
404 was never reclassified as NoCommit.

Focused fixes: reserve50s write work inside60s HTTP to return partial receipts
(real SDK slow-prefix regression fails before/fixes after), and carry version2
on structured Trip receipt GET (real owning HTTP boundary regression). Both are
MCP-only fixes, no Backend/runtime/permission delta.32 focused tests PASS, types/
lint/build and independent reviews PASS.

Explicit Owner-authorized same-operation manual recovery reused the existing
Core idempotency contract. All original Account/Trip/op/target/canonical command
digests matched the initial Preview. First two were full-receipt and independent
DB verified before the original P6's current capability check and one exact POST.
Host hash/path/per-op count plus a pre-fetch wx marker block extra dispatches.
Actual server PARTIAL/UNKNOWN remains retained; status plus full expected receipt
then independent DB proves each APPLIED, unique1row/rev1. See
`NELSON_P6_RETRY_ATTEMPT.json`, `NELSON_RESUME.json`, `NELSON_CREATE_CHECKPOINT.json`.
This is individual receipt completion, not a server-atomic batch or new engine.

Native currently prioritizes its Realtime release. At its request the idle host
session was normally closed with refresh rejection; date9b was NOT_SENT. Next
explicit Native observation of P1 Dec11 precedes its fixed CAS1 date move toDec12.
Dedicated date-only QA entry will not repeat Trip/three Creates. No Nelson Native
or Date PASS is claimed yet. Owner real attachments remain outside Git and DEV,
local read-only preview only; no real travel data was written.

## Historical Phase2 candidate — before public OAuth qualification

This preactivation checkpoint is retained as history. Current status at the top
and the later actual SDK/ChatGPT sections supersede its missing-client/mount and
NOT_TESTED statements.

Accepted baseline main8f79a421. Real ChatGPT UI exposes Add custom MCP Server →
OAuth → advanced OAuth settings in the current signed-in account. Exact callback
was read from the unsubmitted draft and provided to Auth; no client was created,
no consent/access was granted. Automatic discovery failed because the public MCP
mount/PRM remains absent; DEV HTTPS health returned200. This proves the setup
entry exists, not OAuth/tool discovery PASS or a plan-wide capability claim.

Auth supplied versioned minimal delta28349170 and closed request verifierd8f8b0fa.
MCP now requires signed otr_scopes plus independent session_id, passes original
bearer only to the Auth-owned same-issuer verifier and separates provider request
openid from business rights. Read-only policy hides writes. Standard SDK loopback
checks metadata, zero-dispatch scope denial and expiry during write/status reads;
these are local protocol tests, never Hosted issuer/consumer receipts.

Core adapter tests preserve existing operation digests and civil clocks, P3/P4
fields, P5 water-taxi/check-in/unknown arrival, and separate sparse Flight create /
complete authored detail update with CAS/replay and qualified denial.46 directed
local tests/types PASS plus focused independent NO_BLOCKER. No new field Cloud or
Native PASS is claimed. Native explicitly NOT_READY for fixed original date9b;
no date POST or idle MCP normal Session. Owner source data stay outside Git/DEV.

Private25-row schema coverage:22 Manual Item drafts,1 sparse Flight requiring a
separate detail operation,2 blocked missing flight literal. These are not23 fully
qualified bookings or a current-cloud diff: target Account/Trip and current
Snapshot are still unselected, source/booking admission and exact temporal
qualification remain distinct. Real Owner Apply has not been authorized/executed.

See MCP_CLIENT_COMPATIBILITY.md, MCP_NELSON_FIELD_COVERAGE.md and Auth contract for
the remaining activation/consumer/confirmation/Native gates at that checkpoint.
At that time ChatGPT/Claude Read/Write/revoke all remained NOT_TESTED.


## Phase2 actual P5 attempt and device observation

P5_FIELDS uses one fixed synthetic Water Taxi with09:00 departure,08:45 separate
CHECKIN and unknown arrival. Attempt01 sent no POST. Attempt02 sent one POST,
cancelled at the old15s local budget; GETs remained404/UNKNOWN. A reviewed bounded
manual recovery preserved the exact operation/command/preview hashes and returned
actual Backend503 after29.524s. Original UNKNOWN retained, total POST2; both wx
markers prevent a third dispatch. Own normal QA sessions were revoked with refresh
rejection each time. No new P5 Cloud/Native PASS. Evidence: P5_FIELDS_ATTEMPT_01,
P5_FIELDS_ATTEMPT_02, P5_FIELDS_MANUAL_RECOVERY and P5_FIELDS_OWNING_GAP.json.

Protected metadata read shows the scoped MANUAL guard excludes
trip_transport_operational_facts. Core Writer must qualify the minimal owning
repair; MCP made no SQL/GRANT change. The gap is concrete, while the full503 cause
is not claimed proven. Backend per-call timeout is now50s inside the existing50s
write-work /60s response budget; the slow POST regression failed before and passes
after.46 focused tests, scoped checks and focused independent Review pass.

Independent iPad observer used its own Session/state and the approved pinned
Runner. Device claims were empty before open; snapshot failed before UI dispatch
with xcodebuild70 / missing isolated test product. Own Session closed normally.
No Session/SQLite copy, tap, install/reset or date9b POST. Native tool setup repair
is pending. Owner explicitly permits missing real Trip/flight fields to stay
pending while functional QA continues; this does not authorize real Owner writes.


### Actual Nelson before-date UI — PASS; date submission blocked

Device Automation's complete public artifact manifest resolved isolated Runner
layout without copying Native private state. All16 file hashes matched; fresh
AX and card tap read the synthetic walk details with Dec11,2026/Abel Tasman/Onlyme.
The fixed9b CAS1→Dec12 standard MCP call then returned RECOVERY_UNAVAILABLE from
the pre-submit receipt GET; that code branch returns before POST. The same-op
status returned404/UNKNOWN, never NoCommit. No date modification was sent.
Original result retained in NELSON_DATE_EDIT.json. Own normal QA session cleanup
is PASS_LOCAL_SCOPE_REFRESH_REVOKED (run-Q85Egq); observer closed normally and
shared claims were empty. Snapshots05/06 still showedDec11. This qualifies actual
before-date UI and tooling only, not Native Edit or automatic date update.
See NELSON_NATIVE_OBSERVER.json. Core owning receipt-read diagnosis is pending;
no repeated Create, timeout increase, Host/permission or Native product change.


### SDK-first OAuth test custody — prepared, not Hosted PASS

mcp/sdkOAuthQa.ts uses the installed official SDK auth()/S256 with one static
Read client and fixed127.0.0.1:18764/callback. Same-process Auth callbacks own real
token checks, refresh/deny/read/revoke and mandatory cleanup; no Token storage is
read from ChatGPT. Whole-flow15m/caller cancellation rejects late provider writes,
closes listener/client and runs cleanup with a separate50s budget. Cleanup failure
or timeout remains unconfirmed revocation.50 focused tests/types/lint and focused
independent NO_BLOCKER pass, including simulated issuer PKCE exchange, callback
mix-up/duplicate rejection, cancellation cleanup and callback port release.
These local tests do not qualify actual issuance, OAuth revoke or consumer use.


## Structured current-state Nelson Preview — actual DEV PASS

`acceptance/NELSON_PREVIEW.json`, start2026-10-31T06:04:39.192Z, uses the normal
registered QA Account and standard SDK, not public OAuth. Source7f0f5730 returns
both typed proposed changes, current accepted P1base/revision1/Dec11 and the existing
lodge's duplicate ID. Every full proposal and operation ID matched its submitted
plan; current UPDATE base matched an independent Backend full typed read hash.
Timed P3candidate retained14:00/Pacific/Auckland with authored/pending/noBooking
warning. Forced GET-only Backend, empty confirmation set, no Apply/SQL and zero
business POST. Own Session cleanup PASS_LOCAL_SCOPE_REFRESH_REVOKED; Receiver
released.51 local tests/types/lint plus focused independent review PASS.
This proves structured real-cloud Preview, not saving that draft or consumer OAuth.

First actual public SDK OAuth failed before browser/Token because SDK2.4 adds
`offline_access` for the advertised refresh grant while2334 asserted onlyopenid.
Reviewed9c399e01 accepts exactly the two protocol scopes; Auth's supplemental Gate
must approve the change before execution. No business permission expansion,
new Client/issuer or actual OAuth acceptance is claimed by this local repair.


## ChatGPT actual consumer OAuth and list_trips — PASS, bounded

Owner confirmed the same QA Read connection and one fresh finite window. Actual
ChatGPT custom plugin creation/discovery → normal QA email OTP → explicit read
Consent → callback/installed plugin → new natural-language list_trips returned
four current QA Trips, SERVER_CONFIRMED/next_cursor=null. Synthetic Nelson Trip
cc44a705 appeared. No internal Session substituted for the consumer OAuth flow,
no token/OTP was recorded, no real Owner Trip or business write was requested.

After Auth's independently closed Hook and acknowledged grant DELETE204, one new
request on that same connection failed with `Script error: The tool failed
internally.` It returned no new data and no reconnect/login/authorization occurred.
This is not a client-visible invalid_token or a complete consumer revocation PASS.
Original cleanup wrapper failure remains Auth-owned evidence and must be reconciled
by independent receipts, never rewritten as raw PASS. Final independent readback proves Hook closed, grant204, normal Session cleanup,
default healthy, finite config absent and OAuth/Hook OFF with original Site URL.
Two server401s while the route still ran qualify denied post-revoke requests;
the client still exposes only the generic error. See acceptance/chatgpt-auth/.

See acceptance/CHATGPT_READ.json and QA-only CHATGPT_READ.jpg/CHATGPT_REVOKE.jpg.
Consumer get_trip/list_trip_items/get_trip_item/foreign denial/Write were not
executed in this short window; SDK qualification remains separate. ChatGPT Read
success is not Read+Write readiness or general-account/production availability.
