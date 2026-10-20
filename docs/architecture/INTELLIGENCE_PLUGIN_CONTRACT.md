# Intelligence Plugin Contract — CP12

Date: 2026-10-05 (Pacific/Auckland). Boundary: `otr-intelligence-v1`.
Status: **PROVIDER-NEUTRAL DESIGN ONLY — REVIEW PENDING**.
No provider/model is called, selected, installed or promised capable by this contract.

## Reusable boundary and authority

An Intelligence Plugin maps authorized pinned input to structured observations.
OpenAI/GPT, Anthropic/Claude, Apple/on-device models and future providers implement
the same boundary. Vendor SDK types, message objects, tool calls, token objects,
error payloads and model JSON never reach Import or other OTR domain code.
Only adapters translate them. Deterministic/local extraction may implement the
same capability interface where useful, without creating unnecessary model calls.

Future consumers such as CXE can submit their own schemas. Import-specific schema
registry, evidence validation, consolidation, closure and commit authority stay
inside Import. Plugins must not return executable domain commands or receive
canonical write credentials. A model must not decide READY, ACCEPTED, canonical
identity, Event overwrite, participant mutation or Ledger mutation. Prompted document
instructions are data; they cannot expand tool/network scope or override schema.

## Capability discovery

Descriptor: plugin ID, boundary versions, adapter/plugin version, actual model ID/
version (or explicit unavailable stable version), configuration fingerprint,
execution location DETERMINISTIC_LOCAL/LOCAL_MODEL/REMOTE_MODEL, supported modalities,
capability set, schema dialect/version/features, limits, privacy/network requirements,
timeout/cancel/replay guarantees and latency/cost metadata. Changes pin a new
descriptor/config version; fallback cannot masquerade as the originally pinned model.

| Capability                | Promise when advertised                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| TEXT_EXTRACTION           | Supplied exact material → attributed text/structure observations.                                           |
| STRUCTURED_EXTRACTION     | Typed fields/items matching consumer schema; output still validated by OTR.                                 |
| VISION_EXTRACTION         | Image/page evidence with modality-specific locators/uncertainty.                                            |
| CLASSIFICATION            | Proposed labels from allowed schema taxonomy, no domain disposition.                                        |
| BATCH_N_TO_M_EXTRACTION   | Several inputs → zero/many proposed items and cross-input support without one-file/one-item assumption.     |
| SCHEMA_CONSTRAINED_OUTPUT | Declared schema features supported; advisory guarantee until runtime validation.                            |
| EVIDENCE_MAPPING          | References to allowed input/fragment IDs and actual locators; unsupported exact geometry reported honestly. |

Modalities include TEXT, IMAGE, DOCUMENT/PDF, AUDIO and captured WEB_CONTENT where
an adapter supports them. EMAIL is a structured supplied body/part manifest; URL
locator alone does not authorize model browsing. A composite plugin can declare its
actual extraction substeps/versions, never hide unapproved remote transmission.
No provider is assumed to support every capability or schema feature. Discovery is
metadata, not a live booking lookup; version/capability mismatch is explicit.

## Neutral request

Immutable request header: request ID/idempotency key, consumer ID, contract version,
owner scope binding (opaque to provider where possible), input digest, exact schema
ID/version/dialect/digest, output/evidence limits, requested capability set, pinned
plugin/model/config descriptor, locale hints explicitly tagged as context, deadline,
resource/cost ceiling, allowed execution/network/privacy policy and cancellation token.

Input manifest contains exact material/fragment IDs, media type and integrity/length,
consumer-approved structured text or owned content handles, relationships (page/part/
parent Capture) and bounded context. Plugin handles are scoped to supplied material;
no filesystem traversal, mailbox access, arbitrary URL fetch, credentials or domain
writes. Per-field schema scope distinguishes occurrence/booking/participant data.
Privacy plan minimizes names/PNRs/audio/QR content and records which fields/content
may leave the device, applicable consent/authorization and retention requirement.
Context cannot request a remote upload when policy permits only local work.

Same request identity binds identical inputs/schema/config/privacy plan. Changed
inputs, provider or escalation produce a new request with predecessor linkage.
New linked requests/Runs must preserve relevant predecessor and consolidation-lineage
references even when another model splits/merges observations or changes item tokens.
Plugin tokens cannot manufacture item continuity, canonical identity or an independent
CREATE purpose. Import commit preparation must inspect lineage output claims: a
relevant OUTCOME_UNKNOWN predecessor blocks competing CREATE; a successful predecessor
supplies its exact target/result to existing-item assessment. Explicit reviewed lineage
disposition is required for splits, merges and genuinely distinct outputs. This does
not change C-I3A uniqueness or make plugins claim/recovery owners.

Idempotency is an OTR installation guarantee, not assumed vendor dedup billing:
provider replay support is declared SUPPORTED/UNSUPPORTED/UNKNOWN. Response loss with
unsupported/unknown replay needs owner policy and outcome recovery before another
billable attempt; no new key is silently issued as equivalent replay.

## Neutral response and validation

Response: exact request/input/schema/config binding, actual plugin/model version,
SUCCEEDED/PARTIAL/FAILED/CANCELED execution observation, immutable response digest,
bounded observation array and evidence map, explicit unprocessed input IDs and
coverage, uncertainty/rejection findings, safe failure, observed timings and actual
usage/cost where known. Usage/cost is optional metadata, never business confidence.
PARTIAL can support completed valid sub-results only under the consumer's versioned
Run-publication plan; it cannot claim all inputs processed or append to a READY Run.

Each item token is proposal-local, never a canonical target ID. Field observations
retain typed raw/normalized suggestions, allowed fragment IDs, scope keys and
uncertainty/alternatives. Model numeric confidence needs named scale; omit unknown
scale. Raw vendor responses remain adapter-private bounded diagnostics if policy
permits, never a stored canonical proposal blob.

Before becoming an Import Candidate, OTR independently validates envelope identity,
resource/coverage bounds, strict registry schema/field scopes, evidence pin membership,
locator ranges/actual support, deterministic normalization, contradictory material
and account/run-generation fences. Schema compliance alone does not prove evidence
truth. Unsupported versions, extra command fields or invented evidence reject.
Classification output feeds interpretation only; closure is rerun deterministically.

## Timeout, cancellation, failure and retry

Deadline is mandatory and adapter reports whether external execution ceased,
continues or is UNKNOWN. Timeout stops accepting unbound/late results, not proof
of remote cancellation. Cancellation is owner intent plus installation fencing;
acknowledged local abort does not certify provider/process/resource quiescence.
C-I3F/H responsibility and safe IO_UNKNOWN retry gates remain unchanged when relevant.
No plugin implementation can release staged Source resources by lease age alone.

Neutral failure shape: category, stable content-free code, phase, retryability
(TRANSIENT/PERMANENT/WAIT_FOR_AUTH/WAIT_FOR_NETWORK/UNKNOWN), optional retry-after,
execution certainty (NOT_STARTED/TERMINAL/UNKNOWN), affected inputs and request
correlation. No vendor error text, document excerpts, tokens or secrets in domain errors.

Categories: UNSUPPORTED_CAPABILITY, UNSUPPORTED_MODALITY, UNSUPPORTED_SCHEMA,
INPUT_INVALID, INPUT_UNAVAILABLE, LIMIT_EXCEEDED, PRIVACY_POLICY_BLOCKED,
NETWORK_UNAVAILABLE, AUTH_UNAVAILABLE, RATE_LIMITED, TIMEOUT, CANCELED,
PROVIDER_UNAVAILABLE, PROVIDER_REJECTED, MALFORMED_OUTPUT, EVIDENCE_INVALID,
VERSION_MISMATCH and INTERNAL_UNKNOWN. Retryability is distinct from category;
UNKNOWN is not proof of permanent invalidity or safe replay. Retry/claim/backoff
belongs to existing app-level durable work owners, never the plugin or UI independently.

Metadata: estimated latency bucket/range and observed duration; estimated/actual
cost with currency/unit/policy and explicit unknown; input/output units where
available, cache/replay guarantee and privacy processing location. No pricing,
latency SLA or provider retention facts are asserted in CP12.

## Deterministic routing policy

Order: deterministic/local extraction → capable permitted local model → fast/cheap
remote model → advanced remote model only on documented escalation reason. Route
only after capability/schema/modality/size/privacy/network admission and budget checks.
Escalation reasons include validated structured/evidence failure after a bounded attempt,
material ambiguity requiring greater capability or document complexity unsupported
by the cheaper tier. Missing permission/network is a wait, not a reason to escalate.
Maximum planned attempts/cost/deadlines are explicit policy inputs; no unbounded loop
or serial call per field/passenger. Prefer one bounded Batch interpretation call with
N→M discovery and scoped facts. Partition only when limits require, retain cross-partition
consolidation and known incomplete coverage. Advanced models still cannot close facts.

| Adapter family   | Neutral integration obligation                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI/GPT       | Translate vendor multimodal/schema APIs and failures to this descriptor/request/observation contract; validate evidence independently; keep vendor types private. |
| Anthropic/Claude | Same obligations; declare actual schema/multimodal/replay constraints rather than imitating another provider's guarantees.                                        |
| Apple/local      | Same observations/versions; declare actual device/model availability and no-network requirements; deterministic fallback is allowed when capability absent.       |
| Future provider  | Versioned descriptor and capability conformance plus privacy/evidence/schema/fencing tests; no Import domain changes for vendor message formats.                  |

No SDK/API details are frozen, and no provider documentation/live capability check
is needed to define this provider-neutral seam. Exact models, budgets, approvals and
conformance harness are later decisions. Data Providers use the separate roadmap
contract; intelligence cannot masquerade as a trusted flight-status database.
