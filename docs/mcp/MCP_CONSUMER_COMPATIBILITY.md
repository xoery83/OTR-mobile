# Consumer acceptance — Phase3

31 October2026. Current source evidence is MCP_CLIENT_COMPATIBILITY.md and
acceptance/{CHATGPT_READ,SDK_REFRESH_OAUTH_E2E}.json; this file is the Phase3
execution matrix, not another protocol implementation.

| Client | Connection | Trip/Item Read | Write discovery/Create/Edit | Revoke |
| --- | --- | --- | --- | --- |
| ChatGPT web current account | Actual OAuth/normal QA OTP/Read Consent PASS | list_trips4 PASS; all four Read tools actually visible; Item calls next | Current OTR policy Read only; Write deliberately not advertised. Platform Write NOT_TESTED, not PLATFORM_LIMITATION | Same-connection fresh call failed; live server401 evidence; UI generic error |
| Claude current account | Real normal OTP/fresh Read/Edit Consent; finite W discovery six Read/four Write PASS | B Trip/list3 + C full P3/independent match/60s continuation/foreign NOT_VISIBLE PASS | W Create APPLIED/rev1 plus R original-bb Edit APPLIED/rev2 and consumer/independent cloud readback PASS; one explicit new recovery authority, no new Item/ID. Native auto date change and same-ID cold restore PASS. W historical failure not retrospectively diagnosed | R normal DELETE204/fresh absence then one same-connection auth card/no Item; two durable live401 captured before removal, complete closed before harddeadline. W separately had late final verification and no durable probe log. Sole revoke causality unproven |
| Standard SDK public OAuth | Real code/S256/active grant PASS | Own Trip/P3 + foreign private deny PASS | Public Write NOT_TESTED | Refresh/revoke/ordinary Business denial PASS |
| Internal standard SDK QA | Normal independent QA Session, not external OAuth | Read PASS | P3 APPLIED rev1→2/independent readback; Native Create/cold PASS | Own Session refresh rejection PASS |

Run one small continuation on retained synthetic objects. No SDK rerun is required
for the already-qualified Read path. Prioritize ChatGPT get_trip→list_trip_items→
get_trip_item serially; keep formal type/revision/ID evidence. Then qualify fresh
Write consent and trusted operation confirmation before controlled P3, using the
fixed preview-only fixture consumer-p3-write.json after approval. Never upgrade an
old Read grant. Claude reuses the same server; registration/redirect differences
belong to Auth/client adaptation, not another Core Save.

Each live consumer run records client/context, exact tool names, known QA IDs,
actual outcome/revision/receipt, independent readback, Native evidence, failure/
UNKNOWN and cleanup. No tokens/OTP or unrelated browser metadata. A connected UI
or HTTP200 alone is not business Read PASS. Avoid concurrent smoke load, duplicate
paid work and repeated Creates. Use one browser writer per authorization flow;
preflight UI and recipient availability before starting the bounded Auth window.

Reusable local set is the existing mcp six suites (51 tests at last qualification):
protocol/discovery, signature/resource/scope/expiry, Core commands/CAS/receipt/
UNKNOWN/idempotency, cross-account access, typed Preview and consumer SDK behavior.
Run affected checks for actual changes; no new monitor or benchmark platform.

No general public OTR install listing, ordinary-user availability, consumer Write,
full Data/Storage isolation or shared-Trip Beta revocation is claimed. A missing
formal OTR Write port is an OTR qualification gap, not a client-plan limitation.

## Historical consumer preflight (superseded by live B below)

`acceptance/CONSUMER_PREFLIGHT.json` and the two cropped screenshots record the
actual ChatGPT Read4 tool panel and Claude custom-connector Step2. Visibility is
not Item Read execution. Claude's probe returned404 while OTR was default closed;
no OAuth checks ran, and the form remained usable. This is not a demonstrated
Claude plan restriction. No connector was created and no new access was granted.

Claude's [current authentication contract](https://claude.com/docs/connectors/building/authentication)
documents `https://claude.ai/api/mcp/auth_callback` for hosted apps and a public
client when its optional secret is blank. Auth owns the exact static-client
candidate; the existing ChatGPT/SDK client is not reused. Verify the actual
authorize redirect against that approved candidate before issuing a token.
No DCR/CIMD activation or second issuer is needed for this fixed QA candidate.

The installed ChatGPT plugin's Manage page still labels its old account connected
after the independently confirmed server revoke. Its account menu exposes
Reconnect and Disconnect. No Reconnect was clicked in preflight. This reinforces
that a client UI label is not current grant evidence; the next bounded run can
use that explicit Reconnect entry rather than creating another plugin.

Auth review found a separate OTR configuration gap: the old loader accepted only
the ChatGPT callback tuple. Closed-only maina7d39f11 now accepts exactly the old
ChatGPT pair or Claude's one official callback with a new public client, rejecting
mixed/altered profiles. This is code qualification, not an actual Claude OAuth
PASS. Final Gate dd2409b0 remains inactive; Root's frozen Source package does not
yet contain the exact loader, so Host is NOT_READY. No Owner permission is asked
until that closed integration is qualified.

The earlier Host-NOT_READY checkpoint is now superseded: Auth independently
qualified actual retained service0cf/image67/capture82d7 and the a7 loader closed.
Final candidate19253117/Gate b3e66e9d uses the actually accepted bridgeb518/browser9264,
not a new browser build from joined UI vocabulary. Final independent candidate
review passed. Direct human confirmation was independently verified. A reached only first-party
email login; a browser-history lookup blocked1328.055 seconds, no OTP/Consent or
tool call occurred. A independently closed in13b79c98 with zero active grants; no
A retry. This is execution-side failure, not Backend Read or platform rejection.
B remains a separate approved window; only B_READY.json permits browser execution,
with current request-ID hash/pending-row proof before OTP and fresh Root CAS.

## Live Claude window B — 1 November NZ

Normal OTP, explicit Read Consent and four-tool discovery PASS. Actual raw
`get_trip` and `list_trip_items` Responses are SERVER_CONFIRMED; the latter has
three retained P3/P1/P6 Items, revision1, no next page. The P3 summary matches
independent normal-Session Backend baseline fields/dates; full detail comparison
is incomplete: one `get_trip_item` returned raw AUTH_REQUIRED before revocation.
No retry, reconnect, foreign call or write followed that failure. Cause is not
yet diagnosed; it is not evidence of a Claude plan restriction or extra Item scope.

Auth normal DELETE returned204 at15:14:32Z and independently acknowledged fresh
grant absence while route remained live. The one same-connection live probe
showed a real tool Request followed by “使用此工具需要身份验证”/Connect, without
Item response. Connect was not clicked; model waiting was stopped. This is client
reauthentication evidence, not proven server401 or causal revocation PASS, because
authentication had already failed before DELETE. Final independent close PASS at15:24:34Z; grant0, Hook/exact ACL and
localhost/ASoff verified, healthy retained d8b restored, own Session revoked.
Hook/runtime closed before deadline; final readback was later. See
acceptance/CLAUDE_B_AUTH_CLOSED.json.
See acceptance/CLAUDE_READ_B.json, raw TRIP/LIST Response JSON, visible texts and
CLAUDE_REVOKE_B.png. No sensitive credential was retained.

## Actual C continuation — 1 November NZ

New exact Gatebba48f2c had direct human approval independently checked in the
Auth original reply. One normal browser OTP/explicit Read Consent; only fixed
P3 first, one same-P3 after60s, foreign denial and one post-revoke P3 probe.
Trip/list were reused, no reconnect/retry loop or business write. Both raw
SERVER_CONFIRMED P3 results match the entire independent Backend Item exactly
(canonical SHA c2f9627883fc…): rev1/date-only UNKNOWN/DERIVED_CIVIL/PENDING,
no time/zone invention. Same-connection continuation is PASS; refresh wire
mechanism was not observed, and historical B AUTH_REQUIRED cause is unproven.
Foreign raw response is NOT_VISIBLE with no Item fields. Normal grantDELETE204
and fresh absence precede the single same-P3 live probe, which requires auth
and returned no Item. Auth durable safe-log projection records two live-route401 after that
probe; the projection and independent full close PASS before the hard deadline.
The two401 do not isolate revocation from coincident Token expiry. See
acceptance/CLAUDE_READ_C.json and its referenced raw Responses/screenshots.
