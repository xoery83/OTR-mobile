# SQL installation and sustained policy preparation

Pure renderer: `scripts/trip/sustained_sql_prepare.py`. No subprocess, network client, credential handling or execution mode. Root exclusively performs any authorized management SQL, private credential setup, runtime mount, deployment and AD5 operation. Preparing files does not activate or prove anything.

Invoke with the exact approved Gate file/hash, actual newly verified Synthetic A UUID and immutable UTC adoption cutoff:

```sh
python3 scripts/trip/sustained_sql_prepare.py \
  --gate /absolute/path/OWNER_EXECUTION_GATE.md \
  --approved-gate-sha APPROVED_SHA256 \
  --actor VERIFIED_SYNTHETIC_A_UUID \
  --adoption-cutoff ACTUAL_UTC_Z_TIMESTAMP \
  --output /private/tmp/new-private-execution-packet
```

Output directory must not exist. Files are mode0600 in mode0700 directory; manifest binds exact DEV project, Actor, cutoff, Gate hash, reviewed migrations and each SQL file hash. No secrets are included. Existing private SCRAM credentials must be set through Root's separately controlled service procedure before activation; this renderer does not provision them.

Root execution order:

1. Independently retain `preflight.sql` results and existing reviewed readonly baseline. Inspect closed finite/Source/Person gates, all four stopped principals and zero service sessions. The query makes no changes.
2. `install.sql` applies exactly the two reviewed migrations in **one atomic transaction**. The exact seven function/constraint c493 preimages and Person parent guard remain. On failure/timeout/UNKNOWN, stop and reconcile actual function/table state; never blindly reissue or broaden SQL. The renderer does not trigger automatic rollback.
3. After verified deployment/private credentials, `activate.sql` requires the exact13 installed function postimages, safe role flags, stopped service, existing normal Auth/profile, one exact policy Actor/cutoff and closed old gates. It enables only the approved policy and four existing gateways with connection limit1/permanent validity. Memberships/flags and old finite/Source gates are not changed. No fixed Trip/op or recurring temporary window.
4. Root verifies live scope with ordinary owning requests under the approved QA budget; renderer itself does no business writes. Successful service stays revocably active per Owner direction.
5. On setup/error, `close.sql` requires exact Actor/cutoff and no foreign enabled policy; closes four roles, terminates their sessions and disables this policy. It retains all business data, immutable receipts and installed SQL. Run `verify-closed.sql` independently afterward and require literal `closed_verified=true`. Closing SQL exit alone is not closure proof. Scope drift, timeout or unknown result is RECONCILE_REQUIRED; no auto retry. Root separately restores reviewed Backend/image/config/mount if required. Destructive SQL rollback is not part of this renderer.

Nine local tests PASS: hash/scope drift, malformed actor/time, atomic installer, exact postimage presence, secret-free activation, data-preserving closure, private outputs and overwrite refusal. Existing real isolated PG37+8 validate the underlying migrations/owning mutations/rollback; this new renderer was not executed against DEV or an App. Raw errors/secrets are never collected by it.
