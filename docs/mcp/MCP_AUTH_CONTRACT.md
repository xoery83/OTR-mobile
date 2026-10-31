# MCP Auth Contract — 31 October 2026

Public state: **BLOCKED_BY_OWNING_INTERFACE / unmounted**. This is an implemented
resource-server adapter, not a second authorization server or delivered OAuth.
Auth Owner's current response confirms no approved OTR active-grant/revocation binding exists. Provider grant APIs exist and must be qualified, rather than creating a new grant database.

The official SDK2.4.0 implements standard Streamable HTTP. `mcp/oauth.ts` uses jose
for asymmetric signature/algorithm, issuer, exact MCP audience, expiration and
required sub/client_id/token identity/scope validation. It rejects ordinary authenticated-
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
4. isGrantActive({accountId,clientId,tokenId,resource,scopes,expiresAt},signal)
   checks current legitimate normal Account/client grant, disabled/revoked status
   and expiry. Missing/unknown returns closed; no hardcoded true production seam.
5. bindBackend(grant,signal) binds that same Account to existing Backend read and
   mutation ports inside the trusted host; each query keeps owning ACL/CAS. Do not
   forward an MCP resource token to a separate audience or use a service role.

No protected settings changed. The exact future activation package must specify
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
configuration. ChatGPT/Claude consumer-product connections remain NOT_TESTED.

Auth-owned discovery0e51bf13 confirms public DEV OIDC metadata200 at
/auth/v1/.well-known/openid-configuration with code/refresh, S256 and standard
OIDC scopes; the RFC8414 path returned404. That is discovery evidence, not an
enabled-client/grant/audience E2E. Existing SDK listGrants/revokeGrant are reusable
provider APIs; Auth still owns resource-token acceptance, exact Account/client
binding, consent and expiry/revocation qualification. No need to build a second
grant system. The verifier accepts an approved signed jti or session_id as token
identity; neither is itself proof of an active grant.
