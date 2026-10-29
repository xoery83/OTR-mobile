# MCP-01 Auth Design

2026-10-29. **Proposed public contract; not implemented/activated OAuth.**
Auth Owner confirmed through the authorized coordination channel that no Remote
MCP OAuth/resource-bound verifier has been delivered. Existing Auth is ordinary
Supabase getUser(token)→existing Account ID. Guest/Adoption/People are independent
and remain untouched. A different MCP client must never redefine Account identity.

## Public path and exact owning interface

Prefer the existing Supabase identity provider and Account database. Supabase
publishes an [OAuth/MCP capability](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication);
its existence does not prove configuration or suitability in this OTR DEV project.
Auth must qualify it before choosing an OTR authorization-server facade instead.
Do not enable dashboard OAuth settings, change token hooks or add scopes here.

The [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
separates resource server from authorization server. Proposed public activation
requires PKCE S256 code flow, issuer discovery, resource indicators and token
validation. Protected resource metadata must identify the exact HTTPS MCP resource
and Auth-approved issuer. These are requirements, not a new implementation in MCP.

| Owner      | Required contract / closure                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth       | Approved issuer + metadata; authorization/token endpoints; PKCE S256; exact redirect validation; consent against existing Account                                                    |
| Auth       | sub→canonical Account; signature/algorithm/issuer/exp/nbf verification; exact resource/audience; active client grant and revocation check; minimum otr.trips.read scope              |
| Auth       | CIMD preferred when supported; DCR or preregistered clients as qualified fallback, exact redirects and client auth method; prevent arbitrary URL fetch/SSRF in metadata registration |
| Auth       | Per-Account/per-client grant IDs, revocation/introspection policy and renewal; logout vs individual MCP disconnect semantics; audit ownership and retention                          |
| MCP        | Resource metadata route and401 discovery challenge once issuer/resource are approved; tools/schema/protocol and safe errors                                                          |
| Backend    | Bind verified Account to existing read/query ports inside the host; never expose caller-selected actor or generic dispatch                                                           |
| Operations | Exact TLS/proxy origin, rate/concurrency controls and protected deployment window; no public activation before real security evidence                                                |

`McpOptions.authorize(Request)` is an injectable host port, absent by default.
It returns {accountId,resource,scopes,expiresAt,read}; expiry is Unix milliseconds.
The owning implementation must first perform signature/issuer/revocation/client
consent checks, then bind `read(path,signal)` to that same verified Account.
The MCP handler rechecks Account syntax/resource/scope/expiry and expiry before
and after tool execution. These checks cannot replace an Auth-owned verifier.
No unsigned JWT decode, opaque bearer existence check or client ID is authority.
No bearer tokens or refresh credentials enter tool arguments, outputs or logs.

Public challenge should advertise resource_metadata and scope per approved issuer
configuration; public PRM/AS discovery routes are intentionally absent now. The
internal harness uses only a bare Bearer challenge and is not OAuth discovery.
Never publish fake metadata or silently treat ordinary authenticated-audience
Supabase sessions as MCP access tokens. A standalone public service also needs
an Auth-owned token exchange/on-behalf-of mechanism; forwarding a received MCP
bearer token to another resource server is not an accepted solution.

## Internal validation path only

`mcp/internal.ts` is explicitly gated OTR_MCP_INTERNAL_SESSION_TEST=1, binds
127.0.0.1 only and pins DEV Auth/Backend origins. It accepts only a DEV publishable
key (not a service secret), validates each incoming ordinary session with getUser,
and binds GET-only allowed Backend paths to the same bearer. It assigns the
internal30s verification context; it does **not** claim OAuth scopes were granted
or verify a public MCP audience. Neither reverse-proxy nor tunnel this listener.
No session persistence, refresh, Keychain read or other-agent token copying.

Auth's old session-dev-e2e runner includes refresh/logout and a credential path
owned by another Native task; it is not used. Real DEV tests require new normal
OTP/Google login for this lane's authorized QA A/B. User agreed to cooperate;
no existing refresh token or Session artifact is requested. Expired/wrong-audience
public credentials are tested only at the injected verifier seam until actual
Auth resource tokens exist. Mark those tests synthetic, never OAuth E2E PASS.

## Actual clients and limits

[Official OpenAI authentication documentation](https://developers.openai.com/plugins/build/auth)
describes protected-resource discovery, PKCE and CIMD/DCR/predefined registration.
ChatGPT connection requires approved HTTPS endpoint, OAuth and workspace/client
eligibility. No specific user's plan or admin access has been verified here.
The four tools are MCP foundation; search/fetch or connector-specific packaging
for additional product surfaces is deferred, not added solely for a demo.

[Claude custom connector documentation](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
describes cloud-side remote connections and OAuth. A localhost-only harness is
not reachable by that client. [Claude API MCP connector](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector)
is a separate API route requiring the caller to obtain/refresh its OAuth token.
Neither actual ChatGPT nor Claude connection is claimed. Standard SDK HTTP client
coverage remains useful regardless of commercial client access.
