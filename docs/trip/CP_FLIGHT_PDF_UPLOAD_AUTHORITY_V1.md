# CP_FLIGHT_PDF_UPLOAD_AUTHORITY_V1

2026-10-13 — CLOSED, finite Source-owned profile `PDF_PRIVATE_UPLOAD_V1`.
Normative DTOs: `src/domain/trip/sourcePdfUploadAuthority.ts`; exact SQL issuer/profile
fingerprint is exported as `PDF_UPLOAD_PROFILE_V1`. These producer DTOs are not a
public/client certification capability.

Implementation basis: accepted CP_FLIGHT_PDF_UPLOAD_AUTH_01_DECISION.

The existing Source operation digest/receipt, execution attempts and staged resources
remain authoritative. No HTTP route, storage credentials or role membership is activated.
The Source command session is the trusted server producer, never a Native/public client.
The new SQL functions are callable only through the existing NOLOGIN command gateway;
private execution helpers are callable only by the Source writer. Existing PNG functions,
profile fingerprint and container/parser constraints retain their meaning.

## Owning sequence

1. `trip_source_pdf_upload_begin(actor, raw, attempt, resource, node, resource_key,
   run_token, owner_run)` replays FINAL before activation/CAS. For a new upload it
   reserves declared bytes and a stage in the existing journal, starts the canonical
   attempt and binds the finite profile in one transaction. Same non-FINAL plan returns
   its journal without dispatch permission. Original descriptors must already exist.
2. `trip_source_pdf_upload_stage(attempt, owner_run, fence, sha, length, evidence_sha)`
   records the trusted producer's closed, fsynced, private staging observation. The
   opaque node/resource key is not a caller-selected filesystem path.
3. `trip_source_pdf_upload_dispatch(...)` checks current scope/pins, sealed stage and
   first owner fence, then durably grants a single dispatch identity. Commit before
   invoking the provider. A lost dispatch response never grants a replacement token.
4. `trip_source_pdf_upload_terminal(...)` records immutable producer evidence, and
   observes canonical DEFINITIVE_COMPLETION atomically. Dispatched evidence requires
   the exact dispatch identity, full immutable binding, issuer/version and digest.
   OBJECT_MATCH is separate from WRITER_TERMINAL. NO_DISPATCH is accepted only while
   no dispatch was granted; locking closes future dispatch. No client flag is proof.
5. `trip_source_pdf_upload_finish(actor, raw, attempt, owner_run, fence)` replays the
   Source receipt first, otherwise requires durable terminal evidence and owning fresh
   CAS. It reuses existing finalize. UPLOAD success leaves ORIGINAL PENDING; existing
   VERIFY → REGISTER → independent SEAL → Publisher/Admission remains mandatory.

`trip_source_pdf_upload_inventory(actor,trip,source)` is current-private-access scoped.
`trip_source_pdf_upload_claim(attempt,expected_fence,new_owner_run)` transfers only
reconciliation. `trip_source_pdf_upload_release` / `trip_source_pdf_upload_cleaned`
wrap existing stage cleanup with finite PDF reference guards.

For UNKNOWN use `trip_source_pdf_upload_unknown` and read-only inventory. Claim uses
existing execution claim: takeover changes responsibility, not remote writer authority.
Stored terminal evidence records its historical owner fence; reconciliation uses the
current fence. Never resend after takeover or an ambiguous dispatch response.

## Exact authority and recovery

The immutable binding includes the operation/key/digest, actor/Trip/Source/Representation,
Source/material/Representation epoch, parent PREPARE, canonical generation/attempt,
execution principal, stage/node/resource, profile/fingerprint, run token, provider/bucket/
immutable key, PDF SHA/length/MIME and dispatch identity. Terminal evidence additionally
binds issuer `otr-source-pdf-upload-producer/1`, historical owner/fence, observed time,
WRITER_TERMINAL/NO_DISPATCH and independent object MATCH/MISSING/MISMATCH observation.
The digest uses existing `trip_source_hash`, prefix `otr-source-pdf-upload-terminal-v1`.

A matching object, 404, timeout, crash, local fence or expired lease cannot authorize
terminality. Missing evidence retains canonical IO_UNKNOWN (or IO_ACTIVE until explicit
UNKNOWN observation), journal obligation, immutable key and quota. Durable terminality
without FINAL can resume owning finalize without provider PUT. FINAL loss replays exactly,
including rejection and after activation closure, with current private read admission.

This first finite profile never automatically retries or creates another generation.
Terminal missing/mismatched bytes end in existing immutable REJECTED. A second operation
cannot bypass a non-FINAL plan, and a previously dispatched upload epoch cannot be reused
for another write, even while ORIGINAL is PENDING. Changed input requires a new owning
Representation/revision; FINAL history is never rewritten. All unresolved PDF operations
on the representation are exclusive through IO_QUIESCENT, including raw command admission.

## Quota, cleanup and privacy

A protected singleton CLOSED config defaults to 64 KiB/file, 16 stages/1 MiB/account,
256 stages/16 MiB/environment. Reservations serialize before ingress/provider dispatch.
UNKNOWN and release-authorized but not physically cleaned stages count. The quota applies only to the finite PDF profile; PNG admission is unchanged.
The old inventory port explicitly retains its PNG profile filter; the new Source-owned
PDF inventory uses the same journal and current private access. No TTL releases quota or deletes bytes.
Configured 1-hour partial / 24-hour terminal/review intervals are review/conditional
retention values, not a scheduler or a guarantee of physical expiry.

PDF staging release/cleaned additionally requires all referencing operations FINAL and
all attempts terminal, plus current retained VERIFIED ORIGINAL custody. Failed/UNKNOWN
orphans remain protected in inventory; this checkpoint provides no remote object deletion.
Cleanup acknowledgments are separate from authorization. Native keeps its last original
until the later custody handshake. No payload, URL or evidence is exported to collection.
Source owner/private access and Actor/Trip fences are reused; operational evidence may be
persisted after revocation, but success/handoff requires fresh owning admission/CAS.

## Agent A integration gate

Implement private bounded staging and a fixed-instance `supabase_storage` adapter:
`trip-source-material`, `v1/<trip>/<source>/<representation>/payload`, create-only,
no SDK/proxy/application retry, upsert, redirects or alternate key. Consume each committed
dispatch grant at most once; an uncertainty is UNKNOWN. Independently GET/hash/length/MIME
before generating terminal evidence. Trustworthy request completion must cover all delegates
and guarantee no future writes for that exact request. Normal SDK resolve/404/abort is not
sufficient. Reconcile may only obtain independently reviewed provider terminal evidence;
otherwise remain UNKNOWN. SQL cannot attest the real provider's remote termination.

The synthetic provider establishes only CLOSED test semantics. Real provider completion,
private storage provisioning, producer credentials/role bridge, Backend HTTP/pg/TLS,
Native upload/catalog consumption and Hosted activation remain separate Owner gates.
