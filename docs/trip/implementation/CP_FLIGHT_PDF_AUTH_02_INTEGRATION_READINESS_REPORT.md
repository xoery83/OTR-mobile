# CP-FLIGHT-PDF-AUTH-02 — Canonical Integration Readiness

2026-10-12. **CLOSED candidate prepared; ready for separate Owner integration review.**
Canonical main, its index and all concurrent dirty/untracked bytes were preserved.
No canonical merge/push or Hosted/native/provider activation occurred.

## Exact prepared candidate

- Branch/worktree: `codex/cp-flight-pdf-auth-02`, `/private/tmp/otr-flight-pdf-auth-02-20261012`.
- Initial local/remote main: `03794531a224f0a7046f2717a7a9960b1241fc4f`.
  During preflight local main independently advanced through accepted DL2 to
  `40c5d29a9f3d6232003393af1ae516a339a46b56`; remote remained0379453.
  The isolated branch was fast-forwarded to40c5d29 before applying accepted PDF changes.
- Accepted AUTH01 tip: `ea9cbf4d601a6df72264cc96fb3728304b3e00a8`; commit chain
  `da1a8a7` → `ee75692` → `ea9cbf4` and exact22-path manifest verified against Git blobs.
- Prepared implementation commit: `bba31ffd1eae4f57e2827aae3c381adbdc2fb71d`, parent40c5d29.
- Prepared implementation tree: `b8e2c8bc69c7004142ee4794a3e7ee8373bc73a7`.
  Exactly22 changed paths. Documentation-only follow-up adds this report, manifest
  and evidence; final delta is25 paths. No product changes follow the prepared commit.
- [Exact manifest and accepted/prepared hashes](CP_FLIGHT_PDF_AUTH_02_MANIFEST.json).
  [Combined SQL, test, overlap and preservation evidence](CP_FLIGHT_PDF_AUTH_02_EVIDENCE.json).

20/22 accepted files are byte-identical, including every production authority file,
shared DTO, profile, SQL migration, Core proof, accepted tests/fixture and historical
AUTH01 reports. Only two preparation paths differ:

1. `docs/CURRENT_IMPLEMENTATION_STATE.md`: AUTH02 heading and historical AUTH01 heading
   precede the exact captured canonical **working** notes. The canonical draft removes
   an obsolete LLM preparation prefix; that working edit is respected in this isolated
   reconciliation. No other concurrent report/generated file is imported.
2. `scripts/trip/core-v2-sql-acceptance.py`: opt-in `--with-llm` and
   `--with-pdf-authority` exercise the complete installed schema in existing scenarios.
   Function comparisons distinguish the two approved LLM replacements from prohibited
   PDF/historical changes. No production interface or authority is modified.

## Canonical and workstream reconciliation

| Area / overlap                                | Prepared result                                                                                    | Ownership / next action                                                    |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Core85–92, Publisher2, Admission/Writer       | Current canonical plus exact AUTH01 Source proof extension                                         | Existing Core owner; Agent3 owns derivative DTO/profile/seal               |
| Flight DEV Backend b612357 / readiness12693e3 | Canonical TEXT composition retained; no transport/runtime wiring added                             | Agent A consumes the frozen contract for future PDF custody/transport      |
| Native02 `14a9041`, Native03 `8ed6e86`        | Both isolated branches excluded                                                                    | Agent B owns Native handoff and activation                                 |
| Native shared `seedPublicationSource` fixture | AUTH01 `pdfOriginal` interface retained; Native's `nativeOriginal`/`apple-pdfkit` changes excluded | Agent3/Core test owner coordinates any later fixture merge with Agent B    |
| Native shared SQL runner                      | Only accepted AUTH01 plus current combined-chain flags                                             | Agent3/Core test owner; Native `--native-flight` scenario remains excluded |
| G2, DL1, DL2 Lab                              | Canonical versions retained, including40c5d29 read-only Core port                                  | Experience owner; no Composer, read/sync engine or UI modification         |
| LLM integration0379453                        | Facade/Profile/host changes and protected migration retained exactly                               | LLM owner retains reserve/mark roots and private custody                   |
| Shared current-state notes                    | Captured working notes retained verbatim as suffix                                                 | Shared coordinator; preserve current bytes during any later integration    |
| Hosted DEV03 `82ed7bd` / Platform dirty work  | Excluded                                                                                           | Agent A/Platform scopes stay separate                                      |

Accepted PDF paths overlap changes since12693e3 on canonical only in the handoff.
Native02/03 additionally overlap the fixture and runner above. Their representations,
SQLite55, PDFKit/runtime and install/build changes are not carried. General/Quartz
PDFKit evidence continues REVIEW; no native self-certification or Producer expansion.

## Migration order and semantic preservation

Exact order tested on fresh disposable PostgreSQL:

`20261011000100`…`20261011000800` (Core85–92)
→ `20261012000100_model_task_protected_admission.sql`
→ `20261012000200_source_pdf_derivative_authority.sql`.

Every existing migration is byte-identical to canonical40c5d29. The additive PDF
migration is byte-identical to accepted AUTH01. No ordering collision or new allocation.

Core installation preserves all329 original public function definitions. LLM changes
exactly its accepted `flight_activation_reserve_call(jsonb,jsonb)` and
`external_integration_mark_dispatch(jsonb,jsonb)`. PDF preserves **all351** functions
present after Core/LLM; all357 installed definitions remain unchanged after scenarios.
LLM protected-root tests also pass with the PDF layer present. Runtime flags restore
CLOSED; Provider calls0. This is not a Hosted migration/credential/ACL installation claim.

Source-owned profile/seal/receipt /1, original custody/CAS, immutable digest binding,
whole-Source sibling/purpose, airport and SOURCE_INSTANT fences are unchanged.
Original TEXT hashes/path remain authoritative. No additional Publisher, Writer,
Capture pipeline, Scheduler or Ledger. Accepted finite profile only; no Quartz/OCR.

## Combined verification

- 12 focused suites: **172 PASS /2 explicit host skips**. Source/profile/publication/
  Capture, Source plan, DEV TEXT, Model Task/startup and current G2/DL2 reader/render/Lab.
  Skips are unconfigured `LIVE_W_SERVER84` bridge and Linux-only real anchored-custody
  case on macOS. No skip or assertion was changed.
- PDF: `python3 scripts/trip/core-v2-sql-acceptance.py --pdf-authority --with-llm`:
  **1 PASS**, default/restored CHECK-CLOSED; same two qualified Item UUID/revision2 pairs
  across actual SQL/read2, SQLite54 and current production Day, replay/offline/privacy,
  manual protection, seal/hash/map/actor/Trip/stale/revoked-custody negatives.
- Source: `--source --with-llm --with-pdf-authority`: **3 PASS**, durable REVIEW/slot/
  claim/recovery and owning scope behavior preserved.
- DEV ORIGINAL TEXT: `--text-runtime --with-llm --with-pdf-authority`: **1 PASS**,
  real local HTTP → Node pg/verified TLS, five backend restarts, exact receipt recovery,
  one original copy, actor/Trip/privacy and hostname/CA/credential negatives.
- Accepted LLM protected-root harness, with Core/LLM/PDF loaded in one network-none
  UUID clone: **24 grouped assertions PASS**, including concurrent winner commit/
  rollback, lifetime uniqueness, exact replay, UNKNOWN/restart, budgets, cancellation/
  scope rotation, revoked Trip/Account/verifier, FORCE RLS and immutable privileges.
  Task-only effective harness/evidence: `/private/tmp/pdf-auth-02-llm/`; historical
  LLM scripts/evidence were not overwritten.
- Typecheck, Backend build, touched-file ESLint, UI guard, formatting, Python syntax,
  diff checks and exact accepted/migration hash checks: **PASS**.

The first focused startup failed before tests because a Vite temp-cache symlink
pointed into canonical dependencies. Only the task-owned dependency links were
corrected to private `.vite`/`.vite-temp` directories; code/assertions were unchanged.
All test-created containers/networks were removed. Fixture Auth, Source trigger/grant
relaxations and loopback TLS passwords are synthetic and certify no deployed custody.

## Preservation and remaining integration gates

Disposable shared-clone rehearsal fast-forwards to the exact prepared commit after
saving/restoring only its cloned shared-file edit; resulting handoff contains every
original working note as an exact suffix. The other five dirty/untracked paths retain
identical bytes in the preview. Canonical main/index and all six captured dirty paths
retain exact status/hash. Rehearsal: `/private/tmp/pdf-auth-02-preservation/evidence.json`.
A blind fast-forward over dirty canonical current-state is not proposed; later Owner
integration must recheck refs/index/status and deliberately preserve/reconcile that file.

No authority/contract/migration conflict blocks Owner review. Separate approval remains
necessary for actual canonical merge/push and any Hosted/runtime integration. Agent A
still needs actual admitted private PDF custody, bounded Source-controlled byte reads,
PDF HTTP/pg/TLS composition and owning verification. Agent B still needs the Source
sealed catalog/text handoff and native/device acceptance. Generic supplier/Quartz/OCR,
Provider/paid LLM, Production and unrestricted Native remain outside scope. Full-repo
regression and Linux real custody/host bridge were not run in this bounded preparation.
