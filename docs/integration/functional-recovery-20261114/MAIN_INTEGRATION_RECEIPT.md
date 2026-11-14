# Main Integration Receipt — 2026-11-14

## Authorized merge

- Owner Final Main Merge Authorization Gate accepted source `08ad06c9d7391027a27798695e4027ab7f38e491` and Expense closure.
- Fetched GitHub Main: `ec282ce65858f9a9857011b225ed08fce8c8d360`; exact merge base, zero Main-only commits, 342 candidate-only commits through `503eb17d718842bf02deff6b578cbe5bea62cc89`.
- Local restore tag: `main-pre-four-lane-20261114` at the former Main. Original dirty `/Users/xoery/Project/otr-mobile` left untouched.
- Non-fast-forward merge commit: `532b32aa68c86c6cb0dea69fa82404b77a3a42f8`; independent worktree `/Users/xoery/Project/otr-mobile-import/main-final-merge-20261114`.
- Merge tree exactly equals `503eb17d`; differences from accepted `08ad06c9` are documentation/evidence only. No source/configuration merge resolution or incremental product retest required. Final receipt commit is documentation-only; normal non-force push completed `ec282ce6..20775143`; independent `git ls-remote` confirmed `207751439cf144cfbf9097384ddd7461abc0e665`. Worktree clean; accepted source and four-lane ancestry verified. This subsequent status receipt changes documentation only.

## Coverage and compatibility

Import, Auth, Native and MCP accepted closures retained by ancestry through `5a5ca447`, including Recovery and source `08ad06c9`. No old Native snapshot replaces newer Import/Auth. MCP unfinished external capabilities remain default off. See six four-lane delivery documents and Consolidated Merge Gate Report for feature-level evidence/deferred boundaries.

SQLite sequence retained: 76 existing Import definition, 77 local Documents, 78 V3 photo decisions, 79 Auth Parent metadata confirmations. The separate private account profile database migration is not a duplicate main database migration. Installed DEV SQL and Core IMPORT/MANUAL compatibility artifacts retained; no SQL executed by this merge.

Stable source validation reused: 11,964 assertions PASS; 24 failures reproduced on original Main; 162 existing conditional Pending; one external QA158 fixture unavailable (not executed, not PASS). Three baseline TypeScript errors, no new errors. Architecture/UI/scoped checks and full Native source identity checks retain their source08 evidence. Main Merge GO is not Beta Release GO.

## Expense DEV

Owner-authorized fixed image `sha256:427428016a5736ebb9f374d5f86772e7675e6ce0020290ee452e516490db1bdc` deployed healthy, no rollback. Original operation `ledger-operation_mwfnz7vm_g0z2dtlug3` APPLIED; original Expense unique, NZD100 minor, participants/splits consistent. Formal receipts, independent PostgreSQL readback and full App cold restoration already verified. No repeated submission or deployment in this merge task.

## Bounded Settlement Review investigation

Classification: **UNRESOLVED INTERMITTENT READ AVAILABILITY / BETA FOLLOW-UP**, not Settlement PASS and not a proven integration regression.

Earlier post-deployment log sample: four503/nine200; prior retained container sample31×200. Four original request IDs: `9d481656-9462-46e3-ae26-c146504af3a5`, `e2df641d-0c09-4ef1-9102-75dd33bd2643`, `62f73db4-c7f2-478c-aec8-5920a3b6956e`, `a1dcefba-392d-4027-b3a5-24e2c8d7ebc1`. Normalized logs omit method, Trip, Actor and downstream cause; those original requests cannot be reliably assigned.

Limited current check used the existing signed-in complete App and normal Ledger read path; `ledgerReportingCoordinator.pullJourneyLedger` calls `refreshPersonalSettlementReview` GET. No checkpoint POST or Settlement Confirm. During bounded observation, normalized route `/v2/trips/:tripId/settlement-review` produced:

| Request | Status | ms |
|---|---:|---:|
|9244ec0a-fd27-4963-90d8-815e16fc4607|503|1957|
|4fd5ad61-5b1d-4ae3-9974-73d54cd20fef|200|2623|
|32c0bad3-af27-49e2-9a7d-be2fdaa6aea0|200|1992|
|5f4875b6-bfdb-401d-bbe0-e4cfcc29b98a|503|1432|

These logs still cannot prove individual Actor/Trip attribution. Current normal UI retains Recovery Synthetic Expense NZ$1.00. A direct personal-review navigation attempt did not reach the App endpoint and is not counted as success. No credentials copied or disclosed.

Three actual old/new runtime function normalized hashes are identical (`buildPersonalSettlementStatement`, `calculateSettlementPreview`, `calculatePersonalSettlementReview`); evidence in `evidence/expense-p0-closure/settlement-read-code-comparison.json`. Source gateway read fans out to preview, member, lineage and financial-source reads; existing generic failure handling does not identify which dependency failed. SQL/environment unchanged. This evidence does not establish an environmental cause or rule out a latent product bug; it does not identify a new version-specific fault. Per Owner bounded-check policy, preserve the unknown risk as Beta follow-up rather than expanding Recovery. Next targeted task: correlate read failures to dependency stage without financial writes.

## Deferred / next Beta work

Import Slice5/6, full UPDATE, Document Cloud Sync, Hosted MCP Consumer/OAuth, Version/Realtime activation, Flexible/TTR activation and P2 formal manual opt-in remain deferred. Apple system authorization entry is verified; full external identity E2E remains environment-blocked where recorded. Address historical test debt and Settlement read reliability in Beta validation; do not reinterpret this merge as all-feature Beta approval.

No Production deployment, financial finalization, Provider request, schema/ACL/role/grant change or data reset. Push uses normal non-force Main update. Subsequent feature work must start from refreshed GitHub Main, not the protected dirty old local Main.
