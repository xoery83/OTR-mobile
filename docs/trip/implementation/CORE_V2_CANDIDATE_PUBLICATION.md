# Core-owned Flight Candidate publication v2

Owner assigned publication authority to Core/Source on 2026-10-12. Capture owns
interpretation, evidence and Candidate preparation. Runtime, Hosted Import and
Provider activation remain CLOSED. This additive implementation preserves W0
candidate2/plan2/command2/receipt2; legacy CP13A publications remain unchanged.

The publisher re-reads exact retained Source TEXT bytes under the owning Source
scope lock, validates current Input descriptors/hash/ancestry and runs the existing
finite reference Flight grammar independently. Capture field values and locators
must match that owning extraction. Complete Source coverage and change/continuity
observations are sealed alongside candidates; partial, competing or uncertain
observations remain REVIEW. Unsupported binary/codeshare/supplier/manual-edit
branches remain REVIEW rather than being declared verified.

Qualified airport identity uses an owning private date-bound IATA registry.
Namespace identity `IATA_AIRPORT:<code>` requires exactly one enabled assignment
covering the departure date, with immutable registry version/digest. Syntax or a
caller `unique`/`verified` flag is insufficient. Endpoint accepted_place_id stays
NULL; qualified purpose identity does not grant place/map authority. Existing
SOURCE_INSTANT rules are unchanged; civil-resolution inference is not introduced.

Publication seals the existing Source/run/revision/Input pins and new version2
Candidate IDs, exact fact/evidence hashes, qualified purpose identity and registry
bindings. Exact publication replay returns the original response; changed content
under an existing publication/Candidate ID is rejected. Preparation verifies this
sealed catalog and all prior claims, then freezes the existing Core command. The
single Core writer re-verifies that slot in its own transaction. Finalization is
bound to its exact immutable receipt and target vector, never HTTP success.

The bounded publication transport envelope adds Source-owned evidence locators to
W0 Candidate objects, without adding Canonical permissions to Capture. Exact
schemas, route and accepted test results are recorded here as implementation lands.

## Versioned Capture interface

`POST /v2/trips/:tripId/core/source-candidates/publish` accepts exactly
`{publicationVersion:2,publicationId,sourceId,sourceRevision,runId,inputCatalogSha256,
candidates:Candidate2[],evidence:[{candidateId,fieldKey,inputId,locator}]}`.
Authenticated Account/Trip is independently enforced. The request is bounded to
32KiB; at most64 Candidates, with stable new version2 Candidate IDs. Run/Input
pins come from the existing owning Source journal; request bytes are never a
replacement for those originals. Capture's locators and finite field values must
match independent owning extraction of the complete retained ORIGINAL TEXT set.

Candidate2 remains the W0 object with `schemaId:"otr.trip.capture.candidate/2"`.
This minimum supports P2 facts: `flightNumberLiteral`, `departureDate`, optional
`core:{title}`, `origin`, `destination`, `services`. Finite field addresses are
`flightNumberLiteral`, `departureDate`, `ROOT.title`, `ORIGIN.*`, `DESTINATION.*`
and `SERVICE.<key>.*` from the registered Flight matrix. A PRESENT value requires
one exact `track-c/field-evidence/<candidateId>/<fieldKey>` and matching TEXT_SPAN
packet. Airport route spans can support both endpoint labels; shared bytes do not
prove shared physical purpose. No caller confidence or qualification flag exists.

The response is exactly `{publicationVersion:2,publicationId,accountId,tripId,
sourceId,sourceRevision,runId,inputCatalogSha256,requestSha256,candidates:[{
candidateId,candidateSha256,status:QUALIFIED|REVIEW,errorCode:string|null}]}`.
QUALIFIED means sealed physical identity and evidence; it grants neither command
admission nor temporal readiness. Exact SOURCE_INSTANT admission stays separate.

Shared request/result validators and hash domains are in
`src/domain/trip/tripCoreV2CandidatePublication.ts`. The owning backend entry point
is `createCoreSourcePgAuthority(connection,hash)` in
`backend/src/tripCoreV2SourcePgAuthority.ts`, returning `publish`, the `source`
preparation/read/finalization port, `verifySourceIntent`, `audit`,
`canReadSourceReceipt` and `canReadAudit`. Core's existing sole writer invokes the
verifier and audit inside its transaction. Source code writes only private
publication/plan/slot/association metadata; Canonical writes and receipts stay Core-owned.

After successful publication, use the existing version2 preparation route. Sparse
CREATE selection includes literal/date evidence plus the qualified identity refs;
qualification selects the exact non-null endpoint/service leaves and their TRACK_C
proofs. Submit returned frozen commands unchanged, bind dependent qualification to
its own creation receipt revision, then finalize with the original slot/operation,
intent hash, separate domain receipt ID and receipt hash. No latest-revision rebase.

## Recovery and remaining boundaries

Exact publication replay is immutable, including historical QUALIFIED status.
Fresh admission rechecks current Source pins and enabled date-valid registry
assignments. Registry revocation cannot authorize dispatch of a READY slot.
Certified qualification/update slots also own identity-target claims, including a
manual sparse Flight qualified through Source without a Source CREATE. Missing
receipts remain UNKNOWN; verified rejected CREATE with an absent target can be
classified NO_COMMIT by the owning immutable receipt, never by Capture assertion.

Already committed finalization verifies the exact retained old Candidate, Run,
revision, inputs and bytes with current Source access. A newer Source revision does
not silently rebase that evidence. Redaction yields EVIDENCE_PENDING and preserves
the accepted business object. Current deletion/revocation denies access. Receipt
audit checks every private before/after pointer; owning the current Source does
not authorize another Source's evidence.

Minimum supported authority is the complete ORIGINAL TEXT set for one explicit
Source. Binary, derived OCR/lossy representations, omitted originals, mixed Source
scopes, change/supplier/codeshare continuity, manual edits and AUTO_SOURCE remain
REVIEW or unsupported. These need their own verified authority; no activation was
added. Accepted place UUID/civil-resolution/custody/Ledger capabilities remain
separate, with no implicit grant from Candidate publication.

## Accepted isolated validation

Focused publication/Source/purpose tests:74 PASS. Actual Source SQL:3 scenarios
PASS on UUID-owned network-none Server84→85–92 clone, all329 historical public
function bodies unchanged. The tests prove:

- two qualified return legs → two preparations → two actual sparse Core writes →
  two exact same-ID qualifications → four receipt-dependent associations;
- cold exact publication/command/finalization replay, partial progress, wrong
  receipt fencing, six-digit `.120000` timestamp preservation and unchanged
  unrelated Booking/Entitlement/Document/Ledger/Membership/ReceiptAsset rows;
- READY registry revocation at the actual Core transaction admission callback;
- manual sparse→Source qualification→same-purpose CREATE collision, stale CAS
  and protected user title preservation;
- retained revision1 finalization after Source revision2, redaction pending and
  deletion denial, plus unrelated private receipt-audit pointer denial;
- additive legacy fresh/reopened CREATE fencing even for certified REVIEW slots,
  with existing legacy recovery update preserved. This last check is direct
  trigger acceptance in the owned fixture, not legacy command E2E.

Core/Hosted/Provider/Mobile runtime activation remains CLOSED. These tests prove
owning SQL semantics, not deployed Node driver or native/Hosted execution.
