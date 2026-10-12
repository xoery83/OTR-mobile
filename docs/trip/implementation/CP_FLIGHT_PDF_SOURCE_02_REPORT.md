# CP-FLIGHT-PDF-SOURCE-02 — Implementation Report

2026-10-12 (Pacific/Auckland). **Owning finite PDF custody completion and DERIVED
registration implemented/tested in isolation; ready for Owner Review, not integrated.**
No runtime or canonical activation. Existing Source-owned PDF profile/seal is exact.

## Exact tree and scope

- Initial local/actual remote baseline9ca16d3. Independent G2 Flexible main advance
  to `1114cccb536d6a6920c0ba6c6434b5dfe6ace5c9` was preserved through an isolated normal merge. Remote remains9ca16d3.
  G2 ports/production files, Native and all existing migrations are byte-identical.
  Only shared G2/Core SQL test change is epoch-aware revoked-custody assertions;
  its canonical Flexible mock addition is preserved. No actual contract conflict.
- Branch/worktree: `codex/cp-flight-pdf-source-02` /
  `/private/tmp/otr-flight-pdf-source-02-20261012`.
- Implementation:585a646; G2 reconciliation3c656fd; final scoped implementation
  `af36b9a166d58db9ad60f1980e7e679f317d12ea`, tree `0157d9fc29aa2c6fd84f97e657cb5ce86358942c`.
- Exact13 implementation/contract/handoff paths plus3 delivery artifacts =16 paths
  relative to current canonical1114ccc. [Manifest](CP_FLIGHT_PDF_SOURCE_02_MANIFEST.json)
  contains every implementation SHA; [evidence](CP_FLIGHT_PDF_SOURCE_02_EVIDENCE.json)
  contains actual SQL IDs/hashes, gates, test results and preservation inventory.

## Closed authority added

1. `createSourcePdfRegistration(...).verifyOriginal(actor,trip,command)` reuses
   existing VERIFY_REPRESENTATION /1 codec, immutable operation, scope/CAS,
   attempt start/observe/finalize and result SHA. Server rereads registered retained
   private bytes, checks exact provider/bucket/key and hash/length, and independently
   verifies the unchanged finite profile. No caller bytes, URL, MATCH or producer flag.
   Existing FINAL reply is typed/hashed; APPLIED must be VERIFIED at prior row+1.
2. `registerDerived(actor,trip,request)` binds current Source/material/ORIGINAL epoch
   and existing successful VERIFY operation/result SHA, including exact verified
   hash/length/MIME/time. Server rereads bytes and derives UTF-8 text plus full-page
   map. Private immutable registration receipt binds profile/options/producer, text
   hash/length, page-map SHA and identities; exact Source DERIVED TEXT is inserted
   once under its existing direct ORIGINAL parent. No Source material/row revision
   or original-roster change. No original/text payload is copied into the receipt.
3. Exact replay precedes fresh CAS, repeats current Source private read access and
   returns historical receipts. Read-only IO plus SQL completion is atomic; failed
   reads roll back, COMMIT response loss remains ambiguous until same-ID recovery.
   No upload/mutating-IO attempt is performed or inferred quiescent. Existing
   IO_UNKNOWN/nonquiescent attempts cannot be reclaimed by this path.
4. Forward migration `20261012000300_source_pdf_registration.sql` follows Core85–92,
   LLM001 and PDF002. Exactly one existing function root changes:
   `guard_trip_source_mutation()` retains default denial and adds only ORIGINAL
   PENDING→VERIFIED via existing VERIFY attempt and strict DERIVED TEXT insert backed
   by immutable registration. Other Source root/revision/action mutations stay denied.
   Lock-only column grants + UPDATE RLS USING(true)/WITH CHECK(false) permit scope
   locks while denying new root/member/revision writes. Gateway has no table DML,
   raw attempt helper or writer membership. Both gates CHECK-CLOSED; roles NOLOGIN.

There are356 exact preexisting definitions out of357; only the named forward guard
changes. All363 installed function definitions stay unchanged during scenarios.
Historical migration files, Source seal/producer/profile/DTO, owning Publisher,
Core writer and manual/UNKNOWN/airport/purpose/SOURCE_INSTANT rules are unchanged.
Registration is provenance only: existing independent seal rereads/revalidates the
full derivative before Core publication/admission. No second Publisher/writer,
Capture pipeline, provider, execution journal, scheduler or ledger is added.

## Actual owning result

Synthetic pending Source `25ad3630-4cca-4105-9caa-174ec02ec6e0`; retained950-byte strict PDF
SHA `badf69a3f4607d9a7bb25da9847e38f57d76cd4a9fa98865190d8ce0d3c8e6da`. Exact owning object key is in private synthetic
SQL evidence. Existing VERIFY commits ORIGINAL row2, Source row/material1;
registration commits exact DERIVED row1 with pages0:[0,62],1:[63,125].
Immutable verification result `fb17be79e983e95027842ea807bd6e3efa6025f8a06adc1aea15d44d6c576826` and
registration `5d2414b2cbcde34d2b1a7a058063a3d1fe29e295452e4ef15ee2f990daf57425` are reused after lost response/cold
constructor replay. There are0 Canonical Items and0 seals at registration alone.

The unchanged independent seal then permits existing Source Run/Input publication,
full sibling proof, Publisher2/purpose/airport/SOURCE_INSTANT and Core Admission:

| Candidate                              | Accepted Item                          | SQL/read2/SQLite/Day semantic revision |
| -------------------------------------- | -------------------------------------- | -------------------------------------- |
| `15cacd89-0e66-8db1-af50-09d28087b548` | `aa422556-b792-4568-a15d-1c6ae53eb8f8` | 2                                      |
| `ab373b87-30a0-83bf-ac2c-30b42d3c8aeb` | `8e322d65-a9b2-44d5-b9b8-cda8d42430b9` | 2                                      |

Same Item IDs/revisions survive authenticated owning collection, SQLite54 under
local schema55, current production Day reader, duplicate import, four receipt
recoveries and cold offline reopen. Protected manual SET/CLEAR and private Source
no-leakage assertions pass. Retained/native Quartz remains REVIEW/CONTRACT_UNSUPPORTED:
0 commands/accepted local Items/new Canonical Items/seals. No native Candidate repair.

## Verification and custody limits

- Focused13 suites:140 PASS/1 fixture-only skip; the skipped owning Native case is
  separately executed in the actual13-test SQL scenario. New5 unit tests cover
  actor/Trip mismatch, owning object key, retained hash mismatch, unavailable IO,
  and rejecting client text/bytes/producer/page flags in the shared DTO.
- Four disposable full-schema PostgreSQL scenarios:16 tests PASS. Owning PDF1,
  ORIGINAL TEXT/read2/SQLite/Day1, ordinary Quartz13, existing real local HTTP/Node
  pg/TLS TEXT1. Migration ACL/RLS/closed-gate/receipt immutability self-checks PASS.
- Owning PDF scenario checks Source/PDF CLOSED refusal, missing/altered retained
  file, ordinary Quartz, actor/Trip/parent mismatch, stale material/original epoch,
  VERIFY result mismatch, stored hash changed at same epoch, revoked custody,
  changed operation content, derivative ID reuse, existing IO_UNKNOWN operation
  refusal without phase change, forged full-page map/options, injected
  producer, and lost VERIFY/registration/seal responses with exact cold replay.
  Existing seal scenario also rejects changed derived text/current custody;
  Core repeats freshness and manual/private fences.
- Typecheck, Backend build, all touched TS lint, UI guard473/89, formatting,
  Python syntax and diff checks PASS. No tests/assertions weakened. Initial failures
  were fixture constraint/gate setup, missing lock-only RLS capability and hard-coded
  old epoch assertions; fixes preserve the owning guards and current qualification.

Only pending acquisition descriptors are privileged synthetic fixture input. No
VERIFIED/DERIVED row is seeded for this new path. The new owning commands run with
all representation/operation/registration guards enabled and migration ACLs; test
relaxations only open CHECK-CLOSED gates in their UUID-owned disposable clone.
Negative corruption is simulated by fixture admin, then restored. Existing Core
positive acceptance still uses its established synthetic admission fixture seams.

Retained bytes are actual temporary synthetic files under the registered owning
key mapping, reread by the accepted injected Source custody reader. This is **not**
a Supabase private storage adapter/provisioning or PDF HTTP/Node pg/TLS acceptance.
SQL acquisition descriptors are fixtures, not deployed ACQUIRE/runtime evidence.
No Hosted, credentials, deployment, real supplier files or Native activation.
Canonical five concurrent dirty/untracked bytes/statuses are preserved. Current-
state document adds only a short Source checkpoint over exact canonical notes.

## Agent A/B handoff and remaining gates

Authoritative additive DTO/interfaces:
[Source registration /1](../contracts/CP_FLIGHT_PDF_SOURCE_REGISTRATION_V1.md),
`src/domain/trip/sourcePdfRegistration.ts`; existing derivative authority /1 unchanged.
Agent3 owns these commands/SQL/receipts. Agent A owns authenticated HTTP, owning
registered private object read/upload/retention, bound IO and real Node pg/TLS.
Compose the exported constructor with the existing Source principal/reader; caller
JSON cannot provide the proof. Preserve exact request/operation across UNKNOWN.
Do not grant raw helper/table access or relabel model-task custody as Source storage.

Agent A sequence: admitted PDF descriptor + genuinely retained exact object →
VERIFY → registration pinned to returned VERIFY result/original row2 → new stable
existing seal request (without registration-only verification fields) → admitted
Run/Input/publication. Registration receipt does not authorize acceptance. Source
ACQUIRE/root mutation remains CLOSED pending its existing activation/positive-grant
review; this package intentionally does not open all Source commands or register a
storage provider. Runtime inventories must review the new guard/ACL hashes; frozen
Hosted inventories were not changed or bypassed.

Agent B consumes the Source-admitted catalog/text + independent seal and current
ORIGINAL row revision, preserving native identities and exact UTF-8 locators. Its
prospective/PDFKit catalog or metadata cannot substitute for admitted row2 authority.
No Backend transport, Native DTO consumer/schema/upload or Lab change implemented.

Remaining: Owner canonical integration review against actual future main/remote;
Agent A approved acquisition/runtime custody/HTTP/pg-TLS composition and retained
object recovery; Agent B Source-sealed handoff; separate installed/physical/Hosted
positive PDF acceptance. Ordinary Quartz/general PDF/OCR expansion stays outside
profile and REVIEW. Full repository regression and runtime/device tests were not run.
