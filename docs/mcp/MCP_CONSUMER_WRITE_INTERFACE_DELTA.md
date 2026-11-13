# Consumer controlled Write — next owning delta

Read is qualified separately: ChatGPT OAuth/list_trips and SDK Read/refresh/revoke.
The current Owner confirmation and closed window authorize no Write activation.

Reuse existing issuer, Account/session, code/S256, active user/grant checker,
MCP OAuth adapter, Core mutation/receipt/CAS and ConfirmChanges. Current concrete
blockers are Auth-owned: mcpReadGrantSchema permits Read only; the Hook and Consent
are Read only; createMcpAccountReadBinding exposes only GET and supplies no backend.

Auth's next closed candidate must provide a versioned explicit business Write
Consent/verified context and the same-Account existing Core command adapter.
Signed business permissions remain distinct from openid/offline_access. Never
silently upgrade the existing Read grant or forward its resource bearer to a
separate Business audience. No second issuer, permission database, Service Role,
new Core Save or Native sync is needed. Protected activation still needs its own
exact Owner Gate and fresh actual Consent; absent ports remain closed.

MCP already accepts the owning backend port through OAuthOptions.bindBackend and
requires ConfirmChanges bound to Account/client/resource/exact digest/operation
IDs. An OAuth Write grant alone or model-provided confirmed=true cannot approve
an operation. Keep the existing typed preview/current base, stable IDs, receipt
recovery, current capability check, CAS and independent readback.

## Fixed synthetic proposal — not submitted

mcp/fixtures/consumer-p3-write.json is PREVIEW_ONLY_NOT_AUTHORIZED_FOR_DISPATCH.
It proposes a new synthetic P3 Stay on the existing synthetic Nelson QA Trip:
Dec12→13, Consumer MCP QA Lodge, no Booking/Ticket/payment; a distinct CAS1 edit
moves arrival toDec11 while retaining Dec13 checkout. Both operation IDs, target
and canonical command/preview digests are fixed. The file has no execution caller.
Existing pure prepareCreate/prepareUpdate validated it without network/Session.

After the owning candidate and exact permission/operation approval are ready,
use the real consumer, formal APPLIED/independent readback and an actual iPad
before/after date observation. Do not rerun accepted Creates or substitute the
old unresolved9b date operation. This proposal grants no live write authority.

## Prepared consumer sequence — no live authority

`mcp/fixtures/claude-p3-write-smoke.json` pins the original fixture hash and
contains six serial calls: Create PREVIEW → exact APPLY → Item readback →
CAS1 Edit PREVIEW → exact APPLY → Item readback. Only the two existing operation
IDs/digests are used. Each step stops unless its actual result matches; Create
must have formal APPLIED and independent revision1 before Edit. No new runner,
auto batch, model confirmation boolean or POST replay is introduced.

UNKNOWN, timeout or authorization failure after Core IO retains the original
operation and uses only its existing status query if still authorized. Auth's
first adapter returned401 after suppressed Core IO, which MCP maps to REJECTED;
Auth repaired that ambiguity to503/UNKNOWN after POST IO. A local composition
of the real Auth adapter, owning in-memory Core execute/apply/commit, and MCP
createMutationTools confirms UNKNOWN for post-commit revoke/expiry/cancel,
exactly one POST/commit and no result leakage. See
acceptance/POST_CORE_IO_COMPOSITION.json and its executed source artifact.
This is not a DEV/consumer Write or Consent qualification; the original401
response cannot mean no commit. No new consumer Write has run. Native is only
checking the existing QA device; observer15s+one30s timeout/cancel occurred
before AX, with Runner stalled enabling automation mode. Own session closed;
no global process absence or Touch ID cause was established. This blocks
current identity/Trip entrance/downstream/cold verification. Keep physical
acceptance BLOCKED; this does not prevent the separately authorized Backend/
consumer slice. No new simulator or Session transfer is permitted. Consumer idempotency replay is not scheduled; existing
SDK/Core idempotency evidence is reused without claiming consumer replay PASS.
