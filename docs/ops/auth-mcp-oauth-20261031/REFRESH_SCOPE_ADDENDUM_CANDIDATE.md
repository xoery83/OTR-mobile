# Exact DEV QA refresh-scope addendum — not yet approved

Parent: Owner-approved Gate `9dc271f6594f52da4e27cd58f70364d487d7c2ab2a1d365dcef6ed454e8ce733`.
Actual first failure: SDK2.4 adds `offline_access` when discovery advertises it
and the client supports `refresh_token`; the frozen `openid`-only assertion
stopped before opening browser authorization. A public-only SDK probe reproduced
this without another OTP or login. No OAuth token, consent or OAuth session was
created; independent exact QA/client metadata counts are zero. Original failure
and the unqualified DELETE404 are retained, not relabeled as revoked-access PASS.

## Only requested authorization delta

- Permit provider scopes `openid offline_access` for the already requested
  refresh-token flow. No `email`, `profile`, `phone`, write or other scope.
  Consent may still accept plain `openid`; the SDK refresh slice uses the pair.
- Authorize one replacement finite QA window, at most30 minutes from activation
  readiness, after the first window is closed. SDK and ChatGPT share that one
  new absolute deadline; no extension. This is not an extension of the old
  `2026-10-31T06:15:05Z` window, whose signing policy is already closed.

Same exact DEV project, QA Account1f3d7935-1bdc-4952-8d7f-0f72077368c1,
public client83504d3f-59d4-43fd-99b1-bebc54c40f7d, two approved callbacks,
resource `https://api-dev.xoery.art/mcp`, signed `otr_scopes=["otr.trips.read"]`
and access-token cap60 seconds. No new client, role, Schema/RLS/GRANT, hook
function, Provider key, payment or business authority. DCR stays OFF.

## Concrete candidate and execution

Auth Consent only accepts `openid` or the exact identity+refresh pair, in either
order; extra/duplicate scopes are rejected. MCP SDK candidate `9c399e01` preserves
S256/state/issuer/resource/callback checks and reproduces the actual discovery
scope augmentation. Production read binding and grant verifier remain unchanged.

After approval and independent review: preserve Root's fresh actual baseline;
install only the reviewed browser/QA changes while closed; reuse the existing
function/CAS renderer with the same client and one new bounded UTC deadline.
Use normal QA OTP, Code+S256, own/foreign reads, refresh/revocation, and the
approved Business/Data/Storage qualification. Secrets/verifiers/tokens stay in
memory. No copying of another app's Session or administrative login.

Close Hook and attempt normal QA grant revocation independently, including an
unknown token response. A404 is only reconciled by fresh authoritative absence,
never permission-denial proof. Restore default runtime, OAuth OFF, Hook disabled with URI cleared and original Site URL; retain the
closed private function/inactive client. Use the verified Hook-only sparse disable,
which normalizes URI to null; never use Dashboard Delete that automatically
GRANTs PUBLIC EXECUTE. Any
unconfirmed mutation remains UNKNOWN. This addendum does not authorize Beta.
