# C04 fixed QA readback — DEV-only operator composition

Source: `scripts/auth/member-claim-qa-readback.ts`, export
`createMemberClaimQaReadback(exactCase, query)` returns `{preflight, readReceipt}`.
Pass those methods unchanged to `runMemberClaimQaScenario` in
`scripts/auth/member-claim-qa-scenario.ts`.

`query(sql): Promise<unknown>` is Root's existing linked DEV SqlTransport, with
output `{rows:[{result:...}]}`. It must select the approved DEV project externally,
use a read-only transaction with bounded statement timeout, and retain only
sanitized failure metadata. The Adapter supplies one SELECT; no mutator, function
execution, credential loader or generic query UI is added. Root's connection is
independent QA observation, never the normal A/B operation identity.

Preflight reuses the installed candidate's exact QA scope, replacing broad
installation metadata with only booleans/counts needed immediately before ISSUE.
Unexpected binding/receipt/invite/payment/grant/removal count rejects; no cleanup
or repair. Query failure, missing/ambiguous result or mismatched case rejects.
Receipt reads require the fixed actor/Trip/operation and independently validate
Person/invite/digest/outcome. Function existence is not a revalidation of its
definition/ACL; reuse the exact installed-package evidence plus Root's fresh CAS.

Normal callbacks are exported from the same helper as
`createNormalRegisteredQaHostDependencies(receiver,note,publicOptions)`; the
validated DEV config is snapshotted/frozen and storage remains noop. Supply this
result to the existing
`runRegisteredQaHostSession(deps, action, explicitCase)` interface. The convenience
`withRegisteredQaHostSession` is hardbound to an older B/Trip and must not be used
for this case. Each normal receiver must use its explicit registered QA address,
separate one-challenge lease, existing quota/cooldown/reservation controls and
current request timestamp. API credentials stay in the owning secure environment.

The generic helper already validates actual `/user` identity and confirmed email,
keeps its own Session scoped to the action and requires local-session refresh
revocation cleanup. Real request/verify/readUser/revoke callbacks and receiver
readiness must be supplied and qualified; this document does not claim they ran.

Gate packet status remains NOT_EXECUTABLE until the exact operator invocation,
current A/B normal Auth/receiver readiness and final scope are qualified. No fake
Session, Token/Keychain transfer, Host activation or business request is performed
by importing either module. Owner approval precedes actual Root stage/arm/start;
Auth remains responsible for normal business calls and evidence collection.
