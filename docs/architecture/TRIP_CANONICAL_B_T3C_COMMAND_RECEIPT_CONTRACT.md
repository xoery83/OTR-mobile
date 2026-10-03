# Trip Canonical B-T3C — Event Command / Receipt / Writer Activation Contract

Date: 2026-10-04 (Pacific/Auckland). Status: **B-T3C CONTRACT COMPLETE — REVIEW PENDING**.
Design only. Proposed names, signatures, records and routes below are not installed.
**Canonical commands remain disabled.**

Startup: `/Users/xoery/Project/otr-mobile-temporal`, `trip/temporal`, clean HEAD
`f196f9840d49d7184cbba121ad80c8e6ed82e707`; recent log checked. Only this document
changes. No SQL execution, migration, application code, SQLite, database access,
deployment, commit or sibling worktree modification. The task's one-file boundary
also leaves the current-state handoff unchanged. Its historic uncommitted B-T3B
wording is superseded by `1ce691c`; C-I3A is committed at this HEAD. Neither commit
means that future command activation has passed review.

## A. Executive decision and evidence

Choose an Event-owned, typed command boundary and one immutable operation receipt
per admitted operation. Reuse the existing Backend/auth/repository/queue principles;
do not reuse Ledger business commands, financial receipts or a universal command bus.
Event mutation, manual confirmation facts and the receipt commit in **one database
transaction**. A C-only evidence-finalization transaction is deliberately separate.

The first useful activation is narrower than all seven storage shapes: CREATE and
five narrow update families for POINT, CALENDAR and ALL_DAY, using rule-independent
input only. This permits honest unknown/date-only/source-instant schedules, title,
notes, location, grouping and status corrections without inventing a tzdb identity.
Complex shapes, adoption, participants, Booking and provider writers stay disabled.
All first-slice commands still need separate implementation and activation review.

| Local authority inspected                                                                            | Consequence                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-T0 temporal/spatial audit, A/D/I/M; B-T1 A–J; B-T2 A/G/Q/T/U/W                                     | No UTC concatenation as civil truth; no Trip zone; preserve uncertainty, Stay and independent transport endpoints.                                   |
| B-T3A B/D/G/H/J–N                                                                                    | Exact storage field/types, revision, provenance, legacy, participant and lossless-mirror constraints remain authoritative.                           |
| B-T3B report and `20261004000100_trip_temporal_protected_foundation.sql`                             | Storage/guards exist; writer is reserved and disabled. Reuse checks include live-column effective privileges, PUBLIC/inheritance and table grants.   |
| A1 identity/membership, I2A schema, I2B1 snapshot/cursor contract                                    | Account != TripPerson; lifecycle revision/freshness are not Event CAS or permissions.                                                                |
| C-I2 preflight; C-I3A C/J/K/L/M                                                                      | Prepared slot evidence, exact domain operation correlation, receipt recovery and C-only finalization; no competing accepted schedule.                |
| `backend/src/app.ts:getIdempotencyKey/createEntity/executeTypedExpense`                              | Existing header/body correlation, server authentication/admission and safe error envelope; legacy itinerary replay is row lookup, insufficient here. |
| `backend/src/supabaseGateway.ts:canWriteTrip/createItineraryItem/executeExpenseCommand`              | Existing write predicate and literal legacy UTC mapping; Expense replay precedes head/history preparation.                                           |
| `20260929000100_expense_consistency_v2.sql`                                                          | Domain-owned operation locking and immutable receipt/replay principle; financial merge/conflict machinery is not copied.                             |
| PRODUCT/ARCHITECTURE/DATA_MODEL/API_CONTRACT/OFFLINE_SYNC/environment/legacy audit and current state | SQLite/repositories and Account-owned durable work remain the Mobile boundary; no legacy Web checkout or remote inspection.                          |

PASS below means contract coverage, not tested executable capability. PENDING means
an implementation/review gate. BLOCKED means a proposed feature cannot activate at
this HEAD. No runtime test or remote availability is inferred from design.

## B. Selected activation scope

Proposed capability `eventCommandsV1` advertises contractVersion 1, explicit enabled
command names, enabled shapes, `UNASSIGNED`, maximum precision 6 and resolver
availability. It defaults disabled. Missing/unknown capability is disabled, never
fallback to legacy DTOs. Proposed routes are separate from existing v1 itinerary:

- POST `/v2/trips/:tripId/canonical-events` — CREATE_EVENT.
- POST `/v2/trips/:tripId/canonical-events/:eventId/commands` — discriminated,
  strictly enumerated update families, not arbitrary patches.
- GET `/v2/trips/:tripId/canonical-event-operations/:operationKey` — exact Actor's
  operation lookup; no title/provider/hash search or operation enumeration.

The first activation permits POINT/CALENDAR/ALL_DAY only; time inputs are UNKNOWN,
partial civil with **zone_id null**, date-only without a zone, or confirmed UTC
SOURCE_INSTANT without an IANA context. Normalized source instants need no civil
resolver. An input requesting a zone/resolution fails TIME_RESOLUTION_UNAVAILABLE
until H's artifact gate passes. No silent removal of the supplied zone.

SPAN/STAY/TRANSPORT/WINDOW and UPDATE_TRANSPORT/UPDATE_STAY/LINK_RESERVATION/DELETE
are considered and specified below but **deferred**, not capability-enabled.
ASSIGNED/WHOLE_GROUP, recurrence, route/stops, arbitrary reservation adoption,
legacy Event adoption and provider auto-acceptance are out of V1. Supporting extra
shapes later requires a separately reviewed capability change, not enum presence.

## C. Exact command catalog

### Common envelope

Every request has exactly `contractVersion, intentVersion, command, commandVersion,
operationKey, actorAccountId, tripId, eventId, baseSemanticRevision, payload`.
Versions are exactly 1. UUIDs are lowercase canonical UUIDs, allocated independently;
operationKey is UUID v4, not a title/content hash. Header Idempotency-Key equals it.
Route Trip/Event IDs and verified Actor must equal the envelope. Unknown keys,
unsupported versions, duplicate JSON keys or unpaired Unicode surrogates reject.
The full encoded request is at most 32,768 UTF-8 bytes, matching the current Backend
body limit; no Source bytes/excerpts/provider bodies belong here.

CREATE uses a caller-allocated stable Event UUID (including offline allocation),
baseSemanticRevision **null**, and no server ID substitution. Updates target an
existing canonical Event in the same Trip with base 1..9007199254740991.
Permanently immutable identity/history fields are Event ID, Trip ID, temporal
contract marker/version, and legacy snapshot identity/history.

`temporal_shape` is not mutable by the first-slice command families. B-T3A permits
a future semantic shape conversion only through a separately reviewed typed
shape-conversion command with normal Event CAS, full final aggregate validation
and an immutable receipt. `participant_scope` likewise is not mutable in the first
slice and remains UNASSIGNED; M's separately reviewed compatibility adapter may
later change scope/set through the same Event parent revision/receipt transaction.
`event_type` is a semantic field under B-T3A, not permanently immutable: first-slice
CREATE sets activity and first-slice updates preserve its current canonical value.
Any future event_type edit requires a separately reviewed typed whitelist with
normal CAS, aggregate validation and receipt. None of these future capabilities
is enabled or added to the command catalog here.
Existing Event ID under a new operation key rejects EVENT_ID_IN_USE even if values
match; row existence is not a receipt. There is no operation-key-to-title search.

Patch keys omitted mean preserve; explicit null clears **only** a nullable named
field. Empty patches reject. Complete temporal replacement objects require all
specified component keys, including explicit nulls: omission is invalid there.
Clients never submit normalized instants, revisions, resolver output, created_by,
updated_at, candidate fields, legacy snapshot fields or stored provenance maps.

### Shared typed payload components

- `core`: required title (1–200 characters, nonblank after a validation-only whitespace
  check; preserve original string), description (null or <=5,000 characters).
  No implicit trim/Unicode normalization. CREATE sets status planned, order_index 0,
  event_type activity, created_by verified Actor. Legacy location columns remain
  their defaults; no compatibility summary or financial writes are introduced.
- `boundary`: exactly `local_date, local_time, clock_precision, quality, basis,
zone_id, supplied_offset_seconds, source_instant, source_instant_precision,
fold_choice`. All keys required, nullable where B-T3A allows. Date YYYY-MM-DD,
  Gregorian year 0001–9999. Clock HH:mm for precision -1; HH:mm:ss for 0; exactly
  1–6 fractional digits otherwise. UTC source instant YYYY-MM-DDTHH:mm:ss[.digits]Z,
  preserving its -1..6 precision and value; minute precision requires zero seconds,
  and lower unsupplied digits must be zero. Numeric offsets are seconds within
  ±64800; fold_choice is null or EARLIER/LATER, never a library default.
  B-T3A determines valid quality/basis combinations; computed fields are server-owned.
- `proofs`: bounded map (<=64 entries) of approved field keys to exactly
  `{kind:"MANUAL"}`, `{kind:"RETAINED",ref:string}`, or
  `{kind:"TRACK_C",ref:string}`. I defines admission. Keys name fields within this
  command's whitelist, not arbitrary mutation paths. Proofs for unused fields reject.
- Approved proof keys: ROOT.title/description/status/order_index/trip_day_id;
  ROOT.start or ROOT.end followed by a dot and local_date/local_time/zone_id/
  supplied_offset_seconds/source_instant/quality/fold_choice; ROOT.timing_label;
  ROOT or ORIGIN/DESTINATION followed by each B-T3A G spatial fact name (K below), with
  accepted_coordinates naming the pair. Precision is bound with its clock/instant
  value. Future endpoint time keys are `ORIGIN.local_time`, etc., as C-I3A permits.
  Accepted Place pointers are cache references, not evidence keys.
- Proofs are required for newly accepted nonnull facts and ESTIMATED quality/fold
  choice. Clearing a value is an explicit Actor action retained in the receipt,
  not a nonnull provenance entry. UNKNOWN quality may have a declaration proof;
  entirely unknown timed boundaries yield an empty stored provenance object.
  Metadata grouping/status admission is the authenticated exact intent in the
  receipt; an extra provenance reference is optional only if explicitly accepted.
- `locationPatch`: at least one of authored_label, authored_text, authored_address,
  authored_address_line1, authored_address_line2, authored_address_locality,
  authored_address_region, authored_address_postal_code, authored_address_country,
  accepted_address, accepted_address_line1, accepted_address_line2,
  accepted_address_locality, accepted_address_region, accepted_address_postal_code,
  accepted_address_country, accepted_coordinates or
  accepted_place_id. Coordinates are null or exactly `{latitude,longitude}` with
  D's canonical decimal strings, validating finite bounded numeric values; never
  half a pair. Postal suffixes are line1,line2,locality,region,
  postal_code,country, with B-T3A limits. All omitted location fields preserve.

### Family matrix

Common identity, authorization F, outcome/receipt E, strict CAS/replay G and offline
rules N apply to **every row**, including gated future families.

| command / version    | Exact payload keys and changed-field whitelist                                                                                                                                                                                                                                                                                      | Shapes / first scope                                            | Proof / offline boundary                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE_EVENT / 1     | Required shape, participantScope, core, time, proofs; optional location (locationPatch), grouping (`{trip_day_id,order_index}` with both keys required). time is `{start:boundary}` for first shapes; future J defines other exact forms. Scope exactly UNASSIGNED. No reservation_id or participants.                              | POINT/CALENDAR/ALL_DAY first; four other shapes deferred.       | New facts use MANUAL or admitted TRACK_C. Local draft allowed with null server revision; Source admission cannot be certified offline.                                    |
| UPDATE_CORE_TEXT / 1 | Required patch, proofs. patch contains title and/or description; only those two storage columns plus revision and receipt change. title cannot null.                                                                                                                                                                                | First three; others deferred.                                   | Each supplied nonnull text has proof. Retained current proof supports a no-change request; new acceptance is a semantic edit. Offline manual authoring allowed.           |
| UPDATE_TIME / 1      | Required start, proofs; complete boundary replacement. All start fields, planned_start and is_estimated_time are derived together. End remains unused. Shape cannot change.                                                                                                                                                         | First three; only rule-independent payloads admitted initially. | Proofs bind exact accepted facts; offline authors may not manufacture resolution. Rich span/Stay/transport uses its separate family.                                      |
| UPDATE_LOCATION / 1  | Required patch (locationPatch), proofs. Only named authored/accepted fields, optional accepted pointer, generation invalidation K and parent revision. No candidate/provider input keys.                                                                                                                                            | First three; root TRANSPORT location prohibited even later.     | Manual or explicitly reviewed acceptance; no provider auto-copy. Offline without a new unverified cache pointer is allowed.                                               |
| UPDATE_GROUPING / 1  | Required patch; optional proofs. patch has trip_day_id (UUID/null) and/or order_index (signed PostgreSQL integer range). No date/time/shape edit.                                                                                                                                                                                   | First three; later all seven.                                   | Trip Day must exist in same Trip at execution. Offline only with observed same-Trip Day; stale/deleted reference rejects.                                                 |
| UPDATE_STATUS / 1    | Required status; optional proofs. Exactly planned/cancelled/completed/skipped. Only Event status, not Booking cancellation/lifecycle.                                                                                                                                                                                               | First three; later all seven.                                   | Offline authoring allowed. Status intent does not delete an Event or mutate a reservation.                                                                                |
| UPDATE_TRANSPORT / 1 | Required endpoints, proofs; endpoints has ORIGIN and/or DESTINATION, no other roles. Each named endpoint has time (complete boundary) and/or location (locationPatch); at least one. Both existing rows lock/validate; other end's facts preserve. Root normalized slots/estimated summary and parent revision computed atomically. | TRANSPORT only, deferred.                                       | Independent time/place proofs per role. Offline requires a lossless two-row aggregate; resolver/Source gates still apply.                                                 |
| UPDATE_STAY / 1      | Required check_in, check_out, proofs; both complete boundaries replace root start/end together. Only time families and normalized summary; location uses its separate future allowed family.                                                                                                                                        | STAY only, deferred.                                            | Authored date pair/unknown clocks preserved; no daily cloning. Future offline eligibility requires full span projection.                                                  |
| LINK_RESERVATION / 1 | Required reservation_id (UUID/null), proofs. Only association FK and Event revision; no copying reservation time/provider/participants/place.                                                                                                                                                                                       | Deferred for all shapes.                                        | Same-Trip reservation plus exact evidence-action/permission contract required before enabling; missing Booking association admission is a blocker, not guessed authority. |
| DELETE / 1           | Required reason (bounded nonblank <=500); no arbitrary tombstone fields.                                                                                                                                                                                                                                                            | Deferred for all shapes.                                        | No existing Event tombstone/read-feed/retention contract. Reject CANONICAL_WRITES_DISABLED; no hard-delete grant and no offline dispatch.                                 |

SPAN generic time replacement is deferred with that shape: before enabling, a
reviewed UPDATE_TIME version/capability must explicitly accept `{start,end,proofs}`;
V1's first-slice single-start payload cannot reinterpret a span. WINDOW future
UPDATE_TIME similarly requires `{start,timing_label,proofs}`. These are named
future schemas, not accepted alternate payloads in the first slice.

## D. Intent encoding and operation identity

Uniqueness is `(trip_id, actor_account_id, operation_key)` in the Event domain,
**independent of command name**, so changing command/target/base under a key fails.
There is no key alias to Ledger idempotency rows or C Confirmation keys. The key
and Event ID are persisted before any dispatch and survive restart/retry.

`intent_sha256 = SHA256(UTF8(canonical envelope))`, prefixed by including
`encoding:"otr-event-intent-v1"` as an additional bound member alongside every common
envelope key. Canonical serialization uses recursively sorted ASCII object keys,
UTF-8 JSON without whitespace, preserved strings (no normalization/trim), controls,
quote/backslash escaping, decimal integer tokens, no negative zero/nonfinite
numbers and strict duplicate-key rejection. Use JSON short escapes for backspace,
tab, newline, form feed and carriage return; other U+0000–001F use lowercase
`\u00xx`. Escape quote/backslash; emit other valid Unicode as UTF-8 without optional
slash/ASCII/HTML escaping. An encoding tag is included in sorted
order, not special unsorted wire order. Arrays preserve order except explicit sets
which sort canonical UUIDs and reject duplicates. Optional patch members remain
**absent**, not expanded to null; explicit null remains null. This distinction is
part of the hash. Fixed component keys carry their required explicit nulls.

Coordinate values cross this command boundary as canonical decimal strings:
optional leading minus, no exponent/leading plus/leading zeros/trailing fractional
zeros/negative zero, <=17 significant digits; validate latitude/longitude ranges
before conversion to B-T3A double precision. The receipt keeps intended strings
and actual accepted values serialized by a specified lossless binary64-to-decimal
adapter (same algorithm/version across both layers). No tolerance comparison may
turn a changed coordinate/proof into an exact replay. The adapter's numeric
round-trip vectors are a pre-activation gate, not a new storage type.

The Backend recomputes the digest from the verified Actor-correlated typed request;
a client/C claimed digest is compared, never trusted. Transport request metadata,
requestId, token, attempt number, local generation and receipt read projection are
not digest inputs. Account/Trip/Event/base/command/versions, nullable intent and
proof bindings **are**. The same key with different bytes after canonical encoding
rejects IDEMPOTENCY_KEY_REUSED. Cross-Actor/Trip keys are separate scopes and never
permit reading another receipt.

## E. Immutable receipt persistence and replay

Proposed Event-owned `trip_event_operation_receipts` is the sole domain operation
record, keyed by the exact D tuple. No generic job/command bus or separate mutable
pending-command table. Transaction-scoped operation serialization precedes lookup;
a committed receipt is also the unique operation-key fence. A crash before commit
leaves neither Event changes nor receipt; timeout alone never proves that fact.

| Required receipt field                                  | Exact meaning / null rules                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| trip_id, actor_account_id, operation_key                | Required immutable identity; Event domain only. No Source/Expense ID alias.                                                                                                                                                                             |
| intent_version, command, command_version, intent_sha256 | Required admitted version/family and recomputed 64 lowercase hex digest.                                                                                                                                                                                |
| target_event_id, base_semantic_revision                 | Required intended Event UUID; base null CREATE, exact supplied revision UPDATE.                                                                                                                                                                         |
| intended_payload                                        | Required exact canonical typed envelope/payload including original accepted edits/proof intent; <=32 KiB, never raw Source/provider data.                                                                                                               |
| outcome                                                 | APPLIED / NO_CHANGE / CONFLICT / REJECTED; no durable IN_PROGRESS or unproved success.                                                                                                                                                                  |
| result_event_id, committed_semantic_revision            | Required for APPLIED/NO_CHANGE. Null on rejection/conflict. CREATE result ID equals intended ID, revision1.                                                                                                                                             |
| observed_semantic_revision                              | Conflict's locked observation where authorized; otherwise null. Not a base to silently install on retry.                                                                                                                                                |
| result_fields                                           | Immutable accepted field/result projection, normalized slots and proof/value addresses needed by this command. CREATE captures accepted aggregate; UPDATE captures affected values, not mutable later state. No provider candidate/raw evidence bodies. |
| confirmations                                           | Immutable manual field confirmations, exact Actor/Trip/Event/key/value bindings; bound clears are explicit action records. No fake Source/Candidate.                                                                                                    |
| error_code, submitted_http_status                       | Safe stable terminal outcome; code null success. Original HTTP outcome is retained even when replay transport uses HTTP200.                                                                                                                             |
| receipt_version, receipt_sha256, committed_at           | Exactly version1; SHA256 of canonical receipt fields excluding receipt_sha256 itself; server UTC microsecond commit observation. No device timestamp authority.                                                                                         |

Receipt address is deterministic:
`otr-event/receipt/<trip-uuid>/<actor-uuid>/<operation-uuid>`.
Accepted-value address appends `/<approved-field-key>` (max512 total). This can be
prepared by C before dispatch; existence/success is asserted only after database
commit. Receipt timestamps/digests/values are immutable even after later edits.
A replay response wraps the original receipt with `idempotentReplay:true` and a
new requestId; neither modifies receipt bytes/hash. Current canonical state is a
separate authorized read, never appended as if it were the old receipt result.

Only structurally admitted, authenticated, scoped operations can produce durable
terminal receipts. Under the operation lock, first recheck normal authorization;
if write is denied but Actor still has Trip read admission, a scoped REJECTED/
FORBIDDEN receipt may be recorded. No current read admission means a generic
FORBIDDEN before lookup/storage, avoiding a foreign-Trip existence oracle.
Invalid JSON/key/route/Actor binding is an ingress failure with no domain receipt.
Admitted stale-base, invalid provenance/aggregate and resolver failures record exact
CONFLICT/REJECTED receipts without mutation. A retry of a terminal rejection returns
that historical rejection; a corrected proposal needs new review and a new key.
Availability failures (disabled capability, missing credentials, 5xx/network) do
not create terminal rejection receipts or consume the key.

Execution order: authenticate and read-admit; exact-key receipt lookup; compare
intent; if matching, return original authorized outcome **before** current base,
resolver, evidence or capability checks. Then write-admit/gate new execution.
The write-denied receipt rule above applies only when no prior receipt exists.
Same key after subsequent Event edits never rewrites or decrements current state.

Receipt lookup requires current verified Actor, current Trip read admission and
exact operation key; Actor scope is server-derived. Return authorized canonical
accepted fields only. Stored intended proofs/Source operational identifiers are
private: full exposure additionally needs current Source/Confirmation admission.
Redacted read projections preserve receipt identity/digest/outcome/target/revision
correlation, but do not claim their filtered bytes equal the stored full receipt.
Trusted Backend verifies the stored hash before returning that correlation; C
uses the authenticated domain lookup, not a caller-submitted “verified” flag.
NOT_FOUND is meaningful only after an authorized serialized lookup. FORBIDDEN,
network failure or timeout is never no-commit proof. Internal status-only recovery
also requires the known Actor/Trip/operation/digest/target tuple and current Trip
read admission; it has no search/enumeration or business mutation capability.

Retain receipts/keys while the Event/Trip or any pending/replay/history/Source
correlation exists; no TTL/LRU/ordinary DELETE/UPDATE. Retention/security redaction
is a separate approved policy, not activation work. If exceptional erasure becomes
mandatory, retain a permitted closed key tombstone; an unverifiable erased intent
must return REPLAY_UNAVAILABLE, never release/reexecute the key. No receipt schema
or redaction mechanism is implemented here.

## F. Authorization and private writer

Verified Backend identity comes from validated Auth bearer credentials, never the
envelope Actor, a database JWT/GUC, caller flags or service_role privilege alone.
Existing write admission is preserved exactly: Trip creator OR matching legacy
trip_members row OR linked journey_members row with owner/group_member role;
lookup error denies execution. Existing current read admission is independently
required. This is compatibility with `canWriteTrip`, not a relabeling of all
legacy membership as Organizer. Account != journey_members.id. No participation
value/fingerprint/financial status is an authorization predicate. Future approved
revocation precedence must replace the admission helper coherently; do not invent
or weaken it in one Event route.

Activation requires a separate dedicated, password/certificate-authenticated
Backend DB principal proposed as `otr_trip_event_command_gateway`. No API/App
identity has its credential or membership. It has no protected table/column DML,
no role administration/DDL, and no membership/SET ROLE path into the semantic
writer. Its only Event capabilities are EXECUTE on explicitly listed fixed command
and exact-receipt lookup functions. No new Supabase REST service-role RPC authority.
Credential provisioning/rotation is PENDING; if unavailable, activation is BLOCKED.

Each named command has its own fixed-signature SECURITY DEFINER entry owned by
`otr_trip_event_semantic_writer`: verified Actor UUID, Trip UUID, operation UUID,
Event UUID, exact base where applicable, bounded canonical typed intent text.
CREATE omits the base argument; each function validates its one strict C schema.
No table name, SQL text, function identifier or arbitrary path is an argument.
A shared pure parser is acceptable; it is not a generic mutation dispatcher.

SESSION_USER must be the dedicated gateway, independently authenticated by the
DB connection; CURRENT_USER during mutation must be the private owner. API roles
cannot forge either with payload/JWT/GUC. The trusted Backend derives Actor after
real credential verification, matches the envelope, and passes it as the verified
argument. Database entrypoints independently compare Actor/Trip/envelope identity,
reload current normal admission under locks, and check target/base. This does not
claim PostgreSQL verified the user's bearer token: the dedicated gateway is the
explicit trusted identity-verification boundary. That principal or trusted DBA
compromise is outside runtime untrusted-client protection, and is a credential
security gate, not “service_role is authority.”

The writer retains NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS,
no app/gateway membership, no public function EXECUTE and no arbitrary owned
function. Set fixed search_path=pg_catalog and schema-qualify every object/call.
Before activation, rerun effective table/column/membership/ownership inventory;
incompatible **pre-existing** capability fails, not a silent revoke/repair.
Only the reviewed activation transaction introduces a positive allowlist:

- Root SELECT for exact target validation, column INSERT for C CREATE's fixed root
  fields, column UPDATE for the enabled family's union plus semantic_revision.
- Receipt SELECT/INSERT only; no UPDATE/DELETE, including service_role/API access.
- Fixed read helpers for Trip/admission/Day/Place validation; no grants over finance,
  Track A lifecycle, reservation business writes or Source mutation.
- No endpoint/participant DML for the first slice; no DELETE/TRUNCATE/TRIGGER/
  REFERENCES/DDL privileges. Later transport needs an explicit additional grant gate.
- Narrow writer RLS policies installed with the fixed functions. Policies never
  broaden authenticated/service_role direct DML. Private entrypoints enforce
  scoped predicates; NOLOGIN is not an RLS bypass claim.

B-T3B currently rejects the private identity too. A later reviewed activation must
replace only its disabled private branch with admission to the fixed gateway/
private-owner execution pair, enforcing permanently immutable identity/history
fields, first-slice preservation of temporal_shape/event_type, UNASSIGNED and
revision transitions. Deferred semantic shape/scope changes are not permanent
identity restrictions. Ordinary/direct guards and bulk rejection stay.
No trigger-depth, caller-set flags, SECURITY DEFINER postgres ownership shortcuts,
trigger disable or replication-role bypass. Each success entrypoint must exercise
real execution identity in tests; invoking it as authenticated/service/other caller,
spoofing JWT/GUC, gaining column ACLs or owning extra functions must fail.

## G. CAS, atomicity and deterministic locking

CREATE commits revision1; UPDATE first compares exact supplied base with the
locked parent. A semantic change increments once, including changed acceptance/
provenance with identical displayed values. Max-safe revision plus a required
increment rejects REVISION_OVERFLOW. A fresh truly identical value **and retained
current proof** may yield NO_CHANGE at exact base without row DML or increment.
Metadata status/grouping unchanged requests are similarly neutral. A new manual
acceptance/proof is an edit; merely repeating its display string is not NO_CHANGE.
Same-key replay is always neutral and never re-runs CAS. Stale bases conflict even
when values coincidentally match; no LWW, historical automatic merge or silent rebase.

Lock order for a new operation, before mutations:

1. Event-domain operation-key advisory transaction lock (Actor/Trip/key), followed
   by receipt lookup. Hash collisions only serialize; unique tuple proves identity.
2. Acquire the fixed Event activation shared advisory transaction lock, then
   recheck installed enabled families/shapes/input gates. Hold it through commit.
   Deployment/rollback takes the matching exclusive lock before changing admission;
   this drains admitted work and prevents a waiting request using stale gate state.
   This internal installed state is never caller/JWT/GUC controlled. Exact receipt
   replay precedes this gate and remains available when new mutation is disabled.
3. Trip/read-write admission rows in stable primary-key order (Trip, legacy Member,
   linked Person), using compatible row locks. Permission-changing operations must
   use those same row conflicts; pending revocation policy cannot be bypassed.
4. When C participates: Sources, Representations, Associations where involved, Runs,
   Confirmation in C-I3A order,
   each sorted by stable ID, then relevant immutable slot/input checks. No locks
   spanning network dispatch or C finalization. All admission/pin owners lock before
   Event mutation; C-only commands must never invert this order by locking an Event
   after their owners. Any future cross-domain writer must adopt this published order.
5. Referenced Day/Reservation/Place rows sorted by relation family then UUID with
   compatible share/key-share locks; recheck Trip and optional cache existence.
6. Parent Event FOR UPDATE (or serialize/reserve exact ID for CREATE); endpoint rows
   in ORIGIN, DESTINATION order when later enabled. Validate the full final aggregate.
7. Commit semantic row(s), normalized root summary, generated manual confirmations
   and immutable receipt atomically; deferred B-T3B structural/link validators must
   succeed. Error rolls back all; terminal admitted rejection is recorded only after
   failed tentative mutation is rolled back to an internal transaction savepoint.

Same-key concurrent execution waits and returns the original outcome; two fresh
updates on one base produce one APPLIED and one STALE_BASE_REVISION receipt. All
Event command families use the same parent lock, even disjoint fields. Endpoints
have no business revision. Root/endpoint updates and receipt form one transaction.
Reference movement/deletion races must either precede admission or wait and then
fail their same-Trip/canonical guard, not leave dangling semantic truth. Deadlock
or serialization failure retries the identical intent/key, without a terminal
false receipt. Evidence must be admitted in the same local DB transaction context;
an external best-effort “already checked” callback cannot authorize C execution.

## H. Timezone/DST resolver gate

CURRENT: no reproducible resolver/rule manifest was established by B-T0/B-T3B or
located in the inspected Backend/itinerary code. SQL offset/binding checks are not
IANA proof. Thus **resolved civil commands and accepted-zone payloads are BLOCKED**
at this HEAD; first-slice rules B deliberately do not require that runtime.

Permitted later resolver: a server-only deterministic adapter consuming reviewed,
immutable IANA rule bytes bundled with a pinned resolver/runtime artifact. Record
actual IANA release, complete rule artifact SHA256, and resolver+runtime artifact
SHA256; the latter covers conversion/parser/precision behavior. Both artifacts and
test vectors remain available to reproduce accepted results after future upgrades.
An OS/device/Intl/ICU clock alone without this proof is not permitted authority.
No dependency, binary, tzdb release or runtime identity is selected/installed here.

Exact future key grammar (<=256 characters):
`otr-tzdb-v1/<actual-iana-release>/<rules-sha256>/<resolver-runtime-sha256>`.
Release is its verified four-digit-year/lowercase suffix; hashes are 64 lowercase
hex characters of actual archived bytes. Fake labels such as ios-current,
system-tz, test-only or a guessed release are invalid production inputs. Clients
cannot provide interpretation_key or resolution output. Compute B-T3A's unchanged
`otr-civil-binding-v1` recipe from accepted inputs and server resolver result.

- UNIQUE: exactly one valid occurrence; compute normalized civil instant from that
  occurrence's offset, then verify bound input hash.
- FOLD: persist explicit unresolved FOLD, no normalized instant. Later approved rich
  mode may save that unresolved intent; a request for an instant without explicit
  EARLIER/LATER choice rejects TIME_FOLD_UNRESOLVED. A valid choice must select an
  actual occurrence and have its own proof; FOLD_RESOLVED stores its exact offset.
- GAP: retain explicit GAP/no instant only in separately enabled unresolved-rich
  mode; requested resolution rejects TIME_GAP. No roll-forward or fake midnight.
- Supplied offset must match the accepted occurrence when a zone is claimed; it is
  not itself a timezone. A mismatch rejects INVALID_AGGREGATE, never silently picks
  a fold. Without an IANA claim, a confirmed UTC/source occurrence stays SOURCE_INSTANT.
- SOURCE_INSTANT supplies the normalized instant independently. With complete civil
  context, validate it and preserve disagreement explicitly: the typed command must
  choose SOURCE_INSTANT or DERIVED_CIVIL, never infer equivalence or overwrite either
  source fact. Receipt records disagreement; selected basis alone owns normalization.
  Claiming civil/source agreement requires proof under the pinned artifact. Missing
  complete civil context has null resolution for SOURCE_INSTANT, as B-T3A requires.
- Derived/source precision is <=6 digits. Higher precision is retained in owning
  evidence and the Event operation rejects unsupported precision before a database
  timestamp cast; no truncation, Date conversion or rounding-as-acceptance.
- Missing/incomplete civil context stays PENDING with null derived instant; UNKNOWN
  is not ESTIMATED or ALL_DAY. A resolver/rule upgrade is a candidate interpretation,
  not a write; accepting new binding is a fresh CAS semantic edit and receipt.

Absent trustworthy artifacts never silently falls back to system rules. Feature
advertisement excludes affected inputs and commands. Golden gated cases below are
acceptance requirements, not a declaration that those runtime gates are passed.

## I. Provenance and evidence admission

Manual reference address:
`otr-event/confirmation/<trip-uuid>/<actor-uuid>/<operation-uuid>/<field-key>`.
It resolves to the immutable confirmations member of E's operation receipt, not a
new Source graph. For a MANUAL proof, the Backend derives the address and the
transaction binds actual verified Actor, Trip, Event, exact field/value/precision
and resulting revision. Before commit it is only a prepared intent; receipt and
facts activate together. Manual source-instant acceptance is an explicit independent
fact, not an automatic claim that an unzoned clock is UTC. Clears retain the old
fact in historic receipts and record the new explicit clear decision.

RETAINED proof is allowed only for that same Event/field's current accepted value
and current accepted reference, resolved via its immutable receipt/support. It
cannot change value, change proof, import another Event's confirmation or relabel
another Actor's historic decision as the current Actor's. Current editor needs
normal target authority; historical originating Actor remains attributed. Core
text/status/grouping proof history is receipt-owned where B-T3A has no root proof
column; it is not permission to add one. Time/spatial proofs populate only their
existing approved maps. A provenance change alone increments semantic_revision.

Track C address is **exactly** C-I3A:
`track-c/field-evidence/<slot-uuid>/<field-key>` (approved ASCII key, <=128;
whole ref <=512). Admission checks a fixed adapter, not arbitrary URL parsing:

1. Exact prepared Confirmation/slot/input/Candidate binding, Actor/Trip, Event ID,
   Event command version, operation key, recomputed digest and base revision.
2. Slot PREPARED or same-operation OUTCOME_UNKNOWN, executable CREATE/UPDATE and
   permitted Event adapter/version; no canceled/rejected/deferred/redacted intent.
3. Current Source ownership/access and Trip/target rights, exact pinned material/
   Representation/input and reviewed run generation, original proposed value and
   explicit reviewed edited replacement. Each proof equals the exact submitted
   intended fact (including precision/paired coordinates), not just a string ref.
4. Source lifecycle/retention/availability and immutable slot support are checked
   under G locks, following C's own availability rules. No invented “all binary
   Sources must be remotely uploaded” rule; supported exact local-owned inputs need
   their separately admitted C preparation path before server command execution.
5. accepted_value_ref names E's deterministic receipt/field address; prepared state
   does not assert success. Commit binds result ID/revision/digest; C activates its
   historical support only after verified domain success.

Source loss/deletion never erases accepted Event facts. It prevents new admission
from forbidden material; exact historic receipt replay is not new evidence use.
No Source tables/adapters exist at this HEAD. First-slice MANUAL/RETAINED can be
implemented independently; **TRACK_C proof admission stays disabled** until the
C preparation/read-admission transaction interface exists and is independently
reviewed. C stored proposals do not enable B writing or participant scope.

## J. Exact shape rules and gated extensions

All rows below preserve B-T3A; first capability availability is explicit. Each
active temporal family retains facts separately and computes normalized slots.
All CREATEs require core, explicit UNASSIGNED, revision1 on commit, no participants,
no legacy snapshot or implicit reservation. Every active location initializes
location_input_revision=1. Fields not used by a shape remain null.

| Shape     | Minimum CREATE / exact time shape                                                                                                                                                                                                         | UPDATE boundary / availability                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POINT     | `{start:boundary}`; UNKNOWN/DERIVED_CIVIL with no clock/source is valid, date optional. Partial civil EXACT/ESTIMATED clock has evidence/precision and no fabricated instant. SOURCE_INSTANT has confirmed instant/precision. End unused. | UPDATE_TIME replaces start; SOURCE_INSTANT normalization exact; complete zoned civil gated by H. First slice supported without zone.                                 |
| CALENDAR  | `{start:boundary}` with required date, DERIVED_CIVIL/PENDING, clock/quality/source/fold null. End unused; annotation, no occupancy/instant.                                                                                               | Replace date-only start with proof; no midnight. First slice supported without zone.                                                                                 |
| ALL_DAY   | Same structural date-only family; date required. Authored day occupancy, no intended clock or 24-hour duration.                                                                                                                           | Same date-only replacement; cannot change shape to POINT by inserting a clock. First slice supported without zone.                                                   |
| SPAN      | Future `{start:boundary,end:boundary}`; two active timed boundaries, each independently incomplete; fully known end instant >= start. Missing end is not infinity.                                                                        | Future approved two-boundary UPDATE_TIME; whole shape deferred.                                                                                                      |
| STAY      | Future `{check_in:boundary,check_out:boundary}`; two active timed families. Dates independently nullable when incomplete; known checkout date >= check-in. Unknown clocks remain UNKNOWN.                                                 | UPDATE_STAY binds both; derive nights only from valid authored date pair, elapsed duration only from normalized instants. One Event, no cloned daily rows. Deferred. |
| TRANSPORT | Future `{ORIGIN:{time:boundary,location:locationPatch-or-null},DESTINATION:{time:boundary,location:locationPatch-or-null}}`; both rows even unknown, each location generation1. Root new time/spatial families unused.                    | UPDATE_TRANSPORT locks both and recomputes root normalized slots/estimated flag, including partial unknown destination. Independent zones/place proofs. Deferred.    |
| WINDOW    | Future `{start:boundary,timing_label:string}`; label nonblank <=500 with proof; start date optional, DERIVED_CIVIL/PENDING; no clock/quality/source/normalized instant/end.                                                               | Future qualitative-only time schema; no numeric earliest/latest or tolerance. Whole shape deferred.                                                                  |

is_estimated_time is computed true iff an authoritative boundary is ESTIMATED;
UNKNOWN and date-only do not set it. All root/endpoint normalized equality rules,
source basis distinction and B-T3A structure checks remain. No title/description,
status, grouping or location command implicitly reinterprets unchanged time under
new timezone rules. Legacy marker-null targets reject CANONICAL_TARGET_REQUIRED;
V1 has no adoption command or guessed historic snapshot.

## K. Spatial rules

Authoring and explicit acceptance are distinct from candidate/provider cache data.
C's locationPatch names only B-T3A authored facts, explicitly accepted address/
coordinate facts and optional accepted_place_id. B-T3A text/postal limits apply;
accepted coordinates must be a complete validated pair. New Place acceptance is
optional, same admitted target context, never a provider search as a commit gate.
The pointer is cache-only and cannot confer authority or change inline snapshots.
CREATE may attach a validated pointer alongside accepted inline facts. UPDATE may
attach/change it only with an actual authored/accepted fact or proof edit; a
pointer-only patch, or a pointer change with otherwise retained identical facts,
rejects INVALID_COMMAND. Cache-only pointer maintenance is not a semantic command.

Any authored/accepted input correction increments parent semantic_revision once,
advances location_input_revision once within safe bounds and clears the current
candidate family atomically. A retained proof/value exact no-change request does
neither. Changed acceptance/provenance counts even if display text is identical.
Overflow rejects; every unmentioned authored/accepted fact is preserved. Explicit
clears remove only named facts/current proof keys and retain immutable old receipt.

Provider lookup/refresh is **not enabled** in the first slice. A later separately
reviewed cache-only writer must match current location_input_revision, install only
candidate fields with candidate_input_revision equal to captured generation, and
never edit authored/accepted fields. Stale generation discards result. Such cache
refresh is revision-neutral for semantic_revision; accepting a candidate is a new
explicit UPDATE_LOCATION with proof and CAS, never confidence-based acceptance.
Do not use the semantic command role as an unrestricted cache refresh gateway.
The existing narrow Place-null maintenance exception stays intact and neutral.
No Place dedup/normalization or new geocoder framework is proposed.

## L. Old-client compatibility

The existing v1/direct legacy create remains literal and marker-null. No backfill,
new default, temporal reinterpretation or financial change. Direct DML cannot adopt,
edit or delete canonical data, including with service_role RLS bypass. Old full-save
through title/date/time/location DTO rejects; do not rename it title-only or strip
unknown keys to authorize it. The old DTO is never canonical round-trip authority.

A future old-client title/notes/grouping compatibility endpoint may call only the
exact C typed family with an observed base and preservation rules. If the client
cannot carry that revision, reject CANONICAL_CLIENT_REQUIRED. Capability detection
must establish complete supported read representation and command version before
editing. Unsupported shapes/versions or rich date-only/source-only/time-only values
are withheld from lossy readers or explicitly read-only; never manufacture a required
scheduledDate. Storage readability by legacy direct grants is not proof of Mobile
projection support. New version reads require lossless mirrors, including references,
quality, precision, endpoint identities, source basis and accepted revision.

## M. Participant boundary

V1 accepts exactly participant_scope UNASSIGNED with zero participant rows. There
is no implicit whole group, Account UUID-to-Person conversion or roster filter.
ASSIGNED/WHOLE_GROUP reject UNSUPPORTED_PARTICIPANT_SCOPE before mutation. No
journey_members lifecycle/revision, permissions, invite/claim, financial reference
or participation freshness/cursor is changed.

A later adapter would accept explicit same-Trip journey_members.id sets, bind
required A snapshot/freshness observation independently of Event CAS, and preserve
recorded inactive historic IDs. WHOLE_GROUP must record a selected set, not dynamic
current membership. It must enforce concurrent Member Trip moves/deletion and
legacy participant compatibility. Scope/set changes are deferred semantic mutations,
not changes to permanently immutable identity/history. Its changes join the
**same Event parent lock,
revision increment and domain receipt transaction**; no endpoint/participant
business revision or alternate command bus. That adapter is outside this activation.

## N. Future local/offline mutation contract

Before any canonical product editing, SQLite must mirror B-T3A root and exact
endpoint families losslessly and separate accepted projection from pending intent.
The current required scheduled_date/legacy DTO cannot meet that gate. No SQLite
migration/DTO/repository implementation is authorized here.

One repository transaction allocates/persists operation UUID, Event/local mapping,
exact typed intent, proofs and observed server base in existing Account-owned
sync_operations together with the pending local view. Accepted semantic_revision
is null for unsent CREATE, otherwise the last admitted server value. Never invent
revision1 locally or increment a cached server revision as proof of a pending edit.
Stable key/digest survive crash and attempted retries; same-key body never changes.

All six first-slice families can be **authored** offline under B's restrictions and
cached Actor/Trip admission; that is not server authorization or remote acceptance.
Grouping/new cache pointers need observed referenced records; no lookup/provider
requirement may block basic local text/location entry. TRACK_C confirmation can
prepare locally under C, but server dispatch waits for its exact admitted prepared
records and current ACL. Resolver-dependent proposal may be saved as a separate
non-dispatched draft; do not queue a falsely executable canonical operation.

Remote newer state updates the accepted projection monotonically but never edits a
pending operation's values, proofs or base. A stale pending base becomes explicit
CONFLICT, requiring new reviewed operation/key. An unattempted successor may be
prepared after verified predecessor APPLIED/NO_CHANGE receipt at its exact result
revision; an already-bound/attempted operation is never silently rebased. Same-key
replay returns the original receipt, not an invented successor execution base.

Response validation matches Actor/Trip/key/digest/Event/command/result revision;
receipt, accepted root/endpoints and queue completion apply in one SQLite transaction.
A historic result older than an already accepted projection does not regress it;
complete that operation from its receipt without replacing newer rows. Unknown/
malformed receipt is OUTCOME_UNKNOWN, preserving exact intent for lookup/replay.
No JS Date rounding: date/time/UTC microseconds and precision remain exact strings;
coordinate decimal intent likewise remains exact. A generation A→B→A rejects old
responses despite same IDs. Apply under the A-I2B1 Account-transition/commit fence,
with immutable initiating Account/Trip/generation from request through commit.
No network wait holds that local fence. Expired tokens pause dispatch, not valid
local session access or cached reading. Reuse existing retry scheduling; no new
Event timer or second queue framework.

## O. Track C adapter handoff

`itinerary-event-v1` initially remains disabled. The eventual exact flow is:

1. C persists Confirmation, output slot, candidate/input pins, intended Event UUID,
   disposition, command version, base, domain operation UUID, D digest and field
   addresses before dispatch. CREATE honors intended ID; no receipt-assigned remap.
2. C marks OUTCOME_UNKNOWN/dispatched_at before sending; no DB/network lock spans
   handoff. B's single transaction rechecks prepared evidence under current rights
   and G's compatible lock order; accepted fields stay in B.
3. B commits Event + immutable receipt and confirmations. C verifies authenticated
   exact Actor/Trip/adapter/key/digest/target/revision/receipt hash correlation.
4. Lost response: exact replay/lookup returns historic receipt. Later Event edits
   do not reset the Event to that receipt revision. A search by name/hash/provider
   is not recovery, and a missing/forbidden response is not absence proof.
5. C records its write-once result tuple and finalizes Associations/support in a
   C-only parent-CAS transaction. A crash leaves DOMAIN_SUCCEEDED/EVIDENCE_PENDING;
   retry C finalization only, never issue a fresh B operation/create or compensate
   by deleting the Event. Historic successful support may finalize inactive after
   Source deletion under C's admitted policy; it cannot reactivate material.
6. Unknown outcome with Source access loss freezes new B execution. Current Trip
   read-admitted, exact known-operation status-only receipt recovery may proceed;
   otherwise remain unresolved until authorized recovery. Receipt API gives no
   discovery or Source permission. Proven no-commit cancellation requires a fence:
   authoritative operation lock/lookup plus stopping that exact dispatch lease,
   not a transient absence while another identical request is still in flight.

C's candidate/slot create-claim uniqueness also guards accidental new Confirmation
keys. B does not deduplicate by Candidate/title. Manual B creation needs no fake C
Candidate. LINK_ONLY/Reservation evidence-action remains a separate deferred domain
admission contract. No C table, adapter, worker or Source bucket is implemented.

## P. Stable errors and transport conventions

Preserve current safe envelope `{error:{code,message,requestId}}`; no UI strings are
specified. Durable domain outcomes additionally return their correlated receipt.
HTTP401 pauses authentication; 409 is explicit conflict, never generic retry/rebase.
Network/5xx/unknown response/validation failure retains the same key and unknown
outcome. Only explicitly allowlisted codes become actionable terminal local state.

| Code                          | HTTP / durable result                         | Meaning                                                                                         |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| INVALID_COMMAND               | 400; ingress none or admitted REJECTED        | Strict key/type/version/precision/schema violation; never strip unknown fields.                 |
| FORBIDDEN                     | 403; scoped REJECTED only where read-admitted | Normal current target/Trip write denial; no cross-scope oracle.                                 |
| UNSUPPORTED_SHAPE             | 422 / REJECTED                                | Storage shape exists but this capability does not enable it.                                    |
| UNSUPPORTED_PARTICIPANT_SCOPE | 422 / REJECTED                                | V1 requires UNASSIGNED/zero participant rows.                                                   |
| STALE_BASE_REVISION           | 409 / CONFLICT                                | Exact locked base differs; record observed revision where authorized, no mutation.              |
| IDEMPOTENCY_KEY_REUSED        | 409; original receipt unchanged               | Same scope/key differs in intent/family/target/base; no replacement receipt.                    |
| INVALID_PROVENANCE            | 422 / REJECTED                                | Ref, prepared identity, Actor/Trip/value/pin/access or edited-value binding invalid.            |
| TIME_RESOLUTION_UNAVAILABLE   | 422 / REJECTED                                | Requested zone/resolution lacks approved reproducible rule adapter.                             |
| TIME_GAP                      | 422 / REJECTED                                | Requested resolved instant is nonexistent; no roll-forward.                                     |
| TIME_FOLD_UNRESOLVED          | 422 / REJECTED                                | Requested instant is ambiguous without admitted explicit occurrence.                            |
| INVALID_AGGREGATE             | 422 / REJECTED                                | Structural, same-Trip, coordinate pair, boundary ordering or offset mismatch.                   |
| CANONICAL_WRITES_DISABLED     | 503; no new receipt                           | Capability/entrypoint disabled; pause dispatch, retain intent; historic replay stays available. |
| CANONICAL_TARGET_REQUIRED     | 422 / REJECTED                                | Legacy target cannot be adopted by these commands.                                              |
| CANONICAL_CLIENT_REQUIRED     | 409; ingress none                             | Old DTO/client cannot supply lossless projection and exact narrow CAS.                          |
| EVENT_ID_IN_USE               | 409 / REJECTED                                | Another operation already owns intended Event ID; equality is not replay.                       |
| REVISION_OVERFLOW             | 409 / REJECTED                                | Semantic or location generation increment exceeds safe integer range.                           |
| REPLAY_UNAVAILABLE            | 409; closed identity only                     | Separately authorized receipt erasure prevents verified replay; never reexecute.                |
| OPERATION_NOT_FOUND           | 404; no receipt                               | Authorized exact-key serialized lookup only; not a mutation result or automatic cancellation.   |

CREATE APPLIED first response HTTP201; other APPLIED/NO_CHANGE HTTP200. Exact
success replay uses HTTP200 plus original immutable submitted_http_status and
idempotentReplay wrapper. Rejection/conflict replay keeps its original failure HTTP
and receipt. No response-loss retry changes the original receipt digest.

## Q. Deterministic golden cases

Fixed synthetic IDs: A=`00000000-0000-4000-8000-000000000001`,
B=`00000000-0000-4000-8000-000000000002`,
T=`00000000-0000-4000-8000-000000000003`,
U=`00000000-0000-4000-8000-000000000004`,
E=`00000000-0000-4000-8000-000000000005`,
K=`00000000-0000-4000-8000-000000000006`,
second operation=`00000000-0000-4000-8000-000000000007`.
A/Trip T/Event E/op K identify one exact scope.
Dates/times are literal examples, not claims about a production tzdb release.
FIRST means proposed first-slice behavior after all its gates; FUTURE means a
separately enabled shape/resolver/C gate. At present every new dispatch is disabled.
Each success must verify immutable key/intent/result correlation and revision.
First-slice shape/scope/event_type preservation is a command-whitelist restriction,
not permanent semantic immutability; future changes require C/M's separate review.
Fold cases use a deterministic resolver test double returning exactly two ordered
occurrences with explicit offsets; EARLIER selects element zero. Gap returns zero
occurrences; unique returns one. These unit oracles do not establish IANA truth or
a production interpretation_key. Before activation, integration vectors must pin
actual local inputs, offsets, UTC results and artifact hashes under H; synthetic
resolver identity is rejected by the production gate.

|   # | Input / precondition                                                                   | Required outcome                                                                                              |
| --: | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
|   1 | FIRST POINT UNKNOWN, date 2026-12-17, no clock/zone                                    | E revision1; planned_start null; not estimated/all-day.                                                       |
|   2 | FIRST ALL_DAY 2026-12-17                                                               | Revision1, date-only, no midnight/elapsed hours.                                                              |
|   3 | FIRST CALENDAR 2026-12-17                                                              | Annotation shape distinct from ALL_DAY occupancy.                                                             |
|   4 | FIRST POINT SOURCE_INSTANT 2026-12-17T06:00:00.123456Z, precision6, no civil context   | Exact normalized microseconds; no invented zone.                                                              |
|   5 | FIRST UNKNOWN rev1 → accepted partial civil 10:00, precision-1, date given, zone null  | Rev2, EXACT/DERIVED_CIVIL/PENDING, normalized slot still null.                                                |
|   6 | FIRST create POINT complete date+10:00+Pacific/Auckland while resolver absent          | TIME_RESOLUTION_UNAVAILABLE, no Event; terminal admitted rejection receipt.                                   |
|   7 | FUTURE resolved POINT with a verified artifact and exactly one occurrence              | Rev1, binding/key/offset from that artifact; equality to computed instant.                                    |
|   8 | FUTURE STAY Dec17→Dec20, UNKNOWN clocks                                                | One Event, three calendar nights, no elapsed interval/midnights; FIRST rejects shape.                         |
|   9 | FUTURE TRANSPORT origin SOURCE_INSTANT 06:00Z, destination UNKNOWN                     | Exactly two rows; origin root slot 06:00Z, planned_end null; FIRST rejects shape.                             |
|  10 | FUTURE TRANSPORT two source instants 06:00Z/19:00Z                                     | Root slots match pair; known 13-hour interval; no local-zone inference.                                       |
|  11 | FUTURE fold fixture resolver produces two occurrences; no choice but requested instant | TIME_FOLD_UNRESOLVED; no default branch or mutation.                                                          |
|  12 | FUTURE same fold, explicit EARLIER, exact proof and artifact                           | FOLD_RESOLVED with first valid offset/binding; one semantic increment.                                        |
|  13 | FUTURE gap fixture, requested instant                                                  | TIME_GAP; no shifted clock. Separately enabled unresolved-rich intent may retain GAP/null slot.               |
|  14 | FIRST update base3 while locked head4                                                  | CONFLICT/STALE_BASE_REVISION; head4 preserved; receipt observes4.                                             |
|  15 | FIRST same K/exact CREATE intent submitted twice                                       | One E; original revision1 receipt; second replay neutral.                                                     |
|  16 | FIRST same K but changed title/Event/base/command                                      | IDEMPOTENCY_KEY_REUSED; original receipt preserved.                                                           |
|  17 | FIRST commit succeeds but response lost                                                | Restart retains K/digest; exact lookup/replay recovers original receipt, no duplicate.                        |
|  18 | FIRST op K committed rev2; other operation advances E to5; replay K                    | Original rev2 result returned; current E stays5.                                                              |
|  19 | FUTURE candidate refresh matches location generation7                                  | Candidate-only refresh, semantic revision neutral, accepted facts unchanged; first slice has no cache writer. |
|  20 | FIRST accepted location correction at head4/location generation7                       | Rev5/generation8, only named accepted facts/proofs changed; current candidate family cleared.                 |
|  21 | FIRST title-only typed update base4                                                    | Rev5, only title/confirmation change; all time/place/scope facts preserved.                                   |
|  22 | Old full-save includes title/date/time/location for canonical E                        | Reject CANONICAL_CLIENT_REQUIRED/direct guard; cannot relabel title-only.                                     |
|  23 | service_role direct canonical update or spoofed JWT/GUC                                | Existing semantic guard rejects; no private role assumption or gateway entry EXECUTE.                         |
|  24 | FIRST new MANUAL date/location fact                                                    | Domain confirmation derived from A/T/K/field; no fake C Source/Candidate.                                     |
|  25 | FUTURE exact C PREPARED slot/input/value/base and current ACL                          | Single B transaction binds field refs and receipt; C activates support after verification.                    |
|  26 | FUTURE B succeeds; C finalization crashes                                              | Retry C-only finalization from historic receipt, no second B mutation.                                        |
|  27 | Envelope Actor B or Trip U differs from authenticated A/route T                        | Reject before execution/foreign receipt lookup; no side effects.                                              |
|  28 | ASSIGNED or WHOLE_GROUP requested, even with Account UUID list                         | UNSUPPORTED_PARTICIPANT_SCOPE; no Participant or lifecycle writes.                                            |
|  29 | FIRST unchanged grouping/status exact base                                             | NO_CHANGE, immutable receipt, no semantic increment.                                                          |
|  30 | FIRST same displayed accepted value but new explicit manual proof                      | Acceptance changed: one semantic increment, historic confirmation retained.                                   |
|  31 | FIRST update at MAX_SAFE requiring an edit                                             | REVISION_OVERFLOW; no rows changed, rejection receipt.                                                        |
|  32 | Source instant has seven fractional digits                                             | INVALID_COMMAND before timestamp cast; owning evidence keeps original precision.                              |
|  33 | FUTURE offset differs from valid zoned occurrence                                      | INVALID_AGGREGATE; neither offset nor zone silently replaced.                                                 |
|  34 | FIRST grouping names a Day from another Trip                                           | INVALID_AGGREGATE; existing grouping/time unchanged.                                                          |
|  35 | Source removed after a successful operation; exact receipt replay                      | No new Source use; authorized historic correlation recoverable; accepted Event stays.                         |
|  36 | Account switches A→B→A during response application                                     | Old generation rolls back/discards; pending operation remains owned by A.                                     |
|  37 | Canonical writes disabled after a prior success                                        | New K paused; old K's authorized exact receipt replay still works.                                            |
|  38 | Coordinate proof/value changes or lookup returns stale generation                      | Changed acceptance needs new CAS; stale candidate discarded without overwriting it.                           |
|  39 | FIRST newly reused E under different K                                                 | EVENT_ID_IN_USE; no title/hash-based success or alternate ID.                                                 |
|  40 | Same base concurrent text/location operations                                          | One applies; other stale-conflicts despite disjoint fields; no silent merge.                                  |

## R. Activation and rollback sequence

This is a later reviewed implementation order, not execution authorization:

1. Approve this contract and independent review; reconcile typed codecs, coordinate
   round trips, numeric/precision/digest vectors and the fixed database gateway.
2. Implement domain-local immutable receipts and manual confirmations; install with
   command functions, least grants, private RLS, guard private-branch change and
   initially **closed** activation gate in one migration transaction. No window of
   unrestricted private/API access; no Endpoint/Participant grant in first slice.
3. Implement trusted Backend entrypoints and exact lookup; prove credential/Actor
   boundaries and original result replay. Legacy route behavior stays literal.
4. Implement/test lossless read and SQLite mirrors, Account-generation fence,
   durable intent/base/key, queue handling and honest old-client withholding.
5. Run golden/adversarial/replay/financial non-interference tests in disposable
   databases; inspect direct/effective table/column ACLs, ownership/memberships,
   function EXECUTE and RLS. Include real gateway/private-owner identity and
   rejection of service/GUC spoofing, hidden child rows, row/parent cascades, bulk
   truncate, same-Trip races, receipt tampering and crash boundaries.
6. Explicitly enable only the six named families/three shapes/rule-independent
   inputs after review. C and resolver gates remain off. Later additions repeat
   typed schema/grant/mirror/evidence gates; capability is not automatic inheritance.

Rollback disables admission to **new** operations and revokes mutation-entry EXECUTE
from the dedicated gateway, without dropping canonical data/receipts or touching
legacy creates. Keep a separately fixed read-only exact receipt function available
for authorized recovery. Its owner cannot acquire the writer's DML capability:
use a distinct NOLOGIN read-only owner or trusted fixed read-only owner, no generic
query access. In-flight mutation transactions must drain/serialize against the
activation fence before closure is claimed; committed receipts remain replayable.
Queued new work is paused, not relabeled legacy or assigned a new key. Restoring
activation requires the same grant/admission inventory and tests; never rerun the
disabled-foundation migration expecting it to sanitize an activated role.

## S. Risks and blockers

| Gate                                                         | Status / stopping rule                                                                                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Exact commands/receipts/grants/gateway and crash proofs      | PENDING implementation + human/independent review; no runtime capability claimed.                                    |
| Lossless local mirror/read/queue + compatibility withholding | PENDING; current legacy Mobile projection cannot safely edit canonical data.                                         |
| Trustworthy reproducible zone rules and resolver artifact    | BLOCKED at this HEAD; affected zone/resolution inputs stay disabled. Not needed for selected rule-independent scope. |
| C prepared-evidence transaction admission and adapter        | BLOCKED at this HEAD; manual scope is independent, C refs not accepted.                                              |
| Participant/Booking/delete/complex-shape activation          | Deferred by selected scope; separate review/compatibility, not permission to broaden V1.                             |

Largest first-slice runtime blocker is the unimplemented atomic Event receipt and
independently authenticated gateway, followed by the lossless local editing gate.
Largest temporal blocker is reproducible rule identity; do not fake it to enable
complete civil conversion. Source admission must be transactional; if that requires
a generic command bus or changing C ownership, stop rather than broaden scope.
Similarly stop on participant/Booking/financial redesign, guessed legacy adoption,
old-client guard weakening, or any required command lacking a trustworthy resolver.
The selected scope deliberately excludes that required dependency.

Existing unrelated full-repository Ledger architecture-boundary and formatting
debt recorded by B-T3B is not modified or re-tested by this design task. This
contract makes no Production/readiness/deployment claim.

## T. Acceptance matrix and final boundary

|   # | Check                                                          | Evidence / status                         |
| --: | -------------------------------------------------------------- | ----------------------------------------- |
|   1 | Startup scope/clean exact HEAD, one document                   | Header / PASS                             |
|   2 | Small first activation, named deferrals                        | B/C / PASS                                |
|   3 | Typed identities, required keys, null/omission and whitelist   | C / PASS                                  |
|   4 | Existing product authorization + Actor/Trip distinction        | F / PASS                                  |
|   5 | Domain-specific operation uniqueness and digest                | D / PASS                                  |
|   6 | Atomic mutation/manual confirmation/immutable receipt          | E/G / PASS                                |
|   7 | Same key/change/lost response/later-edit replay                | D/E/Q / PASS                              |
|   8 | Receipt privacy/retention/exact lookup/no oracle               | E/O / PASS                                |
|   9 | Parent CAS/increment/no-op/overflow and lock order             | G / PASS                                  |
|  10 | Writer identity, least effective grants, atomic closed install | F/R / PASS                                |
|  11 | Reproducible resolver identity contract and no fake fallback   | H / PASS                                  |
|  12 | Manual vs prepared C evidence/value/pin admission              | I / PASS                                  |
|  13 | Shape boundaries; permanent identity vs deferred semantics     | C/F/J / PASS                              |
|  14 | Authored/accepted/candidate separation and generations         | K / PASS                                  |
|  15 | Old create/full-save/read policy and feature detection         | L / PASS                                  |
|  16 | UNASSIGNED first slice; deferred semantic scope/set adapter    | C/M / PASS                                |
|  17 | Lossless offline intent/base/key/revision/generation contract  | N / PASS                                  |
|  18 | C exact operation handoff/finalization crash isolation         | O / PASS                                  |
|  19 | Stable errors and >=24 deterministic cases                     | P/Q (40 cases) / PASS                     |
|  20 | Safe activation/rollback; no financial/legacy mutation         | R/S / PASS                                |
|  21 | Executable commands/receipts/gateway/independent review        | Not implemented / PENDING                 |
|  22 | Lossless Mobile editing/compatibility integration              | Not implemented / PENDING                 |
|  23 | Resolved-zone execution artifact gate                          | No trusted artifact established / BLOCKED |
|  24 | C prepared-evidence executable adapter gate                    | Source contract only / BLOCKED            |

Totals: **20 PASS / 2 PENDING / 2 BLOCKED**. PASS is document coverage only.
Runtime enabled commands: **0**. Forty golden cases are proposed acceptance vectors,
not executed tests. Document-only formatting, whitespace, link/file-scope checks
are the appropriate validation; no SQL/Backend/device/runtime checks are run.

Exact changed file:
`docs/architecture/TRIP_CANONICAL_B_T3C_COMMAND_RECEIPT_CONTRACT.md`.
Production accessed: NO. Hosted Dev accessed/mutated: NO. Migration/SQL execution:
NO. Application code: NO. Mobile SQLite: NO. Sibling worktrees: NO. Commit: NO.
**Canonical commands remain disabled. STOP — REVIEW PENDING.**
