# PDF_PRIVATE_UPLOAD_BETA_CAUSAL_V3 — finite CLOSED Source authority

Owner-authorized TIMING03, based on accepted TIMING02 decision. No old profile/evidence reinterpretation.

Profile SHA-256: `c8c017e4aab33ece1067ba3a063af2029e09edf5d6a5ba1b375c069a3268c00b` (UTF-8 profile ID). Version3 issuer `otr-source-pdf-causal-producer/3`; evidence prefixes `otr-source-pdf-beta-ack-v3`, `otr-source-pdf-beta-get-v3`. Same existing journal, staging, quota, private producer principal and Source result/receipt writer. `causal_enabled` remains CLOSED.

`observedAt` is finite canonical six-digit UTC, immutable in the evidence digest, audit-only. It is never clamped or promoted to SOURCE_INSTANT, retention/expiry, freshness or physical terminality. No relative wall-clock bounds for V3. All v1/v2/PNG branches and receipts retain prior rules.

## Protected sequence

`trip_source_pdf_causal_begin` uses existing UPLOAD/PREPARE codec/CAS, reserves the exact immutable bytes/key/account/Trip/Source/Representation epoch and producer identity before dispatch. Source alone sets stage discriminator `pdf_causal_profile_id`; association trigger forbids mixed profiles. Existing stage seal digest protects bytes; V3 seal/dispatch order uses state and commit visibility, keeping finite audit timestamps.

`trip_source_pdf_causal_execute` actions:

- STAGE: immutable exact sealed payload in STARTING.
- DISPATCH: sealed stage and reservation must be committed; only initial owner fence1, no previous dispatch. Source issues one immutable dispatch ID. Stage/attempt locks and the shared transaction advisory lock serialize mutation.
- CONFIRM: before physical write, sole producer confirms dispatch is committed, current scope/CAS/generation and initial owner/fence still match. This is confirmation of the original one-write grant, never a retry/new grant. Producer may invoke IO only while holding the fresh DISPATCH response from the current live execution and after commit confirmation. Replay, takeover or process restart does not authorize another write. Disable SDK retry/upsert.
- ACK: requires committed dispatch/current attempt/generation/owner/fence and complete trusted response bound to exact bytes/key/provider. Immutable full200 body/hash/length/Key/Id validation unchanged. Operational evidence may survive revoked access, but cannot authorize completion.
- READ: only after committed ACK and current access/CAS. Source issues a read permit on the same attempt row, binding random readId, exact ACK evidence digest and current owner/fence. Permit itself must commit before GET evidence. On takeover, a current owner can replace an unused old-fence permit, never existing GET evidence.
- GET: current permit and ACK must be durable, readId must equal Source permit, `read.ackEvidenceSha256` must equal immutable ACK digest. Current access/CAS, exact retained SHA/length/MIME, no-cache and current attempt/owner/fence required. Producer must actually issue a new independent retained read after committed permit, not relabel cached/pre-ACK bytes.
- UNKNOWN: preserve unresolved obligations; no terminality/cleanup/retry inference.

Commit checks use own-row `xmin` versus current transaction xid at enforced READ COMMITTED: a visible row version created by this transaction is not committed; another visible version is committed. Stage and attempt are re-read under existing locks. No wall time, lease, timestamp sort or global transaction-ID order is inferred. Equality test uses explicit xid8→xid conversion; no epoch text comparison. Same-transaction stage→dispatch, dispatch→ACK, ACK→READ and permit→GET fail closed. Source cannot certify external network execution; sole trusted producer must obey commit→IO sequence. SQL does not turn a nonce or a hash into independent provider attestation.

`trip_source_pdf_causal_finish` reuses receipt-first lookup, current Source CAS/access and the one existing custody/result writer; exact current-generation ACK-linked GET closure permits FINAL/APPLIED(PENDING). Existing VERIFY→REGISTER→independent SEAL→Publisher/Core qualify business evidence. Physical execution remains RUNNING/UNKNOWN with termination_outstanding, no IO_QUIESCENT/WRITER_TERMINAL and no release/cleanup. Normal completions and UNKNOWN stages remain in quota.

Lost dispatch/confirmation response or restart before trustworthy completion: inspect immutable journal/receipt, retain UNKNOWN; no re-dispatch. Durable ACK allows a new authorized read if none was stored. Durable GET/FINAL replay returns existing facts; no provider write. Missing ACK plus matching bytes cannot authorize READ/GET/FINAL. No exceptional re-import or cross-Source CREATE authority.

## Agent A/Backend gate

Consume exact V3 DTOs and RPCs; bind configured producer/provider instance, do not accept client-declared authority. Await Source transaction commit, confirm only fresh live dispatch, issue at most one write, durably ACK complete response, acquire/commit Source READ permit, then perform independent no-cache GET and submit proof. Local/deployed provider adapter must prove this ordering; synthetic tests do not establish Supabase behavior. No activation here. Credentials/real Provider/Hosted/Native remain separately gated.
