# Source PDF V2 registration preparation — 2026-10-17

Status: LOCAL CODE / TEST CANDIDATE. No Source Authority, registration, Candidate,
Review Unit or Canonical result is produced. Original v1 behavior is unchanged.

## Executable local surface

`createSourcePdfV2RegistrationLocalPreparation(readOriginal, decode)(input)` in
`backend/src/sourcePdfV2RegistrationLocal.ts` uses the existing exact-scoped
`SourcePdfCustodyReader`, independent decoder and twice-read verifier. Input is
an account/Trip-scoped /2 request draft plus retained ORIGINAL metadata. Source
key, Source/representation identities and row revision must agree before I/O.
Caller metadata is never authorization. Output preserves exact extraction and
page hashes, request identity and a domain-separated preparation digest. It
cannot be parsed as the existing /1 seal or registration receipt.

This callable is intentionally not installed in routes or startup. Synthetic
protocol tests exercise its local composition; they are not Runtime proof. The
real NZ5069 PDF remains 2,943,032 bytes / 2,628 extracted UTF-8 bytes; existing
private extraction receipt is reused. There is no existing formal Source context
for this task to claim, so no Source UUID/VERIFY receipt is invented for a run.

## Fixed next owning delta; not authorized execution

1. Select/review an executable /2 producer/profile. The current PDFKit component
   only extracts text and cannot attest full-container/security/resource proof.
   A caller-selected binary hash or Boolean must not turn it into trusted
   authority. This packet therefore introduces no claimed trusted producer.
2. Keep `sourcePdfRegistration.ts` and `sourcePdfAuthority.ts` v1 paths unchanged.
   Add versioned /2 schema/registration/seal dispatch only with the selected
   producer contract. Reuse exact Source key, current authenticated context,
   CAS, idempotent VERIFY/registration and fresh retained reread. The preparation
   body supplies no verificationOperationId/resultSha256; those must come from
   the real owning VERIFY result.
3. Forward-only /2 acceptance is required at the existing registration/authority
   and custody SQL guards originally installed by migrations
   `20261012000200`, `20261012000300`, `20261013000300`; do not edit history or
   loosen v1 bounds. Review an exact new SQL/image/rollback package before any
   protected Hosted operation. No SQL or deployment commands are in this packet.
4. `tripCoreV2SourceContract.ts` already enumerates generic BOOKING targets, but
   `tripCoreV2Source.ts` accepts only ITEM and `flightOutputPurposeV2.ts` certifies
   only FLIGHT_OCCURRENCE. A source-backed Booking-purpose contract and its
   evidence validation must be implemented before one Booking can own the two
   Items. Reuse existing CREATE_BOOKING/link commands; MANUAL is not Import proof.
5. Existing Flight Review/closure repositories need a normal owning Capture
   action after lawful Source/Candidate creation. Missing return service and
   time-basis choices require real user decisions. No fake Review Unit is created
   by this preparation component.

The first new protected operation remains /2 trusted registration runtime and
its exact Hosted/deployment/upload scope. Local components are reviewable now;
there is no claim that Hosted changes alone resolve the unfinished producer,
Booking-purpose or Review wiring.

## Checks

37 tests across the new registration preparation and existing V2 local component;
TypeScript no-emit PASS. Checks cover exact identity/key/revision mismatch,
unknown sensitive metadata, changing retained bytes, asynchronous request
mutation, stable request-bound digests and rejection by unchanged v1 consumers.
No backend deployment, storage upload, provider call, schema application or
Native acceptance performed.
