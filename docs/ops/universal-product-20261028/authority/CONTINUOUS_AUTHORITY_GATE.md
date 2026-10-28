# CONTINUOUS_MINIMUMS — one protected DEV Owning Gate

Status: PREPARED / NOT AUTHORIZED / NOT INSTALLED. Fixed source commit: 41502b12 plus this packet commit.

## Exact boundary

- DEV project `tuqigdxrvrerfewsxqgm`, original `otr-dev-backend` only. Normal Synthetic QA Account `f4b059c5-8241-4ffb-aa15-37fa25474543`, Trip `825f79b2-4a9d-4535-a62e-43000ca50c4a`. No Production or real-user data.
- Existing `trip_sustained_dev_policy` Save flag transitions false→true once with strict five-key `CONTINUOUS_MINIMUMS/1` scope for P1–P6. Absolute SQL expiry `2026-11-01T08:48:56Z`, matching the existing Provider authorization. New Task/Batch/Candidate need their own owning Source, Actor/Trip, original bytes, explicit review, immutable Plan and receipt; no per-object admin window.
- P2 permits only Sparse Flight, existing AKL/CHC issuer/version and synthetic service day 2026-11-02. Qualified Segment, Journey, Booking, Ticket and arbitrary airports/dates remain closed. P5 is the existing TRAIN path. P1/P3/P4/P6 use only approved minimal `CREATE_ITEM` and required details.
- Install replaces six existing function bodies with CAS of exact old hash, owner and ACL; atomic post-hash/owner/ACL/OID check. Native P3 four-function approved postimage is loaded in isolated PG compatibility tests. No new tables/columns/Schema/RLS/GRANT/role or permanent administrator membership. Source intake and Provider budget/secret range are unchanged.
- Existing normal Backend/QA Auth, Core Reader/Mutation, Source, Task and Provider are used. App admission flags for six already-approved minimal types can be configured in the normal DEV build after authority activation; flags alone never grant Server authority.

## Fixed SQL and hashes

- `CONTINUOUS_REVIEW_INSTALL_CANDIDATE.sql` SHA-256 `1d2d4ffc91608ae69cae5230cce2380eeeab7911cc184d40d3b7e628cd1b3e3b`
- `CONTINUOUS_POLICY_ACTIVATE_CANDIDATE.sql` SHA-256 `1ef91bc8b3841c5ca25f7ec6bac876475793250c8757eaba1262f7bbef733db4`
- `CONTINUOUS_POLICY_CLOSE_CANDIDATE.sql` SHA-256 `ea7c0d33d0d244ec34e9c9b752e8ee68933fe2faf70b04d768e1e7a6440d0df6`
- `CONTINUOUS_REVIEW_ROLLBACK_CANDIDATE.sql` SHA-256 `6e685b0c2b31417e93b17199355127d87db5f709eb4fcc2157a01d621ac20e59`
- `CONTINUOUS_REVIEW_POSTIMAGES_CANDIDATE.json` SHA-256 `21984e29410afb0350ffe81b531be3f0ba1b4f60e8a115c379d172bd9c1eb349`
- `NATIVE_P3_DEPENDENCY_BASELINE.sql` SHA-256 `ac83d39cb56267146882b94d3f508ddaf7c7fab3b33f8396b9712ba7c40bf4ea`

Protected function post MD5:
- `trip_sustained_import_p1_capabilities(uuid,uuid)` `9f01606ec37c03662c7d9d828cae9ef9`
- `trip_sustained_import_p1_guard(text,text,jsonb,jsonb,uuid,uuid)` `488f5fe1537d450b610ef7c5e22eb53b`
- `trip_core_guard_historical_source_association()` `fb315854dee6942f552a647fb851abfb`
- `trip_core_publication_guard()` `6ff1c65d9389341e889eb8258c6659af`
- `trip_core_finite_read_state_guard()` `c8d64a12edd7e92a738a536e34071fb4`
- `trip_core_resolve_airport(text,text,text,date)` `40f537b189fd972423e63b2be4023a12`

## Execution and closure

1. Wait for Native to release its exclusive DEV lease. Independently verify current service/image/health, actual DEV project, QA Actor/Trip, closed Save flag/scope and dormant two-airport rows. Freshly compare all six live function preimages with the packet; especially verify the installed Native P3 `trip_core_finite_read_state_guard` full hash and its other three dependencies. Any drift aborts; this packet is not a rebase permission.
2. Install only the fixed default-closed SQL transaction. Confirm six full postimages, OIDs, owners and ACLs, with flag false/scope NULL and airports still disabled. Deploy only a normal unchanged-permission Backend image under Standing Deployment Authorization if required, with latest healthy rollback and normal QA readback.
3. Confirm existing Provider scope/remaining budget, QA identity, normal Task/Source read, and DEV health. Activate the fixed scope+two existing dormant airports in one transaction; duplicate activation must fail. Execute a small new Synthetic QA Batch using normal Native flow and exact evidence; no paid retry of UNKNOWN. Independently read accepted Item/receipt and Native recovery.
4. At finish or earlier risk, run fixed CLOSE transaction to clear this Actor Save flag/scope and disable only the same two airport records; independently read back the policy, resolver expiry behavior and QA Result/Item. The SQL expiry also closes new Save/resolver use if the process or close controller fails. Accepted Source journals may finish against the exact existing receipt after close; no new Core Create is permitted.
5. Function rollback is optional after accepted Source has reached COMPLETE. Reverse-hash rollback refuses an accepted unfinished Source. Never delete the accepted Item, receipt, Source or original to force closure. Preserve previous healthy image; do not restore over newer Native deployments.

## Evidence and stop conditions

Isolated network-none/256MiB PG passed six-function install including wrong-postimage atomic rollback/repeated-install denial, actual Native P3 four-function postimage compatibility, continuous P6 and fresh-identity Sparse P2 Source→Plan→Core→closed recovery/replay, activation CAS and idempotent close/scope-drift refusal. Independent Source candidate and policy review found no blocker; the UI hide/reopen race has been repaired and covered by both completion orders in directed tests. These are LOCAL_PASS, not Hosted PASS.

STOP this protected step on live hash/role/config drift, unmet normal Auth/Trip/Source proof, Provider UNKNOWN or budget exhaustion, loss of closure ability, or any cross-account access. Ordinary local product work continues.

No broader business authority, Role, GRANT, RLS, Schema, Secret access or Provider budget is requested.
