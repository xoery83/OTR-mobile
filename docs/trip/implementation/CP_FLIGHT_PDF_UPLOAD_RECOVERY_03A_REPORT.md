# CP-FLIGHT-PDF-UPLOAD-RECOVERY-03A Implementation Report

**Status: IMPLEMENTED / CLOSED SYNTHETIC ACCEPTANCE PASS — STOP AT OWNER REVIEW.** No canonical integration/push or runtime activation.

## Exact candidate and preservation

- Branch `codex/cp-flight-pdf-upload-recovery-03a`, isolated worktree `/private/tmp/otr-flight-pdf-upload-recovery-03a-20261013`.
- Implementation commit `eec2516e47f38e0048f8fda90794068d93b9426f`; tree `1e687e9c45bf952ab3a01caaacc9ee4c766966ab`. Eleven implementation paths; report/manifest add two handoff paths. Exact 13-path combined manifest and SHA-256 values: `CP_FLIGHT_PDF_UPLOAD_RECOVERY_03A_MANIFEST.json`. A following documentation-only commit seals this report/manifest; final tip/tree are reported in the Owner handoff.
- Baseline/local main `e091b60e0527766bf6a055a4280e21f61933da5c`; origin/main and actual remote main `065bdd96d334cfa4818178cb715dfd7ff14b5289` at preflight and final read-only recheck. Local main descends from remote and includes subsequent G2 CP01B coordination/docs; current-state legacy note still described an earlier blocked main advance. Actual Git refs were used. No canonical refs changed by this task.
- Accepted Upload v1 `1398b2bc1bf49755b31fc74c5f67dbb0534895cc` is in baseline ancestry. v1 SQL SHA-256 `a8f39d530420b4769310ae9c431633aba3136be4d031bc0dd17fa0c433aaa1a4`; v1 domain DTO `91fe41864cce452d3e4a318ce2447c724e7e833f93c4c3e515e26b277ed9803a`, both unchanged. Existing Source VERIFY/REGISTER, independent SEAL and strict decoder production files unchanged; hashes in manifest.
- New forward migration `20261013000300_source_pdf_beta_custody.sql`. Flight00100 unchanged; TTR00200 remains separately isolated, SHA-256 `45c36ccf6f3d0ca92f30b3e78689fb95a6490e64a811bf2b670d521dfe8093c1`. Registered active worktree allocation scan found no other00300 before creation. No TTR import, dependency, edit or historical migration change. Normal installation order remains Core85–92 → LLM001 → PDF002 → Registration003 → Upload00100 → Beta00300; TTR00200 may precede Beta chronologically when separately integrated, but Beta references no TTR symbols.
- Canonical's five dirty/untracked files (Platform reports and Python cache) were hash-snapshotted and remained exact. Canonical current-state file was untouched; isolated note preserves all prior content. G2/Flexible, TTR, Native, LLM, DEV TEXT and concurrent Provider/Backend worktrees were not modified. Evidence snapshot `/private/tmp/recovery03a-preservation.json`.

## Implemented authority and interface

Normative contract: `docs/trip/CP_FLIGHT_PDF_UPLOAD_BETA_ACK_V2.md`; domain DTO `src/domain/trip/sourcePdfUploadBeta.ts`; ADR `docs/adr/2026-10-13-bounded-pdf-beta-custody.md`.

Finite profile `PDF_PRIVATE_UPLOAD_BETA_ACK_V2`, profile SHA-256 `68bf77a7d1f6f0a88e1c2278917cf62609e7f1a03369bc3dcfb96e85cb8445cb` (SHA-256 of the profile ID's UTF-8 bytes). Existing journal gets immutable `pdf_beta_ack` and `pdf_beta_get` fields. Existing private config gets CLOSED Beta flag, one producer UUID and provider-instance digest. No second journal or public storage privilege.

Source RPCs: `trip_source_pdf_beta_begin(actor,raw,attempt,resource,node,resource_key,run_token,owner_run)`; `trip_source_pdf_beta_execute(attempt,owner_run,fence,action,proof)` with STAGE/DISPATCH/UNKNOWN/ACK/GET only; `trip_source_pdf_beta_finish(actor,raw,attempt,owner_run,fence)`; `trip_source_pdf_beta_claim(attempt,expected_fence,new_owner_run)`; scoped private `trip_source_pdf_beta_inventory(actor,trip,source)`.

Begin reuses exact UPLOAD/PREPARE codec/receipt/CAS and existing exclusive plan/key/epoch constraints, reserves shared durable quota first. The fixed producer/binding includes all Source/Representation epochs, actor/Trip, hash/length/MIME, immutable private bucket/key, attempt generation, execution/staging identities and profile. One initial-fence dispatch only. ACK binds exact complete HTTP200 UTF-8 response bytes/hash/length, exact nonduplicate Key/Id shape, create-only request and trusted issuer. GET requires already durable ACK, distinct read ID, no cache reuse and exact retained bytes. SQL validates attestations and binding; it cannot itself execute or independently observe network IO.

Only private Source finish seals logical FINAL/APPLIED(PENDING), using fresh owner/access/CAS and existing immutable Source result hash. The only changed preexisting SQL function definitions are additive finite branches in `trip_source_seal(...)` and `trip_source_operation_guard()`. Strict v1 function bodies and old branches remain unchanged. PostgreSQL fingerprint checks verify all other preexisting definitions and all installed definitions during scenarios.

No `IO_QUIESCENT` or WRITER_TERMINAL is manufactured. Source `io_finished_at` stays NULL; attempt RUNNING/UNKNOWN, `termination_outstanding=true`, terminal body/evidence/result NULL. Old v1 release/terminal wrappers reject V2. All completed custody and UNKNOWN stages continue to consume shared durable quota; no cleanup or remote orphan deletion API. Existing VERIFY → REGISTER → independent SEAL → publication2 → Core remains authoritative for qualification.

## Actual synthetic owning result

Final disposable PostgreSQL run: strict 950-byte two-page PDF `badf69a3f4607d9a7bb25da9847e38f57d76cd4a9fa98865190d8ce0d3c8e6da`:

- Source `b2348dd6-500f-44b7-a9c8-cdcaa7e47606`; Original `12c63420-daaa-464f-8152-2378849842b8`; Derived `d26f99f4-e79b-4d6d-aaa0-e2c158862019`.
- One synthetic provider write; upload operation `e5f7783a-c99f-4dd2-b583-6d19876c1a0d` → immutable FINAL/APPLIED(PENDING), receipt SHA `604c62bdc91375f501e3ebc20a0a563114346c410a23541daf24554c516432db`; remote obligation remains outstanding.
- Unchanged independent VERIFY row2, registration full-page map `[0,62)` / `[63,125)`, seal SHA `165c85ad63524e1e6e82f49da65accc51a1b509ebf1cf74f3f79c1058e0362dc`. Before seal no Candidate authority or Canonical Items. Ordinary Quartz REVIEW.
- Candidate IDs `3a6f8e52-118d-8a88-a244-d148f10c7129`, `7dc34281-3706-8e7d-a343-9e7c2fd7f824`; two independently qualified Items `9f5c579d-6e31-4f4d-9335-2d85e6dea831`, `30e9564d-39e5-4e51-81f6-89a76a0b7eb2`, semantic revision2, identical in owning SQL/read2, authenticated collection, SQLite54/schema55 and production Day reader. Repeat import/lost receipts, collection replay, cold offline reopen, private evidence and protected manual fields passed through the existing combined harness. No negative-path writes.

These are **controlled synthetic Provider results, not real Supabase acceptance**.

## Verification and caveats

Newly executed actual disposable SQL: Beta38/38; strict v1/PNG29/29 with Beta installed; owning PDF full-chain1/1; owning Source3/3; ORIGINAL TEXT Flight1/1. Total72 scenario cases, plus static private ACL/RLS/NOLOGIN/role membership/CLOSED and function-fingerprint checks. Each runner removes only its own UUID container.

TypeScript regression suites: 137 PASS /3 SQL-only SKIP across eight suites, plus 24 PASS across two LLM/Source Pg suites (161 PASS total). Skipped cases are covered by separate owning SQL runs where relevant. Typecheck, Backend build, touched-file ESLint, UI guard and diff checks PASS. No Native implementation or Provider activation. Exact commands, paths, log hashes and chain evidence are in manifest; logs `/private/tmp/recovery03a-*.log`.

Security cases include complete ACK/GET, immutable response/journal replay, missing ACK + matching GET UNKNOWN, delayed same-content no terminal proof, truncated/duplicate/invalid response, wrong key/producer/attempt/fence/hash/MIME, NULL timestamps, independent read identity/cache control, conflicting immutable proofs, concurrent dispatch, new-operation bypass, stale Source/Representation epochs, revoked retained custody/membership, cross-account private access, debt/quota retention and old-profile rejection. Existing full-chain strict SOURCE_INSTANT/airport/sibling/manual/privacy fences remain in force. Exceptional re-import succession is not wired; UNKNOWN creates zero automatic Canonical Items and gets no retry/VERIFY authority. No cross-Source dedup guarantee is claimed.

Unresolved validation caveats retained explicitly:

1. Inherited SOURCE-02 `source_pdf_stage_shape` pre-dispatch rejection was nonreproducible; unchanged rerun passed. It has not been fixed or explained.
2. An intermediate normal ACK setup in the negative GET-byteCount case failed `PDF_BETA_PROOF_CONFLICT` at the strict `observedAt` window guard (line21); final38-case run and full chain passed. Exact cause remains unproven; wall-clock reversal is an inference only. Timestamp bounds are unchanged and fail closed. See `/private/tmp/recovery03a-validation-caveats.txt`.

Other initial failures were fixture enum/output/optional-argument errors or the default5-second Docker test timeout; corrected without authority changes. Disposable SQL runner now uses60-second per-test/hook limits. No claim of universal post-crash recovery.

## Backend assumptions / gates / Owner review

Agent A must consume these exact DTOs/RPCs and supply the sole configured, credential-isolated producer and faithful provider-instance binding. It must seal/fsync/read/hash the payload before journaled dispatch, issue one upload with SDK retries/upsert disabled, persist the actual full successful response before independent retained GET, and replay Source receipts/journal first. Complete ACK lost before persistence remains UNKNOWN even with matching GET. SQL does not attest local fsync, network-body execution, provider exclusivity or Supabase terminality. Concurrent different-content success observed in Provider-01 makes same-key payload/producer isolation a hard prerequisite, not a success-response inference.

Normal logical completion retains remote debt and quota. Safe cleanup, final product quota/retention policy, exceptional re-import succession/cross-Source dedup, real Provider capability review, Backend/Native runtime handoff and Hosted installation/roles/credentials/storage are separately gated. No Client-generated authority, key reuse, overwrite, deletion, second Publisher/Writer or business admission relaxation.

**STOP AT OWNER REVIEW.** Isolated implementation is tested; no canonical merge/push or Hosted/Provider/Backend/Native/DEV DATA/paid LLM/Production activation. Investigate the two timing caveats before claiming runtime reliability beyond the bounded synthetic evidence.
