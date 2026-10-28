# PDF V2 private worker transport — unbound candidate

Actual blocker: the current DEV Backend image has no Docker executable/socket;
the existing frozen qpdf-poppler worker requires Docker isolation. Mounting the
privileged Docker socket into Backend is not an acceptable repair.

This candidate reuses that same worker through a parse-only Unix-socket transport.
Construction does not listen. TCP is rejected even if a future caller misbinds
its listener. Only fixed POST /parse application/pdf bytes are accepted; no Actor,
DB, credentials, URL, image/executable selection or Source authority is carried.
One worker runs at a time; a second request fails without queuing. If the owning
worker cannot prove termination, this server stays quarantined and starts no more
work. Independent Host inspection/cleanup is required before constructing a new
server; automatic service restart must not be used to clear UNKNOWN. Actual ingress
is bounded at10MiB/15seconds, response at2MiB, client at35seconds. The underlying
fixed worker retains its network-none/read-only/nonroot/memory256MiB/CPU/pid/tmp
limits,20second wall timeout and hard cleanup.

Existing verification still independently reads exact custody twice, checks
original hash/bytes and strict producer output/pages; registration/sealing use
existing owning SQL. Their optional trusted worker function defaults to the old
fixed local worker. A transport response is never Source verification or admission.

Prior54-test candidate received one independent resource blocker: releasing the
slot after termination UNKNOWN. Directed RED reproduced it; quarantine repair
and known-terminated retry regression now pass6 suites56 tests, types and scoped lint.
Independent focused re-review reports NO_BLOCKER for the current-process quarantine; Host restart/orphan cleanup is still unqualified. Tests exercise real local Unix
sockets and TCP refusal, concurrency, actual chunked ingress and response limits,
private errors, and owning verifier/proof/registration/HTTP regressions. Test worker
sentinels prove transport only; no actual Docker/DEV PDF execution is claimed.

Not installed or authorized for Host execution: no startup/listen binding, host
service, socket owner/mount, Source profile/SQL/GRANT change, custody provisioning,
Provider use or Native PDF Task/Admission. A concrete protected deployment packet
must first qualify the service/image/uid/private socket ownership/read-only mount,
process-exit cleanup and rollback, plus original custody and PDF eligibility. No
standing image/Gate authorization is inferred for that new execution boundary.

Focused next safety delta: a Host-owned persistent exclusive worker marker, acquired
before invoking the same frozen worker. Known termination releases only this marker;
termination UNKNOWN or process loss retains it. Reconstructing the server cannot
clear that marker. No automatic stale-lock cleanup, directory creation, listener,
Host install or Source permission is introduced. Host-owned private-directory
permissions and deliberate orphan reconciliation remain deployment prerequisites.

Persistent-marker delta:5RED→6suites59PASS, types/scoped lint PASS, independent
NO_BLOCKER for the unbound candidate. Actual file exclusivity across reconstructed
instances, retained UNKNOWN/unclassified failures, known-terminated explicit retry
and missing-directory refusal are tested. No real process-kill/orphan Host test
is claimed; private-directory permissions and no manual in-flight marker deletion
remain required in the protected Host deployment packet.

Actual continuation: one short child-process SIGKILL leaves the marker and rejects
a reconstructed worker (7 marker tests PASS). Separately, the real frozen Linux
image through private Unix IPC + persistent marker + owning double-read verifier
processed the exact retained950-byte/two-page synthetic PDF:127UTF-8 bytes,
textSHA3b123e3e…,4676ms; known termination released the marker. No sentinels in
this parser run, no Provider/SQL/Source registration or DEV Host installation.
PDF_V2_REAL_PRIVATE_TRANSPORT_PASS.json. Readonly DEV preflight confirms the fixed
image exists and zero matching worker containers, but Host Node is absent; do not
infer an executable service binding. PDF_V2_HOST_READONLY_PREFLIGHT.json.
