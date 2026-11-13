# C02 B1 ordinary Backend preflight / draft case

Status: LOCAL_FIXTURES_PASS / INDEPENDENT_REVIEW_NO_BLOCKER / HOSTED_NOT_RUN.
Entry: `scripts/mcp/c02-backend-qa.mts`; normal QA Account1f3d… / Tripcc44… only.
Import and missing invocation flag perform no Auth/API work. No Apply function,
command POST, old operation query, recovery stage or SQL path is implemented.

Future read-only commands, **not executed by this preparation round**:

```sh
node --import tsx scripts/mcp/c02-backend-qa.mts preflight --run-readonly
node --import tsx scripts/mcp/c02-backend-qa.mts prepare --run-readonly --out /private/tmp/otr-mcp-c02-backend-qa-CASE/plan.json
```

Use prepare alone when a draft is wanted: it includes preflight within one normal
Session, not a second login. The output directory must already be owned0700;
output is wx0600, never overwritten. Only this dedicated temporary namespace is
accepted; Auth/Root2/6d49 runtime directories cannot receive output. Do not run
this command until the parent independently reviews and authorizes ordinary QA
read execution. The flag itself grants no authority.

Prerequisites use existing helpers, not a new Auth flow:

- Same checkout's `withRegisteredQaHostSession` normal QA registration/proof hashes,
  public DEV configuration and legitimate existing Receiving credential source.
  `publicConfiguration(process.env)` enforces DEV URL/public-key qualification.
  Existing `OTR_DEV_OTP_TEST=1`, `OTR_QA_RESEND_SCOPE=dedicated-qa-team` and
  `OTR_QA_DEV_BUSINESS_WINDOW=HELD` conditions apply; flags are not permission.
  This round did not read environment/keys or prove source availability.
  The entry now requires existing `OTR_QA_RESEND_API_KEY` before calling the
  Session helper, so absence returns UNAVAILABLE without its Keychain fallback.
  Presence alone proves neither provenance nor coordinated read-window authority.
- Normal own actor lease; BUSY stops without deleting locks, changing actor,
  borrowing Session or relogging. Existing helper owns logout/refresh-rejection
  cleanup. API401/403/404/unavailable stops; no automatic retry or new login.
- Actual Backend must support contract/command/read v2 for this actor/Trip.
  Only GET capabilities, validated collection and bounded normal Trip discovery
  are reachable. Collection actor/Trip/hash checks use existing canonical reader;
  Backend requests are capped at8, redirect:error. Session/token never returned.
  Normal Auth lifecycle is the existing helper's separate work, not a claim that
  authentication itself performs only GET.

Read output distinguishes ordinary Backend HTTP from MCP OAuth/SDK Handler E2E.
Core wire versions are verified. Existing HTTP supplies no deployment build SHA;
that remains explicitly unknown, not guessed from health or source files. No
current hosted Actor/capability result is claimed until a real run.

Prepare uses actual Trip dates and existing `prepareCreate/prepareUpdate` adapters
for a new synthetic P3, new operation/room IDs and deterministic same Item ID.
A separate Notes Edit expects revision1 **only after** exact Create APPLIED plus
independent latest same-ID revision1/Base. Otherwise re-preview/confirm; never
substitute a revision or silently overwrite. Command digests, typed input and
preservation expectations are saved, but status is DRAFT, Apply=false. Fresh
execution compatibility, independent readback and new exact user confirmation
are still required.6d49 remains Preview-only; no old UNKNOWN or Notes Item reuse.

Local validation: 11 targeted fixtures (DEV/GET/scope, actor and collection binding,
ENV-no-fallback before runner, Session lifetime, API-failure cleanup, BUSY/no retry, closed capability, fresh typed draft and output
safety). Typecheck uses the existing project Bundler/alias settings with only the
entry/test as roots, `types=node`, absolute node typeRoots and
`allowImportingTsExtensions=true`; NodeNext CLI defaults do not fit existing MCP
extensionless imports. No historical suite or actual Auth/network/DB was run.

Next: independent review→one explicitly permitted normal preflight/prepare→record
actual capability and protocol results. If unavailable, report the exact ordinary
Backend/actor qualification; do not revive the consumer Console Gate. Actual SDK
Handler/Adapter persistence remains the later B1 step, not this read-only proof.

Readonly candidate Review `26e9db72` and ENV-only guard Review `b11f9850`
are NO_BLOCKER. Current boolean-only environment observation found the approved
ENV input and required public DEV flags absent; no helper/Auth was called.
`BACKEND_READONLY_SCOPE.json` fixes exact GET/lifecycle/budget/close scope.
Native same-mailbox occupancy remains pending, never assumed released.
