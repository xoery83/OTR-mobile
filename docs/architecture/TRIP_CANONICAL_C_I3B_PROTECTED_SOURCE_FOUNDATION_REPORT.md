# C-I3B Protected Source / Material Server Foundation

Date: 2026-10-04 (Pacific/Auckland). Status: **C-I3B P2 CORRECTION COMPLETE — REVIEW PENDING**.
Source commands remain disabled. No commit or remote deployment.

## Baseline and authority

- Worktree: `/Users/xoery/Project/otr-mobile-import`; branch: `trip/import`.
- Clean startup HEAD: `f196f9840d49d7184cbba121ad80c8e6ed82e707` (`f196f98`).
  pwd/branch/HEAD/status/recent log matched the instruction before implementation.
- Authority: [C-I3A schema/access contract](TRIP_CANONICAL_C_I3A_SCHEMA_ACCESS_CONTRACT.md),
  including its exact concurrency subsection; C-I0/I1/I2 and A/B contracts are context.
- Only database target: disposable local `otr-trip-ci3b`, PostgreSQL port 55462,
  container `supabase_db_otr-trip-ci3b`. Existing canonical containers were not reset
  or mutated. Temporary project configuration/evidence lives under `/private/tmp`.

## Changed files

| File                                                                           | Change                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `supabase/migrations/20261004000300_trip_source_protected_foundation.sql`      | Atomic additive four-family foundation                              |
| `supabase/tests/trip_source_protected_foundation.test.sql`                     | 246 isolated pgTAP assertions                                       |
| `scripts/supabase/trip-source-writer-reuse.test.mjs`                           | 26 reserved-role adversarial tests                                  |
| `supabase/tests/rls_matrix.test.sql`                                           | Explained table/column/RLS counts only                              |
| `supabase/schema-manifest.json`                                                | Deterministic full-chain signature                                  |
| `scripts/supabase/verify-baseline-artifacts.mjs`                               | Explained exact expected signature/counts; verifier checks retained |
| `docs/CURRENT_IMPLEMENTATION_STATE.md`                                         | Minimal C-I3B handoff                                               |
| `docs/architecture/TRIP_CANONICAL_C_I3B_PROTECTED_SOURCE_FOUNDATION_REPORT.md` | This report                                                         |

All 66 historical migrations are byte-identical to the baseline. All application,
Backend, Mobile SQLite, receipt provider/worker and financial code is unchanged.
There is no business backfill, receipt migration, Source API, command, uploader,
association, Run/Candidate, Confirmation/slot, extractor or domain adapter.

## Exact schema and manifest delta

| Measure                    | Before | After |   Delta |
| -------------------------- | -----: | ----: | ------: |
| Public tables / RLS tables |    108 |   112 | +4 each |
| Columns                    |  1,611 | 1,683 |     +72 |
| Constraints                |    838 |   924 |     +86 |
| Indexes                    |    350 |   359 |      +9 |
| Functions                  |    154 |   158 |      +4 |
| Triggers                   |    125 |   137 |     +12 |
| Policies                   |    179 |   181 |      +2 |
| Buckets                    |      3 |     4 |      +1 |

The tables are exactly `trip_sources` (17 fields), `trip_source_revisions` (13),
`trip_source_representations` (26) and `trip_source_actions` (16). Revision identity
is `(source_id, material_revision)`, without a revision UUID. Source and
Representation have explicit required safe-integer `row_revision`; no trigger
increments either. Revision redaction remains parent Source CAS-owned, and
Actions remain append-only. This slice provides schema readiness, not a CAS command.

The 86 constraints are 59 CHECKs, 14 FKs, four PKs, five uniqueness constraints,
and four deferred aggregate constraint triggers. Nine indexes implement the four
PKs and five uniqueness constraints. Deferred current-revision/introduced-revision
references resolve the root/capture/Representation circularity in one transaction.

Four functions implement a pure sorted UUID-array validator, a pure Representation
structure validator, an unconditional mutation/truncate guard and a read-only
full-scope aggregate validator. Twelve triggers comprise four row guards, four
statement INSERT/UPDATE/DELETE/TRUNCATE fences and four deferred aggregate checks. No existing trigger
or function is rewritten. No Source public-table policies are installed.

## Structural invariants

- Safe positive revision ranges; exact acquisition/operation keys and digest format;
  scoped acquisition uniqueness without content deduplication; immutable identities.
- Source kind/channel pairs, capture basis/time pairing, finite operational times,
  private access mode and ACTIVE/DELETED metadata pairing.
- Initial versus later revision reasons/previous chain, initial acquisition key,
  Source creator equality, actual copy-origin FK, same-Source current pointer.
- Sorted, distinct, nonnull one-dimensional manifests (1–64), complete member lookup,
  same-Source ORIGINAL membership, introduced revision bounds; original descriptors
  occur in their introducing manifest.
- ORIGINAL has no parents/transformation; DERIVED requires 1–16 distinct bounded
  parents and transform metadata; same-Source/prior-descriptor subset and recursive
  cycle rejection. Historical parent descriptors remain usable after material loss.
- TEXT/LOCATOR/BINARY exclusivity, exact encoding/MIME/provider/bucket combinations,
  TEXT UTF-8 length/hash and LOCATOR UTF-8 length/hash plus supplied http/https URI;
  bounded inline text/locator/name/transform fields.
- Binary positive length, PDF 10 MiB limit, image 50 MiB limit, exact scoped object
  key and unique bucket/key; VERIFIED requires an actual-proof timestamp descriptor.
- RETAINED/PURGE_PENDING presence; PAYLOAD_PURGED removes inline payload while keeping
  descriptors; binary PURGED agrees with purge/redaction state; nonbinary remote
  state remains NOT_APPLICABLE. Only IDENTITY_ONLY permits N's digest/length exceptions.
- First-slice Actions allow only ACQUIRE/REPLACE/DELETE_SOURCE/PURGE/MARK_LOST/REDACT,
  with bounded reason/selector combinations, owner scope and referenced capture/
  Representation integrity. Future family selectors are constrained null with no
  FK to nonexistent tables; LINK/UNLINK/RELINK/TARGET_DELETE stay disabled.

These are storage-structure checks. They do not prove parser safety, real object
bytes, capture/operation digest recipes, private read admission, evidence truth,
retention authorization or a future command's CAS transaction. Every runtime
business write remains impossible in this slice.

## Writer, runtime grants and Storage

`otr_trip_source_writer` is reserved NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
NOINHERIT, NOBYPASSRLS and without replication capability. It has no app/API
membership, SET ROLE path, owned function/schema, Source command, table/column
privilege or direct Storage mutation capability. Trusted postgres role-creation
administration is allowed only without SET ROLE/inheritance; it is not an API path.

Reuse validation runs before any new-table grant cleanup. Effective table and live
column checks cover public/storage/auth relations, including direct/PUBLIC/inherited
SELECT, INSERT, UPDATE and REFERENCES. Table checks additionally cover DELETE,
TRUNCATE/TRIGGER and relevant sequences/ownership. Unsafe role attributes,
membership, ownership or grants fail the migration atomically; nothing repairs or
revokes the incompatible fixture capability. The final runtime inventory also
rejects effective inherited/column permissions surviving direct table revocation.

All four tables have enabled and forced RLS. PUBLIC/anon/authenticated/service_role/
reserved writer have no direct Source table privileges. No service SELECT is needed
while commands/routes are disabled. Fixed-search-path invoker guards reject all
INSERT/UPDATE/DELETE/TRUNCATE, including no-op mutation, privileged existing RPC
owners, BYPASSRLS and spoofed JWT role. The full-scope definer validator only reads;
all four new functions have default client/PUBLIC EXECUTE revoked. Trusted DDL,
superuser ownership changes and deliberate trigger disabling are outside guarantees.

The new `trip-source-material` bucket is private, exactly 52,428,800 bytes, with
MIMEs `application/pdf`, `image/jpeg`, `image/png`, `image/heic`, `image/heif`.
Object key is `v1/<trip-uuid>/<source-uuid>/<representation-uuid>/payload`.
Two restrictive policies deny anon/authenticated Source object access and bucket
metadata even alongside permissive client policies. Existing policies/buckets/grants
remain unchanged. No PUT or create-only uploader is implemented; receipt mutable
upsert semantics are neither extracted nor reused. Trusted provider administration
is not a Source semantic command.

## Trip/Account preservation and non-interference

Source Trip/acquiring Account/deletion Actor and history references use RESTRICT.
A Source-only Trip cannot be physically deleted. A synthetic acquiring Account
which is not that Trip's creator cannot be physically deleted while Source history
references it: this isolates the new Auth FK from pre-existing Profile/Trip guards.
Source row delete and TRUNCATE also fail. No unrelated Auth/Profile/financial
cascade is rewritten. Future account/trip teardown requires separately admitted
retention/redaction policy; logical Source lifecycle commands remain disabled.

A populated prior-baseline forward migration compared **all 108 existing public
table contents**, columns/constraints/grants/RLS/triggers, existing buckets/Storage
policies/grants and financial projections byte-for-byte. The fixture has an ACCEPTED
Expense, participant/split, SAME_CURRENCY valuation, currency setting, Personal
Payment/read grants and real receipt metadata. All comparisons PASS; snapshot SHA-256:
`7368a1b3ccef40273fc8d1160adc240125517e55dfa91d19eccf4ef0d6c5eb92`.
The Source pgTAP test separately checks nonempty receipt/financial snapshots after
adversarial operations. `receipt_assets`, `ledger-receipts`, receipt provider/upsert,
normalization/limits/tombstones/queue, Expense/Settlement/Review/FX/Personal Payment
and A/B stored facts are unchanged. There is no dual write, ID alias or backfill.

## Validation and acceptance

| Gate                                                           | Result                 | Evidence                                                                                                                                                                 |
| -------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Startup and clean baseline                                     | PASS                   | Exact directory/branch/HEAD; 66-migration baseline matched original manifest                                                                                             |
| Exact protected schema and no backfill                         | PASS                   | Four catalogs, live counts, guards and aggregate fixtures                                                                                                                |
| MIME/inline/binary/manifest/chain/lineage invariants           | PASS                   | Structural invalid cases and valid UTF-8/locator/derivative/purge controls                                                                                               |
| Runtime metadata denial and immutable history                  | PASS                   | Real roles, owner DML, temporary service DML grants, BYPASSRLS, JWT, TRUNCATE                                                                                            |
| Reserved-role reuse                                            | PASS                   | 26 Node tests: table grants, four column privileges, PUBLIC/inherited, API SET ROLE, LOGIN, Storage grants, unsafe default privileges, clean reuse and new-table columns |
| Private bucket/client denial                                   | PASS                   | Restrictive policy tested with permissive policies, synthetic Storage metadata and actual anon/authenticated CRUD probes                                                 |
| Trip/Account delete compatibility                              | PASS                   | Dedicated Source-only fixtures; protected physical history                                                                                                               |
| Receipt/financial non-interference                             | PASS                   | Populated forward byte comparison and rollback-test snapshots; full retained SQL/TS regressions                                                                          |
| Two clean full-chain replays                                   | PASS                   | 67 migrations each; deterministic manifest equality                                                                                                                      |
| Full SQL suite                                                 | PASS                   | Each replay: 36 files / 1,096 assertions; Source subset: 246                                                                                                             |
| Strict verifier and negative drift                             | PASS                   | Count and same-count checksum drift rejected; no comparator/verifier weakening                                                                                           |
| Historical migration byte comparison                           | PASS                   | All 66 baseline migrations unchanged                                                                                                                                     |
| Typecheck / lint / UI guard / changed-file format / whitespace | PASS                   | Existing local dependencies; no added dependency                                                                                                                         |
| Full TypeScript suite                                          | BLOCKED (pre-existing) | 166 suites / 1,178 tests PASS; one architecture boundary test FAIL                                                                                                       |
| Human and independent review                                   | PENDING                | Implementation stops here                                                                                                                                                |
| Future Source commands/upload/local acquisition                | PENDING, disabled      | No implementation or automatic continuation                                                                                                                              |
| Domain adapter activation                                      | BLOCKED                | Existing domain receipt prerequisites remain unchanged                                                                                                                   |

The existing TS failure is `src/domain/architectureBoundary.test.ts`, because
`LedgerExpenseDetailScreen.tsx` imports `@/data/api`; both files are byte-identical
to startup HEAD. This is the same B-T3B baseline failure and does not weaken the
full-repository gate. Full receipt/storage-provider, finance, security and Track A/B
SQL suites pass. Test-only row/statement guard disabling is performed by trusted owner in rollback
transactions; no test bypass is shipped. Storage deletion RLS probes use the existing
Storage API delete context to isolate policy denial, not a Source guard exception.

Final manifest checksum:
`6f7449afdc45838a2b29c4d21fc12bf16adcb4971ade9c4c3cb07a85e7bc95a6`.
Evidence logs and deterministic snapshots are under `/private/tmp/otr-ci3b-evidence`.
Dependencies are read through local links; import-worktree caches stay local.
The disposable test stack is stopped without backup after validation.

## Independent-review P2 correction

P2-1: the original recursive `UNION ALL` carried one path array per traversal
inside each Representation loop. Shared ancestry repeatedly expanded the same
nodes; a valid 31-node Fibonacci DAG exceeded the reviewer's 3-second timeout.
The amended migration checks missing/cross-Source/prior-descriptor references
separately, then computes one Source-scoped transitive closure per aggregate
validation with `UNION` set semantics on `(start_id, ancestor_id)`. A nonempty
traversal reaching `(id,id)` rejects a cycle. Shared paths collapse to reachable
pairs, including cycles, so recursion terminates without inventing a depth/count
cap or accepting unknown ancestry. Same-Source, ORIGINAL/DERIVED, manifest and
introduced-revision rules are unchanged.

The rollback SQL suite builds the exact 31-node predecessor-two DAG and a
128-node counterpart. Both flush **every** queued aggregate trigger under the
same `statement_timeout='3s'`; elapsed-time assertions also require each complete
fixture/flush to finish below 1,500 ms. The first final replay measured 20.703 ms
and 799.559 ms respectively (465 and 8,128 reachable ancestor pairs). A diamond
passes; self/small/long indirect cycles, missing/cross-Source parents, a parent
with a later valid introduced revision, and later descriptor time still reject.
No timeout increase or production lineage cap is introduced.

P2-2: row guards never ran for zero-row INSERT/UPDATE/DELETE. The former
TRUNCATE-only statement trigger is replaced with one BEFORE statement fence per
table covering all four mutation events. Existing row guards remain. The shared
invoker function still unconditionally raises `42501 / TRIP_SOURCE_COMMANDS_DISABLED`;
there is no role/JWT/GUC/trigger-depth bypass. Future private command admission
remains a separately reviewed change.

Eighty-four actual mutation probes exercise four tables × seven statements
(zero-row and populated INSERT/UPDATE/DELETE, plus TRUNCATE) × three actual roles:
service_role, reserved writer and the existing privileged postgres test owner.
The suite verifies actual BYPASSRLS attributes and exact guard error text, so ACL,
RLS or uniqueness failure cannot masquerade as fence success. Tests temporarily
grant table privileges; reserved-writer probes additionally need pgTAP schema
usage and trusted-owner SET ROLE, restored before ordinary-role denial checks.
Every grant/DDL fixture rolls back. Neither a test bypass nor these grants ships.

P2 amends six existing delivery files: the migration, Source pgTAP suite, manifest,
strict verifier, this report and the minimal current-state counters/status.
The original writer-reuse script and RLS matrix need no P2 edits because object
counts are unchanged. Overall uncommitted C-I3B scope remains the eight files
listed above; all 66 historical migrations remain byte-identical.

Manifest totals remain **112 tables / 1,683 columns / 924 constraints / 359 indexes /
158 functions / 137 triggers / 181 policies / four buckets**. Source contributes
four functions and twelve triggers: four row guards, four all-mutation statement
fences and four deferred aggregate validators. Only function/trigger definitions
change the checksum. No new migration, Source command, route, worker, SQLite,
association, Run/Candidate, Confirmation or adapter is added.

P2 verification: focused Source **246 PASS**; writer reuse **26 PASS**; both clean
67-migration full replays **36 SQL files / 1,096 assertions PASS**, with identical
manifests; strict verifier and count/same-count checksum drift negatives PASS;
populated receipt/financial byte comparison and historical migration bytes PASS;
typecheck/lint/UI guard/changed-file format/whitespace PASS. Full TS remains
1,178 PASS / one unchanged baseline architecture-boundary failure. Evidence uses
`p2-*` logs under `/private/tmp/otr-ci3b-evidence`; validation remains local only.

## Limits and stop

Biggest compatibility risk: newly retained Source history intentionally blocks
physical Trip/Account deletion. No teardown, legal retention duration or erasure
command is selected. Source acquisition, upload verification/recovery/purge CAS,
parser validation and real byte access need their separately approved later slice.
The read-only aggregate validator is not a substitute for that admission. Source
commands and all domain adapters remain disabled; no generic mutation is added to
exercise revision columns.

- Production accessed: **NO**
- Hosted Dev accessed/mutated: **NO**
- Source command enabled: **NO**
- Upload worker added: **NO**
- Mobile SQLite changed: **NO**
- Receipt behavior changed: **NO**
- Sibling worktrees modified: **NO**
- Commit performed: **NO**

**STOP — C-I3B P2 CORRECTION COMPLETE — REVIEW PENDING.**

## Integration Checkpoint #4 — migration version reconciliation

During replay of the unpublished C commit onto `c3fb253`, the owner authorized
renaming C to `20261004000300_trip_source_protected_foundation.sql`; A retains
`20261004000200_trip_person_snapshot_read.sql`. The C SQL bytes are identical to
`455a5f2`; only filename references change. All 66 preceding migrations and A's
migration are byte-identical. The earlier C-only counts above remain historical.

The actual combined manifest adds A's single snapshot-read function: 112 tables /
1,683 columns / 924 constraints / 359 indexes / 159 functions / 137 triggers /
181 policies / four buckets; checksum `6b554edf84c349dbcb2ee29862dddfe526c68ca710712234f1adaf53e6db7f5a`.

Two clean full-chain replays each apply/register 68 files / 68 unique versions;
each full SQL suite passes 37 files / 1,109 assertions. Both actual manifests equal
the reconciled committed manifest; both public/storage schema diffs are empty.
Focused A 13 / C 246 / B 145 assertions, strict verifier and count/same-count checksum drift negatives
PASS. No historical-lineage or verifier checks are weakened.

Existing populated receipt/financial/table snapshots and A's function/grants are
unchanged across C. C tables/constraints/guards/functions/bucket, both reserved
writers and role memberships are unchanged across A. Writer reuse: 26 PASS.
No Source, Event or lifecycle command is activated; no remote environment or
sibling worktree is modified. Evidence: `/private/tmp/otr-ac-checkpoint4`.
