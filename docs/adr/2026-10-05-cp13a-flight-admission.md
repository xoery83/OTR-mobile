# CP13A.2 — Canonical Flight import admission

Status: IMPLEMENTED; implementation review pending. Runtime gates CLOSED.

The owner accepted CP13A.1 and authorized additive server persistence, SQLite49,
protected Flight CREATE/UPDATE, Temporal Option A and explicit Capture admission.
The accepted [exact preflight](../architecture/TRIP_CHECKPOINT_13A1_EXACT_SCHEMA_COMMAND_PREFLIGHT.md)
is the implementation blueprint. CP12 is unchanged.

## Narrow terminal CREATE receipt clarification

For CREATE_TRANSPORT only, a verified terminal REJECTED/CONFLICT no-commit receipt
may be recovered without current target Event read admission. Current Actor/Trip
admission and exact command, operation key, intent digest, intended Event ID,
Confirmation/output-slot binding and receipt command/result identity are required.
The bridge returns only minimum status/no-commit correlation, never target data,
intended payload, result fields or private confirmations. It releases the claim
only after exact authoritative verification. Missing receipt remains UNKNOWN.
Successful APPLIED/NO_CHANGE target-bearing results retain current target Event
read admission and exact target/result verification. No generic receipt access,
new receipt namespace, CP12 redesign or runtime activation is authorized.

The owner explicitly clarified this boundary during CP13A.2 recovery. The historical
CP13A.1 review document is retained; this paragraph supersedes its target-read
requirement only for the exact terminal CREATE case above.

## Implemented seams and validation

The [implementation report](../architecture/TRIP_CHECKPOINT_13A2_CANONICAL_FLIGHT_IMPORT_IMPLEMENTATION_REPORT.md)
contains the acceptance matrix, exact change scope and baseline exceptions.
Server 74→82 and SQLite49 add protected C6/lineage4, Event-owned services, fixed
Source proof/receipt bridges and explicit Capture bindings. Existing namespaces,
Account apply gates, queue and certified collection/Day ownership remain.

An existing Source invoker lock helper now enters C scope serialization before its
original admission/Source locks. Read-only deferred integrity triggers retain
trusted migration ownership; B receives only the fixed Source-owned proof edge.
The internal operation helper remains Source-only invoker code. No membership,
runtime login, dangerous role flag, gate setter or API table shortcut is added.
Pending local lifecycle observations retain separate registration status and never
claim admitted server clocks/revisions. Exact SQL-produced prepare/dispatch and
terminal snapshots verify their transition to authoritative observations.

All factories/ports remain unwired and import queue operations are scheduler-denied.
Private bounded catalog reads withhold the entire projection above 64 records per
catalog or 4 MiB; they never label truncated history complete. Activation/provisioning
requires a separate owner decision. No commit, push, Hosted Dev or Production work
is part of this checkpoint.
