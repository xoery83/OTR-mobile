# Schema Manifest Reconciliation Report

Status: **SCHEMA MANIFEST RECONCILIATION COMPLETE — REVIEW PENDING**.
Date: 2026-10-03 (Pacific/Auckland).
Scope: repository foundation verification only; no product implementation.

## A. Baseline HEAD

- Working directory: `/Users/xoery/Project/otr-mobile-canonical`.
- Branch: `integration/ledger-polish-canonical`.
- Baseline HEAD: `92862af19500275202b0f53b3f96b088029474f4`.
- Startup `git status --short`: empty. Expected branch and clean-workspace gate PASS.
- No remote environment, legacy checkout, application DB or existing developer DB
  was used as schema authority.

## B. Original mismatch and exact cause

The committed manifest last changed in `a655257` and describes the retained chain
through `20260924000300_personal_payment_fx_bounded_backfill.sql`. A new isolated
replay of that exact prefix reproduces **every committed metric and checksum**.
Thirteen subsequent retained migrations legitimately changed the schema without
refreshing the manifest or the verifier's independent count assertions. This is
artifact drift, not a migration replay failure and not solely Expense v2 drift.

| Metric      | Old committed | Current full replay | Delta |
| ----------- | ------------: | ------------------: | ----: |
| tables      |           105 |                 107 |    +2 |
| rls_tables  |           105 |                 107 |    +2 |
| columns     |          1470 |                1488 |   +18 |
| constraints |           814 |                 824 |   +10 |
| indexes     |           344 |                 349 |    +5 |
| functions   |           123 |                 141 |   +18 |
| triggers    |           108 |                 114 |    +6 |
| policies    |           178 |                 178 |    +0 |
| buckets     |             3 |                   3 |    +0 |

Old schema checksum: `6616a88591a750f8a8345021deb5268c71a327339ae3dc6da9a7527a8c689822`.
Current schema checksum: `201f6b0f42a50e6185233a07604f06907e71bec0dca372645949100cb95c1897`.
Final migration: `20260930000100_expense_participation_preserve_valuation.sql`.

## C. Clean replay method

Used installed Supabase CLI 2.117.0, cached Supabase PostgreSQL image
`public.ecr.aws/supabase/postgres:17.6.1.167`, PostgreSQL 17 and the running Colima
engine. Each project has a unique container/volume and distinct localhost ports.
No linked-project state, credentials or remote configuration was copied.
Only PostgreSQL services were started. The synthetic canonical seed was retained
because the native validation flow and SQL tests require it.

Evidence directory: `/private/tmp/otr-schema-reconciliation`.

| Project  | DB container suffix   | Local DB port | Method                                                                                                         |
| -------- | --------------------- | ------------: | -------------------------------------------------------------------------------------------------------------- |
| proof-a  | `otr-schema-proof-a`  |         55422 | New volume; CLI prefix replay, then all 13 forward migrations individually with ON_ERROR_STOP and transactions |
| proof-b  | `otr-schema-proof-b`  |         55522 | New volume; CLI replays all 64 retained migrations in order and seeds                                          |
| verify-a | `otr-schema-verify-a` |         55622 | New volume; full CLI replay, then repository-native fresh resets/tests/comparison/diff                         |
| verify-b | `otr-schema-verify-b` |         55722 | Independent new volume; same final verification                                                                |

`proof-a/historical.json` matches the old committed manifest exactly.
`trace.py` captures counts and the **unchanged** `object_lines` CTE from
`supabase/schema_manifest.sql` before and after each later migration; the capture
uses `jsonb_agg(value order by value)` to retain multiline function definitions.
Artifact identity keys separate definition changes from additions. Definitions
are compared verbatim; no meaningful schema content is normalized away.
`drift.json` and per-migration `.objects.json` preserve the complete local evidence.
All tail migrations returned successfully before comparison was attempted.

Full retained-chain SHA-256 (sorted filename + NUL + file bytes + NUL):
`4325f4e7d996824c5f28a416aeca685406f307b22b41c0fc2b91661f1671db46`.

Representative commands, with an absolute installed CLI and isolated project cwd:

```bash
supabase start --workdir /private/tmp/otr-schema-reconciliation/proof-b \
  -x gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
docker exec -i supabase_db_otr-schema-proof-b \
  psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < supabase/schema_manifest.sql > /private/tmp/otr-schema-reconciliation/proof-b/final.json
node scripts/supabase/compare-manifests.mjs \
  supabase/schema-manifest.json /private/tmp/otr-schema-reconciliation/proof-b/final.json
```

## D. Complete explained drift

**All entries below: EXPECTED FROM RETAINED MIGRATION.**
UNEXPECTED: zero. UNKNOWN: zero. Net inventory: 61 added identities, zero removed
identities, 10 changed existing identities (3,250 → 3,311 object records). Function
renames followed by wrappers preserve the old identity and add the `_pre_v2`
identity. The chronological list also records changes to newly added objects.

### `20260925000100_ledger_economic_date_completion.sql`

Adds date-completion RPC; replaces finalized-mutation guard and modifies three demand scanners plus valuation admission for later current revisions.

Added identities:

- `function|ledger_complete_expense_economic_date_v1(uuid,uuid,uuid,bigint,date,text,text,text,jsonb)`

Removed identities: none.

Changed identities:

- `function|ledger_apply_valuation_5_1(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb)`
- `function|ledger_claim_settlement_rate_demands(uuid,integer)`
- `function|ledger_guard_finalized_expense_mutation()`
- `function|ledger_list_auto_reference_demands(integer)`
- `function|ledger_list_settlement_auto_reference_demands(uuid,integer)`

### `20260925000200_ledger_valuation_revision_guard_fix.sql`

Qualifies the valuation revision comparison to remove the PL/pgSQL column-name collision.

Removed identities: none.

Changed identities:

- `function|ledger_apply_valuation_5_1(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb)`

### `20260925000300_settlement_adjustment_current_source.sql`

Adds current-source Adjustment read and replaces Adjustment finalization to compare that source.

Added identities:

- `function|ledger_adjustment_source_current_7_2c(uuid,timestamp with time zone)`

Removed identities: none.

Changed identities:

- `function|ledger_finalize_adjustment_7_2b(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text,boolean,boolean,text,text)`

### `20260926000100_my_ledger_lightweight_snapshot.sql`

Adds the My Ledger snapshot function and partial Journey-conflict lookup index.

Added identities:

- `function|my_ledger_lightweight_snapshot_2_0(uuid,text,timestamp with time zone,timestamp with time zone)`
- `index|ledger_idempotency_keys_conflict_journey_idx`

Removed identities: none.

### `20260927000100_expense_attachment_limit.sql`

Adds attachment-limit function and parent-serialized receipt trigger.

Added identities:

- `function|ledger_limit_expense_attachments()`
- `trigger|receipt_assets|receipt_assets_expense_attachment_limit`

Removed identities: none.

### `20260927000200_expense_attachment_tombstones.sql`

Adds nullable receipt deletion time, Expense-only tombstone check and active-attachment index; updates limit function and trigger event columns.

Added identities:

- `column|receipt_assets|18|deleted_at`
- `constraint|receipt_assets|receipt_assets_expense_tombstone_only`
- `index|receipt_assets_active_expense_idx`

Removed identities: none.

Changed identities:

- `function|ledger_limit_expense_attachments()`
- `trigger|receipt_assets|receipt_assets_expense_attachment_limit`

### `20260927000300_receipt_storage_provider.sql`

Adds non-null receipt provider with supabase_storage default and length check.

Added identities:

- `column|receipt_assets|19|storage_provider`
- `constraint|receipt_assets|receipt_assets_storage_provider_check`

Removed identities: none.

### `20260928000100_settlement_review_exact_decimal_source.sql`

Replaces personal financial source to carry decimal rates as exact text.

Removed identities: none.

Changed identities:

- `function|ledger_personal_financial_source_3b(uuid,timestamp with time zone)`

### `20260929000100_expense_consistency_v2.sql`

Adds two eight-column, RLS-enabled immutable evidence/outcome tables, eight constraints, three indexes and five triggers. Adds nine new v2 functions, retains two renamed legacy implementations and installs wrappers at the existing identities; also changes the shared legacy mutation function tombstone guard.

Added identities:

- `column|expense_conflict_outcomes_v2|1|conflict_id`
- `column|expense_conflict_outcomes_v2|2|resolution_key_id`
- `column|expense_conflict_outcomes_v2|3|lifecycle`
- `column|expense_conflict_outcomes_v2|4|reason`
- `column|expense_conflict_outcomes_v2|5|superseded_by_command_id`
- `column|expense_conflict_outcomes_v2|6|resulting_revision`
- `column|expense_conflict_outcomes_v2|7|operation_receipt`
- `column|expense_conflict_outcomes_v2|8|created_at`
- `column|expense_revision_evidence|1|receipt_id`
- `column|expense_revision_evidence|2|expense_id`
- `column|expense_revision_evidence|3|revision`
- `column|expense_revision_evidence|4|canonical`
- `column|expense_revision_evidence|5|canonical_digest`
- `column|expense_revision_evidence|6|observed_base`
- `column|expense_revision_evidence|7|observed_base_digest`
- `column|expense_revision_evidence|8|created_at`
- `constraint|expense_conflict_outcomes_v2|expense_conflict_outcomes_v2_conflict_id_fkey`
- `constraint|expense_conflict_outcomes_v2|expense_conflict_outcomes_v2_lifecycle_check`
- `constraint|expense_conflict_outcomes_v2|expense_conflict_outcomes_v2_pkey`
- `constraint|expense_conflict_outcomes_v2|expense_conflict_outcomes_v2_resolution_key_id_fkey`
- `constraint|expense_revision_evidence|expense_revision_evidence_expense_id_fkey`
- `constraint|expense_revision_evidence|expense_revision_evidence_pkey`
- `constraint|expense_revision_evidence|expense_revision_evidence_receipt_id_fkey`
- `constraint|expense_revision_evidence|expense_revision_evidence_revision_check`
- `function|ledger_capture_expense_evidence_v2()`
- `function|ledger_execute_expense_v2(uuid,uuid,uuid,jsonb,text,bigint,jsonb,text,jsonb,jsonb,jsonb)`
- `function|ledger_expense_audit_evidence_v2()`
- `function|ledger_expense_causal_base_v2(uuid,uuid,uuid,jsonb)`
- `function|ledger_expense_chain_v2(uuid,uuid)`
- `function|ledger_expense_evidence_projection_v2(jsonb)`
- `function|ledger_list_expense_chain_metadata_v2(uuid)`
- `function|ledger_record_conflict_4c_pre_v2(uuid,uuid,uuid,text,text,text,jsonb)`
- `function|ledger_reject_completed_expense_receipt_v2()`
- `function|ledger_replay_expense_v2(uuid,uuid,uuid,jsonb,text,jsonb)`
- `function|ledger_resolve_expense_conflict_4c_pre_v2(uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,text,jsonb)`
- `index|expense_conflict_outcomes_v2_pkey`
- `index|expense_revision_evidence_lookup`
- `index|expense_revision_evidence_pkey`
- `rls|expense_conflict_outcomes_v2`
- `rls|expense_revision_evidence`
- `table|expense_conflict_outcomes_v2`
- `table|expense_revision_evidence`
- `trigger|expense_audit_events|expense_audit_evidence_v2`
- `trigger|expense_conflict_outcomes_v2|expense_conflict_outcomes_v2_immutable`
- `trigger|expense_revision_evidence|expense_revision_evidence_immutable`
- `trigger|ledger_idempotency_keys|ledger_completed_expense_receipt_v2`
- `trigger|ledger_idempotency_keys|ledger_idempotency_expense_evidence_v2`

Removed identities: none.

Changed identities:

- `function|ledger_mutate_expense_4b_pre_settlement_participation(uuid,uuid,uuid,text,bigint,text,text,text,jsonb)`
- `function|ledger_record_conflict_4c(uuid,uuid,uuid,text,text,text,jsonb)`
- `function|ledger_resolve_expense_conflict_4c(uuid,uuid,uuid,uuid,bigint,text,jsonb,text,text,text,jsonb)`

### `20260929000200_latest_state_rate_acceptance.sql`

Adds rate-acceptance rebase predicate and changes v2 execution admission guards.

Added identities:

- `function|ledger_rate_acceptance_rebase_v2(jsonb,jsonb,jsonb)`

Removed identities: none.

Changed identities:

- `function|ledger_execute_expense_v2(uuid,uuid,uuid,jsonb,text,bigint,jsonb,text,jsonb,jsonb,jsonb)`

### `20260929000300_legacy_expense_equivalent_resolution.sql`

Adds verified legacy no-op predicate and extends the v2 equivalent-resolution admission.

Added identities:

- `function|ledger_legacy_expense_noop_v2(jsonb,jsonb)`

Removed identities: none.

Changed identities:

- `function|ledger_execute_expense_v2(uuid,uuid,uuid,jsonb,text,bigint,jsonb,text,jsonb,jsonb,jsonb)`

### `20260929000400_adjustment_lossless_source_transport.sql`

Adds lossless Adjustment source text transport.

Added identities:

- `function|ledger_adjustment_source_text_7_2c(uuid,timestamp with time zone)`

Removed identities: none.

### `20260930000100_expense_participation_preserve_valuation.sql`

Changes the existing v2 execution function to preserve valuation/splits for participation-only edits.

Removed identities: none.

Changed identities:

- `function|ledger_execute_expense_v2(uuid,uuid,uuid,jsonb,text,bigint,jsonb,text,jsonb,jsonb,jsonb)`

### Added non-function definitions

Exact catalog lines below include column order/type/nullability/default, named
constraints, index definitions, RLS state and triggers. These correspond to the
identities already attributed above. Policies/buckets are unchanged.

```text
column|expense_conflict_outcomes_v2|1|conflict_id|uuid|t|
column|expense_conflict_outcomes_v2|2|resolution_key_id|uuid|t|
column|expense_conflict_outcomes_v2|3|lifecycle|text|t|
column|expense_conflict_outcomes_v2|4|reason|text|t|
column|expense_conflict_outcomes_v2|5|superseded_by_command_id|text|f|
column|expense_conflict_outcomes_v2|6|resulting_revision|bigint|t|
column|expense_conflict_outcomes_v2|7|operation_receipt|jsonb|t|
column|expense_conflict_outcomes_v2|8|created_at|timestamp with time zone|t|now()
column|expense_revision_evidence|1|receipt_id|uuid|t|
column|expense_revision_evidence|2|expense_id|uuid|t|
column|expense_revision_evidence|3|revision|bigint|t|
column|expense_revision_evidence|4|canonical|jsonb|t|
column|expense_revision_evidence|5|canonical_digest|text|t|
column|expense_revision_evidence|6|observed_base|jsonb|f|
column|expense_revision_evidence|7|observed_base_digest|text|f|
column|expense_revision_evidence|8|created_at|timestamp with time zone|t|now()
column|receipt_assets|18|deleted_at|timestamp with time zone|f|
column|receipt_assets|19|storage_provider|text|t|'supabase_storage'::text
constraint|expense_conflict_outcomes_v2|expense_conflict_outcomes_v2_conflict_id_fkey|FOREIGN KEY (conflict_id) REFERENCES ledger_idempotency_keys(id) ON DELETE RESTRICT
constraint|expense_conflict_outcomes_v2|expense_conflict_outcomes_v2_lifecycle_check|CHECK (lifecycle = ANY (ARRAY['RESOLVED'::text, 'SUPERSEDED'::text]))
constraint|expense_conflict_outcomes_v2|expense_conflict_outcomes_v2_pkey|PRIMARY KEY (conflict_id)
constraint|expense_conflict_outcomes_v2|expense_conflict_outcomes_v2_resolution_key_id_fkey|FOREIGN KEY (resolution_key_id) REFERENCES ledger_idempotency_keys(id) ON DELETE RESTRICT
constraint|expense_revision_evidence|expense_revision_evidence_expense_id_fkey|FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE RESTRICT
constraint|expense_revision_evidence|expense_revision_evidence_pkey|PRIMARY KEY (receipt_id)
constraint|expense_revision_evidence|expense_revision_evidence_receipt_id_fkey|FOREIGN KEY (receipt_id) REFERENCES ledger_idempotency_keys(id) ON DELETE RESTRICT
constraint|expense_revision_evidence|expense_revision_evidence_revision_check|CHECK (revision > 0)
constraint|receipt_assets|receipt_assets_expense_tombstone_only|CHECK (deleted_at IS NULL OR expense_id IS NOT NULL)
constraint|receipt_assets|receipt_assets_storage_provider_check|CHECK (char_length(storage_provider) >= 1 AND char_length(storage_provider) <= 64)
index|expense_conflict_outcomes_v2_pkey|CREATE UNIQUE INDEX expense_conflict_outcomes_v2_pkey ON public.expense_conflict_outcomes_v2 USING btree (conflict_id)
index|expense_revision_evidence_lookup|CREATE INDEX expense_revision_evidence_lookup ON public.expense_revision_evidence USING btree (expense_id, revision)
index|expense_revision_evidence_pkey|CREATE UNIQUE INDEX expense_revision_evidence_pkey ON public.expense_revision_evidence USING btree (receipt_id)
index|ledger_idempotency_keys_conflict_journey_idx|CREATE INDEX ledger_idempotency_keys_conflict_journey_idx ON public.ledger_idempotency_keys USING btree (journey_id) WHERE (response_status = 409)
index|receipt_assets_active_expense_idx|CREATE INDEX receipt_assets_active_expense_idx ON public.receipt_assets USING btree (expense_id) WHERE ((expense_id IS NOT NULL) AND (deleted_at IS NULL))
rls|expense_conflict_outcomes_v2|t|f
rls|expense_revision_evidence|t|f
table|expense_conflict_outcomes_v2
table|expense_revision_evidence
trigger|expense_audit_events|expense_audit_evidence_v2|CREATE TRIGGER expense_audit_evidence_v2 BEFORE INSERT ON expense_audit_events FOR EACH ROW EXECUTE FUNCTION ledger_expense_audit_evidence_v2()
trigger|expense_conflict_outcomes_v2|expense_conflict_outcomes_v2_immutable|CREATE TRIGGER expense_conflict_outcomes_v2_immutable BEFORE DELETE OR UPDATE ON expense_conflict_outcomes_v2 FOR EACH ROW EXECUTE FUNCTION ledger_reject_immutable_change()
trigger|expense_revision_evidence|expense_revision_evidence_immutable|CREATE TRIGGER expense_revision_evidence_immutable BEFORE DELETE OR UPDATE ON expense_revision_evidence FOR EACH ROW EXECUTE FUNCTION ledger_reject_immutable_change()
trigger|ledger_idempotency_keys|ledger_completed_expense_receipt_v2|CREATE TRIGGER ledger_completed_expense_receipt_v2 BEFORE DELETE OR UPDATE ON ledger_idempotency_keys FOR EACH ROW EXECUTE FUNCTION ledger_reject_completed_expense_receipt_v2()
trigger|ledger_idempotency_keys|ledger_idempotency_expense_evidence_v2|CREATE TRIGGER ledger_idempotency_expense_evidence_v2 AFTER INSERT OR UPDATE ON ledger_idempotency_keys FOR EACH ROW EXECUTE FUNCTION ledger_capture_expense_evidence_v2()
trigger|receipt_assets|receipt_assets_expense_attachment_limit|CREATE TRIGGER receipt_assets_expense_attachment_limit BEFORE INSERT OR UPDATE OF expense_id, deleted_at ON receipt_assets FOR EACH ROW EXECUTE FUNCTION ledger_limit_expense_attachments()
```

## E. Determinism proof

Before modifying canonical artifacts, `proof-a/final.json` and
`proof-b/final.json` were byte-identical (`cmp` exit 0). Their entire object
inventories were also byte-identical (`cmp` exit 0), including every function body,
constraint, index, trigger, column, policy, RLS flag and bucket in manifest scope.

- Raw generated manifest file SHA-256:
  `1ca9c99f25614c61a23701ea0fc43312a927c91310bbfea29243d4e23325c347`.
- Full ordered object inventory JSON SHA-256:
  `9976b68f111d04f5c36f0270c0400faecd89044ec37639a044481008364c07d8`.
- Both canonical schema checksums:
  `201f6b0f42a50e6185233a07604f06907e71bec0dca372645949100cb95c1897`.

No generator determinism change was required.

## F. Manifest changes and historical semantics

`supabase/schema-manifest.json` is generated from proof-b's actual SQL result,
pretty-printed with the existing formatter; it was not manually reconstructed.
It describes the **current full retained migration result (B)**. The original
20260910 baseline migration is historical and unchanged. The baseline runbook now
states this distinction and labels its original verified-count table historical.

## G. Verifier changes

Updated the existing nine pinned count assertions only after deterministic replay
and attribution. Added the independently approved schema checksum assertion so
same-count definition drift is rejected by the artifact verifier as well as the
existing replay comparator. The expectation remains committed code, never copied
from a live replay during validation. Kept the explicit count assertions for a
narrow reconciliation preserving the existing independent artifact guard; deriving
them from the very manifest being checked would remove that guard.

No comparator, generator, validation architecture, historical SQL, security guard,
secret/identifier guard, deferred-column check or seed-email check was weakened.
Added one Node built-in test proving valid artifacts pass and altered table count
or same-count checksum fails both verifier and comparator. No dependency added.

## H. Final clean replay verification

Both executions of the unchanged `scripts/supabase/validate-local.sh` completed
with exit 0 in the isolated verification projects. Evidence:
`verify-a/validate-shared.log` and `verify-b/validate-shared.log`.

| Gate                                           | verify-a                        | verify-b                        |
| ---------------------------------------------- | ------------------------------- | ------------------------------- |
| Complete retained migration replay             | PASS                            | PASS                            |
| Fresh reset 1 and canonical seed               | PASS                            | PASS                            |
| pgTAP after reset 1                            | PASS, 33 files / 658 assertions | PASS, 33 files / 658 assertions |
| Fresh reset 2 and canonical seed               | PASS                            | PASS                            |
| pgTAP after reset 2                            | PASS, 33 files / 658 assertions | PASS, 33 files / 658 assertions |
| Reset 1 vs reset 2 byte equality               | PASS                            | PASS                            |
| Replay vs committed manifest                   | PASS                            | PASS                            |
| Public schema diff against fresh shadow replay | PASS, no schema changes         | PASS, no schema changes         |
| verify-baseline-artifacts.mjs                  | PASS, status ok                 | PASS, status ok                 |
| Final complete inventory vs proof-b            | PASS, byte-identical            | PASS, byte-identical            |

All four project final manifests and inventories have the two file digests listed
in E. The final fresh replays reproduce the approved schema checksum exactly.
Node built-in negative test: 1 test PASS. Changed-file Prettier and
`git diff --check`: PASS. All 64 migration files were independently compared
byte-for-byte with baseline HEAD; no added/removed migration and no application or
backend source changes. Product regressions were not required or run.

## I. Files changed

- `supabase/schema-manifest.json`.
- `scripts/supabase/verify-baseline-artifacts.mjs`.
- `scripts/supabase/verify-baseline-artifacts.test.mjs`.
- `docs/backend/CANONICAL_SUPABASE_BASELINE.md`.
- `docs/CURRENT_IMPLEMENTATION_STATE.md` (short handoff only).
- `docs/architecture/SCHEMA_MANIFEST_RECONCILIATION_REPORT.md`.

## J. Remaining limitations

- Human review remains pending. No commit requested or created.
- The existing manifest scope is public tables/columns/constraints/indexes/functions/
  triggers/RLS plus public/storage policies and bucket metadata. It does not cover
  grants, enums, other schemas, rows or Storage bytes; this repair does not expand it.
- The verifier's existing `lineageChecksum` and SQL secret scan cover its original
  explicit 21-migration prefix through `20260913000600`, not all 64 migrations.
  This behavior is retained; the full-chain checksum above supplies current evidence.
- Initial native pgTAP invocation from `/private/tmp` returned NOTESTS because
  Colima does not share that host directory. This was not counted as a test PASS.
  Disposable validation copies were moved to the allowed Colima-shared visualization
  workspace; all repository scripts/tests remained unchanged. The temporary `npx`
  shim uses the installed CLI and only limits startup to PostgreSQL; reset, tests,
  comparisons, diff and verifier commands are unchanged. A first setup attempt used
  the wrong cwd and triggered an npm package-resolution attempt; it was interrupted
  before database work. No remote Supabase environment access occurred.
- No Hosted Dev parity, Production validation or deployment is claimed. Trip I2A
  remains stopped and requires its own separately approved task.

## K. Git status and acceptance contract

Final `git status --short`:

```text
 M docs/CURRENT_IMPLEMENTATION_STATE.md
 M docs/backend/CANONICAL_SUPABASE_BASELINE.md
 M scripts/supabase/verify-baseline-artifacts.mjs
 M supabase/schema-manifest.json
?? docs/architecture/SCHEMA_MANIFEST_RECONCILIATION_REPORT.md
?? scripts/supabase/verify-baseline-artifacts.test.mjs
```

| Criterion                                      | Evidence                                                                     | Result |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| Existing migration chain replays successfully  | Four isolated projects; full native replay and tail trace                    | PASS   |
| No historical migration modified               | All 64 files byte-identical to baseline HEAD                                 | PASS   |
| Every drift item explained by retained history | Historical prefix exact match; D and per-migration inventories               | PASS   |
| No unexplained object remains                  | 61 additions / 10 existing changes fully attributed; zero UNKNOWN/UNEXPECTED | PASS   |
| Two independent clean replays identical        | proof-a/proof-b manifest and full inventory byte equality                    | PASS   |
| Committed manifest updated from evidence       | Generated proof-b SQL result                                                 | PASS   |
| Baseline verifier updated consistently         | Approved counts/checksum; status ok                                          | PASS   |
| Verifier detects future drift                  | Table-count and same-count checksum negative test                            | PASS   |
| Fresh replay matches committed manifest        | verify-a native comparison plus final capture                                | PASS   |
| verify-baseline-artifacts passes               | Repository invocation and both native validator logs                         | PASS   |
| Second fresh replay independently passes       | verify-b two resets, tests, diff, comparator and verifier                    | PASS   |
| No application code changed                    | Git scope restricted to six artifact/tooling/docs files                      | PASS   |
| No migration changed/added/removed             | Git scope and byte comparisons                                               | PASS   |
| No Trip implementation resumed                 | No Trip/domain/repository/schema implementation files changed                | PASS   |
| No Hosted Dev access/mutation                  | Disposable local-only projects; no linked-project state copied               | PASS   |
| No Production access                           | No remote project command, query or deployment                               | PASS   |

Acceptance contract: **16 PASS / 0 PENDING / 0 BLOCKED**.
Human review: **PENDING**, outside the implementation acceptance criteria.
No commit created. All four disposable projects were stopped with `--no-backup`;
remaining task-owned runtime volumes and shared validation copies were removed.
Docker inspection confirms no `otr-schema-` containers or volumes remain.
Local replay/log/object evidence remains under `/private/tmp/otr-schema-reconciliation`.

Historical migrations modified: **NO**.
Production accessed: **NO**.
Hosted Dev accessed/mutated: **NO**.
Trip implementation resumed: **NO**.

**STOP.**
