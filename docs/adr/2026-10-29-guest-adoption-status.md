# Closed Guest adoption status boundary

Implement the already required server-authoritative UNKNOWN readback interface as
an unmounted, default-closed metadata boundary. Reuse the existing authenticated
Account context and request limits. Pin source Guest/adoption/target/inventory before
awaits; the injected owning reader must return the same binding. No data names,
files, Provider credentials or business mutations pass through this interface.

IN_PROGRESS and NOT_FOUND both keep QUERY_SERVER_STATUS: missing or timed-out reads
do not prove cancellation. PUBLISHED/CANCELLED return only a pointer to the owning
immutable publication/cancellation receipt, requiring a separate authenticated
receipt read and verification before Account activation or source release. A status
string is never a local unlock capability. No device-clock inference or reset.

The real scoped reader, receipt transport, journal/atomic publisher, protected SQL
Gate and Native recovery UI remain required. Do not mount this route with a fixture
or claim a real DEV/UNKNOWN recovery PASS from its port tests.
