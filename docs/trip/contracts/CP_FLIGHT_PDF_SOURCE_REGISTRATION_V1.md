# CP-FLIGHT-PDF-SOURCE-02 — Source PDF registration /1

Scoped CLOSED addition to CP_FLIGHT_PDF_DERIVATIVE_AUTHORITY_V1. No new profile,
storage provider, acquisition, Publisher or writer. Source command gateway and
Source writer remain NOLOGIN; Source command and accepted PDF gates both stay CLOSED.

The backend-only owning adapter verifies ORIGINAL using the existing
VERIFY_REPRESENTATION envelope, hash domain, operation row, attempt/finalization
helpers and exact result receipt. Only a trusted Source custody reader reads the
registered supabase_storage / trip-source-material / v1/<Trip>/<Source>/<Rep>/payload.
No URL, bytes, MATCH flag or producer proof can come from caller JSON. The finite
accepted decoder verifies retained byte hash/length. Read-only IO and SQL changes
are one bounded transaction; failed reads roll back, COMMIT response loss stays
UNKNOWN until the same operation is recovered. No upload retry/worker is introduced.

DERIVED registration /1 pins Source material/row revision, ORIGINAL ID/row revision,
existing successful VERIFY operation ID/result SHA, a new DERIVED ID and operation ID.
The adapter independently rereads and decodes current retained bytes, builds exact
UTF-8 text, hashes/length, transform/options and complete page map. An immutable,
private Source PDF registration receipt satellite follows the existing PDF seal
receipt pattern, not a second execution journal. Registration does not change Source
row/material revision or original roster and cannot mutate an existing derivative.
Exact replay precedes CAS but repeats current read ownership/membership checks.
The receipt records producer/profile/hash/map and original verification receipt;
it grants no Core qualification. The existing independent PDF seal must still pass
before Source-wide publication, Run/Input pins, purpose/airport/SOURCE_INSTANT and
Canonical admission. Old stale/lost/revoked receipts remain historical only.

A forward-only migration admits only the representation mutations necessary for
these two server-only commands: current PENDING strict PDF ORIGINAL → VERIFIED
through existing VERIFY attempt, and exact strict DERIVED TEXT insert backed by its
immutable registration receipt. Other Source root/revision/action mutations remain
disabled. No direct gateway/client table DML. Source writer scoped read/row-lock and
operation grants are guarded by existing principals, CAS and BOTH CLOSED gates.
Trusted SQL completion is internal like accepted seal commit, never an HTTP client
operation. Agent A owns real storage/HTTP/pg/TLS composition and bounded private IO;
Agent B consumes admitted catalog/text/seal, retaining exact identities and locators.
Neither may redefine DTO or treat client PDFKit output as authority.

Disposable tests seed only synthetic pending acquisition descriptors and retained
bytes; no VERIFIED or DERIVED authority is fixture-seeded for the new path. New
Source command tests keep representation guards and receipt protections enabled.
Historical Source acquisition/runtime activation remains outside this checkpoint.

## Exact integration surface

`src/domain/trip/sourcePdfRegistration.ts` is the shared authoritative DTO source:

- `sourcePdfVerifyCommandSchema` / `SourcePdfVerifyCommand`: exact existing
  VERIFY_REPRESENTATION /1 envelope (snake_case). Hash remains
  `otr-source-command-v1` over its existing finite tuple. No new verification command.
- `sourcePdfVerifyReceiptSchema` / `SourcePdfVerifyReceipt`: exact existing FINAL
  VERIFY reply plus digest/pin validation; APPLIED must return VERIFIED at the
  expected original row revision +1. It remains a historical result, not a live
  custody or qualification capability.
- `sourcePdfRegistrationRequestSchema` / `SourcePdfRegistrationRequest`: accepted
  seal request pins plus `verificationOperationId` and `verificationResultSha256`.
  This is registration, not a seal request: mint a separate stable seal operation ID
  and remove the two verification fields when calling the existing strict seal DTO.
- `sourcePdfRegistrationReceiptSchema`: `{derivativeVersion:1, operationId,
registrationSha256, body}`. Body extends accepted SourcePdfSeal with registration
  request pins, exact profile/producer/original/text hashes, lengths and page map.
  It does not contain original bytes or derived text. Private admitted TEXT remains
  only in the existing Representation table.

`createSourcePdfRegistration(connection, hash, readOriginal)` exports
`verifyOriginal(accountId, tripId, command)` and
`registerDerived(accountId, tripId, request)`. Connection is fixed Source command
principal. The reader is the existing SourcePdfCustodyReader; it resolves only the
Source-registered provider/bucket/key for authenticated owning scope, bounds IO and
returns retained bytes. Caller-supplied content/URLs cannot be used as that reader.
The adapter checks provider, bucket, exact key, hash/length and finite profile.

SQL producer-only functions: `trip_source_pdf_original_begin/finish` (existing
VERIFY attempt/finalize), `trip_source_pdf_registration_context/commit/lookup`.
Lookup rechecks current Source access; registration request/receipt hash domains are
`otr-source-pdf-registration-request-v1` and `otr-source-pdf-registration-v1`,
using existing canonical newline-prefixed JSON hashing. No raw helper or table DML
is granted to gateway/client. Existing Source command/PDF gates remain CHECK-CLOSED.
Exactly one forward SQL root changes: `guard_trip_source_mutation()` gains the two
finite representation cases; Source root/revision/action writes remain denied.
Lock-only root/revision/member RLS UPDATE USING(true) WITH CHECK(false) prevents
new semantic writes while allowing owning SELECT FOR UPDATE/SHARE scope locks.

Agent A sequence: existing PDF ACQUIRE descriptor → independently retained exact
private object → VERIFY using same stable operation → registration using returned
VERIFY result SHA/ORIGINAL row revision → fresh existing seal → owning admitted
Run/Input publication. Retention/upload completion remains Agent A responsibility;
this package uploads nothing and provisions no storage. Current CLOSED acquisition
and Hosted/provider registration require their separate integration/runtime gates.
Recover ambiguous COMMIT by replaying exactly the same request/operation; do not
mint another derivative, operation or seal to upgrade an immutable REVIEW Candidate.
Agent B receives Source-admitted catalog/text and independent seal, not registration
as qualification. SOURCE_INSTANT, source-wide sibling coverage, airport/purpose and
manual edit fences remain in their existing owning paths.
