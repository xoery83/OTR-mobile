# Apple Guest Adoption — one finite DEV recovery window

Candidate only. Software `237e4c66`; no Hosted activation authorized by this packet.
The Owner previously approved Apple implementation and real Guest Adoption. This
request is the separate, one-use operational authority for the currently closed
shared DEV policy/runtime. No new schema, role, RLS, GRANT or Apple Key.

## Fixed scope

- DEV `tuqigdxrvrerfewsxqgm`, current image `sha256:1f85595d88531fb6827f1e10a0bd5f440e52f8cc73051ec729bb06f5145392bc`.
- Window `c8d26837-3b39-4d9a-9e39-26594b746c16`.
- Account `f155d314-2ee4-4dae-a3ac-0fca5464e58e`, Guest `fc2fc618-d4b0-4dc1-8ed4-586226fd3528`.
- Original Adoption `7da7240f-4019-4a60-b3d7-350525ecddef`, Trip `faa0ea2b-9729-49b6-8ab7-db924df05e4d`.
- Inventory SHA256 `33dcae3e768ddae6ce37c19dc026b67dbdfaf02199516c3bfbafd99e9c5a513c`.
- Existing normal Apple Session custody only; normal refresh is allowed. If fresh
  Apple authorization is necessary, Owner performs the system confirmation.
- One explicit normal UI resume, using this original ID and immutable checkpoint.
  Preflight → Stage → Status → at most one Publish → formal Receipt → normal
  owning restore. No new Trip, Adoption ID, data reset or direct business SQL.
- UNKNOWN means query the original status/Receipt only. No automatic publication
  retry, credential copy or synthetic receipt. Never claim a local PASS as Hosted PASS.

## Operational boundary

Root2 is the only Hosted Writer. It must first obtain the actual resource lock
and verify fresh CID/config/mount/PG preimages against `ROOT2_OPS_CANDIDATE.json`.
Any drift or nonzero original grant/stage/Receipt count stops positive activation.
The existing runtime binds Account/Guest/expiry, not Adoption ID; Auth's executor
is additionally restricted to the original ID above. No unrelated QA is included.

Only two runtime environment additions are allowed. Keep the same image and
other environment/config/mounts. Retain the original CID for exact restoration.
The database's existing global Adoption policy is enabled only behind this
Account/Guest-scoped HTTP runtime. No other execution authority is granted.

After approval, bind T only when signed Native recovery and sole Writer are ready.
Hard end ≤ T + 30 minutes; reserve starts at hard end − 240 seconds. Set runtime
expiresAt to reserve start (≤ T + 26 minutes), with no extension or second window.
Before positive activation, stage the fixed existing close bundle, validate its
actual standalone launch context and demonstrate independent negative-only job
execution while policy is false and no candidate exists. This drill must not stop
or reconfigure the shared baseline service. Do not borrow the old PDF timer.

Arm the independent close job before running `ACTIVATE_CANDIDATE.sql`. Bind its
three fixed intent settings plus `otr.auth.qa_expires_at` to the frozen reserve
start. SQL CAS requires closed policy xmin 33417 and zero original server state.
At reserve, stop the exact candidate, run existing negative-only close helper via
fixed bundle, independently verify on a separate connection/LinkedPG, restore
original CID and health/config. Release Writer only after closed policy and
candidate stopped are independently proven. Preserve artifacts on UNKNOWN.

## Evidence and limits

- Basic Apple login/cancel/relogin/Hide My Email/cold Session and normal Guest
  Trip/P1 cold persistence already have real device evidence.
- Root2 reads current policy false and original grant/stage/Receipt counts zero.
  Existing close-helper fingerprint and config bytes verified; standalone bundle
  verify-only returns `AUTH_QA_POLICY_CLOSED`. Actual timer/disconnect execution
  is not yet performed and is a mandatory condition, not an assumed PASS.
- PREPARED cold recovery has RED→GREEN focused tests and independent Review.
  Signed-device recovery must pass before the window may be activated.
- Exit evidence must include a bound formal PUBLISHED Receipt, independent scoped
  Trip/Owner/Creator/Person/Item readback, same-Account Native cold restore, and
  independent closure/restoration. Two distinct Apple users remain a separate
  pending acceptance item and are not proven by this same-Apple-identity iPad test.

Approval covers this single window, its bounded negative-only closure drill and
exact restoration. It does not authorize Production, additional identities,
other business changes, main merge/push, or reuse of an expired window.
