# CP-FLIGHT-PDF-UPLOAD-SOURCE-01 Implementation Report

2026-10-13 · **CLOSED implementation complete — STOP AT OWNER REVIEW**

- Branch: `codex/cp-flight-pdf-upload-source-01`.
- Implementation commit: `98316b05bb0234678edbb2c721670d99d35f6dd2`; tree `d71bcb9d362bf004a04ffa76d3780f2cc7daab27` (10 paths).
- Base/current local main: `a878be35db92fb7e36edd5e89f26fe94f1bcb07a`; cached origin and actual remote main:
  `b4ddd27d2352350b6d16617543d0f17a715dc077`. Remote reconfirmed after tests.
- Main includes independent local TTR integration; no push/merge was performed.
  SOURCE-03, G2 Flexible `1114ccc` and DL4 `eb4c8eb` remain ancestors.
- This report and manifest are a separate documentation-only follow-up; final branch
  tip/tree are reported by Git in the handoff. Combined scope is exactly 12 paths.
- Accepted design basis SHA256:
  `ab5dd98eef77de33310faceb82f7ed8ad8d2e61affb0370abfb202800227dabb`.

## Implemented and tested

Forward `20261013000100_source_pdf_upload_authority.sql` adds finite PDF shape to the
existing execution/staging tables, not another ledger. Source operation/digest/FINAL
receipt stays unchanged. One protected CLOSED configuration table supplies configurable
64 KiB/file, 16 stages/1 MiB/account and 256 stages/16 MiB/environment defaults. Limits
apply to this finite PDF profile; old PNG admission is unchanged. UNKNOWN and uncleaned
stages keep durable quota; review intervals never expire IO or authorize deletion.

Protected Source wrappers cover reservation/start, fsynced stage observation, one durable
dispatch grant, UNKNOWN, immutable terminal evidence + atomic canonical IO_QUIESCENT,
receipt-first finish/replay, scoped inventory, fenced claim and guarded stage cleanup.
A lost dispatch response cannot mint another grant. SOURCE FINAL remains dependent on
fresh owning CAS; successful upload leaves ORIGINAL **PENDING**. No automatic next
attempt generation is implemented. Terminal missing/mismatch ends in immutable REJECTED;
new operation IDs cannot bypass unresolved plans or a previously dispatched original epoch.

OBJECT_MATCH, WRITER_TERMINAL and Source FINAL remain distinct. Exact terminal DTO binds
all operation/attempt/principal, Actor/Trip/Source/Representation epoch, parent PREPARE,
stage/node/resource/run token, provider/bucket/immutable key, SHA/length/MIME, dispatch
identity and historical owner/fence. DTO validation is not a provider attestation. Only
reviewed private server producer code may submit these records; no raw helper/client DML,
writer membership, runtime role bridge, LOGIN, credentials or storage capability is granted.
Takeover transfers reconciliation responsibility and cannot authorize redispatch.

All PDF plans remain exclusive through IO_QUIESCENT. Stage release additionally requires
all references terminal/FINAL, retained current Source/original roster and VERIFIED matching
custody. Authorization and actual staging cleanup acknowledgment are separate. UNKNOWN and
failed or revoked orphans stay protected; there is **no remote orphan deletion API**.

Production semantics retained: PNG fingerprint/container/parser shape and lifecycle;
ORIGINAL TEXT; strict `OTR_PDF_LITERAL_TEXT_V1`; independent PDF VERIFY/REGISTER/SEAL;
Core Publisher/Admission, sibling/airport/SOURCE_INSTANT/manual protection and privacy.
The sole replaced preexisting function is `trip_source_execution_inventory()` adding the
explicit PNG profile predicate so its existing reader never consumes PDF rows. No historical
migration file changed. Existing Source/backend/native/G2/LLM production files are byte-identical
to the baseline; only the shared test fixture/runner and current-state handoff overlap.

## Actual CLOSED acceptance

Acquisition descriptor alone is synthetic-seeded with guards temporarily disabled; root
ACQUIRE runtime remains CLOSED. PREPARE, upload operations/journal/receipts and subsequent
VERIFY/REGISTER/SEAL/Publisher/Core all run through owning protected interfaces with guards
restored. This proves retained synthetic custody, not Hosted acquisition or real provider behavior.

- Upload `880c158d-8544-458b-9984-8887233f5d28`, attempt `37e28607-c411-4939-afbc-d6527709ece3`; one provider write,
  immutable FINAL/APPLIED with ORIGINAL PENDING. Same plan/replay returns identical receipt.
- Source `d20f40cd-1dc3-42b9-a86c-f1bad8409c8a`, retained PDF SHA `badf69a3f4607d9a7bb25da9847e38f57d76cd4a9fa98865190d8ce0d3c8e6da` / 950 bytes.
  Private temporary staging is closed/fsynced after durable reservation; synthetic provider
  uses committed dispatch, retained bytes are independently reread/hashed. VERIFIED custody
  then authorizes actual staging removal + exact cleanup acknowledgment; provider object remains.
- Existing VERIFY receipt `0e48d1d2e978b5836cbcad4e9426b9195b398f306de2b1bdfbcbf5a221c3dff1`;
  registration `97a4a2657a8a2dc5719e6f3ca01fd53aba61f2acfde3d3417eaf373c023b18bc`; independent seal `a9bb625cf18d73dcd7b03a0b5cdb661913dedbd28151a6bac833628e3ad4b884`.
  Source/material revision 1, ORIGINAL row revision 2; two full page spans `[0,62)`, `[63,125)`.
- Two independent Candidate UUIDs: `61d76f22-3a9f-825e-a8fb-d979438287ab`, `8325e01f-130e-8798-a76d-1cf4eb183cb5`.
- Two qualified Item UUIDs: `705e46bc-0d8c-4c89-be75-5523608067ea`, `6b8c3d34-859f-42ae-a139-d55a6c87e693`.
  Both semantic revision 2 in SQL → read2 → authenticated collection → SQLite54
  (local schema55) → production Day reader, with dates 2026-12-17 / 2026-12-20.
- Repeat import, four lost Core responses, lost collection response, cold offline reopen,
  actor/Trip and private Source fences, manual SET/CLEAR and zero private leakage PASS.
  Ordinary Quartz/PDFKit retains REVIEW; Native SQL produced zero accepted Items and zero seals.

## Verification

All commands exited 0; seven separately UUID-owned disposable PostgreSQL clones were removed.
No fixture pulled an image or accessed Hosted/provider credentials. SQL installation order:
Core85–92 → LLM001 → PDF002 → Source Registration003 → Upload `20261013000100`.
329 pre-Core functions preserved by Core; PDF upload preserves 362/363 preexisting definitions
(the explicit PNG inventory predicate is the only replacement); all 378 installed functions
retain fingerprints during scenarios. CLOSED gates and private ACL/NOLOGIN checks PASS.

| Verification | Result |
| --- | --- |
| `--pdf-upload --with-llm` | 29 PASS: interruption/late write/404/active writer, exact binding/issuer/digest, CAS/revocation, concurrency, recovery, quota, orphan protection, PNG lifecycle |
| `--pdf-source --with-llm --with-pdf-upload` | 1 PASS: complete upload → unchanged authority → two Items → SQLite/Day |
| `--text-runtime --with-llm --with-pdf-upload` | 1 PASS: real local HTTP/Node pg/TLS ORIGINAL TEXT |
| `--flight --with-llm --with-pdf-upload` | 1 PASS: ORIGINAL TEXT joined SQL/read2/SQLite/Day |
| `--native-flight --with-llm --with-pdf-upload` | 13 PASS; no Native runtime activation |
| `--source --with-llm --with-pdf-upload` | 3 PASS Core Source/authority recovery |
| default Core `--with-llm --with-pdf-upload` | 1 PASS Core SQL mutation/receipt |
| Focused 11 TypeScript suites | 163 PASS, 3 owning-SQL cases skipped without fixture; owning modes ran separately |
| Typecheck, Backend build, touched-file lint, UI guard, format, Python syntax, Git diff check | PASS |

SQL case total: **49**. Evidence logs and preservation snapshot are under
`/private/tmp/cp-flight-pdf-upload-source-01/`; exact UUIDs/SHAs and the 12-path manifest
are retained in `CP_FLIGHT_PDF_UPLOAD_SOURCE_01_MANIFEST.json`.

## Agent A / remaining gates

Use `src/domain/trip/sourcePdfUploadAuthority.ts` and
`docs/trip/CP_FLIGHT_PDF_UPLOAD_AUTHORITY_V1.md` unchanged. Existing command hash uses
`otr-source-upload-v1` and the existing finite flattened tuple. The new producer RPCs
are `trip_source_pdf_upload_begin/stage/dispatch/unknown/terminal/finish/claim/inventory/
release/cleaned`; exact argument types and private helper ACLs are in the forward migration.
Use current Source private read admission for plan/receipt access. Agent A's authenticated
HTTP boundary must never expose private producer evidence/mutations to a client or infer
actor identity from client flags.

Agent A still owns bounded private ingress/staging, fixed provider instance/private bucket
adapter, no SDK/proxy retries/upsert/redirects, actual bounded GET/hash/MIME, reviewed terminal
request completion evidence, and HTTP/Node pg/TLS. A committed dispatch grant authorizes only
one external call; returning a journal/receipt never authorizes another PUT. A synthetic
provider is **not evidence of real Supabase completion semantics**. Remote commit before
terminal evidence persistence may remain UNKNOWN indefinitely; no universal crash recovery claim.

Agent B still owns durable client plan/original bytes, uncertain-response replay and later
Source-sealed catalog handoff. Client must retain its last original until verified custody;
account generation is UI response fencing, not Source authority. No Native/Day implementation
was added. Hosted storage/credentials/completion capability, runtime role review, actual Backend
and Native integration, real PDF and deployment require subsequent gates/Owner decisions.

Canonical main/status and all five concurrent dirty/untracked file SHA256 values match
preflight exactly. Existing canonical current-state notes remain unchanged; the isolated
handoff only prepends this checkpoint. No second Publisher/Canonical writer/upload ledger,
Provider activation, general PDF authority, Hosted, DEV DATA, paid LLM or Production action.

Full-repository tests, real Supabase completion and Native hardware/runtime were not exercised.
UNKNOWN can consume quota indefinitely; this is the approved safety boundary, not automatic recovery.
