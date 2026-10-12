# Finite Source-owned PDF upload terminality

Accepted design basis: CP_FLIGHT_PDF_UPLOAD_AUTH_01_DECISION, Owner authorization
CP-FLIGHT-PDF-UPLOAD-SOURCE-01. Runtime remains CLOSED.

Reuse Source operations, immutable FINAL receipts and existing execution/staging tables.
Add only a finite PDF execution shape, protected reservation/config, producer wrappers
and complete upload-plan exclusivity. PNG container/parser shape remains unchanged;
its inventory explicitly filters the original PNG profile. PDF inventory is scoped to
current Source private access on the same journal. The sole replaced existing function
is that inventory predicate; historical migrations remain untouched.

Object content is independent of writer terminality. Uncertain requests retain UNKNOWN,
private key, stage/quota and cleanup obligation. No evidence means no retry, VERIFY,
registration or deletion. Current CAS controls Source FINAL; uploaded ORIGINAL remains
PENDING until the existing independent VERIFY. Failed attempts seal REJECTED; this
finite profile does not automatically create another generation or permit a second
write to an already-dispatched original epoch.

Reservations and PDF producer transitions serialize in PostgreSQL. A trusted producer
closes/fsyncs staging before durable dispatch; one grant cannot be renewed after a lost
response. Real provider terminality cannot be established by SQL or a matching GET.
The deterministic provider supplies only controlled CLOSED evidence in disposable tests.

No runtime role bridge or storage/provider activation is installed. Hosted/private
storage credentials, actual provider completion semantics, Backend transport and Native
handoff require later reviewed integration. Limits are configurable CLOSED defaults;
UNKNOWN may remain indefinitely protected. Remote orphan deletion is out of scope.

Exact versioned contract: `docs/trip/CP_FLIGHT_PDF_UPLOAD_AUTHORITY_V1.md` and
`src/domain/trip/sourcePdfUploadAuthority.ts`.
