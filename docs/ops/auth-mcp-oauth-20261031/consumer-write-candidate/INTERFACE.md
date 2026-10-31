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
