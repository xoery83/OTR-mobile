# CP15A — First real intelligence activation preflight

Date: 2026-10-07 (Pacific/Auckland). **PREFLIGHT COMPLETE / READY FOR OWNER REVIEW.**
This is a proposed activation contract, not activation authorization or implementation.
All current gates remain CLOSED. No real model call, secret-value access, Hosted
Dev/Production access, deployment, migration, production code change, commit or push.

## 1. Exact base and evidence

Fresh managed worktree:
`/Users/xoery/.codex/worktrees/cp15a-activation-preflight/otr-mobile-canonical`.
Branch: `intelligence/cp15a-activation-preflight`.
Exact entry and retained HEAD: `b973f039dfd6405d302409252ddbdc8f70584159`.
Entry `git status --porcelain=v1` was empty. The original canonical checkout's
uncommitted work was preserved. This branch was created from the commit directly.

| Verified item              | Exact state                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Server migrations          | 83; tail `20261006000100_external_integration_persistence.sql`                                                                       |
| Server83 SHA-256           | `c759a41981f631271df7b960a7ce50dbc32e2317163ca84a7021d1cbf5e46f93`                                                                   |
| SQLite tail                | 50, registered `intelligenceContinuationsMigration`; no51                                                                            |
| SQLite50 source SHA-256    | `63d11a4486660d1b609395234eb3d1309960be1a2766f59f8185477f2880d2b0`                                                                   |
| Final Closure              | Original report plus `TARGETED FINAL CLOSURE RECHECK PASS` present                                                                   |
| Reviewed F2 adoption       | All three production hashes match the independent recheck and final adoption record                                                  |
| Runtime                    | SQL false-only; TEST/DEV/PRODUCTION defaults killed; no activation performed                                                         |
| Provider/public client     | Real adapter, secret resolver, trusted live gateway and startup factories absent                                                     |
| Scheduler                  | `sync_operations` and existing central operational-sync owner only                                                                   |
| Five unconditional denials | `C_PREPARE_CONFIRMATION`, `C_EXECUTE_EVENT_SLOT`, `C_FINALIZE_EVENT_SLOT`, `C_ADMIT_CAPTURE_SOURCE`, `C_REVOKE_EVENT_SLOT` unchanged |

Independently recomputed adopted F2 hashes:

- `backend/src/inboundAiClient.ts`: `5f7b02ebfc8b6936e70aff4e86d77252fc6715c030d9034bc10456f0b891ceaf`.
- `src/data/repositories/tripImportAdmissionRepository.ts`: `1a9493dec5849358d628dd0e0ebdf1dfbcba7bbe7525038a89a99f6c1b302a66`.
- `src/data/repositories/flightImportClosureOrchestrator.ts`: `85af1ad6b261661e34fe9d7016f135d40cbef79f83a0bccfd1d7d601ed3968ae`.

Basis: final accepted Persistence, C2, A2, B2 reports and superseding corrections;
Final Integration's FINAL OWNER CLOSURE ADOPTION; Final Closure's appended recheck;
Server83/SQLite50; API_CONTRACT, DATA_MODEL, OFFLINE_SYNC and current handoff;
CP12 plugin contract and CP13B typed interpretation/owning validation. Historical
report stop/pending sections do not supersede accepted appendices.
The closure's 2,494 passed/one unchanged Ledger failure is inherited evidence, not a
new CP15A test run. This preflight performs local static/hash/document validation only.

## 2. Exact closed boundaries

| Boundary         | Owning code and present restriction                                                                                                                | Future change                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| SQL environment  | Server83 `external_integration_environment_state`, lines27–37: `check(runtime_enabled=false)`                                                      | Server84 must retain structural closure outside DEV                                      |
| SQL mutation     | `cp14_guard_external_integration_environment_state`, lines969–975, rejects changes to runtime; config writer has no runtime column UPDATE grant    | Dedicated SECURITY_ADMIN runtime command and restricted guard/column rights              |
| Dispatch root    | `external_integration_mark_dispatch`, lines1530–1550, rejects `CP14_RUNTIME_CLOSED`; only dedicated call gateway may invoke                        | DEV exact workload/config/account admission before durable MAY_HAVE_STARTED              |
| Application pins | `outboundRouting.ts`: false-only snapshot and `CLOSED_SYNTHETIC_ONLY` execution policy                                                             | Separate versioned real-DEV pins; old synthetic pins remain closed                       |
| Server bridge    | `createServer83OutboundReservation`: TEST-only reserved header; observes rejection as expected                                                     | Real reserve/dispatch/recovery bridge, authenticated and currently authorized            |
| Executor         | `createClosedOutboundHarness`: TEST_ONLY, INJECTED_DETERMINISTIC_FAKE, synthetic custody/meter                                                     | New real server executor; never turn fake observations into real usage                   |
| Factory/wiring   | Constructors have no non-test callers; `backend/src/server.ts` / `app.ts` wire no intelligence runtime; central continuation adapter defaults null | Explicit gated Backend host and authenticated Mobile transport, no unconditional startup |
| Credential       | `vault:` reference grammar exists; resolver, dedicated live verifier/session provisioning absent                                                   | Environment-bound server resolver and least-privilege protected gateway                  |
| Flight plugin    | `interpretation.ts` accepts TEXT and literal LOCAL_ONLY request/descriptor privacy                                                                 | Versioned remotely admitted transport envelope; reuse Flight facts/validation            |

Changing only an environment variable or registry eligibility cannot enable this path.
The current generic reserve command emits task_class INTELLIGENCE; it does not prove
FLIGHT_IMPORT_V1. The future host and SQL must bind the admitted workload explicitly.

## 3. Existing Web DeepSeek integration

**Found: YES**, in read-only `/Users/xoery/Project/otr`. No Web files changed.
Source inspection excluded `.env*`, credentials, private keys and operational stores;
no process environment was evaluated and no secret value was read or copied.

| Concern                | Existing evidence                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter/registry       | `src/lib/ai/model-router/providers/openai-compatible.ts`, `providers/index.ts`                                                                                                                           |
| Routing                | `src/lib/ai/model-router/router.ts`; OpenAI/DeepSeek chat and translation, OpenAI/Qwen/local vision                                                                                                      |
| Protocol               | Native fetch, Bearer authorization, POST `/chat/completions`, messages/model/temperature/max_tokens                                                                                                      |
| URL/model              | Default `https://api.deepseek.com`, default **deepseek-chat**; environment overrides                                                                                                                     |
| Config identifiers     | `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_API_URL`, `DEEPSEEK_MODEL`; `AI_CHAT_PROVIDER`, `AI_TRANSLATION_PROVIDER`                                                                             |
| JSON                   | `response_format: {type: json_object}`; raw response returned; generic chat does not validate Flight output                                                                                              |
| Timeout/retry          | Router default45s with AbortController; no same-provider loop in adapter; router automatically tries other provider after error                                                                          |
| Usage/cost             | prompt/completion token parsing; missing tokens estimated; fixed float USD rates; absent rate becomes zero; total/cache/reasoning not preserved                                                          |
| Errors                 | Raw HTTP text up to300 characters enters errors; router logs error messages; no finite certainty classification                                                                                          |
| Server boundary        | `server-only`; key resolved from server process environment inside generate; no vault resolver in inspected abstraction                                                                                  |
| Additional integration | `src/app/api/ai/parse-itinerary/route.ts` has separate DeepSeek/OpenAI config, AI_PROVIDER,20s timeout, JSON object and automatic provider loop; `parser-upgrade/route.ts`20s; `capture-ai/server.ts`30s |

Web itinerary output includes days/reservations/events/expenses, participant handling
and estimated clocks. That product shape and prompt cannot be imported into CP13B.

Classification: **C — behavioral reference only** for the adapter/router as delivered.
The small HTTP request idiom can be adapted using native Backend fetch, without
copying the Next server-only dependency or generic router. Direct reuse: **NO**.
Fallback, uncertainty, error privacy, accounting and domain authority conflict with CP14.

Existing Web secret infrastructure reusable: **UNKNOWN**. Server-side environment
injection is a usable pattern; inspected code establishes no isolated Mobile Dev
vault, rotation/revocation or deployment permission. Sharing the Web key is not
approved. Only the identifier `DEEPSEEK_API_KEY` was inspected, never its value.

## 4. Current official DeepSeek contract

Checked official documentation on2026-10-07; no authenticated endpoint or model called.

- API model identifier **deepseek-flash**, documented family **DeepSeek-V4.1-Flash**.
  Legacy Flash aliases route to this family. Configure model ID, expected family,
  adapter version and configuration digest as provider pins. The alias is mutable;
  an OTR pin does not make provider weights immutable. Recheck docs/conformance
  before activation or config change. [Official release](https://api-docs.deepseek.com/updates/).
- Prefer OpenAI-compatible non-streaming POST
  `https://api.deepseek.com/chat/completions`, Bearer key, fixed server messages,
  explicit output ceiling and thinking disabled for initial extraction. Parse
  choices/message content and finish reason. Usage includes prompt/completion/total,
  cache hit/miss and optional reasoning detail. Completion `id` is provider response
  identity, not OTR idempotency proof. [Chat API](https://api-docs.deepseek.com/api/create-chat-completion/).
- JSON mode is supported. Set json_object and explicitly request JSON with its shape;
  empty/truncated content can still occur. Chat JSON mode is not JSON Schema enforcement.
  [JSON Output](https://api-docs.deepseek.com/guides/json_mode/).
  Responses API separately documents json_schema, but adds no need to change the first
  transport: independent OTR validation is mandatory either way.
  [Responses API](https://api-docs.deepseek.com/api/create-response/).
- Native vision is supported: user image blocks can carry inline image data, URLs or
  file IDs. Initial OTR policy admits none; later tightly bounded crops require a
  separate image/evidence contract. [Vision](https://api-docs.deepseek.com/guides/vision/).
- Official errors:400/422 invalid request,401 authentication,402 balance,429 limit,
  500 server failure,503 overload. Generic vendor retry/fallback advice grants no
  OTR redispatch authority. [Errors](https://api-docs.deepseek.com/quick_start/error_codes/).
- Non-streaming connections may receive blank-line keepalives; documented closure
  after10 minutes applies when inference has not started. This is not a completed-call
  SLA or client-side nonexecution proof. OTR must enforce its own bounded monotonic
  deadline and response byte bound. [Rate/keepalive contract](https://api-docs.deepseek.com/quick_start/rate_limit/).

## 5. Narrow workload and gates

FLIGHT_IMPORT_V1 means one authenticated, explicitly admitted Flight material
interpretation. Development maps to the existing SQL enum **DEV**. Require:

- DEV deployment identity, enabled SECURITY_ADMIN activation scope and un-killed
  environment/integration, current Account allowlist and Trip access.
- Only DeepSeek COMMERCIAL_REMOTE, one immutable provider_config_id, deepseek-flash
  expected V4.1 Flash family, one adapter/prompt/schema/minimizer/price-policy digest.
- STRUCTURED_EXTRACTION, EVIDENCE_MAPPING and BATCH_N_TO_M_EXTRACTION conformance;
  TEXT/OCR_TEXT, OTR typed Flight schema v1; JSON syntax plus independent domain checks.
- Explicit REMOTE_ALLOWED data/privacy/region admission and bounded request/deadline;
  no inference from text availability or Account permission alone.
- Finite input/output/cost limits and atomic daily admission for Account, environment,
  provider; internal allowlist only. No missing-policy defaults to enabled/unlimited.

No generic chat, caller prompt/model/base URL, agent tools, Event mutation, B2 inbound
activation, CXE, Product Intelligence, shadow, commercial fallback or proactive AI.
Production and TEST real dispatch remain structurally closed. Five C denials remain.

## 6. Intelligence ladder and escalation

| Level             | Work and admission                                                                                                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L0 deterministic  | Verify material/media/byte/digest/revision bounds; local PDF text where supported; existing local Vision OCR where admitted; flight-number/IATA/date/time/PNR candidates; dedup digest and exact existing occurrence/service/revision context |
| L1 optional Apple | Bounded local semantic classification/grouping/interpretation when device/model/schema available; never required for baseline or manual import                                                                                                |
| L2 DeepSeek       | Only a retained unresolved semantic question after adequate L0, optional L1; admitted privacy/network/budget/config and current material/Trip pins                                                                                            |

Existing `referenceFlightExtractor.ts` normalizes supported service/airport/civil/
offset/zone/instant observations and defers booking/passenger dimensions. Its
reference grammar is deliberately narrow, not a general airline email/PDF parser.
PDF text extraction is conditional on an admitted decoder, not claimed installed.
Receipt OCR infrastructure is a native local reference, not automatic Flight admission.

Remote justification: unresolved leg grouping, label meaning, relevant contradictory
text, operating versus marketing service, or which evidenced local date/time belongs
to which leg. Supply exact questions and candidate alternatives. No remote call when
L0 is sufficient, user manual choice resolves it, material is duplicate without new
questions, privacy denies it, or missing evidence cannot be recovered semantically.
Unknown timezone/instant and unsupported booking/passenger authority stay unknown/
deferred. A remote model must never invent those facts to obtain READY.

L1 unavailable/failure/timeout returns the preserved L0 result and explicit unresolved
questions. Only independently admitted L2 may follow; Apple failure is not remote consent.

## 7. Remote minimization and vision

TEXT_ESCALATION is the first activation profile. Backend constructs a normalized
package with version/digest, opaque request-local material tokens, media/transform/
revision facts, selected local text/OCR spans, deterministic candidates, relevant
current occurrence alternatives, exact questions and output schema/version.
Account/Trip/canonical IDs and authorization/config secrets stay in OTR's envelope;
use opaque contextual tokens remotely. Exclude passenger names, email addresses,
PNRs, ticket numbers, payment data, unrelated itinerary text, URLs and EXIF unless a
separately justified approved semantic field needs them. PNR candidates can be
locally detected and withheld; booking persistence remains deferred.

Keep an exact reversible offset map from each minimized span to original admitted
UTF-8 text/OCR representation. Do not ask a model to generate evidence IDs/hashes.
Bounds count full prompt/schema/context/escaping, not just extracted text. Truncation
must preserve span mapping and coverage or fail/defer; no silent discarded evidence.
Treat all material text as untrusted data, including prompt-injection instructions.

VISION_ESCALATION stays OFF initially. Later justification requires a specific
unresolved visual/layout fact that OCR/text cannot represent, admissible local crop,
separate privacy/model/modality/budget approval and image locator conformance. Use
only bounded redacted crops with pinned transformation/digest and retained originals;
no full raw attachment by default, public URL, arbitrary download or Files API upload.
Text→vision is a new admitted request/attempt/call after terminal text responsibility,
never mutation/replay of the earlier request. CP13B currently validates TEXT_SPAN;
image locators need separate approved versioned capability work before vision opens.

## 8. FlightInterpretationV1 reuse and necessary contract change

There is no exported schema literally named FlightInterpretationV1. The existing
contract is `otr.import.flight`, version1, `OTR_TYPED_V1`:
`interpretationResponseSchema`, `FLIGHT_INTERPRETATION_SCHEMA`,
`FlightInterpretationCandidate` and `FlightCandidateSet`.
Reuse these fact/evidence/Candidate/closure semantics; no new Event-shaped AI DTO.

Supported observations cover services/flight numbers, departure/arrival airports,
separate civil dates/times, precision/zone/offset and independently evidenced instants.
Fragments bind Source/representation/material revision/Input and exact original
TEXT_SPAN. Candidates retain evidence_support, contradictions, ambiguity, unknown
occurrence facts, deferred dimensions and source/input references. Quality uses
uncertainty/coverage/ambiguity and owning closure eligibility; no invented numeric
confidence is required. Missing fields remain absent/UNKNOWN, not fabricated values.

**Reusable: YES for Flight facts and owning validation; NO as an unchanged remote
plugin envelope.** Literal LOCAL_ONLY in request/descriptor blocks remote admission.
CP15B must specify a new versioned remote transport envelope and normalize its
result into the retained typed fact contract without mislabelling execution privacy.
The installed Run descriptor/digest must truthfully identify REMOTE_MODEL, remote
privacy, adapter/prompt/config pins and original evidence. Never construct a fake
LOCAL_ONLY response to pass CP13B. Preserve old local v1 validation unchanged.
If owning Run persistence cannot represent that truthful descriptor, stop at a new
schema preflight; SQLite51 is not presently required by the generic descriptor JSON.

A second issue is exact raw normalization: CP13B recomputes every normalized value
from field.raw and requires raw bytes equal each fragment. The host must map selected
original spans and run existing normalizeFlightObservation itself; provider guesses,
rewritten dates, translated excerpts and invented fragments reject. Some free-form
airline labels are outside reference grammar. Prefer a narrowly approved extension
of normalization/evidence validation; never bypass equality or turn synthesized
text into original authority. This conformance work is a CP15B prerequisite.

The provider wire result contains interpreted observations/opaque span references
only. Host supplies binding, identities, hashes, observed time and coverage checks;
CP13B owns grouping/matching/consolidation/contradiction assessment and Proposal.
Only authenticated review and CP13A can prepare/admit canonical changes.

## 9. Real dispatch and Server84 contract (proposal only)

**Server84 required: YES.** Preserve Server1–83 bytes. Append one migration with
these minimal additive purposes; no SQL authored here:

1. Replace the false-only environment CHECK with `runtime_enabled=false OR
environment='DEV'`. TEST/PRODUCTION must remain false under SQL constraints.
   Update the guard only for the dedicated authenticated SECURITY_ADMIN runtime
   root; defaults remain false/killed. Grant runtime-column mutation only to its
   private owning role. CONFIG_ADMIN cannot activate/un-kill or grant allowlists.
2. Add a protected DEV activation scope keyed by environment/workload/provider,
   constrained to DEV/FLIGHT_IMPORT_V1/DeepSeek, active=false by default. Bind exact
   integration/provider_config/model/adapter/schema/minimizer/policy/price pins,
   expiry, revision, per-call bounds and daily ceilings. Add Account grant rows
   keyed scope+Account with expiry/revocation/CAS. SECURITY_ADMIN owns enablement,
   allowlist, scope selection and limit relaxation. CONFIG_ADMIN may append proposed
   provider/price configurations; each new config needs explicit security selection.
3. Add immutable per-call budget reservation facts keyed existing call_id, with
   scope revision/digest, Account, provider, UTC day, currency, worst-case reserved
   cost_nanos and input/output ceilings. Reserve these with call+START in one
   transaction under existing environment/integration locks. No second cost ledger:
   Server83 observations remain actual/estimated usage truth. For v1 retain the
   conservative full hold for its admission day; uncertain, canceled, missing-usage
   or failed calls never automatically refund capacity. No settlement worker needed.
4. Add nullable bounded `provider_request_id` to append-only usage observations,
   accepted only from the trusted adapter, normalized to a safe opaque identifier
   (suggest maximum128 ASCII identifier characters). It is not request_id or
   observation_key. Extend protected row grammars/population compatibly; old v1
   and inbound observations omit/null it. Reject arbitrary headers/text. No secret,
   prompt or raw error string enters this field. Numeric provider_extension remains
   numeric; do not smuggle an ID into it.
5. Extend/version outbound reserve/mark roots with a digest-bound workload and exact
   activation/budget reference. First real calls use task_class FLIGHT_IMPORT_V1;
   old INTELLIGENCE/test reservations cannot qualify. Enforce call_kind OUTBOUND_MODEL,
   shadow=false, no inbound invocation, exact selected config/model/schema, current
   allowlist/Trip and budget holds. Dispatch independently checks these even if
   a permissive caller reserved a generic call. Preserve exact old CLOSED acceptance.
6. Reuse dedicated roles, FORCE RLS, immutable request audit, bounded command/context,
   CAS and current authorization. New scope/grant/hold tables have no PUBLIC/API/
   service_role table or helper rights; grants must not create Event/canonical edges.
   Extend security inventory, actual-root torture and compatibility tests before review.

New tables store policy/admission facts only; credentials remain outside SQL. A daily
hold is resource admission, not customer billing or a financial domain mutation.
Missing/expired scope, allowlist, limits, price or credentials denies admission.
Production closure applies even to otherwise valid admin/call contexts.

Dispatch order: prepare minimized request/custody and all async prerequisites;
reserve exact call+START+budget; recover exact START on acknowledgment loss; complete
current local Account/task/material/Trip CAS and synchronous handoff outside gate;
Backend authenticates and invokes protected mark_dispatch with fresh server gates;
only its acknowledged durable MAY_HAVE_STARTED/RUNNING transition permits a single
native fetch. No provider I/O under SQLite/Account/SQL transactions. Return observations
through protected meter/observe roots and admitted private result custody, then C2
installation revalidates original Run/Candidate/Event/publication pins.

Lost mark acknowledgment or host death after the mark: UNKNOWN; no fetch replay on
recovery, even if the original host might not have sent bytes. Provider transport has
no verified idempotent replay or query-by-OTR-key contract. Concurrent executors must
share one retained call/mark CAS; losers cannot execute. Production factory must not
import/use the synthetic harness as its execution authority.

A kill serialized before mark prevents execution. A kill after MAY_HAVE_STARTED may
race the single already admitted fetch; abort observation is best effort, no guarantee
of stopping/billing reversal. Fence install and retain usage/result/UNKNOWN responsibility.
Do not promise atomicity between SQL kill and external network I/O. Disable, revoke
and price/config changes block new admission, never erase historical pins or late usage.

## 10. Secret boundary

Future server credential reference: `vault:otr/dev/deepseek/flight-import-v1` (proposed
identifier, not an existing populated secret). Backend-only injection may resolve
from **OTR_DEV_DEEPSEEK_API_KEY** through an allowlisted environment-bound resolver;
a deployed secret manager may provide the same logical reference. Neither resolution
mechanism is installed or inspected for values in CP15A. Use a dedicated Dev key.

Resolver accepts only the selected registry reference, provider and DEV host identity;
no caller secret/ref/base URL. Outbound destination fixed to HTTPS api.deepseek.com,
reject redirects or alternate hosts before attaching authorization. HTTP/client/error
instrumentation must redact Authorization and avoid request/response body logging.
No key in iOS, SQLite, Git, package/Flight payload, client logs, or usage telemetry.

Rotate by installing a new server secret version and appending/selecting a new
immutable config/reference under security approval; old calls retain old pins.
Revocation enables kill first, removes resolver availability, invalidates cached
credential handles and provider key as appropriate. Already possible executions
remain recoverable/meterable without allowing old credentials to redispatch.
Secret absence/auth failure yields a finite safe failure; never selects another key/provider.

## 11. Future provider adapter contract

Backend-private adapter receives immutable A2 real-DEV routing/config/price pins,
exact call/attempt/request identities, minimized package+schema/template version,
monotonic deadline/output/byte bounds, and cancellation observation. Secret supplied
only through scoped server resolver; not a serializable domain input.

Observations: definitely-not-dispatched only with trusted positive transport/dispatch
proof; MAY_HAVE_STARTED after durable mark; terminal validated response or terminal
safe failure; timeout/response-lost/unknown; safe provider ID; independently validated
structured content; nullable usage; measured latency; finite error class. Suggested
classes: INVALID_REQUEST, AUTH_FAILED, BALANCE_EXHAUSTED, RATE_LIMITED,
PROVIDER_UNAVAILABLE, TIMEOUT, RESPONSE_LOST, MALFORMED_OUTPUT, SEMANTIC_INVALID,
POLICY_BLOCKED, CANCELED, UNKNOWN. HTTP status alone is not no-execution proof.

One fetch, no hidden SDK retry, no fallback, no tools. Parse bounded blank-line-prefixed
JSON, reject empty/nonstop/truncated/tool output, validate schema and semantic/evidence
conformance. Never log reasoning_content or preserve it for training. The adapter
cannot mutate Event, continuation, usage ledger, queue or review decision directly;
owning orchestrator/custody/meter/install ports perform those responsibilities.

## 12. Tokens, usage and cost

| Provider observation                                          | Server83 mapping / quality                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| usage.prompt_tokens                                           | input_tokens, ACTUAL_REPORTED when valid                                                                                  |
| usage.completion_tokens                                       | output_tokens, ACTUAL_REPORTED                                                                                            |
| usage.total_tokens                                            | total_tokens independently reported; do not silently derive actual                                                        |
| prompt_cache_hit_tokens / prompt_tokens_details.cached_tokens | cached_input_tokens; if both reported require agreement                                                                   |
| prompt_cache_miss_tokens                                      | bounded numeric provider_extension.cache_miss_tokens; included in prompt count, not added again                           |
| completion_tokens_details.reasoning_tokens                    | reasoning_tokens, included in output; absent stays null                                                                   |
| Image units                                                   | image_units only if separately reported with admitted unit definition; text profile null, never estimate from image count |
| Host elapsed time                                             | latency_ms / wall_ms as explicitly defined measured wall observations; not GPU/CPU consumption                            |
| Provider completion id                                        | proposed Server84 provider_request_id; OTR request_id retains its own UUID                                                |
| Missing/invalid field                                         | null/UNKNOWN; explicit zero only when actually observed/reported                                                          |

Validate safe nonnegative integers and relationships; inconsistent totals/cache
breakdowns are invalid observations, not repaired facts. Completion can fail
semantic installation while provider tokens still exist. Retain them separately.
Use CUMULATIVE final snapshot with stable observation key; exact replay appends
no second bill. Late actual counters/cost corrections follow existing supersession.

**Server83 usage schema sufficient: NO for every requested fact**, because it lacks
safe string provider request identity. **YES for numeric tokens/units/latency and
nullable actual/estimated costs**; no new token/cost ledger is needed. Server84's
small ID addition closes the full requested mapping. Daily budget admission is a
separate deficiency, not a token observation deficiency.

Price pin: immutable schedule ID/version/digest, provider/model, billing currency,
effective interval and per-unit definitions. Current official pricing differentiates
cache hit/miss and peak/off-peak input/output; verify effective schedule and currency
before activation. [Models/pricing](https://api-docs.deepseek.com/quick_start/pricing/).
For v1 reserve against peak rates; retain the schedule applicable to admission and
mark calculated cost ESTIMATED until provider-billing evidence confirms it. If actual
billing time band is ambiguous, retain UNKNOWN or an explicitly estimated bound;
no invented actual cost. Compute exact rational nanos with existing helpers, round
once, avoid overlapping included counters (reasoning/cache/image versus parent).
No FX, customer billing, silent historical repricing, or Web float rates.

## 13. Development budget policy

Required approved settings: maximum total prompt tokens, maximum completion tokens,
maximum per-call provider-currency cost, per-Account UTC-day ceiling, DEV UTC-day
ceiling and DeepSeek UTC-day ceiling. Daily counters include concurrent worst-case
holds, not just received completed costs. Existing Server83 quota_limit/rate_per_minute
limits calls per window/integration; they do not enforce these cost/token ceilings.

No accepted monetary values were found in scoped CP14 policy. **Owner approval
required before activation** for currency, each cost ceiling and allowlisted Accounts.
Separate suggested initial test shape:8192 total input tokens,2048 output tokens,
one in-flight call per Account,20 calls/Account/day and100 calls/DEV/provider/day.
These are unapproved suggestions, not active policy; they do not replace cost ceilings.
Define monetary ceilings by conservative peak-rate worst-case request cost multiplied
by approved call allowances, then have Owner select numeric nanos. Missing values deny.
If a trustworthy tokenizer is unavailable, use a conservative tested byte/token upper
bound and refuse unbounded requests; no chars/4 accounting masquerades as actual usage.

Reservation and replay must charge/hold once under existing environment locks. Boundary
crossing at midnight uses server admission UTC day; outstanding unknown calls retain
that day's hold. Exhaustion returns BUDGET_POLICY or QUOTA_EXHAUSTED and preserves
manual Flight Import/review/local saved intent. No automatic expensive fallback.

## 14. Retry/recovery

NO automatic commercial-provider fallback or blind UNKNOWN redispatch. Queue retry
only reevaluates responsibility. Safe recovery: exact call+START/mark/result/custody/
usage reads; resend the same idempotent meter observation; retry local install after
its own admission; positively proven NOT_STARTED may proceed only under retained
identity/current gates. Mark response loss cannot be treated as NOT_STARTED.

A new same-provider attempt is allowed only after trusted terminal FAILED evidence,
completed metering responsibility, bounded explicit recovery policy and fresh budget/
privacy/config admission, with new linked attempt/request/key/call. Never overwrite
predecessor pins or repeat a possibly running call. Malformed/semantically invalid
terminal output goes to manual/defer first; no automatic costly repair prompt.
DeepSeek docs' retry advice is not proof of terminal/nonexecution or free billing.

## 15. Apple L1 evidence and later CP15C

The requested closure commit does **not** track
`APPLE_LOCAL_INTELLIGENCE_CAPABILITY_SPIKE.md` or the original Agent C spike report.
They are available untracked in the user's original canonical checkout and were
read as supplemental historical evidence, not copied/adopted into this exact base.
C2's accepted report preserves their iOS27 finding. No FoundationModels runtime
adapter/factory is installed in this base. No device or compiler invoked by CP15A.

The supplied spike records compile-only Xcode27/iPhoneOS27 support: iOS26 text
SystemLanguageModel/LanguageModelSession, availability reasons deviceNotEligible/
appleIntelligenceNotEnabled/modelNotReady, guided structured generation, iOS27 image
attachments and separate Vision OCR. Device inference/readiness/quality/latency and
terminal cancellation were unverified. iOS26 image FoundationModels capability is
unavailable; OCR→text remains separate. OS version alone is not availability.

Future L1 checks runtime availability/language/schema each attempt, has a bounded
caller deadline, retains L0 on unsupported/failure, does not block manual import or
require model download. Cancel fences installation; cancellation does not certify
resource terminality. No tools/network/private-cloud model may enter on-device mode.
SDK guided output does not prove OTR original-evidence or N→M correctness.

CP15C synthetic fixtures: single and multi-leg/codeshare, overnight/dateline,
exact midnight/missing arrival/offset-only departure, conflicting calendars, bilingual
labels, noisy OCR/table layout, injected instructions, booking/passenger deferral,
duplicate/changed material, unavailable/unready model, language/size limits,
cancel/timeout/stale generation. Record device/OS/runtime availability, config,
completion/evidence validity, bounded latency and nullable reported usage. Compare
L0 versus optional L1 versus admitted L2 without raw-material telemetry/training.

## 16. Operational evaluation facts

Derive bounded facts from owning journals/publications/reviews/receipts: provider/
model/config/policy/schema, latency, nullable usage/cost quality, interpretation
complete/partial/deferred, field-path counts, supported/missing/contradictory counts,
resolved contradictions, fields changed during review, ACCEPT/REJECT/DEFER and eventual
CP13A receipt admission outcome. Correlate by safe scoped IDs/digests, never raw field
values, source excerpts, passenger/booking data or prompts. Unknown outcomes stay unknown.
Only collect a decision/change/outcome where the actual owning workflow exposes it;
CP15A adds no product analytics store or claim of fully installed outbound review.
Operational reliability evidence is separate from future explicit training consent.
No training dataset, raw training retention, Product Intelligence or CXE is created.

## 17. CP15E failure/torture acceptance

| Case                                     | Required witness                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Offline before call                      | No reserve/mark/I/O; local manual result and bounded network wait survive           |
| Kill before dispatch                     | Zero provider fetch; retained START/hold if already reserved                        |
| Kill after may-have-started              | Install fenced; uncertain execution/usage retained; no refund/retry                 |
| Provider timeout / response loss         | Exact UNKNOWN call; no new key/provider fetch after wake/restart                    |
| Malformed JSON                           | No Candidate publication; finite failure; actual usage retained if reported         |
| Schema-valid impossible output           | Reject invalid clocks/airports/services/evidence; no Event authority                |
| Usage missing / cost late                | Null UNKNOWN independent counters; late observation/correction without replay       |
| Budget exhausted                         | Atomic concurrent admission denied; manual import unaffected                        |
| Duplicate material / same material twice | Original digest/lineage and review continuity; no automatic duplicate call/Event    |
| Duplicate request                        | Same body/key returns same call/START/hold/result; changed body rejects             |
| App/host kill and restart                | Fresh Account context, exact retained responsibilities, no lease-based redispatch   |
| A→B→A                                    | Old callback cannot disclose/install; fresh A authorized exact recovery only        |
| Trip revoke                              | No new reserve/mark/disclosure/install; retained private responsibility/late meter  |
| Event changed before install             | Owning revision fence rejects; re-review/new linked publication required            |
| Text→vision                              | Separate CLOSED gate by default; later new admitted request/budget/evidence lineage |
| Apple→remote                             | Optional local failure preserves L0; remote needs independent privacy/current gates |

Also test mark ACK loss, concurrent mark, kill/config/allowlist/budget expiry during
credential/custody awaits, read/START/meter response loss, UTF-8/redaction offset errors,
redirect/auth/header leakage, response byte/finish_reason limits, UNKNOWN day crossing,
late tokens after disable, price band change, five C denials and inbound→outbound firewall.
Run real protected roots in disposable network-none fixtures before any live acceptance.

## 18. Capture/Experience and sequencing

CP15A preflight, CP15B Backend adapter/activation/budget/transport conformance and
CP15C optional Apple/synthetic benchmarks can proceed without UI using admitted
fixtures and existing repositories. Owner must approve migration/contract scope first;
implementing them does not grant a real-call/deployment authorization.

CP15D needs only admitted immutable material reference/digest/revision and transform,
Trip target/current authority, Import/task processing status, exact Proposal/Run/
Candidate/review version, and authenticated ACCEPT/REJECT/DEFER with CP13A preparation/
receipt outcome. Capture owns originals; Experience reads repository projections,
never calls provider or owns upload/retry. Real private request/result custody and
truthful remote Run installation are genuine contract prerequisites, not UI blockers.
Public B2 remains closed; its authenticated review/freshness semantics can inform
internal outbound review without activating public package clients.

Proposed order: Owner approves CP15A scope/limits/privacy; CP15B adds Server84 and
real-DEV contracts/adapter with network-none tests; CP15C optional Apple benchmarks;
CP15D minimal authenticated review integration; CP15E failure acceptance; separately
authorized limited Development live activation. Preserve closed CP13A execution gates:
end-to-end Event admission cannot be claimed until their owning activation is approved.
No ADR is created now; after approval a focused CP15 Dev activation ADR may record
accepted security/policy decisions.

## 19. Explicit migration and readiness decisions

**Server84: YES** — narrowly authorized DEV dispatch, protected workload/config/
Account gate, durable worst-case daily budget holds and safe nullable provider ID.
**SQLite51: NO** — SQLite50 already holds generic capability/schema/policy snapshots,
private material refs, immutable attempts and independent execution/meter/install axes.
Versioned TypeScript privacy/pin/normalization contracts and real custody are required;
no new local authority/table has been demonstrated. Stop for another preflight if
implementation proves persisted bounds/enums cannot represent the approved contract.

Ready for Owner Activation Review: **YES**. Ready to activate now: **NO**. Open Owner
choices: budget numeric values/currency, internal Account list, remote data-region/
privacy admission, exact credential provisioning host and approved versioned remote
Flight envelope/conformance. Apple spike provenance should be preserved/adopted in
its owning task; its absence does not block the text-only first provider.

## 20. Required final answers

| Question                                    | Answer                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| Exact CP14 closure base verified            | YES                                                                          |
| Existing Web DeepSeek integration found     | YES                                                                          |
| Web adapter directly reusable               | NO                                                                           |
| Existing Web secret infrastructure reusable | UNKNOWN                                                                      |
| Actual secret values read/copied            | NO                                                                           |
| Preferred provider                          | DeepSeek                                                                     |
| Preferred model identifier                  | deepseek-flash                                                               |
| Current model version                       | DeepSeek-V4.1-Flash; configurable expected family, mutable API alias         |
| JSON structured output supported            | YES; JSON mode, independent OTR schema validation                            |
| Vision supported                            | YES by provider; initial OTR vision gate CLOSED                              |
| FlightImportV1 existing schema reusable     | YES for facts/validation; remote envelope requires versioned change          |
| L0 deterministic path defined               | YES                                                                          |
| Apple L1 optional                           | YES                                                                          |
| DeepSeek L2 defined                         | YES                                                                          |
| Raw attachment upload default               | NO                                                                           |
| Text-first minimization defined             | YES                                                                          |
| Server84 required                           | YES                                                                          |
| SQLite51 required                           | NO                                                                           |
| Real dispatch activation contract defined   | YES                                                                          |
| Production remains structurally CLOSED      | YES, including proposed Server84 contract                                    |
| Secret remains server-side                  | YES, future boundary defined; no secret installed                            |
| Server83 usage schema sufficient            | NO for full facts; token/cost fields sufficient, provider ID addition needed |
| Token mapping defined                       | YES                                                                          |
| Cost mapping defined                        | YES                                                                          |
| Budget policy shape defined                 | YES; values pending Owner approval                                           |
| Automatic provider fallback enabled         | NO                                                                           |
| UNKNOWN blind redispatch possible           | NO under proposed contract; activation requires proof by tests               |
| Evaluation facts defined                    | YES                                                                          |
| Training dataset created                    | NO                                                                           |
| Capture/Experience blocks CP15A/B/C         | NO                                                                           |
| Hosted Dev/Production accessed              | NO                                                                           |
| Real model call made                        | NO                                                                           |
| Migration authored                          | NO                                                                           |
| Production code changed                     | NO                                                                           |
| Commit                                      | NO                                                                           |
| Push                                        | NO                                                                           |
| Ready for CP15 Owner Activation Review      | YES                                                                          |

STOP — CP15A ACTIVATION PREFLIGHT COMPLETE / READY FOR OWNER REVIEW.
