# Realtime version local performance candidate

This branch composes existing code; no new Reader authority or SQL is proposed.
Reader/domain are the actual deployed frozen `609` build-input snapshot (including
3c3e484f phase instrumentation and authored P1/P3 summary). Core connection/tests
are the reviewed f70d69cf candidate. No Root build-input tree was modified.

Golden Slice: current Actor → existing transaction/finite Scope/Actor/runtime
checks → minimal eligible P1/P3 projection → opaque visible token. Unsupported
graphs or unqualified external-object authority retain full collection fallback.
No Trip-global revision is exposed as a user's visible version.

The new opt-in script `scripts/trip/realtime-version-local-perf.mts` takes four
paths: isolated private config, synthetic fixture SQL, synthetic metadata, output.
It rejects non-loopback/non-marker fixture identity before setup. The input SQL is
operator-owned local fixture material, not user input. It creates tables/functions
only inside its exact fresh disposable database. Synthetic authority functions
are explicit stand-ins, not production RLS/GRANT qualification. TLS remains
verified including IP identity. No credentials are committed.

Actual local PG17 results: cold33.37ms; warm11.09/8.71/9.21/5.72ms, same PID.
Twelve Reader queries per operation; cold lease phase15ms versus warm1ms.
Counts/row-JSON bytes exclude connection qualification, PID observation and
DISCARD cleanup; they are neither total SQL counts nor HTTP response bytes.
Hidden private Create/Edit leaves A token unchanged; B own Edit and A visible P3
Edit change their respective tokens; runtime closure rejects. These are small
samples, not percentiles or Hosted measurements. Projection remains O(rows),
not a constant-time per-Actor index. Local synthetic predicates are cheap; actual
Hosted authorization SQL may dominate even after connection reuse.

Reuse historical failure 3c3e484f PRELUDE_HOSTED_VERSION_RESULT: one version GET
12797ms, before-projection8951ms, projection+commit2051ms. Shrinking response did
not solve it. Local evidence isolates the candidate's connection/SQL/projection
costs but cannot prove which Hosted authorization/transport phase still dominates.
The existing phase telemetry is ready for one lawful normal GET after owning
software/runtime is qualified; no high-frequency polling should be enabled yet.

Validation: 64 existing deterministic Reader/version/connection cases, new actual
local PG measurements/assertions, scoped TypeScript, product lint. Prior real TLS
pool reset/NOLOGIN/privilege tests f70d69cf are reused; not rerun mechanically.
No Hosted deployment, private subscription, publisher, Provider or main mutation.

Independent Review NO_BLOCKER; 2 factory cases and retained64 cases independently
passed. Real PG output was reviewed, not rerun by the reviewer.
