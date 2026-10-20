# R3 Ledger initialization — installed and Owner accepted

2026-10-08. Target DEV: `tuqigdxrvrerfewsxqgm`.
Forward `otr-r3-dev-v1-ledger-init-1` committed exactly once and passed Hosted
verification. Owner accepted the rebuild/forward and 36 bounded Hosted checks.
**Do not rerun this installed SQL or the original R3 destructive transaction.**

| Provenance | Exact value |
| --- | --- |
| Forward SQL | `202610080001_fresh_trip_ledger_initialization.sql` |
| Forward SHA-256 | `983674336ac12bffb7746a4d76fc0c79c53b7b3dfec307aaf1875d00aa55f4f2` |
| Resulting OTR catalog | `c9adf99f4818b32d6aca81d22d3a17bc7ccd935652b59f95016fa19cb9982906` |
| Resulting function definition | `73de5cd814b1b1feafc4bf08418a3c402708c80fd87e38119b64f7d1104ada1c` |
| Parent baseline | `otr-r3-dev-v1` |
| Frozen baseline SHA-256 | `f065259a9cda07cc3c43008be06a975b42ce8534be16d35b7d83987852e01f52` |
| Original cutover SHA-256 | `c65d5c2c5b0b21eb22f82da96654c0254714496f5535fd23cb22b8f4062878c2` |
| SQL artifact origin | `a817e8e881e2fa2e094696b13bc4df2eca7e2db2` |
| Approved rebuild canonical | `b6daffecedab1616b173fde3f5e2de5d54770eff` |
| Forward implementation base | `4f97bb6f96daaab7f96f19d192683f63846a413b` |
| Current canonical main, read-only verified | `c2f1524aa492ecf32982de6a52c7166bf45715e0` |

Only existing OTR function `public.add_trip_creator_as_journey_member()` changes,
plus its versioned function comment. Trip creator/linked owner logic remains;
ordinary Trip creation atomically inserts unique NZD/scale2/REFERENCE_RATE settings
with ON CONFLICT DO NOTHING. postgres owner, SECURITY DEFINER search_path/ACL,
RLS/FORCE RLS and protected roles remain. No new platform function body hash pins,
endpoint, role, scheduler or table. No existing Trip backfill or legacy Ledger import.

This is a separate forward artifact, not an invented historical migration record.
Original R3 lineage and full68 history rows/hash remain unchanged; Server1–84 and
SQLite1–50 source inputs remain byte-identical. Original frozen baseline/cleanup/
verifier remain in `/private/tmp/otr-r3-lightweight-dev-rebuild/supabase/dev-baselines/r3-v1`;
private backups are preserved outside Git. This folder is not a standalone baseline
installer; historical report relative baseline links refer to that original worktree.

Local retained validation: two fresh network-none PostgreSQL17 installs, each29
initialization/authority and24 CLOSED assertions; real local PostgREST + Backend
bootstrap, focused78 Backend regressions, typecheck/lint/UI guard/build PASS.
`local-validation.json` and `local-bootstrap-validation.json` are local evidence,
not Hosted results. Existing local-only rehearsal scripts depend on retained
original R3/platform fixtures and disposable containers; do not run them on Hosted.
They were not rerun during documentation-only closure.

Hosted accepted fixtures: Profiles2/Trips2/members4/settings2/Expenses2/Receipt1/
finalized settlement1; Account isolation, idempotent replay, private Storage and
final preservation PASS. Backend healthy; all CLOSED gates remain; provider calls0.
Device first-sync/re-enable remains unaccepted; old outboxes stay quarantined.
No replay/wipe/reset/logout/rebind.

[Execution report](../../../docs/architecture/OTR_R3_SAME_PROJECT_DEV_REBUILD_REPORT.md)
and [correction report](../../../docs/architecture/OTR_R3_FRESH_TRIP_LEDGER_INITIALIZATION_CORRECTION_REPORT.md)
preserve original stage evidence with appended Owner acceptance.
