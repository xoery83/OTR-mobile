# R3-A3B hardened provisioning independent security review

Date: 2026-10-10 (Pacific/Auckland). Independent reviewer session, separate from Builder.

**PASS WITH REQUIRED CORRECTIONS — 0 CRITICAL / 2 IMPORTANT / 0 MINOR.**

What this change does: A dormant, root-run Python/libpq procedure provisions only the fixed Catalog Reader on disposable loopback PostgreSQL. It suppresses diagnostic sinks before binding a candidate password, persists UNKNOWN before mutation, and observes actual role state plus candidate authentication before promoting custody. It also rotates credentials and disables the Reader with explicit session retirement.

| Requested outcome                             | Independent result                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Original leakage scenarios closed             | **YES** for reproduced cancellation/FATAL server-log and emitted-client paths; privileged native error buffers remain sensitive.                                               |
| UNKNOWN recovery independently verified       | **NO** as a complete recovery guarantee; ordinary uncertainty, actual SIGKILL after COMMIT, and actual SIGKILL after custody rename passed. Partial journal recovery fails F1. |
| Persistent secret exposure detected           | **YES**: F2 retains a cleartext candidate in root-private `candidate.new` after DORMANT. Unauthorized corrected log/statistics/diagnostic disclosure detected: **NO**.         |
| New regressions                               | **NO** in application regressions; **YES**, newly exposed credential lifecycle failures F1/F2. No production code was changed.                                                 |
| Ready for Dormant-Code Final Owner Acceptance | **NO**, correct and independently recheck F1/F2 first.                                                                                                                         |
| Ready for Hosted Provisioning                 | **NO**, separate authorization and actual Hosted/host prerequisites remain required.                                                                                           |

## IMPORTANT findings — must fix

### F1. Interrupted journal replacement prevents emergency disable while LOGIN remains enabled

Source: `scripts/supabase/catalog_reader_credential.py`, lines 164–176, 212–221, 286–289.

Every journal write exclusively creates the same `operation.json.new`. After database COMMIT and candidate-to-active promotion, an actual SIGKILL during the final journal file fsync leaves that staging file beside the durable UNKNOWN journal. The Reader is LOGIN with a password. A subsequent authorized `disable()` fails with `FileExistsError` at its first journal write, before executing NOLOGIN/PASSWORD NULL. Actual role state remains unchanged. Reconciliation encounters the same final-write obstacle.

Independent reproduction: fork a real provisioner; kill it when final APPLIED journal fsync is reached; inspect LOGIN/password presence; call disable; assert failure and identical role state. All assertions passed. This is not merely a synthetic KeyboardInterrupt or a fabricated post-crash journal.

Smallest required correction: provide an explicit, locked recovery path for a checked incomplete journal staging file. Preserve UNKNOWN and never replay credential provisioning. Safely resolve the stale staging name and durably record the authorized disable intent before database mutation. Reject unsafe ownership/modes/links; do not introduce blind deletion or automatic retries. Add the actual-kill regression. If skipped, the advertised emergency operation is unavailable precisely after a credential-changing crash.

### F2. Disable declares DORMANT while a failed-write candidate password remains on disk

Source: `scripts/supabase/catalog_reader_credential.py`, lines 164–176, 212–222, 241–256, 265–268.

Injecting failure into candidate file fsync leaves the complete 64-character generated password in `candidate.new`; provision returns UNKNOWN. A fresh authorized disable commits NOLOGIN/PASSWORD NULL and returns DORMANT, but removes only `candidate` and `active`. The cleartext staging password remains. The dormant reconciliation branch has the same omission. A later provision also cannot exclusively create that candidate staging name.

Independent reproduction asserted the failed fsync, UNKNOWN, successful DORMANT disable, and surviving complete password file. This candidate was not bound to PostgreSQL and is not an accepted database login; it is nevertheless retained credential material after claimed retirement. It remained inside root-private custody, not in logs or exported evidence.

Smallest required correction: include checked incomplete secret staging files in authorized retirement and fsync their removal before recording DORMANT. Fail closed on unsafe files or unsuccessful cleanup; retain truthful UNKNOWN until cleanup succeeds. Cover failed fsync and interruption before rename, including the dormant reconciliation branch. If skipped, retirement and retention claims are false and subsequent provisioning is blocked.

## Source, scope and preservation

HEAD exactly matches `d2c904efb22090d9a1c51fd1be63a3bb5780c8cc`. Initial status contains exactly the nine Builder paths listed in its report: one modified current-state handoff and eight untracked artifacts. SHA-256 before/after comparisons preserve all nine byte-for-byte, including the two copied proof documents. Existing tracked source, configuration, Principal SQL, manifests, Driver and Backend files match HEAD outside the already-modified Builder handoff. The only new repository artifact from this review is this report; the handoff is preserved as Builder evidence.

Only `test_r3a3b_builder.py` imports the module. There is no CLI, runtime caller, persistent SQL helper, authentication service, dependency change, Backend injection, deployment or migration. The module pins loopback/fixture CA and fixed Reader identity. No Git ref operation occurred.

Accepted Principal reports and the extended H1 manifest contract were inspected. The Builder's retained read-only Hosted observations report identical before/after H1 `a56e074a33ea3e3b34c042a0e02c391f0074a5d868ee59e22f66f9ea22446e42`, NOLOGIN/PASSWORD NULL, null expiry, limit1 and zero sessions. Those evidence bytes are preserved. **No fresh Hosted observation was made by this reviewer**; current remote H1 is therefore not independently recertified. No real Hosted credential mutation occurred.

## Independent fixture and native boundary validation

Fresh isolated PostgreSQL17.6/Supautils3.4.0 fixture used the cached Builder runtime image `sha256:c77094970281215d04e60f80e1e66a6f7c03341a1cec363d1855f64c27fb56f9`. PostgreSQL ran as UID100, with network none, no published ports, database/log/custody tmpfs, core0, no-new-privileges and dropped capabilities except DAC_OVERRIDE. Root clients used an empty environment. Existing nine local containers were preserved. The task fixture was removed after final actual `pg_authid` observation: NOLOGIN, password NULL, limit1, zero sessions. Synthetic credentials and database WAL were destroyed with fixture tmpfs.

The preserved baseline mechanism was rerun on that fresh fixture: nested ALTER under row lock, original OTHERS-only cancel handler, and FATAL without panic message suppression. Each produced a password in native client error/context and one server-log occurrence. Baselines were retained only in redacted form. An initial fixture capability/socket setup failure occurred before secret tests and was corrected without changing Builder sources.

Actual ctypes signatures call native `PQexecParams` with a separate parameter array. Password and expiry are bound to constant set_config statements; the boolean result does not return their values. All required logging/audit/statistics settings are established or checked before password binding. Privileged controls use constant SET LOCAL statements, not an assumed set_config privilege bypass. A nonexistent logging control fails closed. Unsafe transaction sampling, duration sampling, pgAudit client output and MD5 encryption each prevented secret binding and remained UNKNOWN/dormant.

**The unqualified claim “no password enters SQL statement text” is false.** Top-level client statements and sampled activity contain placeholders or the constant DO body. Server-side `format(%L)` deliberately constructs a nested ALTER containing the cleartext password. Its transient error/context and privileged memory are the known risk; the corrected procedure suppresses the tested retained sinks. This is parameter binding plus suppression, not universal SQL redaction. [PostgreSQL ALTER ROLE documentation](https://www.postgresql.org/docs/17/sql-alterrole.html) describes password operands and their disclosure risk.

Production module does not call native error-message/context accessors. Failed results are cleared, failed provisioning connections close, and notice text pointers are discarded by the installed processor before authentication polling. Independent secret-bearing NOTICE injection produced no client stderr or retained secret match. The default receiver can still format transient notice text inside libpq; no claim of absent native memory copies is made. [PostgreSQL notice processing](https://www.postgresql.org/docs/17/libpq-notice-processing.html) documents the default stderr behavior and processor override. PANIC remains above the suppression boundary. [PostgreSQL logging controls](https://www.postgresql.org/docs/17/runtime-config-logging.html).

## Coverage of the requested challenges

| Review area                                                                                  | Observed result and limit                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Normal provision, rotation, expiry, fixed identity, connection limit                         | APPLIED; actual TLS1.3 and Reader SCRAM authentication; second connection rejected; expired password rejected; old password and old session retired.                                                                                                                                                                                                                                                      |
| Cancellation, timeout, FATAL, malformed SQL expiry, transport shutdown, interrupted rotation | UNKNOWN; a second provision refused; ambiguous states stayed UNKNOWN; explicit disable succeeded when custody staging was intact.                                                                                                                                                                                                                                                                         |
| Uncertain COMMIT                                                                             | Actual COMMIT sent/flushed, independent committed role state observed, response not consumed; fresh reconciliation authenticated candidate and returned APPLIED without ALTER replay.                                                                                                                                                                                                                     |
| Real process death                                                                           | SIGKILL after COMMIT and after candidate rename recovered APPLIED. SIGKILL during journal fsync reproduced F1.                                                                                                                                                                                                                                                                                            |
| Filesystem faults                                                                            | Candidate-file fsync reproduced F2. Directory fsync after promotion and interrupted candidate rename left durable UNKNOWN and recovered APPLIED.                                                                                                                                                                                                                                                          |
| Journal corruption                                                                           | Invalid JSON blocked provision before mutation; authorized disable replaced the corrupt journal. This is safe rejection, not a typed UNKNOWN result or a complete corruption-recovery interface.                                                                                                                                                                                                          |
| Custody controls                                                                             | Wrong directory/file modes, non-root directory owner, directory/file symlinks, hard links, writable ancestor and concurrent lock denied. O_NOFOLLOW/O_EXCL, root0700/0600, ownership, lock and file/directory fsync inspected. Privileged root path replacement remains a trusted administrator boundary.                                                                                                 |
| Native diagnostics and independent sinks                                                     | Preserved run and independent harness stderr were each zero bytes. Corrected complete log, administrator statistics, four observer activity classes, sampled argv/environment and retained non-database artifacts had zero exact matches in their respective secret scans. Sampling does not prove every transient instant.                                                                               |
| ACL/settings                                                                                 | Builder fixture grants/settings preserved, business SELECT and schema CREATE denied. Additional deliberate ACL grant showed provision does **not** itself attest H1/ACL integrity: it enabled LOGIN and the Reader could SELECT that table. External accepted H1/ACL validation is a mandatory future gate, not a property supplied by OBSERVE. This falls within documented privileged ACL drift limits. |
| Emergency disable                                                                            | Ordinary disable commits NOLOGIN/PASSWORD NULL, retires sessions and observes zero. F1/F2 prevent complete crash-safe disable/retirement acceptance.                                                                                                                                                                                                                                                      |
| Finite expiry after disable                                                                  | Finite metadata persists; it grants no login with NOLOGIN/password NULL. Accepted Principal Builder explicitly documents finite metadata remaining after disable. It is not exact original null-expiry H1 restoration; future inventory must report the actual state. No pg_authid direct update or infinity substitution is justified.                                                                   |
| Process/dumps                                                                                | RLIMIT_CORE hard/soft0, PR_SET_DUMPABLE0, same-UID environment denial and SIGABRT/no core file passed under fixture plain `core` handler. Actual Apport was not tested.                                                                                                                                                                                                                                   |

Synthetic fixture ACLs use a stub protected root, not the full accepted SQL Principal schema. Historical 235-outcome Principal SQL/19-case Driver socket matrices were not rerun; no historical count is presented as fresh proof.

## Application validation and residual limits

The exact five affected suites passed **262/262**: Catalog read67, Pg connection33, Catalog transport17, Import admission51, Publication membership94. Additional relevant application, native receiver, canonical read, execution recovery, private custody, log redaction and flight admission tests passed; no application failure was observed. Typecheck, lint including UI guard, Backend build and tracked whitespace checks passed. Scoped Markdown formatting found one issue in the byte-preserved nonlogging proof; the other Builder Markdown files passed. No formatting rewrite was made. Shell syntax/Python compilation and actual Python/SQL fixture execution passed. Full-repository formatting was not rerun.

Trusted administrator/provisioner/backend transient memory still contains password/verifier copies, including sensitive FATAL context. Python immutable encodings and libpq buffers are not certified erased. Nondumpability must be validated in the actual secret-bearing process after exec/UID changes; core0 under a plain handler does not certify a piped Apport handler. Actual host inspectors, crash agents, privilege boundaries, provider-managed logs and retention remain uncertified.

PANIC can bypass the tested logging threshold. pg_authid, WAL and managed database backups retain sensitive SCRAM verifiers by design. No database verifier/WAL/backup absence is claimed. Root/Docker/DB administrators remain trusted custodians; unlink is not secure erasure. Actual Hosted Supautils build, administrative authentication custody, Direct Primary TLS endpoint, termination authority, H1 validation, backup policy and Backend admission closure need separately authorized evidence before real provisioning.

Sanitized independent evidence is in `/private/tmp/otr-r3a3b-independent-20261010` (0700; retained files0600): independent challenge sources/results, fresh preserved fixture results, redacted original controls, corrected log, regression counts, source hashes and evidence manifest. No synthetic password/verifier was exported. Builder and original proof evidence were preserved. The reviewer wrote no production correction, accessed no Production/device/Simulator, activated no provider/Composer/C5/C9, and performed no commit/push/merge/rebase.

**Verdict: fix F1 and F2 before Dormant-Code Final Owner Acceptance.**

Not checked: actual Hosted/Apport/PANIC/backup behavior and historical full SQL/socket matrices; those boundaries remain CLOSED.

**STOP — HARDENED PROVISIONING INDEPENDENT SECURITY REVIEW COMPLETE.**

## F1/F2 TARGETED INDEPENDENT RECHECK — PASS WITH REQUIRED CORRECTIONS

2026-10-10 (Pacific/Auckland). Original Reviewer session; this session did not implement the corrections. The original review above is preserved byte-for-byte, including its findings and verdict. This appendix supersedes only the targeted status below.

**Remaining: 0 CRITICAL / 1 IMPORTANT / 0 required MINOR.**

| Requested return                                    | Independent result                                                                                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 FIX VERIFIED                                     | **YES**, checked damaged/staged journal recovery and emergency disable passed.                                                                                                            |
| F2 FIX VERIFIED                                     | **NO** for the requested complete-custody criterion; the original `candidate.new` defect is fixed, but F3 below remains.                                                                  |
| Original negative probes closed                     | **YES**, unchanged F1/F2 blocks independently reproduced original defects and rejected those vulnerability assertions on corrected code.                                                  |
| Emergency disable independently verified            | **YES** for checked missing/damaged/staged journals, with actual Reader session termination and database observation. Persistent storage/authority failure remains UNKNOWN or incomplete. |
| DORMANT custody completeness independently verified | **NO**; unexpected credential material is outside the hard-coded inventory and survives DORMANT.                                                                                          |
| UNKNOWN recovery independently verified             | **YES** for the tested COMMIT/rename/crash, ambiguous-state and cleanup/durability matrix; this does not override F3.                                                                     |
| New regressions                                     | **NO application failures**; one newly exposed custody verification gap.                                                                                                                  |
| Ready for Dormant-Code Final Owner Acceptance       | **NO**, close F3 and independently recheck it first.                                                                                                                                      |
| Hosted/Apport/Secret/Runtime gates                  | **CLOSED**; no actual Hosted provisioning or runtime acceptance.                                                                                                                          |

### IMPORTANT F3 — Unexpected credential file survives a successful DORMANT result

Source: `scripts/supabase/catalog_reader_credential.py`, `SECRET_ARTIFACTS`, `secret_artifacts()` / `retire_secrets()` at lines 230–242, and the DORMANT completion path.

The correction checks/removes only `candidate`, `candidate.new`, and `active`. The final absence check consults that same list. An independently created, checked root-owned0600 `candidate.backup` containing a synthetic candidate password survives `disable()`, which nevertheless returns DORMANT. This directly fails this recheck's items12–15: DORMANT cannot be certified while any staging/temporary credential material remains, including the unexpected-file negative.

Concrete probe: in a root0700 custody directory, generate a synthetic credential in process memory and write it as `candidate.backup` using the existing checked custody writer. Run real authorized disable against PostgreSQL; assert returned DORMANT and retained file. Both observations held. Only name/state/presence were exported. The harness then explicitly removed its own synthetic file; no credential bytes appear in evidence.

This file is not created by the fixed production provisioning flow, and there is no new automatic backup path. It models an unexpected retained credential artifact in the dedicated custody directory. Thus the original F2 implementation defect is closed for every currently generated secret filename, but the broader Owner-requested completeness guarantee is not established. The Builder's unrelated **nonsecret** sentinel preservation test cannot prove that arbitrary unexpected files are safe. This is retained root-private material, not an unauthorized server-log disclosure.

Smallest required correction: before certifying DORMANT, validate the dedicated custody inventory. Preserve unexpected files and report CUSTODY_INCOMPLETE/UNKNOWN until explicit authorized resolution; do not blindly delete them or inspect/export arbitrary secret contents. Recognize only checked expected metadata and owned secret names. Add this unexpected-secret negative alongside the unrelated-file preservation assertion. This changes local completeness verification, not the accepted PostgreSQL credential mechanism. If skipped, DORMANT means only the three recognized secret names are absent, rather than the requested complete custody state.

### Exact scope and original evidence

HEAD remains `d2c904efb22090d9a1c51fd1be63a3bb5780c8cc`. Compared with the original review's source manifest, exactly five existing paths changed: credential module, fixture bootstrap, Builder report, current-state handoff and ADR. `test_r3a3b_f1f2.py` is the sixth correction path. Bootstrap adds only the disposable database identity comment; no Principal ACL tightening. The original Builder test harness, fixture launcher, accepted proofs and Independent Review remain exact. Builder report retains its original prefix. Correction sources were hashed before/after this recheck and were not edited.

Original Independent Review SHA-256 before append:
`70e32a05fd067b9167cad79042b4f6b12b31b7c379173a8eedab8435e9c0968b`.
Append verification requires the final document to begin with those exact original bytes. The Builder handoff was not changed by this Reviewer, preserving its correction evidence.

No new service/helper, Driver or runtime caller exists. Principal/Hosted H1 contracts were not reopened. Accepted Hosted NOLOGIN/PASSWORD NULL/H1 evidence remains preserved; no fresh remote H1 observation is claimed.

### Fresh real PostgreSQL and unchanged negative probes

Two fresh disposable fixtures used cached runtime image `sha256:c77094970281215d04e60f80e1e66a6f7c03341a1cec363d1855f64c27fb56f9`, PostgreSQL17.6/Supautils3.4.0, network none, no published ports, tmpfs database/log/custody, core0/no-new-privileges and dropped capabilities except DAC_OVERRIDE. Database ran as UID100; secret-bearing clients ran as hardened root with empty environment. A fixture-only source-directory permission startup failure occurred before the pre-correction test and was corrected without editing sources.

The original independent `challenge.py` ran byte-for-byte against preserved pre-correction module SHA-256 `45afe8eddcbe037aeb7f301eb91dafb337dfeb202bf040d0aae0bd66792e6aa0`. Actual SIGKILL during final journal fsync reproduced F1: Reader LOGIN/password remained and disable failed before SQL. Candidate fsync failure reproduced F2: DORMANT with the complete staged password retained. The complete original harness passed those vulnerability assertions.

On corrected code, the original F1/F2 blocks ran unchanged, with hashes:

- F1: `d0e89396dff11b106f372f8e65e5a6b1447ca1590bfae0ad376d6fdde35f7a38`.
- F2: `7902a04249cf91570eeed590eb9c363b415a2f6eddbf1700b6df712e26eae5de`.

Their old vulnerability assertions failed because actual disable succeeded and candidate staging was removed. The harness then checked real database NOLOGIN/password NULL, zero sessions, DORMANT journal and no recognized secret/staging residue; arbitrary exceptions were not treated as closure. Unchanged real SIGKILL-after-COMMIT and SIGKILL-after-custody-rename blocks also recovered APPLIED without password mutation replay.

### Targeted recovery and independent bypass controls

The correction's complete real fixture matrix passed: journal failures before/partial write, after file fsync, after rename and directory fsync; malformed JSON/schema/type/secret-bearing unexpected journal field; candidate fsync and pre/post-rename interruption; unlink/removal directory-sync failure; final disabled journal failure; false APPLIED metadata versus actual dormant role; symlink, hardlink, FIFO and unsafe-mode staging; wrong project and ordinary administrator channel.

Reviewer-authored additional controls independently confirmed:

- Missing journal with a live authenticated Reader still permits authorized disable, terminates that session, and observes zero sessions. Repeated disable/reconcile is idempotent.
- Existing damage-evidence file remains byte-identical when another checked staging artifact is recovered. New evidence contains restricted name/hash/length only; recovered history is not certified as a successful credential operation.
- Failure to persist disable intent returns UNKNOWN before role mutation, with actual LOGIN/password state unchanged. After fault removal, explicit disable completes.
- Removing the operator's termination authority rejects the channel before local recovery or database mutation. The fixture grant was restored only by the harness afterward.
- Individually failing removal of each of `candidate`, `candidate.new`, and `active` returns CUSTODY_INCOMPLETE and retains the failed artifact. Provisioning remains closed; fresh observed reconciliation completes after fault removal.
- Unexpected secret backup reproduces F3. It was preserved during the failing completeness assertion, rather than silently deleted by the provisioner.

Checked recovery preserves invalid local-state evidence and uses actual role/session state. Corrupt live-operation metadata cannot authorize rotation or fabricate APPLIED. Filesystem failures cannot be called successful DORMANT. Unsafe journal files or persistent inability to write durable intent may still prevent the SQL disable step and return UNKNOWN; that is an explicit storage/authority prerequisite, not a claim of disable success despite unusable custody.

### Regression, leakage, custody and remaining gates

**327 PASS / 13 existing platform SKIP / 0 FAIL**, comprising the original262 application tests and65 relevant Backend security tests. Typecheck, lint/UI guard, Backend build, scoped correction Markdown formatting, Python/shell syntax and tracked whitespace/preservation checks passed. No full-repository formatting or historical full Principal SQL/Driver socket matrix was rerun.

The unchanged lifecycle suite passed normal provision/rotation, actual TLS1.3/SCRAM, expiry and limit1, old password/session retirement, unconsumed COMMIT/lost-ACK reconciliation, candidate-ready recovery, cancellation, timeout, FATAL, malformed expiry and interrupted connection/operation. Original cancel/FATAL logging controls still reproduce their unsafe baseline; corrected sink scans remained closed.

Complete corrected SQL/DDL/audit/error/auto_explain logs and administrator statistics had zero exact matches for the respective synthetic passwords/verifiers. Process argv/environment and recognized retained artifacts had zero matches in the preserved matrices. Additional Reviewer secret/log/statistics/artifact scans passed after explicit test cleanup. All three corrected client stderr files were zero bytes. No secret values/verifiers were exported into source, reports or retained evidence. F3's retention observation precedes the harness's explicit cleanup and is not contradicted by the final zero-match scan.

Root0700/0600, owner/single-link validation, nonblocking O_NOFOLLOW, exclusive staging, locking and file/directory fsync remain enforced for recognized files. Dump soft/hard0, nondumpability and same-UID environment denial/abort-without-core passed under plain fixture `core` handling. Actual Apport/inspectors, privileged transient/native memory, PANIC, provider logs, database SCRAM verifier/WAL/backup custody and physical erasure remain uncertified. Finite dormant expiry persists; exact original null-expiry H1 restoration is not claimed. No new absolute secrecy claim was added.

Final disposable database observation was NOLOGIN/password NULL/limit1/zero sessions. Both task-owned fixtures were removed, destroying synthetic database/WAL/custody; the nine pre-existing local containers were preserved. Sanitized Reviewer evidence is restricted0700/0600 at `/private/tmp/otr-r3a3b-recheck-20261010`, including original/pre-correction results, corrected lifecycle/probe results, independently authored controls, scanned logs,327-test counts and preservation hashes.

No Builder production correction, Hosted DEV/Production access or mutation, real credential provisioning, Backend injection/deployment, device/Simulator, Composer/C5/C9/provider activation or Git ref operation occurred.

**Verdict: original F1/F2 negatives closed; fix F3 before Dormant-Code Final Owner Acceptance.**

Not checked: actual Hosted/Apport/PANIC/backup behavior and historical full SQL/socket matrices. Hosted/Secret/Runtime gates remain CLOSED.

**STOP — R3-A3B F1/F2 TARGETED INDEPENDENT SECURITY RECHECK COMPLETE.**

## F3 FINAL TARGETED RECHECK — PASS

2026-10-10 (Pacific/Auckland). Original Independent Reviewer session; this session did not implement F3. All original review and previous recheck text is preserved byte-for-byte. This appendix supersedes the pending F3 finding and acceptance status, without granting Hosted or complete local custody acceptance.

**Remaining findings: 0 CRITICAL / 0 IMPORTANT / 0 required MINOR.**

| Requested return                              | Independent result                                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F3 FIX VERIFIED                               | **YES**. Original backup-survival unsafe acceptance reproduced on preserved code and closed on corrected code.                                                        |
| False DORMANT prevented                       | **YES**. No corrected production path writes or returns DORMANT. Unsafe/unknown entries return CUSTODY_INCOMPLETE; even a clean checked snapshot returns UNAVAILABLE. |
| Emergency disable verified                    | **YES**. Actual NOLOGIN/PASSWORD NULL commit and established Reader session termination observed despite damaged, partial, symlinked or unwritable journal.           |
| UNKNOWN recovery verified                     | **YES** for the tested lost-ACK, actual COMMIT/rename crashes and ambiguous operations; no automatic credential mutation replay.                                      |
| New regressions                               | **NO**.327 PASS /13 existing platform SKIP /0 FAIL; targeted real PostgreSQL controls passed.                                                                         |
| Ready for Dormant-Code Final Owner Acceptance | **YES**, for the explicitly fail-closed dormant implementation. Complete custody acceptance remains UNAVAILABLE.                                                      |
| Ready for Hosted provisioning                 | **NO**, separate authorization and actual host/Hosted/custody prerequisites remain.                                                                                   |

### Source and preservation

HEAD remains `d2c904efb22090d9a1c51fd1be63a3bb5780c8cc`. The six F3 correction paths are the credential module, new F3 fixture tests, adjusted F1/F2 test assertions, appended Builder report, current-state handoff and appended ADR. Original fixture launcher/bootstrap, original Builder harness, accepted proof documents, Principal SQL, Driver/Backend/runtime/configuration contracts remain unchanged. This Reviewer edited only this report by appending this section; no production correction, new filesystem framework, background service or privilege expansion occurred.

Full prior review SHA-256 before append:
`2b866bbeb6f6d1ef21819cde7e38ef22254c80dcba0ccdcc65be4b71e3967fe8`.
Final prefix verification preserves those exact bytes, including the original review and F1/F2 appendix. Before/after hashes preserve correction sources and prior evidence. The Builder handoff remains untouched by this Reviewer.

### Original F3 and corrected negative matrix

Two fresh disposable PostgreSQL17.6/Supautils3.4.0 fixtures used the cached runtime image `sha256:c77094970281215d04e60f80e1e66a6f7c03341a1cec363d1855f64c27fb56f9`. Network none, no ports, tmpfs database/log/custody, core0/no-new-privileges, dropped capabilities except DAC_OVERRIDE; UID100 database and hardened root clients with empty environment. A pre-fixture source-permission setup failure was resolved before the successful original run; no Builder source was changed.

The original independent `independent.py` ran unchanged against preserved pre-F3 code and again observed `state=DORMANT, retained=true` for a synthetic `candidate.backup`. Its original failure assertions passed. On corrected code, the exact original F3 block was rerun unchanged, SHA-256:
`b5ded520897928c8ce8a1f0db03082ea563d8724dc9dbfe71450e6ab47de71ad`.
It instead observed CUSTODY_INCOMPLETE with the backup preserved. No arbitrary exception was counted as closure.

Corrected real fixture controls passed for unexpected backup/regular/hidden/alternate staging entries; symlink/hardlink/directory entries; unsafe ownership/modes; invalid metadata, nonempty lock and duplicate JSON; known secret-file retirement; concurrent insertion during inventory and allowed-metadata insertion between snapshots. Unknown entries were rejected without opening their contents or deleting them. Complete acceptance was unavailable even after authorized harness cleanup produced a clean inventory.

The inventory checks exact metadata names/schema, root0700/0600 ownership/single-link controls, empty held-lock identity, canonical JSON, finite entry/size limits, directory-relative O_NOFOLLOW/nonblocking opens and before/after identity/timestamps. These are checked observations under the existing advisory lock, not a race-free custody transaction. Per the Owner's explicit criterion, the uncooperative privileged-writer limit is accepted only through the fail-closed UNAVAILABLE result, not through a new custody guarantee.

### Database disable and custody are distinct

Actual database disable was independently observed as NOLOGIN/password NULL/limit1/zero sessions. CUSTODY_INCOMPLETE from `disable()` follows confirmed database revocation but local cleanup/history failure; it does not certify local secret retirement. UNKNOWN denotes uncertain database/transport/termination observation. UNAVAILABLE denotes a checked clean disabled snapshot for which complete custody exclusion still cannot be proven. These outcomes remain distinct from APPLIED credential reconciliation.

Reviewer-authored additional tests passed:

- An incomplete secret-bearing `operation.json.new` plus forced failure of every journal write did not veto NOLOGIN/PASSWORD NULL COMMIT. The established Reader session failed its next SELECT; local outcome remained CUSTODY_INCOMPLETE.
- After the local fault was removed, reconciliation returned UNAVAILABLE and kept durable CUSTODY_INCOMPLETE. Actual SQL instrumentation observed zero replay of the credential-changing DO block. An attempted new initial provision was rejected.
- Repeated disable preserved an unknown file whose filename and contents both carried synthetic secret material. Only boolean/status evidence was exported. Its inode remained unchanged; no filename or value was emitted.
- More than the allowed256 inventory entries returned CUSTODY_INCOMPLETE, never DORMANT. After explicit harness teardown, reconciliation still returned UNAVAILABLE.

Malformed/partial local history is hashed as restricted name/length/digest evidence rather than retained plaintext. Emergency database revocation does not rely on a writable/intelligible journal. Wrong-project/ordinary or insufficient-authority channels remain closed before mutation. An unsafe/unopenable custody root or lock remains a constructor prerequisite; no alternate filesystem authority was introduced.

Repeated disable/recovery does not silently remove unexpected files. Only the three checked owned secret names are eligible for retirement. Unknown files remain for explicit authorized resolution. Checked metadata history remains byte-identical across recovery. Durable incomplete state and actual role/custody checks prevent automatic new provisioning; the procedure contains no retry service or background caller.

### UNKNOWN, lifecycle and regression checks

Original unchanged F1/F2 negative blocks were rerun and remained closed. Real SIGKILL after COMMIT and after candidate-to-active rename recovered APPLIED through actual role observation and candidate authentication, without credential mutation replay. Partial journal/candidate writes, rename/fsync/unlink failures and cleanup uncertainty remained incomplete or UNKNOWN, then UNAVAILABLE after authorized recovery. Damaged history never fabricated successful credential history.

Normal provision/rotation, actual TLS1.3/SCRAM, finite expiry, connection limit1, old credential/session retirement, cancel/timeout/FATAL/malformed expiry/connection loss/interrupted rotation and unconsumed COMMIT recovery passed. The inspected private lifecycle harness changes only disabled-state assertions to UNAVAILABLE and explicitly clears its own incomplete journal between separate synthetic lifecycles after checking disabled state and clean inventory. That test-only reset is not runtime permission to bypass the custody gate; original attack/observer logic and original repository harness are preserved.

**327 affected tests PASS /13 existing platform SKIP /0 FAIL.** Typecheck, lint/UI guard, Backend build, scoped correction/report Markdown formatting, Python/shell syntax, whitespace and preservation checks passed. Historical full Principal SQL/Driver socket matrices and full-repository formatting were not rerun.

Corrected SQL/DDL/audit/error/auto_explain logs, administrator statistics, four observer activity classes, sampled process argv/environment and retained artifacts had zero exact synthetic password/verifier matches in their respective scans. Reviewer-authored controls also scanned secret-bearing journal/filename cases. All four corrected client stderr files were zero bytes. Unsafe original cancel/FATAL controls reproduced their known log leaks and were exported only redacted. Synthetic values/verifiers and unknown secret files were not exported into reports or evidence. Unknown artifacts were removed solely by explicit test teardown after preservation/rejection assertions.

Final actual database observations in both task fixtures were NOLOGIN/password NULL/limit1/zero sessions. Both task fixtures were destroyed, including synthetic database/WAL/custody; nine pre-existing local containers were preserved. Sanitized independent evidence is restricted0700/0600 at `/private/tmp/otr-r3a3b-f3-review-20261010`, containing original/corrected probe results, reviewer controls, scanned logs,327-test counts and source/prior-review hashes.

### Remaining Hosted provisioning limits

This PASS accepts dormant fail-closed code, not complete race-free local custody. Complete custody acceptance remains **UNAVAILABLE** until a separately reviewed prerequisite is established. Actual Hosted build/identity, administrator authentication/termination privileges, Direct Primary TLS, protected H1/ACL readback, host Apport/inspectors, privileged native/transient memory, PANIC, provider logs, SCRAM verifier/WAL/backups and retention/physical erasure remain uncertified. Finite expiry remains after disable; exact original null-expiry H1 restoration is not claimed.

No Hosted query or credential/LOGIN mutation, Production access, Backend injection/deployment, device/Simulator operation, runtime/Composer/C5/C9/provider activation or commit/push/merge/rebase occurred. All those gates remain CLOSED.

**Verdict: F3 fixed. Ready for Dormant-Code Final Owner Acceptance of the fail-closed implementation.**

Not checked: actual Hosted/Apport/PANIC/backup behavior and historical full SQL/socket matrices; complete custody and Hosted provisioning remain gated.

**STOP — R3-A3B F3 FINAL TARGETED INDEPENDENT RECHECK COMPLETE.**
