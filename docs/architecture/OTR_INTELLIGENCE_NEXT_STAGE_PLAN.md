# OTR Intelligence — Next Stage Plan

Date: 2026-10-06
Baseline: CP13B `c4571746b0c300fa3b46842cd37745963567338c`

## Architecture decision

OTR Intelligence is one shared platform supporting three separated intelligence products:

1. **Import Intelligence** — task-scoped evidence understanding and structured travel import.
2. **Personal CXE** — event-driven personal context, attention, ranking and adaptive presentation decisions. Baseline OTR must remain fully usable with CXE OFF.
3. **Product Intelligence** — server-side minimized/aggregated product analytics, experiments, friction, retention and conversion analysis.

They may share model lifecycle infrastructure, but not authority, training datasets, or necessarily model weights.

## Shared platform

Long-term shared infrastructure:
- capability and model/provider registry
- model/version identity
- routing policy
- privacy/network requirements
- latency/cost/usage observations
- evaluation suites and shadow mode
- outcome/quality feedback hooks
- model promotion/rollback
- self-hosted model registration
- commercial provider adapters
- explicit data-governance boundaries

## Import Intelligence has two directions

### OTR-initiated / outbound

User imports into OTR.

Capture → deterministic/local extraction → Intelligence Router → qualified provider → provider-neutral observation → CP13B Import Engine.

Providers may include Apple/on-device, OTR self-hosted and any qualified commercial model.

Routing policy:
1. deterministic when sufficient;
2. local/on-device when qualified;
3. cheapest qualified remote/self-hosted provider;
4. escalate only when uncertainty or complexity requires it.

Optimize expected cost per trustworthy completed Import subject to latency, privacy and quality gates—not vendor prestige or raw token price.

### AI-client-initiated / inbound

User works in ChatGPT, Claude or another AI client and invokes OTR through an App/Plugin/MCP-style tool.

External AI understanding → OTR Import Package → OTR validation/closure/review/canonical admission.

External AI is not canonical authority. OTR still owns schema/evidence validation, Candidate identity, admitted match policy, duplicate/complete/update/conflict, closure, review and canonical admission.

The integration receives only context/material explicitly passed through the tool call; it does not imply blanket access to the user's AI conversation history.

## Self-hosted OTR intelligence

`OTR_SELF_HOSTED` is a first-class provider.

Promotion path:
1. prompt/constrained structured extraction
2. periodic parameter-efficient fine-tuning such as LoRA/QLoRA
3. benchmark/evaluation
4. shadow production
5. eligible low-risk/simple tasks
6. default cheap provider for qualified slices
7. commercial providers remain fallback

Do not perform uncontrolled online learning in production.

Not every task should use an LLM. Ranking/classification/bandit/tree/linear models may be better for structured behavior.

## Data governance

Keep three loops separated.

Import supervised signal may be:
Evidence → observation → Candidate → closure → user correction → canonical outcome.

Personal CXE context serves the individual user and does not automatically become population analytics/training data.

Product Intelligence uses separately admitted minimized/aggregated/pseudonymized events under its own retention/governance.

No automatic path:
- Personal CXE memory → Product Intelligence training
- raw private ticket/hotel/email evidence → model training corpus

Training datasets require explicit lineage, policy/version, retention/deletion handling and appropriate user/legal basis.

## CP14 scope

CP14 establishes the thinnest stable Intelligence Platform foundation and makes Import Intelligence the first consumer.

Personal CXE and Product Intelligence receive boundary/interface documentation only unless implementation is necessary to prevent coupling.

### Agent A — Intelligence Runtime / Outbound Router

Implement:
- capability registry
- provider/model registry
- `otr-intelligence-v1` compatible request/result envelope
- routing/qualification policy
- local/remote/privacy/network attributes
- timeout/cancellation/retry classification
- latency/cost/usage observations
- shadow mode
- model/version identity
- `OTR_SELF_HOSTED` provider slot
- generic commercial-provider adapter slot

Start with deterministic/test providers. No production commercial credentials required.

### Agent B — Inbound AI Client / Import Package

Define and implement the safe inbound tool boundary:
- authentication/authorization contract
- Trip selection/creation intent
- Import Package schema
- evidence/attachment references
- structured Candidate observations
- unresolved/deferred facts
- explicitly user-confirmed facts
- idempotency/replay
- privacy/minimum-context rules
- tool result/closure response
- follow-up review/confirmation semantics

Target future ChatGPT/Claude/MCP-style integrations without hard-coding one vendor.

No public marketplace submission is required in CP14.

### Agent C — Deferred Continuation + Apple Capability Spike

Durable continuation:
- WAITING_FOR_NETWORK
- WAITING_FOR_REMOTE_INTELLIGENCE
- WAITING_FOR_ENRICHMENT
- reconnect/resume
- cold restart
- Account A→B→A fencing
- stale result rejection
- foreground/background handoff facts
- notification-ready completion event, not final notification UX

Apple spike:
- current Foundation Models availability
- structured output
- text capability
- actual image/multimodal availability
- Vision OCR/document/handwriting capability
- device/model availability gates
- latency observations
- fallback conditions

Spike findings must not be invented into production capability.

## CP14 integration gate

Prove three paths converge on the same Import truth boundary:

1. OTR Capture → Intelligence Router → provider-neutral interpretation → CP13B Candidate/Closure → CP13A prepare.
2. External AI Import Package → inbound validation → same CP13B Candidate/Closure → CP13A prepare.
3. Offline/deferred request → durable wait → reconnect/resume → stale Account/result fencing → same Import pipeline.

No final UI, deployment or runtime activation required.

## Explicitly deferred

- final Import UI
- Share Sheet/Photos/Files capture UX
- inbound email service
- public ChatGPT/Claude marketplace publication
- broad commercial-provider rollout
- training an OTR model
- Personal CXE runtime
- Product Intelligence model
- adaptive navigation
- monetization optimizer
- automatic training-data collection from private user content

## Agent topology

Run three builders in parallel from exact base:

`c4571746b0c300fa3b46842cd37745963567338c`

- A: Intelligence Runtime / Outbound Router
- B: Inbound AI Client / Import Package
- C: Deferred Continuation + Apple Capability Spike

Then one Integration Agent.

All builders treat this plan, CP12 `INTELLIGENCE_PLUGIN_CONTRACT`, and CP13B `otr-intelligence-v1` as normative. Integration owns final shared-type consolidation.

## Likely following checkpoints

- CP15 — Real OTR Capture Channels: Photos / Files / Camera / Text / URL / Share Sheet / multi-select Batch.
- CP16 — First real external AI-client adapters, depending on current ChatGPT/Claude platform requirements.
- CP17 — Commercial outbound provider adapters and cost/quality escalation policy.
- CP18 — First OTR self-hosted extraction model in shadow mode.
- Later — Email forwarding as a separate server-side transport/security checkpoint.
- Later — Personal CXE implementation after the diverse Trip-archetype UX gate.
- Later — Product Intelligence with a separately governed analytics/training pipeline.
