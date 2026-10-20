# Trip Import Contract — CP12

Date: 2026-10-05 (Pacific/Auckland). Version: `otr-import-v1`.
Status: **DESIGN ONLY — CONTRACT REVIEW PENDING**.
[Architecture](TRIP_IMPORT_ENGINE_ARCHITECTURE.md) defines authority and reuse.
All shapes below are logical contracts, not new tables, endpoints or runtime types.

## Identity and N↔M model

| Concept               | Identity, content and lifecycle                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Import Batch          | Opaque locally allocated Batch ID, owning Account, intake operation key/input manifest, immutable Context Snapshot ID, optional selected Trip and ordered Capture membership. Groups one intake intent and subsequent bounded Runs; neither Source nor all-or-nothing booking transaction. Intake manifest can settle per input with explicit failure; later additions create a new manifest version. |
| Capture               | Existing CP11 Capture ID/revision/payload integrity facts. One acquisition result, independent of file dedup, Trip association and eventual Source. Original material and acquisition provenance are immutable; assignment follows existing revision CAS.                                                                                                                                             |
| Evidence Fragment     | Opaque fragment ID bound to exact Capture revision/payload or admitted Source/material revision/Representation/input pin, locator and extraction transform. Observation support only; never a second Source.                                                                                                                                                                                          |
| Candidate Observation | Immutable Run/request-scoped observation ID, proposed item token, schema field path, raw value, normalized proposal, supporting fragment IDs, contradictions, uncertainty and producer/version. No canonical or accepted state.                                                                                                                                                                       |
| Candidate             | Existing Track C opaque Run-owned Candidate ID/key and immutable proposal digest. Consolidates one prospective item from several observations. Uses versioned subtype schema; neither type nor time is its identity.                                                                                                                                                                                  |
| Candidate Set         | Immutable ID/version, Batch manifest and completed Run IDs, selected Candidate IDs, consolidation lineage and complete/partial coverage. View of proposals and matching, not a new canonical business root.                                                                                                                                                                                           |

Batch → many Captures; Capture → many Evidence Fragments; fragments support many
observations/fields; Candidate → many observations across Captures. One Capture
can support many Candidates; many Captures can support one Candidate; many can
support many. Source can have several captured/derived Representations, including
email body and attachments. Source admission is explicit, not one Source per Batch.

Opaque acquisition, Run, observation, Candidate and canonical output identities
are separate. Type selects schema. Date/time, places, identifiers and evidence
contribute to resolution but never serve as universal identity keys. Array position,
filename, digest, flight number or booking reference alone cannot become an ID.

C-I3A immutable READY publication remains authoritative. A Batch may expose completed
Run R1 while R2 is still reading; it cannot append to R1. Consolidation/reprocessing
creates a new Run/Candidate with predecessor observation/Candidate references and
new Candidate Set version. Old selected/confirmed values remain immutable. A closure
assessment is separate from Candidate publication and confirmation disposition.

## Context Snapshot at intake

Required header: snapshot ID/version, owning Account, Batch/intake identity,
capture timestamp and clock provenance, entry surface, and per-value origin.
Optional fields: selected Trip ID, viewed Day date plus explicit query IANA zone,
Trip inclusive date-range labels, known Person IDs/roster observation, surrounding
Event IDs/revisions, exact collection certificate/projection generation and
historical/current-match labels, expected city/location, permitted device zone,
locale and physical location with observation time/accuracy/permission origin.
Unavailable context is explicitly unknown; no network fetch is required at capture.
Store only needed permitted context, not entire Account profiles or credential data.

Every supplied element is tagged `CONTEXT`, `PRIOR` or `HINT`, with observation
identity/time and completeness where available. Source statements are `EVIDENCE`;
accepted canonical facts are `FACT` with owning-domain revision/proof. These labels
are not interchangeable. Context can rank hypotheses or suggest missing year,
Person or place; it cannot silently supply accepted values against source evidence.
A proposed inference retains input hints, rule version and unresolved assumption.
Physical current location is observed device context, never itinerary location.

Capture selection/snapshot remain historical. Later closure records a separate
current context observation and exact target revisions; it never rewrites intake.
Conflicting source dates versus viewed Day or Trip overview require explicit review,
not clipping or year substitution. A Trip overview mismatch is a contextual conflict,
not proof that the booking is invalid. Unselected Trip means review/assignment is
needed before Trip Source preparation or domain commit.

## Evidence and provenance

Each important extracted field retains its scope path: occurrence field, booking
proposal-local key plus field, or passenger proposal-local key plus field. Scope
identity is evidence-group identity, not a name-derived Person or canonical Booking
ID. Several accepted support items may refer to different bookings/participants of
one occurrence. A source about passenger X must not support Y's seat or baggage.
A future domain adapter must approve each scoped field key; no dynamic proposal key
may be smuggled into B's accepted provenance maps.

Each important extracted field retains:

- exact origin Capture and, when admitted, existing Source ID/material revision,
  Representation ID and typed Run Input ID; verified bytes/text integrity binding;
- fragment ID and WHOLE/PAGE/REGION/TEXT_SPAN locator when valid; CP12 additionally
  permits conceptual AUDIO_RANGE with exact recording/timebase for future admission;
- raw source value or immutable value reference, normalized proposed value and
  versioned transformation chain with parent IDs/options digest;
- extractor/plugin/model/version/config identity, observation time, optional
  confidence decimal string with named scale, uncertainty categories/alternatives;
- multiple supporting evidence IDs and explicit contradictory observation IDs;
- field origin: evidence-derived, inferred from labelled hints, user-entered,
  accepted-extracted or edited-extracted, with actual actor decision binding.

No invented precision: WHOLE is valid when no accurate region exists. UTF-8 byte
spans address exact saved text derivatives, not character positions in a PDF.
Page/region refer to the pinned representation and dimensions. Speech timestamps
are transcript alignment observations until validated. AUDIO_RANGE cannot enter
C-I3A v1 support locators without a later versioned adapter; preserve whole-recording
support at that boundary. Excerpts, names, URLs and booking references remain private.

Normalization must be deterministic, loss-aware and preserve raw values: date locale,
clock precision, civil zones/offsets/instants, airport codes and Money cannot be guessed.
Unknown/ambiguous is not null-as-zero or default midnight. Confidence is diagnostic,
not field acceptance. Conflicting material retains both alternatives; a newer model
observation does not win by age. Model evidence references must resolve to allowed
input pins, locators and actual supporting material; fabricated references reject.
User-edited values preserve original proposal and separate edited intent, never
claiming the document contained the replacement.

Accepted field support uses the existing C address
`track-c/field-evidence/<slot-uuid>/<field-key>` and exact C-I3A/B-T3C admission.
CP12 fragment/observation IDs do not become alternative accepted proof addresses.
Provider-specific objects stay behind adapters. LLM output is an observation.

## Entity resolution and consolidation

Matching inputs: subtype/family, carrier/service provider namespace, strong ticket
or segment identifiers, booking reference namespace, independent endpoint dates/
times/zones, origin/destination/place, source traveller tokens versus explicitly
resolved same-Trip Person IDs, and acquired/derived evidence relationships.
Missing dimensions contribute no agreement. Negative evidence and namespace
scope matter. Booking reference can cover many passengers and legs; codeshares
can give several flight numbers for one physical leg.

| Match outcome           | Deterministic interpretation and allowed next step                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SAME_ITEM               | Sufficient jointly consistent evidence relates proposals to the same prospective item; consolidate supported fields into a new immutable Candidate, retaining all predecessors. Against unchanged existing facts, may expose duplicate disposition. |
| NEW_ITEM                | Sufficient distinction and assessed search coverage support a separate item; propose CREATE after confirmation. Incomplete offline search must retain coverage limits and cannot guarantee global uniqueness.                                       |
| POSSIBLE_DUPLICATE      | Some overlap but insufficient equality/distinction; preserve separate identities and require review or bounded further resolution.                                                                                                                  |
| UPDATE_TO_EXISTING_ITEM | Exact existing target/revision and item continuity established, proposed changed fields identified; explicit UPDATE review/CAS required.                                                                                                            |
| CONFLICTING_ITEM        | Probable same-item relation with incompatible material or canonical fields; retain both values and require resolution, no silent consolidation of conflicting fields.                                                                               |
| UNRESOLVED_MATCH        | Insufficient facts, missing target access or incomplete lookup prevents a safe relation; schedule eligible work or review.                                                                                                                          |

A match assessment records ID/version, policy version, input Candidate digests,
context/search scope and completeness, target kind/ID/base revision if known,
positive/negative reasons, and proposed field changes. No score-only match.
Occurrence relation and proposed action are separate dimensions. SAME_ITEM among
proposals permits consolidation; against an existing target it does not mean the
new evidence is duplicate. Match assessment includes exactly one action outcome
from the following catalog, or independent per-field-group outcomes with an explicit
combined reviewed plan. Mixed additions and updates must retain each group's outcome.
These are assessment outcomes, not automatically separate executable commands;
execution against one Event revision follows the I2 rules below.

| Action outcome     | Required evidence and effect proposed                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DUPLICATE_EVIDENCE | Exact same-item target/revision; imported fields add no materially new fact within assessed scope. Preserve acquisition provenance; optional link-only action, no business write.          |
| COMPLETE_EXISTING  | Same item; evidence fills missing accepted fields. Missing means absent/explicitly unknown at observed base, never replace an existing nonnull value as completion.                        |
| AUGMENT_EXISTING   | Same item; adds valid dimensions such as another booking, passenger, ticket, seat or baggage detail. Preserve dimension identity and scope, not new occurrence.                            |
| UPDATE_EXISTING    | Same item; evidence establishes change to an accepted fact (explicit reissue, schedule-change or supported supersession relation). Requires old/new field binding and reviewed target CAS. |
| CONFLICT           | Same/probably same item; incompatible evidence or accepted fact cannot safely reconcile. No automatic write; explicit decision required.                                                   |
| NEW_ITEM           | Supported distinct occurrence under stated search coverage; proposed CREATE.                                                                                                               |
| UNRESOLVED_MATCH   | Insufficient item/dimension continuity, ambiguous member mapping or missing target observation; further resolution/review required.                                                        |

DUPLICATE_EVIDENCE, COMPLETE_EXISTING, AUGMENT_EXISTING and UPDATE_EXISTING are
match/action outcomes, not closure states. Legacy shorthand DUPLICATE/UPDATE in
CP12 means those exact outcomes; no new enum in existing runtime. Unknown target
revision prevents a definitive existing-item action. POSSIBLE_DUPLICATE maps to
UNRESOLVED_MATCH with a possible-duplicate reason; CONFLICTING_ITEM maps to CONFLICT.
UPDATE_TO_EXISTING_ITEM is occurrence relation supporting UPDATE_EXISTING, not its
own closure state. COMPLETE/AUGMENT can relate to SAME_ITEM without any schedule change.

Separate scopes: occurrence facts (service/date/endpoints/time/terminal), booking
facts (PNR/provider/party/financial evidence), and participant facts (printed name,
reviewed Person mapping, ticket, seat, cabin/fare, baggage and boarding group).
One occurrence can have multiple bookings and passengers; one booking may span
multiple legs. Correlation alone never grants canonical booking/participant authority.
Matching first resolves occurrence, then independently resolves booking and passenger
groups. A booking reference cannot flatten several passenger observations into one.

Two confirmations for one flight with different passengers can propose AUGMENT_EXISTING
and retain separate booking/passenger evidence rather than create duplicate Flights.
Printed names are evidence tokens, not TripPersonId. Ambiguous homonyms, transliteration
or missing roster observations stay reviewable; explicit exact same-Trip Person
association is required before proposing canonical participant mutation. Conflicting
seat/baggage evidence is compared within the same participant/booking/leg scope;
different passengers' different seats are compatible, not occurrence contradictions.

Minimum safe consolidation requires an admitted subtype occurrence anchor plus
consistent leg applicability and no unresolved critical contradiction. Flight uses
the normative `import-flight-match-v1` matrix in the
[registry](TRIP_RESERVATION_SCHEMA_REGISTRY.md#flight-matching-anchor-policy--i3).
Acquisition/source relationship alone never establishes business-item identity. Otherwise POSSIBLE_DUPLICATE
or UNRESOLVED_MATCH. Same type, same clock, same booking reference, equal bytes or
similar names alone never merge. Canonical IDs come only from domain targets or
locally allocated intended CREATE IDs in deterministic code, never provider output.

## Closure assessment

Closure is deterministic over pinned Candidate/schema/closure policy versions,
evidence, match assessment, context, current target observations, work eligibility
and explicit `now`. The assessment retains known fields, missing fields with
requirement predicates, conflicts/alternatives, deferred-resolution plans, failed
optional enrichments, user decisions needed, search completeness and recheck reasons.
No single confidence score determines business state.

| State                  | Meaning                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| READY                  | All closure-critical predicates resolve, no material ambiguity/conflict or unresolved match/action ambiguity; valid proposed action available. Still unaccepted and possibly blocked by a separately recorded domain capability gate. |
| NEEDS_REVIEW           | Material ambiguity, Person/Trip selection or possible duplicate requires a human decision; enough information exists to present that decision.                                                                                        |
| INCOMPLETE             | Missing critical fact with no eligible bounded automatic plan; retain proposal and report the exact missing facts.                                                                                                                    |
| CONFLICT               | Critical contradictory evidence, incompatible target facts or context contradiction requiring explicit resolution.                                                                                                                    |
| WAITING_FOR_NETWORK    | Critical work can reasonably resolve after reconnect; resumable plan/dependency is recorded, so ordinary missing-field prompts wait.                                                                                                  |
| WAITING_FOR_ENRICHMENT | Critical resolver has an eligible pending/running enrichment plan; online provider latency is distinguished from missing internet.                                                                                                    |
| UNSUPPORTED            | Schema/modality/version or required transformation is unsupported; retain original and explain bounded unsupported reason.                                                                                                            |

Evaluation order: unsupported required contract → CONFLICT for material unresolved
contradiction → NEEDS_REVIEW for nonautomatic decision → blocking critical gaps
(INCOMPLETE if any has no automatic plan; otherwise WAITING_FOR_NETWORK if any
plan awaits connectivity, else WAITING_FOR_ENRICHMENT) → READY. Pending online remote
intelligence without a published usable Candidate is processing, not fabricated
closure; an older incomplete Candidate retains its assessment and deferred-work facts.
All independent reasons remain visible even when one state takes precedence.
Failed optional providers never downgrade READY. Temporary critical-provider failure
can remain deferred within policy bounds; definitive exhaustion returns INCOMPLETE
or NEEDS_REVIEW, not invented values. Present invalid typed observations as rejection
reasons; preserved raw material can be reprocessed, never coerced to READY.

Trip member checks validate explicit selected same-Trip Person IDs and observation
freshness. Unknown names cannot create Persons or auto-map uploader→traveller.
A permitted explicit UNASSIGNED scope is valid; known contradictory traveller mapping
requires review. Location checks preserve free text and endpoint roles without
requiring geocoding. Time checks follow B-T3A/C precision, DST and independent zones.
A complete Event schema may still support partial times; Import Flight READY is a
stricter proposal completeness policy, not a change to canonical Event validity.

### Existing-item closure and review

Closure assesses the selected action, not global completeness of the existing item.
COMPLETE_EXISTING validates additions into fields proven missing at the pinned base;
AUGMENT_EXISTING validates new scoped dimensions without duplicating the occurrence;
UPDATE_EXISTING validates supported change and old/new facts. All recheck affected
cross-field invariants, exact scope and current base revision. An existing incomplete
item need not meet unrelated Flight CREATE predicates for a valid terminal addition.
DUPLICATE_EVIDENCE can be READY for a no-business-write/link-only review outcome.
Match readiness is distinct from enabled domain capability and user confirmation.

Ambiguous passenger/member association is NEEDS_REVIEW, or UNRESOLVED_MATCH pending
eligible resolution. Raw passenger evidence can remain unassigned; selecting only
safe occurrence facts leaves passenger mapping explicitly deferred, never silently
accepted or dropped. Conflicting passenger evidence is scoped and yields CONFLICT
only for the affected action; independent safe Candidates/actions remain reviewable.
Adding a Person/ticket/booking dimension cannot bypass currently disabled participant,
reservation or credential adapters. The deterministic baseline records required
capability/action and prevents dispatch until separately admitted.

No absent-value overwrite, roster union by printed-name similarity, passenger-specific
fact flattening, unreviewed schedule update or financial aggregation is permitted.
Acceptance prepares existing UPDATE intent only where its exact typed domain adapter
supports that addition; it does not reinterpret augmentation as legacy CREATE.

## Urgency and attention policy

Baseline `import-attention-v1` takes explicit `now`, its clock provenance, configured
horizon and evidenced actionable deadlines. **24 hours is a configurable/versioned
baseline default, not a universal architecture constant.** Pin policy version and
configuration digest in the assessment; changed horizon/configuration produces a
new attention assessment, never a changed evidence or closure version by itself.

Evaluate evidenced boarding, check-in or other actionable deadlines as well as
departure; the earliest relevant unresolved actionable deadline can require attention
before departure. Compare supported exact instants where available. If clocks/zones
are unknown, use conservative possible-window attention from evidenced calendar
labels and explicitly unknown bounds, not invented midnight, device zone or departure
instant. Record the uncertainty reason. Hint-only dates are not asserted deadlines.
Known past items alone are not urgent.

Attention facts: severity NONE/DEFERRED/ACTION_REQUIRED/URGENT, reason codes, affected
Candidate/field IDs, blocking action, deferred plan and optional evidenced deadline.
Urgency can expose user action while closure stays WAITING_FOR_NETWORK: an offline
flight soon with missing departure time warrants attention now. A distant incomplete
booking with a capable planned resolver stays deferred. No-capability or exhausted
plans ask for necessary values; do not postpone indefinitely. Changing attention
policy or presentation must not mutate evidence, identity, matching, closure truth
or canonical authority. Only new domain inputs can change those assessments.
CXE may choose presentation timing within admitted policy; it cannot redefine the
underlying urgency/deadline facts, owning policy or canonical authority.

## Offline durable continuation

Future logical work record: work ID, owner Account, Batch/manifest version, optional
explicit Trip, stage, Run/request identity, exact Capture revisions/material pins,
input digest, schema/plugin/routing policy versions, dependency IDs, work status,
claim/fence, attempts/due time, normalized failure, result publication digest,
cancellation disposition and timestamps with clock origin. Persist capture plus
membership/snapshot before processing; keep owned originals safe. Processing metadata
and queue mapping require a later migration; CP11 rows are unchanged.

Separate work reasons include WAITING_FOR_NETWORK, WAITING_FOR_REMOTE_INTELLIGENCE
and WAITING_FOR_ENRICHMENT. These are not new generic queue status enums. A future
adapter maps them to existing due-time/dependency/auth scheduling. Reconnect can
resume the same pinned work automatically without re-import or premature missing-field
prompts. Upload, extraction, closure, user disposition and canonical outcome are
independent axes. Partial published Runs remain usable after other files fail.
Intake/current-pass completion is separate from processing quiescence. A completed
pass can retain durable WAITING_FOR_NETWORK, WAITING_FOR_REMOTE_INTELLIGENCE or
WAITING_FOR_ENRICHMENT work; completion cannot suppress their reconnect wakeups,
cancel dependencies, hide later results or release required evidence. The existing
queue/work owners alone settle execution and resource responsibility.

Persist ownership and identity, not process generation as permanent authorization.
Each resumed attempt captures a fresh existing AccountRequestContext/generation
before credentials/I/O; compare after awaits and under the existing Account apply
gate through local commit/rollback. Release gate during I/O. Account A→B→A rejects
old completion even with equal Account ID. Recheck Capture revision/Trip binding,
Run generation, input digest and target base; changed inputs require new work identity.
Logout/switch pauses old-owner work and hides its private results; it does not delete
retained evidence. Fresh A resume uses persisted intent with fresh admission, never
an old callback. Token expiry/network failure pauses remote work, not local access.

Claims and result publication are idempotent. Response loss retains exact request
identity; recover/replay when safe, never assume timeout means no execution. Cancel
records intent, fences late installation and preserves input; plugin cancellation
acknowledgement is not C-I3H resource/provider terminal proof. UNKNOWN execution
cannot start a competing unsafe attempt or release protected staged resources.
App-level lifecycle work may later wake continuations; CP12 installs no timer/worker.

## Presentation-neutral progress

Progress observation header: Account/Batch/manifest version, monotonic sequence,
observed time, completed/active Run IDs and bounded reason facts. Facts include
captured, reading, extracting, items_discovered, checking, waiting_for_network,
ready, needs_attention and failed. Publish counts: expected/admitted/rejected Captures,
processed/failed/pending files, observations, discovered/selected/ready Candidates
and confirmed output slots; unknown denominator is explicit.

For example, 4 of 6 files processed with 7 discovered Candidates is partial success,
not seven accepted Events. Counts cannot be derived from a provider's prose.
Terminal work failure and closure INCOMPLETE are different facts. Report separate
intake disposition, current-pass completion, outstanding work count/IDs, resumable
work count/reasons and processing quiescence (with observation scope/time). A current
pass completes when its admitted inputs have a processed/failed/deferred disposition;
this may be completed-with-deferred-work. It does not mean all Candidates are READY,
accepted, or that no later results can arrive.

Processing quiescence requires no outstanding resumable, running or uncertain work
within the assessed Batch scope. It is an observation, not Source IO terminal proof,
byte-release authorization or permanent closure against future authorized intake.
A generic `batch_complete` summary, if presented, must identify intake/pass completion;
it cannot cancel reconnect wakeups, release required evidence, imply Source IO
terminality or hide later results. Keep existing queue/claim/resource owners; do not
create a second Batch queue or terminality authority.

Foreground waiting and leaving then receiving later results consume the same durable
facts. Future notification delivery is separately authorized, account-fenced and
coalesced by Batch/version/attention reason; no sensitive content or old-account
result may leak. No screens, localized copy, exact layout or notification SDK is
specified. CXE selects presentation without rewriting facts.

## URL and email

A URL Capture preserves the exact supplied locator and origin/time. Locator-only
material proves a supplied address, not the page's content or an authoritative
booking. Fetch is separate deferred work with explicit OFFLINE, BLOCKED,
LOGIN_REQUIRED, UNAVAILABLE and FETCHED outcomes. A successful fetch records actual
requested/final locator, redirects, fetch time, content completeness, exact snapshot
integrity and a new pinned Representation/material revision via Track C's future
fetch adapter. Never mutate the captured locator or re-fetch silently under old pins.

Only actual saved page content supports extracted fields; fetched content is still
evidence, not accepted truth. Authentication and restricted-fetch safety, including
allowed schemes, redirect/private-address restrictions and bounded responses, are
future adapter admission requirements. Credentials are never extracted booking fields.
Unavailable/login-required pages retain the locator and may accept separately supplied
screenshots/text; blocked content must not trigger invented observations.

Email captures preserve supplied body and separate attachment material, with message
part identifiers and parent/acquisition relationship. One acquired message may become
one Track C Source with body/attachment Representations; local intake may contain
several related Captures. A file imported independently remains a distinct acquisition
unless explicit relation/reuse is reviewed. Full message bytes/headers are retained
only if supplied. Record missing attachments/partial body honestly. Message ID, subject,
sender and conversation thread cannot merge booking identity. Multi-email evidence
can consolidate a Candidate under the same matching rules. No forwarding address,
mailbox credentials, ingestion service or inbound email infrastructure is implemented.

## Confirmation and commit

READY never means ACCEPTED. Explicit human disposition selects CREATE, UPDATE,
LINK_ONLY, REJECT or DEFER per Candidate/output purpose. Preparation binds Actor,
Trip, exact reviewed Run/Candidate/input versions, edited fields, target/base revision,
intended target ID, adapter/version and immutable domain operation key/digest.
Recheck current admission and enabled shape/proof/capability before dispatch.
Flight TRANSPORT and reservation CREATE cannot fall back to legacy itinerary routes.

### I1 — CREATE fence across reprocessing and consolidation lineage

Before enabling NEW_ITEM/CREATE, commit preparation must inspect relevant current,
predecessor and consolidation-lineage output claims for the same proposed output
purpose and target kind in the admitted Account/Trip scope. This includes reprocessing,
escalation, another model/configuration, Candidate Set changes and split/merge
lineage. Record the exact inspected claims and reviewed purpose correspondence.
A new Candidate ID, output key, model token or intended Event ID cannot bypass a
relevant earlier claim. Check before preparing/acquiring a competing claim and
recheck before dispatch through the existing preparation/claim ownership fences;
a concurrent related claim cannot be hidden by a stale empty-lineage observation. Missing/inaccessible/incomplete lineage assessment blocks
competing CREATE pending recovery/review; canonical search cannot replace this check.

- A relevant predecessor OUTCOME_UNKNOWN claim blocks competing CREATE until exact
  predecessor outcome recovery or authoritative no-commit proof under existing
  C-I3A/B-T3C fencing. Timeout, missing search result, expired lease, inaccessible
  receipt or transient NOT_FOUND is not no-commit proof.
- A successful predecessor CREATE supplies its exact receipt-bound target/result
  and historic result revision to existing-item assessment. Reconcile with the
  current accepted target observation before a new mutation; do not regress current
  facts to the historic result. Incomplete canonical search cannot justify a second
  target, and missing current target visibility leaves a deferred/review outcome.
- Split, merge and genuinely distinct outputs require explicit reviewed lineage
  disposition: predecessor/current output-purpose mapping, which exact successful
  target is reused, which purposes are proven uncommitted and which outputs are
  independently evidenced as distinct. Unknown relevant claims remain fenced;
  relabelling a purpose or splitting a Candidate alone does not release them.

This is an Import preparation/dispatch invariant, not a new global canonical identity
or a change to C-I3A's `(candidate_id, slot_key, intended_target_kind)` uniqueness.
Use existing exact operation/slot recovery and claim ownership; do not invent a
cross-domain dedup key or allow models to declare a claim irrelevant.

### I2 — Mixed assessments against one Event revision

COMPLETE_EXISTING/AUGMENT_EXISTING/UPDATE_EXISTING labels describe assessed changes.
Several selected changes to one Event may use **one immutable atomic operation**
only if an admitted typed domain command supports every selected field/dimension
and all invariants in one parent-CAS/receipt transaction. Bind the reviewed complete
payload, base revision, proofs, operation key/digest and output slot to that command.
No generic Event patch may carry unsupported booking/passenger/ticket dimensions.

Otherwise use separate reviewed actions with explicit dependency/successor
relationships and partial-result correlation. Bind the first executable operation;
retain dependent decisions as non-dispatched reviewed intent with predecessor
identity and expected effect, not several prebound mutations at the same base.
Recover/verify predecessor APPLIED/NO_CHANGE receipt before dependent dispatch.
An unattempted successor may then be prepared at that exact result revision only
under B-T3C §N, after checking the original reviewed decision, affected invariants
and current target baseline remain valid. Intervening or incompatible baseline
changes require fresh review and a new immutable operation/key. Already-bound or
attempted requests never have their base/body/key silently changed.

Do not dispatch multiple same-base mutations and silently rebase losing/conflicting
operations. Unknown predecessor outcome keeps dependents blocked; failure/conflict
requires explicit reassessment, not assumed success. A known historic predecessor
receipt does not roll back a newer current target or authorize its revision as the
new base. Unsupported dimensions stay explicitly deferred, with evidence retained,
while separately valid admitted actions may proceed after review.

Contract vectors:

| Vector                                                                                  | Required preparation/dispatch result                                                                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1 CREATE is OUTCOME_UNKNOWN; model escalation publishes C2 for same output purpose     | C2 CREATE blocked; recover exact C1 operation or authoritative no-commit proof.                                                                  |
| C1 CREATE succeeded E1/revision 1; C2 canonical search incomplete                       | Assess E1 using exact C1 result plus current observation; never CREATE E2 for this purpose.                                                      |
| One predecessor splits into two new Candidates                                          | Explicit purpose/target lineage disposition; relevant unknown claim still blocks; new IDs alone confer no distinctness.                          |
| E1/base 7: selected arrival completion, departure update and passenger augmentation     | One atomic operation only with admitted all-field typed command; otherwise reviewed dependent actions, unsupported passenger dimension deferred. |
| First action applied at revision 8; successor unbound and original decision still valid | Verify receipt/current baseline; prepare successor at exact 8 per B-T3C §N, preserving reviewed intent.                                          |
| First action uncertain or another edit advances baseline to 9                           | Recover first; fresh review if original decision invalidated; no blind base 7→8/9 substitution.                                                  |

Reuse C-I3A/B-T3C prepared slot, write-once result, exact receipt recovery and
DOMAIN_SUCCEEDED/EVIDENCE_PENDING correlation. Partial success/restart never issues
a fresh create key for an uncertain slot. Domain success activates field evidence;
Import success/closure or provider output does not. Target drift requires new review/
CAS intent. Import cannot certify canonical collection completeness or compensate
failed evidence finalization by deleting a successfully committed Event.

## Financial Evidence boundary

Import-side observations may include TOTAL, DEPOSIT, AMOUNT_PAID, BALANCE_DUE,
CURRENCY and PAYMENT_DATE, each with scope (booking/leg/passenger/unknown), raw value,
exact normalized Money if supported, field provenance and uncertainty. Use integer
minor units plus explicit ISO currency/scale; unknown symbol/scale stays unresolved,
never float rounding. Due date, invoice date and payment date remain distinct.
Quoted totals do not prove paid amounts, payer, participants or allocations.

Future path: Import Financial Evidence → Ledger matching → Ledger Candidate →
explicit deterministic/user-approved Ledger action through its existing repository/
command/receipt contract. That Ledger Candidate is future Ledger-owned work, not a
CP12 implemented entity. Trip IDs/Person references and evidence can correlate under
admission; canonical domains remain independent. No Expense, PaymentRecord, valuation,
economic date, FX rate, Settlement vector or financial Review state is changed.
