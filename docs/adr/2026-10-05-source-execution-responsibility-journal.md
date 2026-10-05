# Source execution responsibility: durable PostgreSQL journal foundation

Status: FULL PASS / ACCEPTED / CLOSED by human review. Scope C-I3H; runtime remains disabled.

Use protected PostgreSQL rows and exact CAS owner/run generations rather than a
process object or expiring lease to remember execution/staging responsibility.
Takeover moves unresolved execution to UNKNOWN and cannot authorize dispatch.
Terminal cleanup-pending ownership can also advance its fence while preserving the
terminal observation; cleaned work cannot be reclaimed or reopened.
Initial C-I3D admission and journal creation must share a transaction before I/O;
registration of an older admitted row imports UNKNOWN. Transaction provenance
(`xmin` versus current transaction), not time, distinguishes initial write-ahead
registration from recovery. Canonical phase/state is never rewritten here.

Resource locks serialize registration/release, followed by attempt row locks.
All references remain durable; no row deletion or memory-only cleanup authority.
Release additionally locks and requires canonical IO_QUIESCENT/FINAL evidence for
every associated operation. Parser proof alone cannot release a provider-UNKNOWN
reference. Authorization and positive physical cleanup acknowledgement are distinct;
cleanup-pending survives process loss between them.
Private NOLOGIN writer/gateway roles expose only fixed commands and principal-
scoped recovery inventory; no connector or credential is provisioned. An explicit
Backend seam may inspect/claim responsibilities, but is not wired to startup.

A sealed observation digest records evidence from a future trusted exact runtime
producer. The database does not establish OS/provider death. Actual fsync staging,
quota/deployment identity, startup reconciler and host/node-loss terminality remain
pending. Provider post-crash terminality and safe IO_UNKNOWN retry remain blocked.
