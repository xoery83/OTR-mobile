# Core storage on one owned transaction — isolated extraction candidate

Native's unique Core Writer delegated only PgStorage transaction/DI points and
direct tests after freezing its P2 software source. Candidate baseline is Native
72962c8f plus accepted mainb7e5c51e. Do not merge this whole candidate branch into
main: hand back only the focused extraction diff, retaining all P2 guards.

Expose a Backend-internal transaction callback owning exactly one lease and one
BEGIN/COMMIT. It supplies the original CoreCommandStorage bound to that transaction
and a lifetime-fenced query lease for future owning adapters. The normal single-
command factory delegates to it. The same exact Gateway principal/role check runs
before callback access and per command; all Actor/Creator/CAS/Source/admission/
receipt/finite-scope behavior stays in one shared implementation.

Only sequential commands may share this lease. Escaped ports stop at scope end;
pending operations or caught operation failures prevent COMMIT. Callback code does
not own transaction-control statements. Errors roll back; unprovable cleanup retires
the connection. No caller-supplied skip flag, SQL/principal relaxation or service_role.

This extracts only storage composition. It grants no Trip creation, staging or
Guest publisher authority, does not activate the metadata preflight route, and is
not Adoption E2E. Any protected authority changes retain their separate exact Gate.

The batch storage also fences each command callback's methods and observes pending
methods and errors before any SQL occurs. The ordinary single-command factory uses
the same owning implementation directly inside the outer transaction, preserving
its intentional terminal-error-to-REJECTED/CONFLICT receipt behavior. Batch callers
must abort publication on those returned outcomes; a domain receipt is not proof
of a complete Guest publication.

The internal query port accepts uncommented single statements only; semicolons and
SQL comment markers fail closed alongside transaction-control prefixes. Existing
parameterized Core statements need none of these. This deliberately avoids a new
SQL parser and is not an arbitrary/untrusted SQL execution API.

## Stable Auth replay

Native delegated these exact transaction/DI ports to Auth as unique Writer on
2026-10-29. Replay starts at accepted main dd53870c; all selected parent files
are byte-identical. Only these files and direct tests are replayed, never the old
Native parent branch. SQL/role/Authority/DEV publication remain closed.
