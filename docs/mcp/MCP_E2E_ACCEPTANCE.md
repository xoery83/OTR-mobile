# MCP E2E acceptance — 31 October 2026

Current: **LOCAL implementation verified; actual internal DEV Read PASS; public OAuth
BLOCKED_BY_OWNING_INTERFACE**. No new real-use PASS is claimed by code/tests.
Historical 29 October normal OTP/discovery evidence remains separate.

| User outcome                       | Current evidence / limit                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AI reads an OTR Trip/P3            | Real standard SDK4 tools, Trip list independentMATCH,3 Item summaries, P3 full detail independent hashMATCH, foreign private404; normal own Session cleanupPASS. Earlier failures retained below |
| AI creates/edits cloud Item        | One fixed P3 Create POST recovered to formal APPLIED/rev1; independent Supabase full fields/receipt/unique row MATCH. Edit waits Native details readiness                                        |
| iPad automatically sees same Item  | New MCP P3 automatically displayed its property card; first sample ~44s after commit. Original title-only monitor miss corrected; Edit/latest-revision check pending                             |
| Nelson Preview/Confirm/Apply       | Three-day synthetic preview/partial/replay path implemented and tested; actual DEV/new-Trip/iPad proof pending. Real Owner plan untouched                                                        |
| ChatGPT / Claude actual connection | NOT_TESTED: public OAuth grant/revocation/binding contract and approved mount absent. No paid-plan/region compatibility claim                                                                    |
| Extended domains                   | Future owning interfaces only; no new domain adapters/authority                                                                                                                                  |

## Source and focused verification

Fresh fetched accepted main42652324 was the start base; no historical SHA chosen
as current architecture. MCP work remains in its independent branch/worktree.
Existing mandatory product/architecture/API/read/receipt contracts reused.

Current focused tests29 PASS: official SDK loopback discovery/calls, signed JWT
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
