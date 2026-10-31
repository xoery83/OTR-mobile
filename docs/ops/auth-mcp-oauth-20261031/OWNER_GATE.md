# Hosted DEV OAuth finite QA Gate V1 — not yet approved

Purpose: one real normal Supabase authorization-code + S256 flow, then the
existing MCP read tools, using only registered Synthetic QA Account
`1f3d7935-1bdc-4952-8d7f-0f72077368c1`. No Owner Gmail/Foxmail account or real Trip.
This is a bounded qualification, not general Beta OAuth or proof that supplier
tokens are read-only on Data/Storage.

## Exact target and preimage

- DEV project `tuqigdxrvrerfewsxqgm`, Dashboard **OTR Development**.
- Existing issuer `https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1`; public JWKS
  already has ES256 key `79aad5d4-341d-41da-8eff-cc04f7b232d2`. No key rotation.
- Actual Dashboard: OAuth Server OFF, no OAuth apps, no Auth Hooks.
- Site URL `http://localhost:3000`; Auth redirect allowlist empty.
- New function absent. Existing `supabase_auth_admin`: superuser=false,
  createRole=true, bypassRls=false. **All existing role flags stay unchanged.**
- Evidence: `HOSTED_CONFIG_PREIMAGE.json`, `HOSTED_HOOK_CATALOG_PREFLIGHT.json`.

## Requested protected changes

1. Install exactly `public.otr_mcp_qa_access_token(jsonb)` from
   `QA_TOKEN_HOOK_CLOSED_INSTALL.sql`, Owner postgres, SECURITY INVOKER,
   `search_path=pg_catalog`. Only existing Auth Admin gets EXECUTE; PUBLIC, anon,
   authenticated and service_role do not. No new table, role, RLS, table GRANT or
   business-data migration. Initial body rejects **every** OAuth issuance and
   leaves ordinary Native OTP/Google claims byte-equivalent as JSON.
2. Configure the Custom Access Token hook to
   `pg-functions://postgres/public/otr_mcp_qa_access_token`. First prove ordinary
   QA OTP/refresh still works while OAuth remains closed. Never read SMTP/Resend
   secret, PAT, provider secret or browser session.
3. Set DEV Site URL to `https://api-dev.xoery.art`, OAuth authorization path
   `/oauth/consent`; enable OAuth Server with **DCR OFF**. Keep the separate Auth
   redirect allowlist empty. Site URL is a project-global change, not MCP-local.
4. Create **one** manually registered public OAuth client named
   `OTR DEV QA Read`, token endpoint auth `none`, code+PKCE S256 and refresh flow,
   exact callback `https://chatgpt.com/connector/oauth/CYUxrs56rSrW`. Request only
   provider scope `openid`. The callback was freshly observed in the current
   ChatGPT draft and must still match immediately before registration; changed
   callback means stop and amend this Gate. No wildcard, CIMD, DCR or client secret.
5. Independently read back that client's generated UUID and exact metadata. Bind
   only that UUID and an execution-time UTC deadline at most30 minutes away into
   the frozen `QA_TOKEN_HOOK_INSTALL.template.sql` using
   `scripts/auth/render-mcp-qa-hook.py`. The other substitutions are hashes derived
   from the approved closed body. Record the rendered SQL/close SQL hashes before
   apply. These two runtime parameters are explicitly part of this Gate; no other
   policy value may be substituted. CAS accepts only the exact closed predecessor.
6. Activate the matching public finite QA runtime config and exact CAS hook body
   after the reviewed software is ready. The function permits only this client
   and QA Account, signs `aud=https://api-dev.xoery.art/mcp` and
   `otr_scopes=["otr.trips.read"]`, and caps access expiry at60 seconds and the
   absolute deadline. Normal Native sessions remain unchanged. No write policy.

Installing the hook function does not activate it. Enabling the server/client
must happen with the deny-all hook already installed and configured; there is no
unprotected client-registration interval. This read client must never silently
gain write through a later hook change; write requires fresh explicit consent.

## Software and resource prerequisites

- Consent login uses normal Email OTP through existing SDK and Repository;
  memory-only session, explicit decision, fresh Account/client/callback checks.
- Ordinary Business HTTP rejects OAuth resource markers; only the MCP trusted
  same-Account binding delegates existing Discovery/Core read and ACLs. No bearer
  forwarding to Business HTTP and no new service-role admission path.
- Root must fresh-confirm actual Host baseline and preserve concurrent PNG
  diagnostics/Native version fixes. Software build and review happen outside the
  short Host mutation resource. No Auth whole-branch overwrite.
- Before mount, qualify real Caddy HTTPS/private backend port binding. Internal
  fixed-Host HTTP is normalized to the approved HTTPS resource; arbitrary
  Forwarded headers create no authority. Missing evidence keeps mount closed.
- Node-only MCP SDK stays outside the Mobile TypeScript graph. No new simulator,
  Native build, browser credentials export or other device Session copying.

## Real qualification and limits

Use formal OTP, real code/S256 exchange, signature/audience/Account/client/session
binding, current grant readback, own Trip list/items and registered synthetic
foreign Trip denial. Test refresh, access expiry, cancel/deny, grant revocation
with old access and refresh rejection. Test the same resource bearer against
ordinary Business HTTP and normal Data/Storage surfaces; unexpected access is
FAIL, not hidden by MCP's read-tools UI. Do not expose a real Account to this test.
Do not use an internal ordinary QA Session as the public MCP resource credential.
No OTP bypass, hand-signed JWT, administrative login or second grant database.

Native Email OTP uses code verification and Google uses native ID token; neither
uses the Site URL as its normal login callback. Their code/provider/key settings
are unchanged. Reuse prior full E2E and run only a targeted normal QA session
smoke for this global hook/Site URL change; Apple remains Owner-paused.

## Close and recovery

First CAS back to the approved deny-all OAuth body with the renderer's matching
close SQL; repeated close is idempotent. The absolute window and token cap close
new issuance/access even if the operator loses its connection. Native claims
continue unchanged. Then normally revoke only this QA client's provider grant,
prove old resource access/refresh rejected, and close the public runtime config.
Restore OAuth Server OFF, no configured hook and Site URL
`http://localhost:3000`; keep the existing redirect allowlist empty. Do not disable
the protective hook before issuance is closed and the issued QA grant/sessions
are revoked. Leave the private closed function and inactive registered client
as traceable artifacts; no irreversible deletion is required.

Any timeout/uncertain mutation is UNKNOWN: read back the same object/operation,
do not retry client creation or manufacture cleanup times. Record the five actual
resource timestamps and release. No Production, commercial policy or existing
user-data change is authorized by this proposed Gate.
