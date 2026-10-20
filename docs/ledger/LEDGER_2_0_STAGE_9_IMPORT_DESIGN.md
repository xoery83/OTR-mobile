# Ledger 2.0 Stage 9 Import Design & Safety Plan

Date: 2026-09-13
Status: Implemented and accepted in Hosted Dev; Stage 9 complete

## Stop Conditions And Approval Gates

The design plus the 2026-09-13 final constraints authorize tooling, read-only
legacy code inspection, and synthetic local/Dev-shaped validation only. They do
not authorize any Production connection or extraction, Hosted Dev load, or
Mobile replay injection.

Stage 9 has three separate approvals:

1. tooling and synthetic validation approval (complete);
2. after read-only extraction and deterministic transformation, approve the
   safe manifest and redaction report before any Dev load;
3. approve any rollback action separately if post-load validation fails.

The Production Europe Journey UUID is intentionally not present in Git. It must
be supplied explicitly in private runtime configuration as
`OTR_STAGE9_SOURCE_JOURNEY_ID`. Extraction stops if it is absent, malformed, or
does not select exactly one `trips` row. The extractor never searches by name,
destination, date, or fuzzy match.

The only destination is `tuqigdxrvrerfewsxqgm` / `OTR Development`. The replay
Journey name is `Europe 2026 Replay`. Its deterministic Dev UUID will be
generated during transformation and included in the pre-load manifest.

Active identifiers are fixed as:

- transform: `stage9-europe-replay-v3`;
- normalization: `legacy-equal-rounding-normalization-v2`;
- mapping: `legacy-ledger-to-ledger2-v1`;
- allocation: `ledger-largest-remainder-v1`;
- manifest: `stage9-import-manifest-v1`.

## Pipeline

```text
Production preflight (metadata only)
  -> Extract to private immutable files
  -> Transform from files only
  -> Validate transformed data
  -> Generate safe manifest and redaction report
  -> STOP FOR LOAD APPROVAL
  -> Capture and verify Dev restore point
  -> Backend-owned transactional load
  -> Independent Dev validation
  -> Normal Mobile bootstrap/pull acceptance
  -> Private artifact cleanup
```

No command combines extraction and load. Transform never connects to
Production. Load accepts only a transformed dataset whose digest is recorded in
an approved manifest.

## 1. Exact Production Source Allowlist

All row values below remain in private artifacts. `presence count only` means
the extractor may return only `count(*) filter (where column is not null)` for
the redaction report; it may never export the value.

| Table                       | Row-export columns                                                                                                                                                                                                                      | Presence-count-only columns                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trips`                     | `id`, `start_date`, `end_date`                                                                                                                                                                                                          | `name`, `destination`, `cover_image_url`, `created_by`, `photo_storage_provider`, `photo_storage_status`, `photo_storage_root_folder_id`                                                                                                                                                                                                                                     |
| `journey_members`           | `id`, `trip_id`, `role`, `status`                                                                                                                                                                                                       | `user_id`, `display_name`, `avatar_url`, `notes`, `invite_email`, `invite_code`, `invited_by_user_id`, `linked_at`                                                                                                                                                                                                                                                           |
| `journey_ledgers`           | `journey_id`, `base_currency`, `display_currency`, `exchange_rates_snapshot_date`                                                                                                                                                       | `exchange_rates_snapshot_source`, `exchange_rates_refreshed_by`                                                                                                                                                                                                                                                                                                              |
| `ledger_entries`            | `id`, `journey_id`, `category`, `accounting_mode`, `expense_date`, `start_date`, `end_date`, `original_amount`, `original_currency`, `base_amount`, `base_currency`, `exchange_rate`, `exchange_rate_date`, `payer_member_id`, `status` | `title`, `description`, `itinerary_event_id`, `itinerary_reservation_id`, `memory_entry_id`, `created_by_member_id`, `created_by_user_id`, `address_text`, `latitude`, `longitude`, `location_source`, `location_text`, `location_lat`, `location_lng`, `location_confidence`, `place_id`, `location_provider`, `location_provider_place_id`, `geocoded_at`, `geocode_error` |
| `ledger_entry_participants` | `ledger_entry_id`, `member_id`, `split_method`, `share_amount`, `share_percentage`, `computed_share_base_amount`                                                                                                                        | none                                                                                                                                                                                                                                                                                                                                                                         |
| `journey_exchange_rates`    | `journey_id`, `base_currency`, `quote_currency`, `rate_to_base`, `rate_date`                                                                                                                                                            | `source`                                                                                                                                                                                                                                                                                                                                                                     |
| `ledger_settlements`        | `id`, `journey_id`, `from_member_id`, `to_member_id`, `amount`, `currency`, `status`, `created_at`                                                                                                                                      | `notes`                                                                                                                                                                                                                                                                                                                                                                      |

Every query is scoped by the exact Journey UUID. Child rows are selected by a
join to the already scoped parent, not by an unbounded table export. No
`profiles`, Auth, invite, place, media, Storage, itinerary, memory, provider, or
third-party table is queried. No receipt or asset inventory is queried; the
manifest records zero asset rows and zero asset payloads extracted.

The row allowlist deliberately omits traveller names and expense titles. Their
Dev replacements can therefore be generated without ever exporting the
plaintext source values.

## 2. Read-Only Extraction Mechanism

The dedicated Session Pooler reader is retired because existing Production RLS
intentionally denies that role Journey rows. Extraction instead uses a
short-lived access token from an already-existing real Production Journey
member/creator through the normal `authenticated` PostgREST path. Stage 9 does
not create users, change memberships, use service-role credentials, refresh the
token, or change Production RLS, roles, grants, functions, schema, or
privileges.

The token is supplied through a one-time `0600` file under the encrypted private
Stage 9 root. It is never placed in command arguments, URLs, logs, reports, or
Git. The extractor requires `role = authenticated`, an issuer bound to the exact
Production project, a valid subject, and remaining lifetime greater than the
estimated complete two-pass duration plus a fixed safety margin. The same token
must cover preflight and both passes. The local token file is removed after it
is read; this is retention cleanup, not secure erasure on SSD/APFS. The process
has no refresh or server-side logout capability and relies on natural JWT
expiry.

The private runtime variables are
`OTR_STAGE9_SOURCE_SUPABASE_URL`, `OTR_STAGE9_SOURCE_PROJECT_REF`,
`OTR_STAGE9_SOURCE_PUBLISHABLE_KEY`, `OTR_STAGE9_SOURCE_JOURNEY_ID`,
`OTR_STAGE9_SOURCE_ACCESS_TOKEN_FILE`, `OTR_STAGE9_PRIVATE_ROOT`, and
`OTR_STAGE9_ESTIMATED_TWO_PASS_SECONDS`. The duration estimate must be at least
60 seconds; the extractor additionally requires a fixed 300-second token safety
margin. Service/secret keys are rejected. The token file must resolve inside the
private root, be a regular non-symlink file owned by the current user, and expose
no group/other permission bits.

Every network request is a fixed code-owned GET to the exact
`https://<project-ref>.supabase.co/rest/v1/...` origin. Redirects are rejected.
There is no generic method, URL, table, column, filter, SQL, RPC, Auth, Storage,
or Functions path. Financial numeric fields use the fixed PostgREST CSV response
format so their decimal text is not converted through JavaScript floating
point.

Preflight queries only the explicit Journey UUID and requires exactly one
visible `trips` row. Extraction then performs two complete reads with stable
unique keyset ordering. Each pass verifies exact counts, strict ordering,
duplicate identities, scoped parent relationships, approved row columns, and
presence-count-only columns. Per-table ordered identity and content digests feed
one source-set fingerprint. Pass A writes only a candidate bundle; Pass B must
match it exactly. A successful bundle is fsynced, gains an explicit committed
receipt, and is atomically renamed to `raw/`. Failed, changed, or interrupted
candidates are rejected and cannot be consumed by the transformer.

## 3. Explicit Europe Journey Selection

The private run configuration contains exactly one UUID in
`OTR_STAGE9_SOURCE_JOURNEY_ID`. Preflight verifies:

- `trips.id = supplied UUID` returns exactly one row;
- every exported parent row uses that UUID;
- every participant belongs to an exported entry;
- every referenced payer and participant belongs to the selected Journey;
- no row from another Journey appears in any export file.

The UUID is printed only in the secure preflight session and private evidence;
the safe manifest uses an HMAC reference instead.

## 4. Private Artifact Location And Retention

`OTR_STAGE9_PRIVATE_ROOT` must resolve outside
`/Users/xoery/Project/otr-mobile` and `/Users/xoery/Project/otr`, on an encrypted
local volume. The tool creates a mode-`0700` run directory and mode-`0600`
files. A run contains:

```text
raw/                 immutable JSONL exports plus source digest
config/              private namespace and approved member/Auth mapping
mapping/             Production-to-Dev ID map
transformed/         canonical private load dataset plus digest
reports-private/     row-level HMAC references and review reason codes
reports-safe/        manifest and redaction report
restore/             Dev restore evidence or encrypted logical backup
```

After extraction, raw files are changed to read-only and their SHA-256 digest
is verified before every transform. Transformation creates new files and never
modifies `raw/`.

Raw exports, mappings, secrets, transformed private data, and restore material
are deleted after post-load Dev and Mobile acceptance, after the approved
rollback window expires. Safe manifest/redaction reports and the backend import
receipt may be retained. On SSDs, deletion is not claimed to be secure erasure;
confidentiality relies on the encrypted volume and restricted permissions.

Before any commit, `git status --short` and a repository scan must prove that no
raw export, transformed dataset, mapping, Production UUID, Production project
reference, email, token, Storage path, or private namespace secret exists in
the worktree or index.

## 5. Production-To-Dev Identity Mapping

The mapping file is private and explicit:

- one source owner member is mapped to the approved Dev organizer Auth identity;
- optionally one or more source members are mapped to approved dedicated Dev
  member identities;
- every other source member becomes an unlinked Dev Journey member with
  `user_id = null`;
- no Production `user_id` is extracted or reused;
- no mapping is inferred from role, name, email, order, or similarity.

The run stops if the explicit owner mapping is missing, refers to a member
outside the source Journey, maps two source members to one Dev member, or maps a
source member to a non-approved Dev Auth identity.

Legacy `owner`, `group_member`, and `guest` roles are retained. A mapped Auth
member becomes `linked`; all others become `unlinked`. Invite state, emails,
codes, notes, avatars, and linkage timestamps are discarded.

## 6. Pseudonymization Rules

- Journey name is always `Europe 2026 Replay`; source Journey name and
  destination are not extracted.
- Member labels are deterministic `Traveller NN` labels ordered by their
  private HMAC identity token. Source display names are not extracted.
- Expense titles are deterministic `Imported <category> <token>` labels using a
  short private HMAC token. Source titles and descriptions are not extracted.
- No address, coordinate, location/provider value, notes, email, avatar, media,
  receipt, Storage path, Auth identifier, or creator user identifier enters the
  transformed dataset.
- Date, category, currency, and financial values are retained only because the
  approved replay profile requires them.

The pseudonym map never leaves the private run directory.

## 7. Deterministic Dev IDs

A private 256-bit namespace key is created once for this replay and stored only
in `config/`. For every entity, the transformer computes
`HMAC-SHA-256(namespaceKey, transformVersion | entityType | sourceIdentity)`,
uses the first 16 bytes, and sets the RFC 9562 UUID version-8 and variant bits.

The same namespace, source identity, entity type, and transform version always
produce the same Dev UUID. Production UUIDs are never used as Dev UUIDs or
embedded in Dev provenance. Node's standard `crypto` module is sufficient; no
new dependency is required.

The manifest contains only a non-secret namespace fingerprint and the expected
Dev Journey UUID. It never contains the namespace key or source-to-target map.

## 8. Per-Table Transformation

| Source                      | Destination                                                 | Rule                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trips`                     | `trips`                                                     | Deterministic new id, fixed replay name, retained start/end dates, Dev organizer as creator, all destination/media fields null.                                                                |
| `journey_members`           | `journey_members`                                           | Deterministic new ids, generated labels, explicit Auth mapping or unlinked identity, retained valid role, no invite/profile fields.                                                            |
| `journey_ledgers`           | `ledger_settings`                                           | Base currency becomes settlement currency; scale comes from versioned ISO metadata; policy is `MANUAL_AGREED` because imported per-expense valuations remain explicit `LEGACY_IMPORTED` facts. |
| `ledger_entries`            | `expenses`                                                  | One deterministic aggregate per source entry; generated title; mapped category/date/payer/money; no description or location; safe import provenance only.                                      |
| `ledger_entry_participants` | `expense_participants`, `expense_splits`                    | Mapped members and generated display snapshots; only provable allocations become exact accepted splits.                                                                                        |
| entry rate/base fields      | `exchange_rate_snapshots`, `settlement_valuation_snapshots` | Deterministic immutable records with `LEGACY_IMPORTED` provenance and the recorded source rate/base value.                                                                                     |
| `journey_exchange_rates`    | validation evidence only                                    | Cross-checks currency pair/date/rate metadata; it is not loaded as a mutable Dev quote.                                                                                                        |
| `ledger_settlements`        | safe aggregate provenance only                              | Counts/totals/status distribution and private HMAC row references; never `settlements`, `settlement_transfers`, or `settlement_payments`.                                                      |

`expense_date` maps to `occurred_at` as `<expense_date>T00:00:00.000Z`, never
the load clock. `import_provenance` records `occurredPrecision = DATE` and tells
consumers that the time component is a sentinel, not a claimed source time.
Source start/end dates remain provenance only.

No Household, PaymentRecord, receipt/evidence, link, correction, historical
audit event, Settlement, Transfer, or Payment is created. Normal database
change-feed triggers may record the newly imported current state; that is
transport state, not fabricated legacy history.

## 9. Legacy Expense To Ledger 2.0 Mapping

An entry is eligible for `ACCEPTED` only when all of these are true:

- legacy status is `complete` and accounting mode is `shared` or `stats_only`;
- category is one of the ten canonical legacy categories;
- original and base currencies are valid in the checked-in ISO metadata;
- original and base decimals convert exactly to positive integer minor units;
- payer and every participant map to distinct members in the replay Journey;
- at least one participant exists and all rows declare `equal`;
- every computed base share converts exactly and either reconciles to base or
  passes the bounded v2 legacy-equal-rounding proof below;
- entry base currency equals the Journey base currency;
- same-currency amount/rate rules or cross-currency rate/base checks pass;
- original and settlement split totals both reconcile with zero residual.

Accepted rows use revision `1`, contain no PaymentRecord, and receive one active
`LEGACY_IMPORTED` valuation. `shared` maps to settlement `INCLUDED`;
`stats_only` maps to settlement `EXCLUDED`. Source `accounting_mode`, destination
participation, and source date range are stored as bounded import provenance.

Structurally loadable review rows use `DRAFT`, no active valuation, and a
deterministic `IMPORT_NEEDS_REVIEW` finding. Structurally unloadable rows remain
in the private review report and are absent from canonical tables; this avoids
inventing a required payer, valid currency, or positive amount.

## 10. Participant To Exact Split Mapping

Version 3 accepts only the legacy split mode that the audited Web flow actually
created: `equal`.

- Original-currency allocations use the existing deterministic
  largest-remainder `allocateEqual` rule with stable mapped member ids.
- Exactly reconciled settlement allocations retain the converted
  `computed_share_base_amount` values.
- A non-zero settlement residual is normalized only when the entry is `shared`
  or `stats_only`,
  every stored share exactly equals the verified legacy
  `Number((base_amount / participantCount).toFixed(2))` result, all other Money,
  rate, payer, participant, and split evidence passes, and no other review reason
  exists. Stable mapped-member UUID ordering and
  `ledger-largest-remainder-v1` then produce the exact destination split.
- Normalized provenance records legacy equal intent, independent JS `toFixed(2)`
  source rounding, historical-evidence status for stored shares, the v2
  normalization version, the destination allocation version, and that the
  destination participant amounts are not claimed historical values.
- The accepted canonical method is `EQUAL_PERSON`; exact integer amounts are
  persisted for every participant.
- Duplicate members, missing members, mixed modes, null computed shares, unsafe
  decimals, unexplained residuals, or any additional review reason
  remain `NEEDS_REVIEW` or unloadable.

`custom_amount` and `custom_percentage` are not auto-accepted in transform version 3.
The legacy audit found these modes latent but not reliably produced by the Web
flow, so interpreting their ambiguous currency/rounding semantics would invent
facts. They may be resolved only through a separately reviewed mapping version.

## 11. Money, Rate, And Valuation Rules

The transformer reuses the checked-in ISO metadata version `CLDR-48.0` and pure
Ledger allocation/conversion rules.

- Decimal strings are parsed as integers plus scale; JavaScript floating point
  is never an authority.
- A legacy amount is multiplied by `10^ISO exponent` and accepted only if the
  result is an exact integer within the signed 64-bit and JavaScript safe-integer
  bounds used by the existing contract. No rounding is allowed during decimal
  to minor-unit conversion.
- Same-currency rows require rate `1` and equal original/base Money after scale
  conversion.
- Cross-currency rows require a positive recorded quote-to-base rate and matching
  currencies. The stored base amount is preserved rather than recomputed.
- For every snapshot, `quote_currency` is the Expense original currency,
  `base_currency` is the Journey settlement currency, and `decimal_rate` is the
  recorded quote-to-base `exchange_rate`/`rate_to_base` value.
- The source `base_amount` is the settlement value. Its valuation policy and
  snapshot source are `LEGACY_IMPORTED`; the original recorded decimal rate and
  effective date are retained as immutable evidence.
- The verified legacy writer used JavaScript
  `Number((original * rate).toFixed(2))`; exact Ledger 2.0 HALF_UP recomputation
  is diagnostic only and is not an acceptance gate.
- No mutable external rate lookup and no current provider quote is consulted.

## 12. `LEGACY_IMPORTED` Provenance

Safe Dev provenance contains only:

- transform and mapping versions;
- opaque HMAC source reference;
- legacy accounting mode;
- date-only precision and optional date range;
- ISO metadata version;
- `LEGACY_IMPORTED` rate/valuation classification;
- canonical transformed payload hash.

It contains no Production UUID, project reference, title, name, note, user id,
provider payload, or source-to-target mapping.

## 13. `NEEDS_REVIEW` Classification

Reason codes are deterministic and may include:

- `SOURCE_STATUS_NOT_COMPLETE`;
- `MISSING_OR_INVALID_PAYER`;
- `MISSING_OR_INVALID_PARTICIPANT`;
- `DUPLICATE_PARTICIPANT`;
- `UNSUPPORTED_OR_MIXED_SPLIT_MODE`;
- `MISSING_COMPUTED_SHARE`;
- `UNSAFE_OR_INEXACT_MONEY`;
- `UNKNOWN_CURRENCY_OR_SCALE`;
- `RATE_PAIR_OR_VALUE_INVALID`;
- `BASE_VALUE_MISMATCH`;
- `ORIGINAL_SPLIT_MISMATCH`;
- `SETTLEMENT_SPLIT_MISMATCH`;
- `NON_POSITIVE_AMOUNT`;
- `OUT_OF_RANGE`.

Legacy draft/review rows and unsupported split modes may be loaded as reviewable
`DRAFT` records only if their required destination payer, Journey, currency,
and positive Money are valid. A valid complete/equal `stats_only` row is instead
canonical `ACCEPTED + EXCLUDED`. Missing required destination facts makes the
row unloadable. The manifest separates loaded and unloaded review counts so
nothing is hidden.

## 14. Private Approval Manifest And Repo-Safe Summary

The private approval manifest is generated after validation and before load. It
may contain exact grouped Production totals needed for reconciliation and is
not automatically safe for Git. It has this structure:

```text
manifestVersion
state = PRELOAD_VALIDATED
sourceJourneyRefHmac
extractedAt
sourceTables[] { table, rowExportColumns, presenceCountColumns, rowCount }
sourceFinancialTotals[] { classification, currency, category, amountMinor, scale }
sourceFinancialChecksums[] { classification, currency, category, hmacSha256 }
destination { projectRef, projectName, journeyId, journeyName, entityCounts }
classificationCounts { accepted, needsReviewLoaded, needsReviewUnloaded, excluded }
pseudonymizationCounts { journeyLabels, memberLabels, expenseTitles }
redactionCounts { omittedSensitiveColumns, presentSensitiveValues, assetRowsExtracted, assetPayloadsExtracted }
versions { transform, mapping, iso4217, allocation, manifest }
idempotency { importKey, namespaceFingerprint, transformedDatasetSha256 }
validation { financial, relationship, privacy, duplicateMapping }
```

It contains no plaintext names, emails, notes, coordinates, receipt content,
tokens, Production project reference, Production UUID, source-to-target map, or
private namespace key. Financial totals are grouped and exact; row-level values
are absent.

A separate repo-safe retained summary contains only counts, versions, pass/fail
results, and keyed non-reversible checksums. It omits exact Production financial
totals. Copying any private approval report into Git requires a separate content
review and explicit approval.

## 15. Redaction And Privacy Report

The safe report records pass/fail and counts for:

- forbidden source columns omitted by the static allowlist;
- zero exported asset/media/Storage rows and payloads;
- traveller and title substitutions;
- Production UUID exact-match scan using the private source-id set;
- email, JWT/token/secret, URL/Storage-path, coordinate/address key, free-form
  notes, receipt/OCR/media, Auth/provider identifier, and Production hostname
  scans;
- allowed Dev UUID and generated-label format checks;
- manual explanations for any false positive.

Any unexplained hit blocks manifest approval and load. Raw matching values are
never copied into the safe report or normal logs.

## 16. Idempotency And Source Mapping

The transformed dataset is canonical JSON with sorted object keys and stable
entity ordering. Its SHA-256 is the load payload identity.

The backend import uses one stable key,
`STAGE9_EUROPE_REPLAY_V1:<devJourneyId>`, and records the payload hash in
`ledger_idempotency_keys` for the dedicated Dev operator. The receipt and
deterministic target Journey id are checked before insertion:

- absent receipt and absent target Journey: insert the expected rows;
- present receipt with the same canonical payload hash: treat as replay;
- present receipt with a different hash: fail `IMPORT_PAYLOAD_CONFLICT`;
- present target Journey without the matching receipt: fail
  `IMPORT_JOURNEY_CONFLICT` rather than adopting existing rows;
- source HMAC mapped to more than one target or target mapped from more than one
  source: fail before load.

The loader never updates an existing imported financial row. A failed import
rolls back its idempotency receipt and all rows in the same transaction.

## 17. Dev Transactional Load

After separate approval, implementation adds one backend-owned, service-role-
only import command and the minimum database function needed to execute the
validated dataset in one transaction. Mobile and UI code are not involved.

The command must:

1. require the exact host `tuqigdxrvrerfewsxqgm.supabase.co` using the existing
   backend Dev guard pattern;
2. require the approved manifest and verify its dataset digest;
3. require the deterministic Journey id and exact name
   `Europe 2026 Replay`;
4. verify the current migration ledger/schema checksum;
5. verify no outbound notification or third-party integration is enabled for
   the import path while preserving financial validation and change-feed
   triggers;
6. load only the destination tables named below;
7. run all deferred Ledger constraints before commit;
8. return counts and a safe import receipt only.

Direct destination tables are limited to `trips`, `journey_members`,
`ledger_settings`, `expenses`, `expense_participants`, `expense_splits`,
`exchange_rate_snapshots`, `settlement_valuation_snapshots`,
`ledger_review_findings`, and `ledger_idempotency_keys`. Existing database
triggers may populate `ledger_changes`. No Storage or legacy Ledger table is a
load target.

The Stage 9 loader uses one transaction for the selected Journey. If the validated
payload exceeds the measured backend/database request ceiling, load does not
silently split it; the design returns for approval of a resumable batch protocol.

## 18. Dev Restore And Rollback

Before load, operations must record:

- all current `supabase_migrations.schema_migrations` versions;
- schema manifest counts and checksum;
- Dev project reference/name;
- pre-load counts/digests for every destination table;
- current Auth identity and Storage object counts;
- the approved restore mechanism and its restore-test evidence.

Preferred restore is a Supabase Dev snapshot/PITR point when the project supports
it. Otherwise, use an encrypted logical backup outside Git (plain SQL/COPY or
custom format as appropriate) and prove it can restore into a disposable Dev
project before loading the approved target. If neither mechanism can be proved,
load is blocked.

Transaction failure needs no cleanup because it rolls back. A post-commit
failure uses the approved restore point; no ad-hoc deletes, trigger disabling,
or Production action is permitted. Restore is a separate destructive operation
and requires explicit approval at that time.

## 19. Pre-Load Validation

The validator reads only the transformed dataset and private mapping. It must
prove:

- dataset and raw source digests match their recorded values;
- schema, transform, mapping, ISO, and allocation versions match the manifest;
- all ids are deterministic Dev ids and every relationship is closed;
- Journey/member/payer/participant ownership is exact;
- every accepted Expense has one payer, participants, one exact split per
  participant, and one active valuation;
- original and settlement split sums equal their parent totals exactly;
- every v2-normalized row carries complete normalization provenance and every
  non-normalized row carries none;
- DRAFT rows carry no split or active valuation and therefore cannot contribute
  to authoritative reporting or settlement;
- amount/rate conversions are exact and within bounds;
- same-currency and cross-currency invariants pass;
- accepted totals/checksums by currency/category equal the manifest;
- all `NEEDS_REVIEW` and excluded rows have explicit reason codes;
- Production id, private data, secret, and duplicate scans return zero hits.

The validator reuses existing pure Ledger currency/allocation/aggregate logic
where applicable. A single focused test fixture will cover deterministic ids,
exact money rejection, unexplained-residual rejection, privacy rejection, and idempotent
replay; no new framework is needed.

## 20. Post-Load Financial And Privacy Validation

An independent read-only Dev verifier queries the replay Journey and compares
database results with the approved manifest:

- Expense counts by accepted/draft state;
- participant and split counts;
- original totals by currency and category;
- settlement-value totals by currency and category;
- exact original and settlement split sums;
- payer/member/Journey ownership;
- `IMPORT_NEEDS_REVIEW` finding and unloaded-review counts;
- active valuation count and `LEGACY_IMPORTED` provenance;
- zero PaymentRecord, Receipt, Household, canonical Settlement, Transfer, or
  SettlementPayment rows created by the import;
- zero duplicate deterministic ids, source HMACs, and import receipts;
- zero Production identifiers, secrets, emails, Storage paths, coordinates,
  addresses, notes, receipt/photo/OCR content, or provider payloads.

The verifier recomputes balances from queried Dev facts and requires group net
zero. A successful transaction without these checks is a failed import.

The same approved import is then run again. It must return an idempotent replay
receipt and produce zero row-count, revision, change-feed, finding, or financial
fingerprint differences.

## 21. Mobile Bootstrap/Pull Acceptance

Acceptance signs in through the normal Dev Auth path, selects the replay
Journey, and uses the existing Hosted Dev bootstrap/pull flow. It never inserts
or edits Mobile SQLite directly.

For organizer and linked-member clients, SQLite v17 must contain the manifest's
expected replay rows in `ledger_journeys`, `ledger_members`,
`ledger_expenses`, `ledger_expense_participants`, `ledger_expense_splits`,
`ledger_valuation_snapshots`, and `ledger_review_findings`. Server ids,
revisions, counts, totals, and accepted/review classifications must match Dev.

Cold-start cached read, incremental pull with no duplicate rows, normal Ledger
UI rendering, and repository-backed totals must pass. A Mobile count mismatch
or privacy hit fails acceptance even when Dev validation passed.

## 22. Cleanup

After Dev and Mobile acceptance and the approved rollback window:

1. verify retained safe reports and backend receipt are sufficient;
2. delete `raw/`, `config/`, `mapping/`, `transformed/`, private review files,
   and local restore material according to the restore policy;
3. verify the private run directory contains only explicitly retained safe
   reports, or delete the directory entirely;
4. scan both repositories and Git indexes for artifact names, Production ids,
   secrets, emails, and dataset signatures;
5. record cleanup completion without logging deleted content.

## Approval Checklist

Approval of this plan must confirm:

- the seven-table source allowlist and presence-count-only columns;
- explicit private Journey UUID selection rather than name discovery;
- conservative accepted/`NEEDS_REVIEW` rules, including no automatic custom
  amount/percentage interpretation;
- deterministic private HMAC/UUIDv8 mapping;
- generated member and expense labels without extracting plaintext names;
- no canonical promotion of legacy settlements;
- single-transaction backend-owned Dev load and exact project guard;
- restore-point proof before load;
- a second stop after manifest/redaction generation and before Dev mutation.

All gated steps were separately approved and completed: synthetic ETL and HTTP
acceptance, authenticated read-only Production extraction, private mapping,
offline v3 transformation, recovery rehearsal, Hosted Dev transactional load,
independent verification, idempotent replay, and normal Mobile bootstrap/pull.
Production is disconnected and unchanged. Private artifacts remain retained
until the separately approved rollback window expires; Stage 10 is not started.
