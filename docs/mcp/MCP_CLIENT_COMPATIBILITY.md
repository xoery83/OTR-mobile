# Consumer compatibility — Phase 2

31 October 2026. All consumer cells below are actual evidence status, not platform
capability claims. Main8f79a421 is the accepted Phase1 baseline.

| Client                                 | Discovery / login / consent                          | Own Trip Read | Foreign private deny | Revoke deny                                                | Controlled Create/Edit / Native                                   |
| -------------------------------------- | ---------------------------------------------------- | ------------- | -------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Official SDK (internal normal Session) | Protocol PASS; not OAuth                             | PASS          | PASS                 | Own Session refresh rejection PASS, not OAuth grant revoke | P3 cloud PASS; Native Create/cold PASS; edit title not observable |
| Official SDK (public OAuth) | PASS finite Synthetic QA Code/S256/Consent + signed/current grant | PASS | PASS | PASS grant204, old user403, refresh400; Hook closed | NOT_TESTED / Read only |
| ChatGPT custom MCP plugin | PASS real normal QA OTP/explicit Consent/callback | PASS list_trips4; Item reads NOT_TESTED | NOT_TESTED | New same-connection call failed, generic error; exact cause not exposed | NOT_TESTED / Read only |
| Claude remote connector | NOT_TESTED | NOT_TESTED | NOT_TESTED | NOT_TESTED | NOT_TESTED |

Use one server. First qualify standard client discovery/code+PKCE/resource/token/
revoke, then one real consumer Read + controlled Write before expanding the other.
Capture actual account product/permissions and tool approval behavior; no inferred
plan/region or PLATFORM_LIMITATION until observed. Do not use API/internal QA or
simulated OAuth as evidence for ChatGPT/Claude products.

ChatGPT's current [official authentication guide](https://developers.openai.com/plugins/build/auth)
requires resource metadata, resource binding, per-tool OAuth policy and runtime
challenges. The SDK2.4 native metadata support must be checked against actual
consumer discovery; platform examples using the older SDK are not proof.
Claude's [official setup](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
provides remote connector OAuth client choices; use the actual selected metadata
rather than hardcoded historical callbacks. Public reachability is DEV only and
requires the Backend Writer's exact compatible release package.


## Historical preparation checkpoints

The NOT_TESTED and pending-approval statements below describe initial checkpoints;
the current matrix and actual SDK/ChatGPT receipts above supersede them.

The SDK-first public qualification harness is prepared at mcp/sdkOAuthQa.ts.
Its exact loopback callback is http://127.0.0.1:18764/callback, proposed alongside
the freshly observed ChatGPT callback on the same manually registered Read client.
Neither redirect registration nor Token issuance is authorized by this document.
Auth owns same-process token assertions and provider cleanup; no consumer Token
storage is inspected. Local SDK code/S256 and cancellation/cleanup checks pass;
public OAuth/consumer cells remain NOT_TESTED until actual evidence is obtained.


SDK public discovery reproduced before browser authorization: the official SDK
adds `offline_access` to `openid` when the AS supports it and client registration
includes `refresh_token`. The initial harness's only-openid assertion rejected
this URL; no OAuth Token was issued. A candidate now permits exactly these two
protocol scopes (either order), keeping signed OTR business Read unchanged. Auth's
supplemental exact scope Gate must be approved before execution; this document
and local tests do not expand the approved Hosted policy. Original2334a562 remains
traceable. No new client, callback, issuer or business permission is introduced.
