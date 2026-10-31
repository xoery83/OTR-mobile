# Candidate only: two finite consumer Read QA windows

Not approved or activated. Previous SDK and ChatGPT list-trips windows are closed;
their PASS evidence is reused. This request creates no Write qualification.

Only DEV `tuqigdxrvrerfewsxqgm`, synthetic Account
`1f3d7935-1bdc-4952-8d7f-0f72077368c1`, resource
`https://api-dev.xoery.art/mcp`, `openid offline_access` and signed business scope
`otr.trips.read`; access tokens at most60 seconds. No new functions, roles,
RLS/GRANT, business mutations, billing, Production or real-user access.

## Exact requested actions

1. One new ChatGPT window, maximum30 minutes, existing public/none client
   `83504d3f-59d4-43fd-99b1-bebc54c40f7d`; its existing two callbacks stay exactly
   `https://chatgpt.com/connector/oauth/CYUxrs56rSrW` and
   `http://127.0.0.1:18764/callback`. Run only `chatgpt-item-read-smoke.json`:
   get-trip, list-items, own P3, registered foreign denial, then same P3 after
   grant revocation. No list-trips/SDK/Create/Edit replay. Compare IDs, revision
   and typed fields using an independent normal-QA read, never a shared token.
2. After window1 is independently closed, register exactly one **new** manual
   public/none client `OTR DEV QA - Claude Read` using the existing Supabase DEV
   OAuth client administration flow. Callback only
   `https://claude.ai/api/mcp/auth_callback`; code/S256 and refresh flows only.
   `claude-read-registration-proposal.json` is semantic metadata, not an invented
   HTTP body. Independently read back only its issuer-assigned UUID and allowlisted
   public metadata; no secret column. Do not edit/reuse client835 or enable DCR/CIMD.
   One separate maximum30-minute window may then verify Claude read tools against
   the same synthetic targets, with explicit fresh consent and a revoke probe.

These are two non-overlapping one-shot windows, not extensions of an old deadline.
Client registration time is inside the Claude window budget. Before creating that
client, the existing exact deny-all Hook must already be configured and verified.
Actual authorize client/callback/S256/scopes must match before OTP/consent; mismatch
stops that attempt. No guessed callback or auto-registration fallback.

## Frozen implementation and bounded execution parameters

Use reviewed main `4c5baacf45b4e215de7fe8e31fd355e92a0045d5` plus the two-file
loader callback patch `d0917e06` (isolated curated source `a7d39f11`), not the long
Auth branch. The former main loader rejected Claude. The patch permits exactly
the old ChatGPT/SDK tuple OR the single Claude callback, never mixed/arbitrary
redirects; it also forbids reusing client835 for Claude. Candidate53 tests PASS.
Reuse the actual previously qualified SDK/ChatGPT Read artifacts retained by Root:
bridge SHA256 `b518f81a7145ba8441d4d8bc599f9e3f09023ec552e8db68cfee859fed557b72`;
browser SHA256 `9264dd02e6e4474326264ed4e8ac91ec82e21de374c731085b2dbfa0094627fe`.
These are the exact artifacts from the real SDK/ChatGPT receipts, not a new build.
The main recipe's f051 bridge and 6f31 browser remain source/build evidence only:
its Read graph is unchanged; differing closed Write files and unused Profile copy
are not needed for this Read-only slice. No artifact replacement is requested.
No Native, Profile, Parent or future Write candidate is deployed with this action.
The isolated main-plus-patch server builds to SHA256
`841fbfdea2420bb952e6b321893abe8b70e082c4e8f62eb32b95da722591a5e0`.
This is build proof, not an instruction to deploy an old service baseline. Root
must carry the exact pinned loader into its fresh service source and record that
build/image digest, then qualify it default-closed before either activation;
ordinary traceable DEV software integration cannot change this Gate's authority.
Root deployed the exact loader in its fresh Source72+Native diagnostic assembly:
image `67f21d4975f953d030d395533fe1a2a0f7b206c970dc80ed04476a07ca101ad1`,
capture `82d7cf57aeabff6c1ee9d8b1040ceaf65a5fbf323845c759ca79274f3cfe955f`.
Independent hash/entrypoint and 200/401/closed-config404 observations are attached.
This proves closed software, not a Source window release or configuration approval.
Root subsequently supplied the window15 SQL/runtime/worker/timer closure receipt.
That historical release is not a future lease: acquire the shared short CAS lock
and recheck current Source coordination immediately before each service switch.

Reuse the unchanged `QA_TOKEN_HOOK_INSTALL.template.sql` and
`scripts/auth/render-mcp-qa-hook.py`. Per window, only client UUID and execution-time
UTC deadline (at most30 minutes from the first temporary configuration change) are
parameters. Window1 UUID is fixed835; window2 is only the newly created/read-back
Claude UUID. Record rendered activate/close SQL hashes before applying. The active
Hook admits exactly one QA/client and read claim, and CAS accepts only closed body
MD5 `b0f7eae14599bd32cb9430a59832c837`. No other substitution or ACL expansion.

`operators/` reuses the prior deploy/retained-restore implementation and unchanged
restore helper. Only the two literal consumer profiles, fresh baseline parameters
and total-window timestamp are adapted. Preparation validates public/none/manual
client metadata, exact callbacks and a newly created Claude client in this window;
it retains hashes instead of plaintext Env. Deployment can add only the one public
QA config Env key, never change the image or mounts. Private plans are root-owned
0600 in one `auth-consumer-qa-<32hex>` directory. No operator is executed by staging
or review; Owner approval and current Root CAS coordination remain prerequisites.

Under Root's serial Host Writer, capture and retain the **fresh** healthy service,
image digest, environment/mount/source pins and closed finite configuration before
each window. Retain the pinned Auth/MCP artifacts; add only the matching public
finite config. Keep ordinary Backend/Source/Native code and flags intact. Never restore a
historical ce09 image over newer delivery. Fresh Auth preimage must be ASoff,
Hook disabled/URI null, Site `http://localhost:3000`; drift stops activation.
Observed DCR is unset/null while AS is off, not a proved explicit false value.
This Gate permits only setting it explicitly false while AS remains off; verify
false before enabling AS. Null never permits dynamic registration. On cleanup,
retain explicit DCRfalse with ASoff. Root's active Source window must close first.
Temporary ASon/Hookon and Site `https://api-dev.xoery.art` are inside that budget.

## Revoke and close

Own normal OTP control Session stays in its creating process memory. Revoke only
this QA/client grant, then probe the same consumer while Hook/route remain live;
correlate client generic errors with server401 instead of inferring their cause.
After that probe, failure or deadline: CAS-close Hook, independently read back,
finish grant/normal Session logout plus negative refresh, restore the exact fresh
retained healthy Host, ASoff/Hook disabled/URI null/Site localhost/DCRoff and ACL
readback. A 404 revoke response needs fresh absence proof. Raw UNKNOWN/failures are
retained and reconciled independently, never rewritten PASS. Each window needs a
ready close controller/operator before activation; on expiry it stays closed and
is not restarted. Claude may not begin until ChatGPT closure is proven.
Retain the new manual public QA client inactive after its grant is revoked; no
active grant or issuing policy may remain merely because its metadata is retained.
