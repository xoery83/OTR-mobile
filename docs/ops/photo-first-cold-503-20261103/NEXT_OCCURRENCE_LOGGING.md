# Next Import binding failure diagnostics

Owner direction4November: stop investigating historical first503; prepare logs and
investigate only if it recurs. Historical OPEN_UNPROVEN stays unchanged.

The existing universal_task_binding_read_failed event now includes the existing
ingress UUID requestId when valid, CONTEXT/TASK readKind, elapsed durationMs and
the existing allowlisted kind/code/sqlState classifier, alongside stage/category.
Join requestId with the existing HTTP log and X-Request-Id response header.
CONTEXT/TASK describes the binding read, not a claim of the entire HTTP endpoint.
On recurrence retain actual method/path and Batch/Task from the lawful request
observation, response status/header, time, and these correlated failure records.

No tokens, original text, raw SQL/error message, filenames or raw Account/Trip/
Batch/Task identity is added to server logs. Diagnostics failure cannot replace the
owning exception. No retries, Source/Task/Provider behavior or Save contract changes.

Validation: four existing suites37 checks PASS (host, runtime correlation, retained
results, safe classifier), scoped strict types PASS with existing complete root
dependencies, scoped ESLint0errors/4pre-existing duplicate-import warnings.
Injected binding error proves CONTEXT vs TASK, stable request correlation, SQLSTATE
allowlist, omitted raw detail, unchanged original exception even when logger throws,
same Task/operation recovery and one synthetic Provider send.

LOCAL_PASS candidate only. No Hosted deployment, real recurrence or new paid call.
Root1 source integration then Root2 ordinary qualified software deployment is needed
before these extra fields exist on Hosted. No Gate activation is requested.
