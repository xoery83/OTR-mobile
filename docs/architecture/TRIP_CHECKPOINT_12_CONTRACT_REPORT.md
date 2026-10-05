# Checkpoint 12 — Import Contract Foundation Report

Date: 2026-10-05 (Pacific/Auckland).
Status: **CONTRACT FOUNDATION COMPLETE — READY FOR FINAL OWNER CONTRACT REVIEW**.
Includes owner addendum: existing-item completion/augmentation and scoped Flight facts.

## Starting and retained Git state

Original checkout: `/Users/xoery/Project/otr-mobile-canonical`, branch
`integration/ledger-polish-canonical`, clean at exact requested base
`dc580e790d6e0998e97f1dc17fa05a1f50c731ee`.
Fresh managed worktree:
`/Users/xoery/.codex/worktrees/cp12-import-contract/otr-mobile-canonical`.
It started clean/detached at that commit, then branch
`codex/cp12-import-contract` was created without a commit. Retained HEAD is the
same exact base. Original canonical, temporal, import and legacy checkouts are
not edited. No fetch, provider/LLM call, Hosted Dev or Production access.

## Exact files

Added (seven):

- [TRIP_IMPORT_ENGINE_ARCHITECTURE.md](TRIP_IMPORT_ENGINE_ARCHITECTURE.md)
- [TRIP_IMPORT_CONTRACT.md](TRIP_IMPORT_CONTRACT.md)
- [TRIP_RESERVATION_SCHEMA_REGISTRY.md](TRIP_RESERVATION_SCHEMA_REGISTRY.md)
- [INTELLIGENCE_PLUGIN_CONTRACT.md](INTELLIGENCE_PLUGIN_CONTRACT.md)
- [TRIP_IMPORT_PROVIDER_ROADMAP.md](TRIP_IMPORT_PROVIDER_ROADMAP.md)
- [2026-10-05-import-engine-boundaries.md](../adr/2026-10-05-import-engine-boundaries.md)
- [TRIP_CHECKPOINT_12_CONTRACT_REPORT.md](TRIP_CHECKPOINT_12_CONTRACT_REPORT.md)

Modified: [CURRENT_IMPLEMENTATION_STATE.md](../CURRENT_IMPLEMENTATION_STATE.md),
a short CP12 design-only handoff inserted before CP11; prior history is preserved.
Existing contracts already use `docs/architecture`, so no duplicate `docs/contracts`
structure was created. No PRODUCT scope expansion or UI copy/localization change.

## Exact existing authorities reviewed

Task-relevant portions were reviewed; historical review-pending statements in older
specifications do not supersede accepted implementation reports/current base facts.

| Existing document / seam                                                                                                                                                 | Reviewed contract                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`; `docs/CURRENT_IMPLEMENTATION_STATE.md` (current checkpoints)                                                                                                | Documentation-first scope, exact base, CP10/11 gates and next review boundary.                                                                      |
| `docs/PRODUCT.md`; `docs/ARCHITECTURE.md`; `docs/DATA_MODEL.md`; `docs/API_CONTRACT.md`; `docs/OFFLINE_SYNC.md`                                                          | Current product, local/repository/backend ownership, Account/auth/queue boundaries, CP11 Capture/Day and disabled canonical adapters.               |
| `docs/ENVIRONMENT_AUDIT.md`; `docs/legacy/OTR_LEGACY_AUDIT.md`                                                                                                           | Local environment/reference context; legacy checkout was not reopened.                                                                              |
| `docs/architecture/OTR_TERMINOLOGY_GLOSSARY.md`                                                                                                                          | Normative Account/Person/Participant, Trip/Journey and financial distinctions.                                                                      |
| `docs/architecture/TRIP_CANONICAL_A1_IDENTITY_MEMBERSHIP_CONTRACT.md` (vocabulary) and `src/domain/trip/person.ts`                                                       | Existing Trip/Account/TripPerson IDs; no name/account-based passenger mapping or access changes.                                                    |
| `docs/architecture/TRIP_CANONICAL_B_T1_TEMPORAL_SPATIAL_CONTRACT.md`                                                                                                     | Civil dates/clocks/instants, independent zones, places, authored versus observed context and financial non-interference.                            |
| `docs/architecture/TRIP_CANONICAL_B_T3A_SCHEMA_WRITER_CONTRACT.md` (field model, transport, spatial, validity, reservation boundary)                                     | Exact canonical temporal/spatial semantics and schedule owner; Reservation remains associated, not a second schedule.                               |
| `docs/architecture/TRIP_CANONICAL_B_T3C_COMMAND_RECEIPT_CONTRACT.md` (evidence, shapes, spatial, offline and Track C handoff)                                            | Prepared proofs, exact typed commands/CAS, disabled shapes/adapters and domain success/evidence finalization.                                       |
| `docs/architecture/TRIP_CANONICAL_B_T3G_COLLECTION_SNAPSHOT_CURSOR_CONTRACT.md` (certificate/reconciliation/absence/owner) plus newer B-T3I sections in DATA_MODEL/API   | Historical certificate versus present completeness; normalized durable B-T3I generation/membership supersedes original proposed JSON layout.        |
| `docs/architecture/TRIP_CANONICAL_C_I1_SOURCE_PROVENANCE_CONTRACT.md` (identity, Representation, evidence, confirmation and N:M scenarios)                               | One canonical Source origin, immutable material and proposals, support/acceptance distinction, original retention and independent financial domain. |
| `docs/architecture/TRIP_CANONICAL_C_I3A_SCHEMA_ACCESS_CONTRACT.md` (IDs, Run/Candidate/Evidence, Confirmation/slot, offline, receipt isolation)                          | Existing opaque IDs, Run publication limits, field-evidence address, immutable proposal/support and explicit output receipt correlation.            |
| `docs/architecture/TRIP_CANONICAL_C_I3C_SOURCE_LIFECYCLE_COMMAND_CONTRACT.md` (activation scope, future local queue/channel boundaries)                                  | Acquisition/admission separate from Capture, deferred email/URL/multipart, disabled runtime and existing queue ownership.                           |
| `docs/architecture/TRIP_CANONICAL_C_I3F_PARSER_TERMINALITY_CONTRACT.md` (authority/threat/format/worker boundaries)                                                      | Structural parser completion is independent of semantic truth/provider terminality.                                                                 |
| `docs/architecture/TRIP_CANONICAL_C_I3H_DURABLE_EXECUTION_JOURNAL_REPORT.md` (foundation/owner protocol)                                                                 | Durable UNKNOWN, exact attempt fences and positive cleanup/terminal proofs; no plugin timeout bypass.                                               |
| `docs/adr/2026-10-05-local-capture-inbox.md`; `src/domain/capture/localCapture.ts`                                                                                       | Immutable CP11 bytes, kinds/limits/revision and INBOX/ASSIGNED only.                                                                                |
| `docs/adr/2026-10-05-trip-day-read-model.md`; `src/domain/trip/dayReadModel.ts`; `docs/architecture/TRIP_CHECKPOINT_11_FINAL_INTEGRATION_REPORT.md` (composition/review) | Certified retained projection, exact boundaries/context and historical offline observations; no rebuild semantics changed.                          |
| `src/data/auth/accountRequestContext.ts`; `src/data/auth/accountGeneration.ts`                                                                                           | Existing request capture/apply gate and A→B→A fencing, no second Account generation.                                                                |
| `docs/ledger/LEDGER_2_0_API_CONTRACT.md` (boundary/aggregate/evidence/receipts)                                                                                          | Exact Money, independent financial authority, explicit commands and receipt namespace.                                                              |

## Selected terminology and compatibility result

Capture is local acquired material; Source remains existing logical evidence origin;
Representation remains immutable material version. Batch groups intake, Run owns
published extraction/interpretation proposals, Candidate is noncanonical, Candidate
Set identifies selected proposal coverage. Closure Assessment, Match Assessment,
Context Snapshot, Evidence Fragment and Candidate Observation are new logical
contracts, not implemented schema. Confirmation/output slot keeps existing meaning.

READY means closure readiness only, not ACCEPTED, domain capability, sync completion
or canonical receipt. Occurrence relation and action outcomes are separate from
closure/work/attention. Existing-item outcomes: DUPLICATE_EVIDENCE, COMPLETE_EXISTING,
AUGMENT_EXISTING, UPDATE_EXISTING, CONFLICT, NEW_ITEM, UNRESOLVED_MATCH. Occurrence,
booking and passenger dimensions preserve independent field provenance and ambiguity.
Intelligence Plugins interpret; Data Providers supply attributed enrichment records.
Import Financial Evidence never aliases Ledger PaymentRecord, Receipt or Expense.
Account actor/owner never aliases Trip Person. UI Trip/Journey glossary remains intact.

Likely integration conflicts are explicitly fenced: CP11 lacks Batch/context/modality
fields; C-I3A subtype/observation/scoped detail must use a reviewed proposal adapter,
not new candidate_kind values or mutable READY Runs; audio locator needs future
versioned admission; Source first activation lacks multipart/fetch; Event TRANSPORT,
TRACK_C, participation and reservation CREATE adapters remain disabled. Current
reservation adapter is LINK_ONLY; no new canonical Booking domain is inferred.
Existing certificate/mirror/Day/private evidence read policy remains authoritative.

## Red Team review and targeted owner corrections

Independent [Red Team review](TRIP_CHECKPOINT_12_CONTRACT_REVIEW.md): **PASS WITH
REQUIRED CORRECTIONS**. The review grants no implementation/activation approval.
It is owner-provided read-only evidence and remains byte-identical to the start of
this correction pass. No independent rerun/acceptance by the Red Team is claimed.

| Correction                           | Normative resolution / documentation vectors                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1 — lineage CREATE fence            | Import preparation/dispatch inspects relevant predecessor/consolidation output claims across new Candidate IDs; uncertain CREATE blocks competitors, known success supplies exact target/result, split/merge/distinct purposes require reviewed disposition. Plugin lineage requirement preserves this boundary. Vectors cover escalation with response loss, successful target missing from search and split purposes. |
| I2 — mixed-action revision semantics | Assessment labels do not create separate commands. One atomic operation only with an admitted all-field typed command; otherwise reviewed dependencies/successors recover predecessor receipt and validate the decision/current base per B-T3C. Unsupported dimensions defer. Vectors cover base-7 mixed changes, verified revision-8 successor and unknown/intervening revision-9 cases.                               |
| I3 — Flight automatic anchors        | Registry `import-flight-match-v1` qualifies supplier occurrence/leg scope or complete unique carrier/service/origin-local-date/route tuple, with explicit supporting/negative evidence. Matrix covers dates, routes, codeshare, retiming, rescheduling/changed number, acquisition legs and multiple passengers/PNRs. Until admitted, use POSSIBLE_DUPLICATE/UNRESOLVED_MATCH.                                          |
| C1 — Flight temporal predicate       | EXACT departure, supported civil resolution or independent instant evidence/confirmation; preserve civil/offset/IANA/derived/source distinctions. Offset-only 2026-12-18 09:00 +13:00 yields derived 2026-12-17T20:00Z but no fabricated zone/source instant; separate explicit instant confirmation has its own proof. Arrival EXPECTED; selected known arrival validates independently and ordering.                  |
| C2 — attention                       | Configurable/versioned baseline default 24 hours, explicit now/clock provenance, evidenced actionable deadlines including boarding/check-in; conservative unknown-context attention without invented instants. Presentation/policy change cannot mutate domain facts/identity/matching/closure.                                                                                                                         |
| C3 — pass versus quiescence          | Intake/current-pass completion is distinct from outstanding/resumable work and processing quiescence. Deferred network/intelligence/enrichment remains wakeable; no evidence release, Source terminality or hidden later results from batch completion. No second owner/queue.                                                                                                                                          |

Exact CP12 files amended in this correction pass: architecture, Import contract,
registry, intelligence contract, ADR and this report (six files). Provider roadmap
and current-state handoff remain unchanged from the prior delivery. The independent
review is a separate eighth untracked document, not authored/modified by this pass.

## Remaining genuinely deferred questions

- Final owner acceptance of these corrected contracts; no CP13 implementation or
  runtime activation is authorized. I1/I2/I3 and C1/C2/C3 are resolved normative draft
  semantics, not unanswered builder choices.
- Exact proposal/schema adapter fields, persisted lineage/output-purpose preparation
  and serialization seams, scoped booking/passenger storage, admitted typed atomic
  commands/dependent successor transport and participant-aware read/certificates.
  These must implement the fixed semantics, not redefine canonical domains.
- Actual supported civil resolver/independent instant confirmation admission and
  capability tests, privacy/consent/retention/encryption, email/voice/fetch safety,
  bounded partition/quota mechanics and deployment-specific attention configuration.
- Actual model/device/data capabilities, budgets, freshness/coverage and executable
  conformance harness. Source runtime/host-loss/provider-UNKNOWN gates stay closed.

Deferred intentionally: engine/validators, migrations/DTOs/endpoints, queue registrations,
reconnect/background/runtime wiring, UI/notifications/CXE, inbound email, provider SDKs/
calls, Source handoff admission, target commit adapters and Ledger evidence matching.
Contract review is the next step; it grants no implementation/activation approval.

## Validation and final Git scope

Correction-pass validation **PASS**: formatting for all seven CP12 deliverables;
27 relative links/anchors; I1/I2/I3 and C1/C2/C3 contract/vector coverage plus retained
six-layer/twelve-subtype/seven-capability/addendum/closure coverage; whitespace;
exact six-file correction scope; unchanged base/branch; no staged changes; clean
original canonical checkout. Standard-library arithmetic independently verifies
2026-12-18 09:00 +13:00 → 2026-12-17T20:00Z, without asserting source-instant authority.

Protected Red Team review SHA-256 before/after is identical:
`8c3546c08b25b7017d8d83321a51bda7dedb722aa2785615ed352f294d9be99f`.
Provider roadmap and current-state handoff hashes are also unchanged from the start
of this pass. No product runtime tests or provider/database acceptance are claimed.

Correction-pass UI guard PASS: 473 unchanged legacy occurrences; 76 representative files checked.
The fresh worktree has no installed dependencies. An initial guard invocation could
not resolve TypeScript; rerun with the existing canonical dependency directory via
NODE_PATH passed against this worktree's source and working directory. No dependency
installation, lockfile change or runtime configuration was made.

No product tests, database replay, migration application, native build, remote
capability or live acceptance is claimed for this documentation-only change.

Final verified status: seven CP12 untracked documents plus the owner-provided
untracked review and previously modified current-state handoff; no staged changes, retained exact HEAD/branch. Original checkout stays clean.

## Owner-correction explicit answers

| Criterion                                   | Answer |
| ------------------------------------------- | ------ |
| I1 lineage CREATE fence resolved            | YES    |
| I2 mixed-action revision semantics resolved | YES    |
| I3 Flight automatic anchor policy resolved  | YES    |
| Arrival universally closure-critical        | NO     |
| 24h urgency architecture constant           | NO     |
| Batch completion cancels deferred work      | NO     |
| Red Team review file modified               | NO     |
| Production code changed                     | NO     |
| DB/schema/runtime/UI changed                | NO     |
| Commit                                      | NO     |
| Push                                        | NO     |

## Required explicit answers

| Criterion                                                                    | Answer |
| ---------------------------------------------------------------------------- | ------ |
| Import pipeline contract defined                                             | YES    |
| Batch N↔M model defined                                                      | YES    |
| Context Snapshot defined                                                     | YES    |
| Evidence/provenance defined                                                  | YES    |
| Entity resolution defined                                                    | YES    |
| Schema registry defined                                                      | YES    |
| Flight closure schema defined                                                | YES    |
| Offline continuation defined                                                 | YES    |
| Progress/attention facts defined                                             | YES    |
| OpenAI plugin boundary defined                                               | YES    |
| Anthropic plugin boundary defined                                            | YES    |
| Apple/local plugin boundary defined                                          | YES    |
| future plugin extensibility defined                                          | YES    |
| Data-provider boundary defined                                               | YES    |
| Trip/Ledger boundary defined                                                 | YES    |
| CXE presentation independence preserved                                      | YES    |
| Existing-item completion/augmentation and seven addendum outcomes defined    | YES    |
| Occurrence/booking/participant scoped facts and ambiguous membership defined | YES    |
| production code changed                                                      | NO     |
| server schema changed                                                        | NO     |
| SQLite/DB changed                                                            | NO     |
| runtime wiring changed                                                       | NO     |
| UI changed                                                                   | NO     |
| Hosted Dev/Production accessed                                               | NO     |
| commit                                                                       | NO     |
| push                                                                         | NO     |

YES means contract coverage, not human acceptance or implemented capability.

**STOP — READY FOR FINAL OWNER CONTRACT REVIEW.**
