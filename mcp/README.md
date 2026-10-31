# OTR MCP

Standard TypeScript/Streamable HTTP module, official SDK2.4.0. Read tools reuse
Backend discovery/Core read2. Controlled Trip/Item writes reuse formal Manual
commands, CAS and exact receipt recovery; Nelson preview/apply has no batch-atomic
claim. Public activation is **closed pending Auth-owned OAuth grant/binding**.

From the repository root with Node24 and repository tooling installed:

```sh
npm ci --prefix mcp --ignore-scripts
npm --prefix mcp test
npm --prefix mcp run typecheck
npm --prefix mcp run build
```

Build emits root ignored `dist/mcp/index.mjs` (importable adapter exports) and
`dist/mcp/internal.mjs` (QA-only loopback entry). No Backend startup or Mobile
bundle imports them. A few protocol tests open localhost; run in an environment
that allows local listening. SDK/JWT dependencies are isolated in this package. Root Mobile typechecking excludes
MCP sources; run the separate MCP checks above whenever this module changes.

For public DEV, the owning Backend host imports createMcpHandler, installs
protectedResourceMetadata with approved issuer/resource, and supplies
createOAuthAuthorizer with trusted JWKS/key, Auth isGrantActive and in-process
bindBackend. No MCP bearer forwarding to another resource. Host also supplies
trusted user confirmation bound to the exact fields/digest and operations.
Absent ports deny access or return NEEDS_CONFIRMATION. Auth/Backend unique Writer,
TLS/origin/rate control and exact deployment window are required before mounting.
This module implements neither a new authorization server nor grant database.

Internal-only ordinary-session validation: explicitly set
OTR_MCP_INTERNAL_SESSION_TEST=1 and OTR_MCP_DEV_PUBLISHABLE_KEY, optional
OTR_MCP_PORT(default8798), then run start:internal or internal.mjs. Listener binds
127.0.0.1 only; no flag means no listener. Normal entry exposes reads only.
Never reverse proxy/tunnel this Session harness or call it public OAuth.

Actual Golden acceptance uses `mcp/golden.ts` and the existing registered-QA normal
OTP helper. It requires OTR_DEV_OTP_TEST=1, approved public DEV URL/key,
OTR_QA_RESEND_SCOPE=dedicated-qa-team, OTR_QA_DEV_BUSINESS_WINDOW=HELD and
OTR_MCP_QA_CASE=READ/P3/NELSON/P3_VERIFY. Flags grant no authority: ensure existing synthetic QA authorization and coordinate only overlapping
receiver/object/device resources. Ordinary QA has no global DEV reservation. The helper owns receiver
locking and local logout+refresh-rejected cleanup. No copied Session/Keychain,
credential arguments/logs or new fixture permissions. P3 and NELSON stages may
write only their frozen synthetic cases after explicit owning coordination.
P3 and NELSON require a real interactive stdin. P3_VERIFY uses a GET-only owning
backend port for original-operation recovery/replay, with a separate authorized
foreign negative POST. For an already submitted UNKNOWN Create,
OTR_MCP_RECOVER_P3=1 performs only same-operation status lookup and DB validation
before the Native checkpoint; it never invokes or re-POSTs the original Create.
Native acknowledgement precedes the distinct Edit operation.

Current contracts/evidence: docs/mcp/MCP_ARCHITECTURE_INVENTORY.md,
MCP_TOOL_CONTRACT_V1.md, MCP_AUTH_CONTRACT.md, MCP_NELSON_IMPORT_PLAN.md,
MCP_E2E_ACCEPTANCE.md. Earlier MCP_01 files are historical evidence.

Bounds:16KiB request/60s total/50s Backend reads/15s mutation calls/25 Items per page,
64MiB certified collection,12 changes per preview. Item list uses one validated
visible collection and returns summaries; get_trip_item retrieves full typed detail. No auto retries,
workers, sync engine, schemas or provider calls. Existing timed/qualified date
moves require the owning temporal adapter; date-only edits are supported.

Nelson QA retains the actual initial batch result. UNKNOWN is never re-POSTed:
status and full expected receipt validation must succeed; only explicitly
unsubmitted suffix operations can continue as unchanged, confirmed single-change
subsets. Each Item requires independent DB verification before the next submit.
This is QA composition of existing tools, not a server batch-atomic claim.

V2 delivery procedure: ordinary approved disjoint QA has no global DEV lock.
Only intersecting main/service/SQL/config/device changes acquire that resource;
prepare/review outside it and record five actual release times. No Authority is
created by the procedure. Structured Trip recovery requests explicitly use v2.
NELSON_STATUS is GET-only; NELSON_RESUME is an explicitly selected same-command
QA recovery with original-digest validation and a non-deleted pre-fetch marker.
NELSON_DATE_EDIT requires actual Native readiness and never repeats three Creates.
