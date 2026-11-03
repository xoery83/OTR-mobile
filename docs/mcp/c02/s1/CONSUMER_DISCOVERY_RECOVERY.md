# C02 — consumer discovery qualification after679c

3 November 2026. Existing MCP-C02 remains IN_PROGRESS. No new capability or
permission is authorized by this runbook. Closed e325/679c windows never restart.

## Actual result and MCP-owned correction

The existing ChatGPT App displayed the old Notes catalog:7 read tools and1 write
(`update_trip_item`). A refresh before reconnect failed. Normal QA browser OTP and
Consent then completed; ChatGPT reported “Primary 现已连接”. A focused refresh after
that change still returned “无法更新应用。请重试”. The original synthetic task,
sent once, finished “无法加载此回复”. No formal P3 Preview or business Apply occurred.

MCP allowed the ordinary task to be sent before validating the consumer catalog.
That preparation error is owned by MCP. Fix the sequence below; do not classify it
as an Auth/Core interface gap or try another business operation identity.

## Required order for a separately qualified future window

1. Inspect the existing connection's catalog before starting a user task. A
   cached Notes-only catalog cannot qualify full-field P3 discovery.
2. Within the approved finite access scope, finish normal OAuth for the existing
   fixed QA Account/Client. Read/write OAuth Scope and a particular business Save
   are separate approvals. Never infer Save from successful Consent.
3. Refresh that existing connection and verify the actual advertised names and
   schemas. The C02 profile's local SDK baseline is8 read/2 write tools; Create
   accepts P3 only. Do not replace the consumer check with bundle string counts.
4. Only after metadata matches, start a fresh conversation with the same fixed
   synthetic files and ordinary task. Do not teach tool names or field paths to
   the model. Let it discover the Guide itself.
5. On refresh failure, preserve App/version identity, timestamp, visible error and
   sanitized protocol results, then close normally. Do not resend the task,
   uninstall/recreate the app, add a Client, change scopes/TTL or replay a mutation.

OpenAI documents refreshing metadata, checking the changed catalog, then starting
a new conversation for custom MCP connections. The order above applies that
sequence without adding an OTR authority or business-write exception.
[Official connection/test guidance](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Focused local evidence and remaining uncertainty

`c02Execution.test.ts` now exercises actual SDK tools/list against the real
Handler plus existing C02 restriction, using isolated authorized fixtures. It
compares Notes and C02 catalogs, checks exact write-tool sets and P3-only input,
and proves zero Backend/confirmation calls. One focused test, Typecheck and scoped
lint PASS. It does not exercise deployed Host JWT/Grant binding or ChatGPT refresh.

A client React error418 occurred around the OAuth callback, with callback-start
and callback-completed messages. These observations do not establish the cause
of the subsequent generic refresh failure. Official troubleshooting advises
isolating server/auth/client layers and retaining logs/screenshots; it does not
identify this generic message as a particular server defect.
[Official troubleshooting](https://developers.openai.com/plugins/deploy/troubleshooting).

Frozen C02 logging emits `MCP_QA_REQUEST` records containing requestId/status/
duration and optional tool. It does not include a pathname, and initialize/
tools-list responses need not contain tool. Therefore a route-text filter for
`/mcp` is not proof of no incoming MCP traffic. Root confirmed these records were not retained and the candidate/Docker log
were removed;679c raw records are unrecoverable. This is an actual evidence gap. Next diagnosis
needs the real protocol response/correlation, not a broader Auth audit or new API.

Acceptance: normal Consumer OAuth/Consent PASS; Consumer tool refresh BLOCKED;
P3 Preview/Create/Edit/APPLIED/Supabase/Native NOT_RUN. Grant DELETE204 plus
independent absence and own-session logout/refresh rejection PASS; Root reports
Console/Issuer/Host/timers restored and shared Writer released. No saving allowed.

## Close-side repair, local only

The MCP-owned close wrapper now takes a bounded best-effort snapshot before
calling the unchanged pinned Root restore. It selects only current-candidate
MCP_QA_REQUEST summaries since the immutable window start, tail200, timeout5sec;
unknown fields/params/Token/URL/other logs are discarded. Per-candidate artifacts
are exclusive0600 files, never overwritten. Default-container probes do not read
shared default logs. Capture/parse/write failure reports unavailable and still
restores. Three focused privacy/failure tests, existing9timer checks/narrow control
checks and independent review PASS. Close/timer/CAS hashes changed only in the
future local package; no new Host installation or OAuth activation. It cannot
recover the lost679c transcript, and an empty summary is not proof of zero HTTP.
