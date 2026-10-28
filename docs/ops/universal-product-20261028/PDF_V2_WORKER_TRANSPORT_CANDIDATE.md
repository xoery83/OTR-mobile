# PDF V2 private worker transport — unbound candidate

Actual blocker: the current DEV Backend image has no Docker executable/socket;
the existing frozen qpdf-poppler worker requires Docker isolation. Mounting the
privileged Docker socket into Backend is not an acceptable repair.

This candidate reuses that same worker through a parse-only Unix-socket transport.
Construction does not listen. TCP is rejected even if a future caller misbinds
its listener. Only fixed POST /parse application/pdf bytes are accepted; no Actor,
DB, credentials, URL, image/executable selection or Source authority is carried.
One worker runs at a time; a second request fails without queuing. Actual ingress
is bounded at10MiB/15seconds, response at2MiB, client at35seconds. The underlying
fixed worker retains its network-none/read-only/nonroot/memory256MiB/CPU/pid/tmp
limits,20second wall timeout and hard cleanup.

Existing verification still independently reads exact custody twice, checks
original hash/bytes and strict producer output/pages; registration/sealing use
existing owning SQL. Their optional trusted worker function defaults to the old
fixed local worker. A transport response is never Source verification or admission.

LOCAL_PASS:6 suites54 tests, types and scoped lint. Tests exercise real local Unix
sockets and TCP refusal, concurrency, actual chunked ingress and response limits,
private errors, and owning verifier/proof/registration/HTTP regressions. Test worker
sentinels prove transport only; no actual Docker/DEV PDF execution is claimed.

Not installed or authorized for Host execution: no startup/listen binding, host
service, socket owner/mount, Source profile/SQL/GRANT change, custody provisioning,
Provider use or Native PDF Task/Admission. A concrete protected deployment packet
must first qualify the service/image/uid/private socket ownership/read-only mount,
process-exit cleanup and rollback, plus original custody and PDF eligibility. No
standing image/Gate authorization is inferred for that new execution boundary.
