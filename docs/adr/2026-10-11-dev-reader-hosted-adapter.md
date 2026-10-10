# Fixed DEV Reader provisioning endpoint adapter

Reuse the accepted one-shot libpq procedure with exactly two endpoint modes:
the existing disposable localhost fixture and
`db.tuqigdxrvrerfewsxqgm.supabase.co:5432`. No pooler, arbitrary host, alternate
Hosted port, CLI, launcher or runtime caller is added.

Hosted connections require a hardened Linux root process and an explicit native
password buffer from the previously specified checked root-private descriptor
boundary. The existing Backend API-key env_file and linked Management API
authentication are not Direct PostgreSQL administrator credential custody.
No actual approved admin password descriptor/store has been established; that
deployment prerequisite remains BLOCKED. This change does not read real secrets.

Verified TLS chain and exact hostname bind the Hosted project. Require database
postgres, actual session_user/current_user postgres for the operator, Primary,
SSL, and the existing delegated configuration/role-admin/signal prerequisites.
The fixture database stamp remains mandatory only for localhost. A Hosted project
setting, when present, must match DEV; its absence is not project attestation.
Reconciliation uses the operator's same endpoint, port and CA for Reader auth.

Fixed mutation SQL, secret buffers, logging controls, durable UNKNOWN, session
termination and custody inventory/UNAVAILABLE semantics remain unchanged. This is
a dormant adapter, not real provisioning authorization or complete custody proof.
Host libpq, direct admin custody, crash/retention controls and separately authorized
authenticated acceptance remain required before real credential generation.
