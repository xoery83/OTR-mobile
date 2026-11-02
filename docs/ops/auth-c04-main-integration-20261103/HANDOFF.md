# C04 main default-closed integration

Candidate branch `codex/root-auth-c04-main-20261103` starts at main `8c992a79`.
It consumes Auth fixed `51fa7d66` + `56d78536`: four owning backend leaves and
exactly four app import/optional-dependency/destructure/route anchors. No factory,
serverCapture, env, SQL, credentials, Native or MCP hook changes.

Base app SHA256: `434b8612777ba7907ca467fbee4adfed16ab236d090860d50d48ea83b5df78ee`.
Target app SHA256: `b7a32d4b8163a1511d4bb01f4d2e41b8c5045cf5a977d0bb9359bb7d325db3e9`.
Both exactly match the Auth handoff's pinned base and patched output. Import
requestId/retained read fixes and existing Native405/MCP hooks remain in the base.
Per-file hashes are fixed in VALIDATION.json.

The two Member Claim route shapes use existing normal-account authentication.
B does not pass a prior Trip Reader gate; the owning Claim transaction performs
qualification. Missing memberClaimPort remains503 MEMBER_CLAIM_CLOSED. Other
methods remain405. Resource token markers are rejected before getUser/Claim IO.
No runtime constructs or injects the optional PG adapter.

Validation: nine actual integrated app route tests, focused strict TypeScript,
scoped ESLint and diff check PASS. The original Auth test's generated-app pin
assertion is replaced with an actual405 route assertion; all other Auth route
checks are retained. No old PG/full Auth rerun or real login/Hosted/device proof
is claimed. Independent fixed review: NO_BLOCKER; see INDEPENDENT_REVIEW.json.

Future enablement is separate from this software candidate: use the existing raw
CorePgConnection.withLease lifecycle (not CoreHttpConnection), explicit trusted
server invite expiry, exact normal synthetic A/B scope and existing Core Reader
qualification, plus independent normal-login/cleanup qualification. Auth remains
E2E DRI. Installed7c/3bbe SQL is not runtime enablement; no new SQL or privilege
is requested here. Lost responses retain the original operation/digest and use
read-only recovery; no execute retry or identity replacement. Formal removal of
an already-linked member remains outside this installed Claim authority.
