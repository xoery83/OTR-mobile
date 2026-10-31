# Candidate only — diagnose the first Claude P3 authentication failure

Not approved, not activated. Both b3 windows are closed and cannot restart.
Root has now qualified and deployed default-closed imagef052/capturec088 with
actual bridgef9; see qa-window/SOFTWARE_HANDOFF.json. Joined34a remains separate
local compilation evidence. The precise approval candidate is qa-window/OWNER_GATE.md.

Golden Slice: the existing Claude connector performs fresh normal Email OTP and
explicit Read Consent, then reads the fixed P3 directly. Reuse the accepted Trip
and list responses; do not spend this window repeating their qualification.
Correlate the single failed request with the existing, safely projected
`MCP_QA_REQUEST` event and its `authFailureSource`. No inferred cause from
`AUTH_REQUIRED` alone.

## Exact proposed scope

- Only Hosted DEV `tuqigdxrvrerfewsxqgm` and resource `https://api-dev.xoery.art/mcp`.
- Existing manual public/none Claude client `d2b8167f-ee42-4ac1-b5ef-4dc003c0d141`;
  only callback `https://claude.ai/api/mcp/auth_callback`. No new registration/DCR.
- Synthetic QA Account `1f3d7935-1bdc-4952-8d7f-0f72077368c1` only.
- Provider scopes `openid offline_access`; signed business scope `otr.trips.read`.
- Access tokens at most60 seconds. One new window at most30 minutes from the first
  temporary configuration intention; no extension or automatic restart.
- Reuse the reviewed Hook template, existing consent, normal control Session and
  bounded close operators. No new function, role, RLS, GRANT, Write or billing.

## Bounded execution

1. Fresh Source/worker closure and service/config CAS; normal control readiness and
   explicit consumer PREPARED ACK before starting the window.
2. Independently verify the actual authorization binding before OTP using the
   current request-ID hash and the exact pending row; never browser history.
3. Read Trip `cc44a705-6f43-41e0-a2f9-16f334b2a6b2`, P3
   `3616da44-0d35-4400-a739-01f1029565ea` directly. If successful, compare the full
   typed result with the existing independent Backend receipt.
4. If that succeeds and time remains, repeat this Read once after the60-second
   token lifetime to qualify refresh. Otherwise preserve the first failure and
   its safe source diagnostic; no retry/reconnect loop.
5. Only after successful authentication, run the registered foreign Trip/Item
   denial. Then normal grant DELETE, fresh absence and one same-P3 live probe.
   A generic error is not proof of server401 or revocation causality.
6. Early completion/failure/deadline closes the Hook and normal Sessions, restores
   the fresh retained default Host, ASoff/Hook disabled/URI empty/Site localhost,
   and verifies exact ACL/grant0 independently. Retain the public client inactive.

Remaining before approval: independent review of the fixed Gate/manifest.
This file authorizes no execution and changes no existing security boundary.
