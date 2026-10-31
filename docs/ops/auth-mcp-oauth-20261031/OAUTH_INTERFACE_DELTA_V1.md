# MCP OAuth minimal Auth delta V1 — candidate, 31 October 2026

Status: **NOT_READY / no settings activated**. Golden Slice: an existing normal
DEV Account grants Trip Read in Inspector, then one consumer; `list_trips` and
`list_trip_items` return only the same Account's authorized records. Internal
ordinary-session QA is reusable business evidence, never OAuth issuance evidence.

## Fixed and unresolved values

- Existing issuer: `https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1`.
- Existing discovery and JWKS: see `PUBLIC_DISCOVERY_HANDOFF.json`.
- MCP-proposed resource: `https://api-dev.xoery.art/mcp`; PRM:
  `https://api-dev.xoery.art/.well-known/oauth-protected-resource/mcp`.
  MCP/Backend must qualify the actual HTTPS mount before activation.
- Client ID, exact callback URI, consent UI URI and current Hosted OAuth/hook
  configuration: **not yet read back**. No guessed callback, CIMD or open DCR.
- MCP observed the current ChatGPT custom OAuth draft callback as
  `https://chatgpt.com/connector/oauth/CYUxrs56rSrW`, token auth `none`, secret
  optional. This is a draft observation, not a durable registration; fresh-check
  before creating the static public client. No client has been created here.
- PKCE S256 only. Exact registered redirects; existing normal Account login.

## Minimal issuance candidate — requires exact protected configuration approval

Reuse Supabase authorization code, sessions, consent/grants, refresh and revoke.
Do not add an issuer, session store or grant database. Supabase currently supports
standard OIDC scopes, not arbitrary `otr.trips.read` authorization-request scopes.
Its default `aud=authenticated` does not authorize this resource.

Proposed first client is **read-only**, registered with exact public values. A
dedicated consent view must explicitly say it grants access to authorized Trip
content. An issuer-owned access-token hook may map only that registered OAuth
`client_id` to exact resource `aud` and signed `otr_scopes=["otr.trips.read"]`.
This is a candidate fixed client policy, not implemented authority: verify the
provider's grant/session semantics and consent behavior before approving it.
OIDC `scope` stays distinct from `otr_scopes`; neither `openid` nor a caller's
requested resource creates business authority. Other clients and Native sessions
must keep their current claims. No write scope or permission is inferred.

If deployed provider behavior cannot enforce that client/consent mapping, this
candidate stays closed. Do not compensate with a local grant ledger or a generic
`openid => Trip access` rule. Controlled Write needs an explicit later mapping
and the existing separate trusted per-operation confirmation.

## Auth request port and MCP caller delta

MCP keeps asymmetric JWT verification, fixed issuer/key source, exact audience,
expiry and signed business permission validation. Require a separate UUID
`sessionId` from `session_id`; optional `jti` is token identity and cannot replace
it. Keep Account/client/resource/permission values bound to the verified token.

Auth's request-scoped active check must also receive the original resource bearer,
only in memory. It calls the same fixed issuing Auth service for normal Account
and current client grant/session validation. It must match `sub` and `client_id`,
reject unknown/anonymous/disabled/missing/revoked state, and honor abort/timeout.
Do not synthesize a stored SDK session or request the consumer refresh token.
The installed SDK's reusable APIs are `oauth.listGrants()` and
`oauth.revokeGrant({clientId})`; resource-token acceptance and response shape still
need a real provider-issued OAuth token qualification. Upstream session checks
are not proof of the deployed DEV version's behavior.

Unavailable provider means fail closed for this MCP request; it must not force
Native offline users into reauthentication. No bearer/token/grant payload logging
or persistent token cache. No resource bearer goes to a different audience's
Business Backend. The trusted same-Account Backend adapter keeps all existing
owning ACL/CAS checks; service-role bypass is not an alternative.

## Writers, exact Gate and acceptance

- Auth: Account classification, issuer hook/consent/client policy and request-only
  provider grant verifier; Auth-only code candidates may proceed while closed.
- MCP: JWT/PRM/protocol caller, explicit session ID, signed `otr_scopes` adapter,
  actual consumer callback discovery and client compatibility.
- Backend/Core unique Writer: trusted same-Account business binding and HTTPS
  mount; no change to Trip permission semantics or Core mutation pipeline.
- Protected Gate must name actual current configuration/preimage, client/redirect,
  consent URI/text, hook identity/source/hash, exact changed claims, DCR state,
  rollback and closed/open behavior. Unknown values are not an executable Gate.
  The Parent `e89b3d5b` installation approval does not approve OAuth activation.

Audience alone is not a read-only security boundary. Supplier OAuth tokens inherit
ordinary user access unless the receiving service enforces the restriction. Before
issuance, qualify rejection of this resource token by ordinary Business HTTP and
Supabase Data/Storage mutation paths; do not assume PostgREST checks its audience.
If existing exposure allows writes or broader private reads, the candidate remains
closed until the unique owning Writer supplies an exact approved restriction.
Do not silently change RLS/GRANT as part of this interface task.

First proof: real code+S256 issuance, exact audience/normal Account/client/session,
explicit read consent, own Trip read and foreign private Trip denial. Then refresh,
deny/cancel, expired token, grant revoke with old-token and refresh rejection;
provider outage stays closed. Independent security review precedes activation.
Only then Inspector and actual consumer evidence can make this READY.

Sources: [Supabase OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows),
[token security](https://supabase.com/docs/guides/auth/oauth-server/token-security),
[MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).
These are supplier capabilities; Hosted configuration and end-to-end behavior
remain unqualified.
