# MCP Auth Contract — 31 October 2026

Current public qualification: **finite Synthetic QA Read OAuth PASS via official
SDK**, including normal OTP/explicit Consent/code+S256, production token and active
grant verification, own Trip/P3, foreign private denial, refresh and revoke denial.
See acceptance/SDK_REFRESH_OAUTH_E2E.json and CHATGPT_READ.json. ChatGPT also
completed normal QA OTP/explicit Read Consent and a real list_trips request with
four QA Trips. A later same-connection call failed after Hook/grant closure, but
consumer UI exposes only a generic tool error. Owning server logs prove two401
while MCP remained available. Final independent Hook/grant/runtime/config closure
passed; the original control wrapper FAIL_OR_UNKNOWN remains retained separately.
The finite consumer window is closed. No public Write policy or trusted consumer mutation
confirmation port is qualified. Do not reuse a closed window.
Auth remains the sole issuer/grant/consent/revoke owner; no second authorization
server or grant database was created.

The official SDK2.4.0 implements standard Streamable HTTP. `mcp/oauth.ts` uses jose
for asymmetric signature/algorithm, issuer, exact MCP audience, expiration and
required sub/client_id/session_id/token identity/signed otr_scopes validation. It rejects ordinary authenticated-
audience sessions, service role, invalid signatures and insufficient business
scope. Keys/issuer are trusted host configuration, never token-selected URLs.
PRM and401 discovery challenge are ready through protectedResourceMetadata;
AS discovery, PKCE, registration, issuance and consent remain Auth-owned.

Required Auth contracts:

1. Canonical HTTPS issuer and resource, approved asymmetric JWKS/key source.
2. OAuth code+PKCE S256, exact redirects, CIMD or registered clients; qualify any
   DCR separately. No implicit open registration or fake discovery metadata.
3. Resource-bound audience and otr.trips.read / otr.trips.write. Scope/client
   claims must come from real user consent, not MCP parameters or inferred email.
4. isGrantActive({accountId,clientId,tokenId,sessionId,resource,scopes,expiresAt},signal,{accessToken})
   checks current legitimate normal Account/client grant, disabled/revoked status
   and expiry. Missing/unknown returns closed; no hardcoded true production seam.
5. bindBackend(grant,signal) binds that same Account to existing Backend read and
   mutation ports inside the trusted host; each query keeps owning ACL/CAS. Do not
   forward an MCP resource token to a separate audience or use a service role.

Protected finite-QA settings were applied only by owning lanes under precise Owner
approval. Any subsequent activation package must specify
issuer/resource/client+redirect values, audience/scope issuance mapping and grant
revocation behavior; Auth unique Writer approval precedes any setting/hook change.
Then Backend unique Writer mounts /mcp and PRM in an approved DEV software window.
No business schema/RLS/GRANT or Production change is required by this MCP code.
Do not interpret this as authority to create an Auth grant database here.

Trusted mutation confirmation is a separate host port. It receives complete
canonical user fields, exact operation IDs, Account/client/resource and digest;
only actual user interaction or this Owner-authorized fixed synthetic QA case may
approve. A model cannot submit confirmed=true. No confirmation handler means
NEEDS_CONFIRMATION. An OAuth grant alone is not approval of a particular batch.

Internal acceptance uses the existing registered-QA normal OTP helper in a
coordinated DEV/receiver window. Session remains in its action scope and cleanup
uses local logout plus proven refresh rejection. Its ordinary-session audience is
**not** promoted to public MCP OAuth. The internal write bridge is opt-in and
limited to exact existing Trip/Core command and receipt routes. It never mounts a
public endpoint or reads another device's Session/Keychain. The receiver may use
its already-approved dedicated mailbox credential through the owning helper.

References checked for this delivery: [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization),
[Supabase MCP](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication),
[Supabase token claims](https://supabase.com/docs/guides/auth/oauth-server/token-security),
[OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth).
Supabase's default aud=authenticated and OIDC scope semantics alone do not satisfy
this OTR resource contract. These are capabilities, not claims about current DEV
configuration. Current finite ChatGPT OAuth/list_trips PASS is recorded above;
Claude remains NOT_TESTED.

Auth-owned discovery0e51bf13 confirms public DEV OIDC metadata200 at
/auth/v1/.well-known/openid-configuration with code/refresh, S256 and standard
OIDC scopes; the RFC8414 path returned404. That is discovery evidence, not an
enabled-client/grant/audience E2E. Existing SDK listGrants/revokeGrant are reusable
provider APIs; Auth still owns resource-token acceptance, exact Account/client
binding, consent and expiry/revocation qualification. No need to build a second
grant system. The verifier requires a signed session_id independently of optional jti. Auth
receives the bearer only as request-scoped verification evidence for its own
issuer; it is never returned in the grant DTO, logged, persisted or forwarded
to a business Backend. Neither identifier proves an active grant.

## Phase 2 exact interface delta — 31 October 2026

The existing MCP verifier/PRM remain the resource adapter. Auth owns implementation
and qualification of the five required ports above; do not wait for People,
Guest Adoption or Settings. First grant targets an existing normal Account's own
private Trip. No new issuer, Account, Session or grant database is authorized.

| Missing owning delivery | Minimum reviewable output / Writer                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public DEV resource     | Existing Backend Writer: exact HTTPS origin + `/mcp`, PRM URL, TLS/forwarded-origin contract, current image/config baseline and compatible mount package. No production.                                           |
| OAuth client            | Auth: exact provider client IDs or approved CIMD, actual ChatGPT/Claude redirect metadata, code+S256, token endpoint auth method. No assumed callback or open DCR.                                                 |
| Audience and scopes     | Auth: approved provider issuance mapping for the exact resource and consent-derived read/write scopes, preserving ordinary Mobile tokens; protected token-hook/config changes need an exact authorization package. |
| Active grant / revoke   | Auth: provider-backed check on every authorized MCP HTTP request, failed/unknown/expired/revoked closed, real refresh/revoke evidence. A signed session_id alone is insufficient.                                  |
| Backend binding         | Auth/Core unique Writer: verified same Account bound in-process to existing Backend ports; token audience is not forwarded to a different resource and no service-role impersonation.                              |
| Per-change confirmation | MCP host: exact digest/operations bound to real user interaction. Platform tool approval is not assumed to reach this port; absent integration remains NEEDS_CONFIRMATION.                                         |

MCP supplies tool OAuth metadata and explicit tool-level re-link /
insufficient-scope challenges, preserving request-level authentication. The
installed SDK2.4 tool configuration supports `_meta`; use its documented metadata
surface, record any consumer compatibility limitation, and never rewrite SDK
JSON-RPC routing to imitate an authorization server. Local signed test tokens
qualify only protocol behavior, not hosted OAuth or consumer PASS.

Current sources rechecked: [ChatGPT auth](https://developers.openai.com/plugins/build/auth),
[tool metadata](https://developers.openai.com/plugins/reference),
[Claude remote connector](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp),
[MCP2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).
Only actual account UI/connection receipts establish product access or limits.

Supabase provider requests use the qualified openid/offline_access pair; signed
otr_scopes remain separate business authority. The exact finite-QA mapping and
normal Consent were supplied by Auth and actually qualified. Any future general
account or Write activation needs its own approved contract; no internal Session
substitution or silent read-grant upgrade is allowed.

Historical preactivation checkpoint (superseded for finite QA by the receipts
at the top): Auth candidate28349170/d8f8b0fa supplied a closed same-issuer request-only
getUser/grants checker. Missing exact client/public DEV key policy is false/no IO;
no Session/store/mount is created. Its actual Hosted resource-token acceptance,
normal Account/session/ban semantics and old-token/refresh rejection still need
qualification. The client/request scope is `openid`; signed `otr_scopes` carries
business read permission. `protectedResourceMetadata` accepts an explicit
`authorizationScopes={read:["openid"]}` policy; PRM/challenges/tool metadata use
that request scope, while the verifier still requires signed OTR claims. Missing
write policy suppresses write discovery even with a stray Backend port. Neither
openid nor tool annotations grant business authority.

Resource token restrictions must also be qualified on ordinary Business HTTP and
Supabase Data/Storage. Audience alone is not proof of read-only access. Auth/Core
own any exact protected restriction delta; no RLS/GRANT or issuance is changed
here. Those initial P0 activation blockers were resolved for finite Synthetic
QA Read; general-account/Write and full Data/Storage qualification remain outside
that result. The active test window is now independently closed.
