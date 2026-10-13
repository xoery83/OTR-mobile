# CP-FLIGHT-PDF-TIMING-03 Implementation Report

Status: **CLOSED IMPLEMENTATION VERIFIED — STOP AT OWNER REVIEW**. Not canonically integrated or activated. 2026-10-13.

## Exact candidate and ancestry

- Branch: `codex/cp-flight-pdf-timing-03`.
- Verified canonical local main, canonical origin/main and actual GitHub main: `e9e4511c0bcbf668627a8bc99b02bb8962580a17`, reconfirmed at completion. Canonical refs were not changed.
- Accepted Recovery-03A dependency: `3aecdbce472e469cbff370f25845df67f6e74b5e`, carried by normal isolated merge `0582d8747dfc34ffd72ecd2a10ecd0343fecb8f1`. Its 13-path scope is recorded separately in the manifest. Only the runner required conflict resolution: retained accepted PDF modes plus canonical TTR installation/modes. Current-state handoffs were retained.
- V3 implementation commit: `4ba9a3a451302dda03d7231fbfac4e216f83af49`; implementation tree: `ed5495655851986672a34314b6b2d8f1a5720557`. Ten paths changed relative to the dependency merge. The following report/manifest-only commit records this implementation; its final HEAD/tree are returned in the completion message, avoiding self-referential hashes.
- Worktree: `/private/tmp/otr-flight-pdf-timing-03-20261013`. Common Gitdir: `/private/tmp/otr-flight-pdf-timing-03-seed.git`. Two shared-Gitdir creation approval reviews timed out. A private shared bare clone reads canonical objects/refs and owns all new refs/index writes under tmp. Its branch is local to that seed, not registered in canonical Git. No force/reset, canonical index/branch change, push, or concurrent-worktree mutation.
- Exact V3 and combined canonical manifests, file SHA-256, retained accepted hashes, dirty-file evidence and log hashes: `CP_FLIGHT_PDF_TIMING_03_MANIFEST.json`. Combined scope is 22 paths including unchanged accepted dependency documentation. The canonical current-state document and all five initial dirty/untracked file contents are untouched; the isolated current-state handoff adds only this checkpoint above retained notes.

## Versioned finite contract

Normative contract: `../CP_FLIGHT_PDF_CAUSAL_UPLOAD_AUTHORITY_V3.md`; ADR: `../../adr/2026-10-13-finite-causal-pdf-upload.md`. DTO: `src/domain/trip/sourcePdfUploadCausal.ts`.

`PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3`, profile digest `c8c017e4aab33ece1067ba3a063af2029e09edf5d6a5ba1b375c069a3268c00b`; uploadVersion3, issuer `otr-source-pdf-causal-producer/3`, ACK/GET digest prefixes `otr-source-pdf-beta-ack-v3` / `otr-source-pdf-beta-get-v3`.

The existing Source journal/stage/attempt/receipt remains authoritative. Source sets immutable `pdf_causal_profile_id`; association guards prevent cross-profile stages. Only its finite CHECK branches omit relative seal/dispatch wall-clock bounds. Old v1/v2/PNG branches retain them. `observedAt` is finite canonical six-digit UTC, immutable in evidence, audit-only, with no arbitrary tolerance. It does not become SOURCE_INSTANT, expiry or terminality proof.

The protected sequence is:

1. `trip_source_pdf_causal_begin`: exact existing UPLOAD/PREPARE identity, revision/payload/key/producer pins and durable quota reservation.
2. STAGE then committed DISPATCH: sealed stage and reservation must be from committed row versions, initial owner fence1, current scope/CAS/generation, one dispatch.
3. CONFIRM: committed current original write authorization; no new write grant, retry or takeover dispatch. Only a live producer holding its fresh DISPATCH response may write once.
4. ACK: complete exact bound 200 response, response bytes/hash/length/Key/Id, exact producer/owner/attempt/dispatch. Immutable ACK durably stored before READ.
5. READ: Source issues current-owner read permit on the existing attempt, binding a random readId and immutable ACK evidence SHA. Permit must commit before the producer executes a new independent no-cache retained-byte read and submits GET.
6. GET: exact permit/readId, `read.ackEvidenceSha256` equals stored ACK SHA; exact retained bytes/length/MIME and current access/CAS/attempt/generation/owner/fence.
7. `trip_source_pdf_causal_finish`: existing receipt-first seal/result writer returns logical FINAL/APPLIED(PENDING). Existing VERIFY/REGISTER/independent derivative SEAL and Publisher/Core decide business qualification.

Commit visibility uses the existing READ COMMITTED protected transition locks and own-row xmin equality against current xid (explicit xid8→xid conversion). It does not compare transaction IDs globally or introduce a lease/scheduler. Same-transaction stage→dispatch, dispatch→CONFIRM/ACK, ACK→READ and READ→GET reject. Source command/execution writers remain NOLOGIN; untrusted/public/Core/execution gateway access to the new wrappers and raw helpers is rejected. CLOSED configuration is asserted before/after disposable scenarios.

Logical completion leaves attempt RUNNING/UNKNOWN, termination_outstanding true, physical terminal facts and io_finished_at absent, retained quota/remote debt intact. Missing ACK plus matching bytes remains UNKNOWN. Lost dispatch response or restart cannot authorize another write. Committed ACK permits an authorized new read; exact GET/FINAL/receipt replay returns prior facts. No cleanup, remote deletion, exceptional re-import succession or cross-Source Canonical CREATE was added.

## Migrations and hash preservation

Order: Core85–92 → LLM001 → derivative PDF002 → Source registration003 → Flight Upload `20261013000100` → canonical TTR Ordering `20261013000200` → accepted Beta `20261013000300` → additive causal `20261013000400_source_pdf_causal_upload.sql`.

All four version allocations were checked against available registered worktree files: one filename/content per version, no conflicting allocation observed. All 97 canonical historical migration files are byte-identical. Existing SQLite56 Capture PDF handoff and SQLite57 ordinary ordering, registration/runtime code and all canonical G2/TTR/Native/LLM/Core/DEV TEXT production code remain byte-identical except previously accepted carried V2 dependencies. No registry renumbering.

Flight00100 SHA `a8f39d530420b4769310ae9c431633aba3136be4d031bc0dd17fa0c433aaa1a4`; TTR00200 SHA `45c36ccf6f3d0ca92f30b3e78689fb95a6490e64a811bf2b670d521dfe8093c1`; accepted Beta00300 SHA `840e2c22b6262aa8af486eec3a5efe001657c4567a8805a3e80ab01e0dab051a`. Full accepted dependency hash preservation is in the manifest. Shared registration fixture and runner deliberately gain only the V3 synthetic hook/modes; old Beta helper, tests, domain, contract and migration are unchanged.

The only preexisting SQL function extended by V3 is `trip_source_pdf_beta_custody(trip_source_operations)` with the finite ACK-linked V3 closure. Existing Source seal/operation guard, VERIFY/REGISTER/derivative seal, Publisher and Core functions are unchanged. Disposable installation asserts 329 historical Core functions preserved and only prior approved LLM/Source changes plus this named extension; 400 installed functions remain unchanged during scenarios.

## Newly executed verification

All PostgreSQL evidence uses owned disposable Server84 clones and controlled synthetic producer/retained files. No synthetic provider result is real Supabase acceptance.

| Verification                                                                               | Result / evidence                                                                              |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Final V3 SQL/security suite + CLOSED ACL/install checks                                    | 35/35 PASS, `/private/tmp/timing03-sql-35.log`                                                 |
| Existing strict v1/PNG upload suite with V3 installed                                      | 29/29 PASS, `/private/tmp/timing03-v1.log`                                                     |
| Existing V2 Beta suite with V3 installed                                                   | 38/38 PASS, `/private/tmp/timing03-v2.log`                                                     |
| Strict PDF causal upload → owning VERIFY/REGISTER/SEAL → Publisher/Core → read2/SQLite/Day | 1/1 PASS, `/private/tmp/timing03-chain.log`                                                    |
| ORIGINAL TEXT joined SQL/read2/SQLite/Day, V3 installed, serial                            | 1/1 PASS, `/private/tmp/timing03-text-serial.log`                                              |
| Focused TypeScript regressions                                                             | 10 suites, 161 PASS/3 existing skips, `/private/tmp/timing03-unit.log`                         |
| Final typecheck, touched-file ESLint, Backend build, UI guard, diff check                  | PASS, final static logs in manifest; UI guard 473 baseline occurrences/90 representative files |

The 35 V3 cases include both captured rollback pairs (68.016/76.146ms), valid far-future/past audit-only values, malformed/noncanonical/null/infinite/calendar-invalid dates, unchanged legacy CHECK rejection, unsealed/uncommitted stages and dispatch/ACK/permit, wrong read digest/readId/hash/length/cache flag, bound ACK producer/key/body, missing ACK UNKNOWN, replay/lost responses, concurrent dispatch/takeover, stale Source/Representation/generation pins, revoked retention/private cross-account access and retained quota/debt with cleanup rejection. The controlled producer rejects cached/pre-ACK buffers before invoking its read callback. Old V2 rejects its original invalid timestamp order despite matching bytes.

Full PDF chain evidence: Source `f512ade1-7c9a-416e-979d-f86d85e69325`; original `9b576047-8616-4bb6-98e3-4e31e4a689ac`, derived `ea9f204f-ed7c-4d58-a3fd-541f30733e68`; one provider write, upload receipt SHA `0fbaf7c55cdf33d1f87fb9a68e6ff3b6c81ddf7a31e97a022fb881e6da686f9e`, debt remains true. Existing derivative seal SHA `25eaf1d457609d8fcd9f167f2deb9c85fc10e49ae580d628b8a4d717cf28b727`.

The same two Item UUIDs `75f469fc-e1c5-4bed-9a88-e67b419f16a1` and `9f4050e3-d9fc-4af9-bfd2-20419c89960d`, semantic revision2, survive SQL/read2 → authenticated collection → SQLite54 mirror (local schema57) → production Day. Duplicate/replay, lost collection response and file cold-offline reopen pass; privateSourceLeakage=false. Existing airport/sibling/UNKNOWN/SOURCE_INSTANT and protected manual-field negatives run in the unchanged joined acceptance; ordinary Quartz stays REVIEW with zero new Items before authoritative seal. No native runtime was used.

## Validation caveats retained

- Earlier `source_pdf_stage_shape` pre-dispatch failure remains nonreproducible/unresolved for the old profile; no fixture or old guard was repaired or reclassified as fixed.
- TIMING01 measured real backward samples 68.016/76.146ms; VM/kernel mechanism remains unknown. V3 causal cases tolerate those audit samples by design; old profiles, VERIFY and other actual wall-clock bounds may still reject clock anomalies. Passing old regression runs do not resolve that caveat.
- First parallel ORIGINAL TEXT run exceeded its existing explicit 30s timeout; unchanged serial rerun passed in 8.80s. Failure log `/private/tmp/timing03-text.log` retained. No timeout or security validation was widened.
- One final Docker permission review timed out before execution; retry was approved and passed. These are execution-access delays, not evidence of a guard fix.
- Earlier V3 29/30-case passes are superseded by final35; full repository regression and real Provider/Native acceptance were not claimed.

## Minimum Backend gate and remaining limits

Agent A must consume this exact V3 DTO/digest and `trip_source_pdf_causal_*` wrapper sequence. Bind the configured sole producer/provider instance and immutable payload/key; durably stage, await committed Source journal/dispatch and confirm current authority before its one no-retry/no-upsert write. A replayed CONFIRM is not a retry license. Persist complete ACK, acquire and commit READ permit, then issue an actual new independent retained GET with cache bypass and its exact ACK digest/readId. Persist GET before relying on receipt-first recovery; use existing VERIFY/REGISTER/SEAL afterward.

SQL proves Source-side causal facts. It cannot distinguish a malicious trusted producer relabelling cached bytes with a new permit from an actual new read. The controlled fixture tests compliant adapter ordering; real adapter/process restart/response completeness/independent-read guarantees need separate Backend evidence. A late original writer may retain remote debt after logical FINAL; no physical IO_QUIESCENT/TERMINAL guarantee, cleanup authority or universal post-crash recovery is asserted. UNKNOWN before durable ACK stays UNKNOWN; automatic re-import/dedup is excluded.

Backend HTTP/private custody transport, real Supabase provider behavior, credentials/roles/storage provisioning, Hosted installation/deployment and Native catalog/runtime activation remain CLOSED/separate Owner gates. G2/TTR/Sync/Day business code is untouched. Recovery-03B must be separately reconciled with this versioned candidate and reviewed; it cannot resume by silently changing old V2 timestamps.

**STOP AT OWNER REVIEW — separate exact-tree canonical integration approval required.**
