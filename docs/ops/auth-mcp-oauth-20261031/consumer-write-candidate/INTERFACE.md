# Closed consumer P3 command binding

Golden Slice: explicit Write Consent → existing consumer preview/ConfirmChanges →
P3 Create/Edit in the existing synthetic Trip → Core receipt/CAS/readback.
Owner scope: MCP Phase3, 31 October, A1.4–7/A2 and workstream boundary §4.

Reuse the Account Read binding and `coreHttpBoundary`; add only POST Core commands
and GET operation recovery. No Trip Create, Source, Provider or new Save pipeline.
Only a signature-verified, current `otr.trips.read` + `otr.trips.write` grant may
bind this port, after Auth proves fresh explicit business Write Consent. A mandatory
Auth-owned current Write-grant verifier also runs before and after owning IO; the
existing Read-only verifier cannot supply this qualification. MCP still
requires trusted confirmation bound to Account/client/resource/digest/operation IDs.
Caller headers, body Actor fields and model `confirmed=true` confer no authority.

The adapter is unmounted. Existing Read verifier/Hook/Consent remain Read-only;
neither a Read grant nor merely supplying this software creates Write permission.
Next: the same Auth-owned verifier/Consent must qualify fresh Write consent without
silently upgrading existing grants. Activation and exact synthetic operations need
their separate precise Owner Gate; the consumed Read C window cannot be reused.
Expiry/cancellation after Core IO suppresses the result, never retries POST; recover
the original operation through the existing Core operation reader after re-auth.

The closed DEV Write verifier reuses the existing issuer `/user` and
`/user/oauth/grants` reads. It accepts both signed business scopes only, bound to
the same Account/client/session/expiry, and requires the current provider grant's
`granted_at` to be at or after a trusted activation floor (`consentNotBefore`).
The browser must show explicit Write copy and reject an already-authorized redirect
before the new decision. Gate preflight must revoke old grants; neither changing a
Hook nor passing OIDC `openid offline_access` constitutes business Write consent.
There is no live Write policy or caller until this full chain is independently
reviewed and its separate activation/operation Gate is approved.

QA Runtime candidate v2 uses `OTR_DEV_MCP_WRITE_QA_CONFIG`, mutually exclusive with
the existing Read config. It is limited to QA1f/existing Claude d2b, at most30 minutes
from the trusted activation floor, and the two frozen P3 preview digests/operation
IDs in the existing MCP fixture. Its trusted ConfirmChanges callback only matches
that exact Account/client/resource/digest/single operation; model booleans and
other commands confer no approval. Missing Write SDK/evidence/Core ports fail closed.
The browser receives explicit Write mode, not the private operation approvals.
