# Strict TLS and bounded partial continuation

Prepared candidate only. The previous actual attempt is safely CLOSED_VERIFIED and immutable. Its new summary charges cumulative reads8/mutations0: two normal logins/getUser, existing own profiles (no inserts), canonical empty read and two Create receipt-first GETs returned503. No Create POST occurred. Queue is exact original CREATE_TRIP, RETRYABLE, attempt_count2, TRIP_CREATE_UNAVAILABLE. Original request/identity/SQLite remain intact.

## Exact diagnosis

The original B Node runtime fails a credential-free PostgreSQL SSLRequest/TLS handshake with SELF_SIGNED_CERT_IN_CHAIN. Official Supabase Studio `SSLConfiguration.tsx` uses `useCustomContent(['ssl:certificate_url'])`; its official `hooks/custom-content/custom-content.json` publishes `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/${env}/ssl/${env}-ca-2021.crt`. Production public root downloaded over HTTPS has SHA256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`. The same actual B Node runtime with this CA, rejectUnauthorized=true and exact hostname now reports TLS_VERIFIED. Neither probe authenticated or sent SQL. This proves a concrete transport blocker; it does not prove that every later SQL/authorization/result check will succeed.

Official documentation: https://supabase.com/docs/guides/platform/ssl-enforcement and https://supabase.com/docs/guides/database/connecting-to-postgres . Provenance and actual receipts in `/private/tmp/otr-c-recovery-execution-20261023/{OFFICIAL_CA_PROVENANCE.json,OFFICIAL_SSLConfiguration.tsx,ACTUAL_B_NODE_TLS_READONLY.json,ACTUAL_B_PINNED_CA_TLS_READONLY.json}`.

## Minimal fix and scope

- Add public CA to the existing strict `tripPg.ca`/`metadataPg.ca` runtime fields. Whole manifest pins it; service refuses any other SHA before activation. No extra mount/image/Backend deployment/Schema/grant, no change to TLS verification.
- Resume phase EXACT_RECEIPT_ONLY_FAILURE_CREATE requires the actual fixed prior summary hash, reads8/mutations0/CLOSED_VERIFIED/no accepted Create/Edit plus exact owning local request and RETRYABLE attempt2/error503. No reset or conversion of queue. Only A login/getUser/own-profile check; no repeat B login or initial empty read. Actual receipt-first still precedes Create POST.
- Complete Create/linked Ledger NZD owning readback and SQLite recovery, Edit valid snapshot/V2 queue/receipt/readback/reopen, then original immutable Create receipt readback. Skip real replay/collision/B denial and Currency under the remaining cap; report these NOT_RUN/BLOCKED_BY_READ_BUDGET. Existing L2 evidence stays distinct.
- Expected cumulative reads15/16, mutations2/8. One remaining read can recover an UNKNOWN receipt only; never repost an unknown command or refund attempts. Any added GET/automatic bootstrap reserves budget before wire. If a dependency fails, preserve partial evidence and close immediately.

## Final synthetic password recovery boundary

Only A's proven current-scope new identity may receive one additional password-only PUT: cumulative A<=2/B<=1. The first A PUT must have retained exact identity receipt and HTTP200 (not UNKNOWN). Fresh exact ID/email/created_at still required. Separate durable reservation advances existing counts before wire; a second unknown or failure cannot be retried. No B PUT/creation, no private metadata/email/role changes. Existing key stays in original container. Previous proof/result files remain unchanged; ordinal2 uses distinct files. New password stays only in memory; no process introspection/secret export.

The prior controller held memory but lacked a command route to reuse it. The new minimal `private_memory_control.py` is tested for initial failure -> explicit fixed continuation with the same object and monotonically increasing callback counter -> release. No eval/arbitrary commands or automatic continuation; EOF holds. Actual executor must independently validate fresh reviewed manifest, exact prior state and cumulative counts before dispatch; failed proof stops without wire. Do not assume the prior headless Auth token survives a child exit: one new A password login/getUser is explicitly required and counted separately.

## Validation and readiness

10 Node local-loopback/real-QA-SQLite tests PASS; 22 Python tests PASS including pinned-CA rejection, existing serial-lock/service restoration, final A-only reservation limit and private-memory control. Initial reservation test found an increment bug, fixed before any execution. TypeScript and scoped ESLint PASS. Existing CA strict-TLS actual probe is readonly, not an authenticated SQL or Cloud E2E PASS. Candidate requires independent boundary Review before new Auth/finite activation. Choose fresh <=900s window only after preparation and Review; old00:30–00:45 window is expired.

## Data Path Checklist

1. Existing Trip/Ledger Cloud contracts unchanged; password/session transient only.
2. Preserve original QA SQLite, request and all previous receipts; dedicated ordinal journals only, no secrets persisted.
3. Same repositories/queue/workers/transports; existing optional CA config, no new authority.
4. Receipt-first, immutable operation, exact revision/identity, cumulative budget, no UNKNOWN repost, finite closure.
5. L2 isolated tests as above; strict TLS readonly actual evidence; L1 Native not run, L3 business paths still blocked until actual accepted/readback/client recovery.
6. Remaining: independent Review, final A-only recovery, bounded Create/Ledger/Edit, exact currentB safe closure. Currency remains read-budget blocked.
