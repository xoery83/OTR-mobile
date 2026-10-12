# CP-FLIGHT-E2E-AB Joined Integration Report

Date: 2026-10-12 (Pacific/Auckland).
Status: **JOINED ISOLATED SYNTHETIC ACCEPTANCE PASS / NOT CANONICALLY INTEGRATED**.
Baseline: `b5caa1f61cad1d8c612ee40142f3289f69715b5a`.
Accepted A: `473893f7654a7fc194a7e7c35e922e350d426f24`.
Accepted B: `fdd5a5c38660a7942b19fee0d65af7144d1aed19`.
Branch/worktree: `codex/cp-flight-e2e-ab`, `/private/tmp/otr-flight-e2e-ab-20261012`.

## Exact bounded integration

Both accepted tips and their manifests were verified against the baseline:
A24 files, B13 files; their only overlap is `docs/CURRENT_IMPLEMENTATION_STATE.md`.
The ordinary merge conflict was resolved by retaining both accepted handoffs.
Isolated merge: `90128ce8a390d017d56b5dee59cebfbf9d09471f`.
Joined harness: `763860a27379e8fffe56da16d0560217067c6fc0`.
The final documentation commit is the branch HEAD recorded in the final handoff.

All accepted A/B production code is byte-identical to its accepted tip. The only
additional executable changes are a test-only assertion helper, additions to A's
existing SQL scenario, and SQL runner logging/owned-fixture closure checks. No new
Publisher, writer, command/collection contract, sync engine or Day Composer exists.
No SQLite/server/historical migration was changed. No unrelated Core/Experience/LLM
work or `fb8dbc9` was included. Canonical main and concurrent uncommitted files retain
exact HEAD/status/content hashes; no merge, push or activation occurred.

### Carried Stage1 dependencies

Only these10 files from A match pinned `1fd4b7d` bytes exactly. Stage1's commits
`8743641`/`ff7c2bb` and the old17-file integration-prep tree were not blindly merged.
B has no additional Stage1 dependency overlap.

- `src/data/interpretation/__fixtures__/flightFirstStage1.ts`
- `src/data/interpretation/flightEnrichmentDecision.ts`
- `src/data/interpretation/flightEvidenceCoverage.ts`
- `src/data/interpretation/flightFirstStage1.test.ts`
- `src/data/interpretation/flightInterpretation.test.ts`
- `src/data/interpretation/flightInterpretation.ts`
- `src/data/interpretation/flightInterpretationQuality.test.ts`
- `src/data/interpretation/flightInterpretationQuality.ts`
- `src/data/interpretation/flightSourcePayload.ts`
- `src/domain/trip/referenceFlightExtractor.ts`

The combined40-file manifest is `CP_FLIGHT_E2E_AB_CHANGED_FILES.txt`. Structured
exact-run evidence is `CP_FLIGHT_E2E_AB_ACCEPTANCE_EVIDENCE.json`.

## Joined owning path and exact identities

One synthetic retained ORIGINAL TEXT Source passes existing C2 Run publication,
Capture CandidateSet/preparation, owning Core publication2, Source Admission,
sole Core SQL writer, exact receipts and Source finalization. Core creates two
independent sparse UUIDs and qualifies each same UUID at semantic revision2.
Four associations finalize COMPLETE; four lost command responses recover exact
immutable receipts through fresh owning connections without new operations.

At the qualification checkpoint, direct SQL, actual owning PostgreSQL read2,
authenticated Core HTTP handler/collection transport, SQLite54 mirror and production
`readTripDayFeed()` all match these pairs:

| Synthetic Item UUID                    | Semantic revision | Accepted origin date |
| -------------------------------------- | ----------------- | -------------------- |
| `91a75c22-e98d-4354-bae0-dc8b7b768ec6` | 2                 | 2026-12-20           |
| `fc0c6c0f-502f-460a-aba5-37897363a70c` | 2                 | 2026-12-17           |

These are exact last-run synthetic fixture IDs, not business rows on canonical main.
Later manual SET/CLEAR and visibility changes in the existing A scenario have their
own revisions; they do not rebase or rewrite this qualification checkpoint.

- Full registered SQLite1–54 runs against actual file-backed Node SQLite. Only the
  complete validated actor partition installs; v2 never writes SQLite47 Day tables.
- Repeated import reuses publication/plan/slot/operation/Item IDs and emits no new
  commands. New duplicate targets collide. Repeated collection retains two rows;
  lost collection response preserves the previous complete partition and retries.
- Closing/reopening the file database and invoking the production local Day reader
  offline preserves both accepted UUIDs/revisions without any HTTP request. Failed
  offline pull does not clear them.
- Existing Core Day projection selects each accepted local date, despite the Source
  instant being on the preceding UTC date. Each Day renders one separate existing
  Flight component with stable `(itemId,ORIGIN,localDate)` occurrence key.
- Typed ORIGIN/DESTINATION boundaries, qualification and Person bindings remain
  accepted facts. Unknown arrival date/clock/zone/place is not fabricated. Airport
  purpose identity does not become an accepted place UUID or coordinates; TTR/map
  readiness is not inferred.
- Another admitted Trip member receives a complete empty private partition in
  actual SQL→collection→SQLite→Day. Account-switch partitions remain distinct;
  wrong-Trip requests and installing another Actor's manifest fail closed. B's
  combined tests retain ABA, access-generation/revocation and participant-scope fences.
- Owner and shared-Item collections omit Source/Run/publication/Candidate IDs,
  private field-evidence refs and authorization refs. Sharing an Item does not share
  its Source. Capture Candidates and REVIEW siblings never become accepted Day Items.

HTTP tokens/membership dispatch are an explicit in-process synthetic authentication
seam. The handler, transport validators and owning SQL reader are actual; SQL uses
libpq/psql through the restricted owning roles, not a deployed Node pg/TLS driver.
Day components use React-native static-render mocks. No native/device acceptance is
claimed and no retained real Source/supplier bytes were used.

## Executed verification

- Combined targeted Vitest: **19 suites / 347 PASS**.
- `python3 scripts/trip/core-v2-sql-acceptance.py --flight`: **1 joined SQL scenario PASS**.
- Existing `--source`: **3 SQL scenarios PASS**.
- Both final runs use independent UUID-owned, network-none Server84→Core85–92
  clones; only those clones and test SQLite files are deleted. Default RLS/CLOSED
  gates pass; all329 historical public function bodies remain exact both after
  migrations and after the scenarios.
- The runner now emits exact joined identity evidence and explicitly restores the
  owned positive fixture gate/allowlists before verifying CLOSED. Initial added
  cleanup assertions exposed retained disabled lists; the fingerprint check was
  corrected to compare historical bodies rather than the expanded function set.
  No owning business authority or migration was changed to make tests pass.
- Typecheck, full lint/UI guard, backend build, touched formatting, Python syntax
  and `git diff --check`: **PASS**. Guard baseline unchanged.
- Full-repository regression was not rerun for this bounded harness. The two known
  baseline UI test failures are not counted as passed or resolved here.

## Remaining F6 gates and integration conflicts

No material contract or authority conflict was found. A/B production changes do
not overlap. Only current-state documentation needed a normal merge resolution;
canonical's concurrent Platform-owned notes still need preservation in any future
Owner-authorized canonical integration.

F6 remains OPEN for: separate canonical integration decision; approved deployment/
Core schema and owning principal; actual Node pg/TLS/auth transport; retained real
Source acquisition/byte custody and nonsynthetic identity provisioning; native
queue/SQLite/Day cold-restart/offline/device acceptance. Unsupported binary/OCR,
supplier/codeshare/change and richer existing-target branches retain their separate
REVIEW/authority gates. All Hosted, Provider, paid LLM, Mobile Runtime and Production
activation gates remain CLOSED. This result proves the requested joined synthetic
interface, not deployment or production readiness.
