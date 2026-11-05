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

## Native Batch crosswalk — local candidate 5 November

The normal `universalImportTransport.context` and `.result` GET failure paths
now emit a metadata-only `console.info` event `universal_import_read_failed`.
It records `method=GET`, `phase=CONTEXT|RESULTS`, a fixed category
(`HTTP_UNAVAILABLE` for503, `HTTP_FAILURE`, `NETWORK`, `TIMEOUT`, `VALIDATION`,
or `UNKNOWN`), optional bounded numeric HTTP status and valid server UUID
`requestId`. Missing/invalid requestId is omitted, never generated. Existing
`api_request_failed` supplies templated route/time; the new event has no route.
A valid server requestId allows an exact join to that event and server binding
read stage/category. Without requestId, only phase/Batchhash correlation remains;
HTTP/server association is unknown. This is correlation, not a503 root-cause proof.

`batchCorrelation` is lowercase SHA256 of UTF-8 bytes of the literal domain
`otr.import.batch-diagnostic/1`, then one NUL byte, then the already validated
Batch UUID in lowercase. Given the lawfully observed Batch UUID, compute this
locally to join Native failures for that same Batch without logging its raw ID.
CONTEXT can exist before any Task, so no Task identity is inferred. Same Batch
across CONTEXT/RESULTS has the same hash; a different Batch differs. UUID hash
is a correlation identifier, not anonymized data or new execution authority.

Only an existing GET failure produces this event. No request/response body,
URL/query, original filename, raw Account/Trip/Batch/Task UUID, token, Session,
headers, Provider response, arbitrary error code/message or stack is logged.
Hash/logger failure is swallowed and the exact owning error rethrown; no new
retry or call occurs, no404/503/UNKNOWN recovery rule changes. POST diagnostics
are unchanged. `console.info` follows existing metadata diagnostics and adds no
warn/error LogBox or user-facing engineering layer.

Candidate2c7ec1c5 on fixedce054: injected-error RED5/old9PASS -> GREEN14PASS,
scoped strict types/lint/diff PASS. This round has no real HTTP, device, Provider
or historical replay. Source integration, independent review and matched Native
JS/device usage remain pending; current Hosted server logging remains qualified
only by its own deployment receipt. Historical first503 stays OPEN_UNPROVEN.

Independent ui08 review NO_BLOCKER with14PASS is archived in
`CLIENT_CORRELATION_INDEPENDENT_REVIEW.json`; it proves the local injected-error
boundary only. Source integration and actual device/Hosted observation remain pending.
