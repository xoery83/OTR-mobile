# Exact settled Results recovery Gate

Status: READY_FOR_EXACT_OWNER_AUTHORIZATION; NOT EXECUTED.

## Actual evidence and narrow need

D13 made exactly one real DeepSeek call. Immutable owning Call is TERMINAL and COMPLETION SUCCEEDED; request d9718019-e6cb-4b69-b715-cc924a620e2c,3457tokens,USD0.00099012. Native90s POST timed out before settlement, and finite expiry occurred before Task publication. Raw response remains anchored (SHA7c1022a36e52df4d0db38bb7446b18b031f8feef2c1f9ade8d970543a2e3b6c6); Task RUNNING/result NONE. D13 watchdog CLOSED_VERIFIED; no repeated paid request.

Current Operator allowance has42 consumed requests, including15 of16 fresh requests. It has1 fresh request remaining. Recovery must retain the original owning Source Reader. Its startup cache refresh plus two current-material checks and immutable completion require at least6 business reads before independent recovery readback. We do not exceed or reset this ledger.

## Exact candidate

- Code: `02f874a2cc33d8fa48444a3a1a6e07d526ce1975`.
- Image: `sha256:33272c2a5a820a1cc6469b7cbf10b9ec2a26e3a8164587052ee76f9e566fb051`.
- Accepted rollback image: `sha256:40e998c31815a77452dd52dbbd6d8789ea8a815a6d1afba068029e97e919bbaa`.
- CLI bundle: `2b1af939a8f14b7c02e7ccca919a346a13aa5f66424982bab15e2af99ef4b7e1`.
- Existing DEV Backend otr-dev-backend; Supabase DEV tuqigdxrvrerfewsxqgm only.

## Requested execution

1. One exact candidate image replacement using the reviewed retained-baseline deployment/rollback mechanism. Preserve normal Trip/P1 configuration, mounts, user, data and permissions. No DEV rebuild.
2. One finite settled-only recovery window: Root records actual UTC start before activation; read/publish Host lifetime <=600seconds, independent watchdog/role close <=900seconds. Reuse existing watchdog and exact retained-container rollback. Do not renew original Task deadline.
3. Only existing principals otr_external_integration_call_gateway and otr_trip_source_command_gateway may temporarily LOGIN for their existing owning read RPCs; expiry and independent NOLOGIN/session closure bind to that window. The exact existing SourceScope pins permit only the same already-accepted three Source commands; its use here is exclusively the original Source Reader. No Source command HTTP port is mounted. No new role, GRANT, RLS, ProviderScope or CP14/admin activation. The original Source qualification (including registration/revision/ancestry) remains authoritative; generic Catalog cannot replace it.
4. Mount only protected recovery config and original D13 Backend custody/SQLite; no App SQLite/session copy, no Provider key/environment mount. Normal Synthetic Auth may legitimately refresh. No Auth users/profile changes.
5. Restore only the already-created Task cd36d6f4-a09b-41ef-977e-bb4127920d7f / Attempt b8e1e9a0-0b36-4df7-8a95-5de7cb35fb8a / Call43678b0c-05c4-4dbb-8478-13716c55964d / Batch5bafa531-7fd4-4b50-bb63-a016c55cb427. Exact original Account1f65e932-b6d8-4ea4-9cc9-fe9da331b424 and Trip9a5b7ef6-db4c-4b33-be42-406cdfd292ab, same3Sources/Run. No new Task/Attempt/Source/Run/paid call or canonical business objects.
6. Existing owning CAS/result install only after current Auth/Trip/Source plus real successful completion/raw/request hashes pass. Native existing GET context/results renders original real candidates and cold reopen within window. POST remains closed.
7. Append at most8 additional individually counted Operator business read requests to the same ledger, preserving all42 entries and current prefix. Existing Native136 maximum unchanged (116 used). No paid budget increase: one call already consumed, all recovery paths structurally lack Provider/send/reserve.

## Validation and stop conditions

Root TypeScript PASS; focused6suites40PASS/1Linuxskip; Writer network-none Linux actual SQLite/anchoredcustody recovery PASS including late completed install, cold reopen, GET200/POST503 and revoked Auth. Exact final image network-none smoke PASS (Health200/protected401/uid10001/default CLOSED). Independent Source-Reader fix review PASS; original weaker Catalog mapper is removed. Receipts are attached.

Stop before mutation on identity/hash/Source/permission drift, missing completion, cancelled/stale Task, unexpected prior publication or inability to arm independent close. UNKNOWN local publication is reconciled by same Task/result pin, never Provider retry. On runtime/compatibility failure restore exact40e image/config; failed close/rollback becomes RECONCILE_REQUIRED. Preserve all Sources, raw response, Task and immutable receipts. Production, real users, history, SQL/schema/ACL changes, Admission/Booking/Ticket rights and other queues remain prohibited.

This Gate requests only a fixed recovery deployment, finite existing-principal read operation and8 additional reads. It does not claim Native Results or formal Admission PASS.
