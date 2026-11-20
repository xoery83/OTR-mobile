# Owner-approved risk authorization delta v1.1.0

Supersedes universal per-write human confirmation and the universal in-chat Beta gate. Frozen v1.0, Layer1/2 and all original business request/response/CAS/Receipt schemas stay byte-identical. This additive registry/Guide/description metadata changes authorization orchestration only, behind explicit Layer3 runtime opt-in; legacy default remains unchanged until composed deliberately.

READ: existing read scope/ACL. L1: normal creation and update. L2: reversible single-target lifecycle/sharing/participation/financial evidence; descriptions warn about side effects but GPT warning is not a credential. L1/L2 apply the concrete original validated operation with formal OAuth write scope and owning Backend validation/ACL/CAS/idempotency. Preview remains the default and exact digest protects field/target consistency; it grants no extra permission and no user click is requested. L3 requires exact trusted human approval; missing owning approval stays closed. Whole Trip delete and journey-wide currency commit are conservatively L3. Financial finalization, membership removal and other excluded APIs remain unavailable.

Machine `RISK_REGISTRY.json` covers exactly103 frozen capabilities (including READ entries); actual typed command/patch and whole downstream effects determine escalation. A claimed lower level or extra target is never accepted as authorization. Expense participant split/payer/settlement-participation changes are L2 even through ordinary update. Multi-step/bulk destructive impact is L3; single-call interfaces do not accept arrays/extra targets, and decomposition across calls requires a durable risk admission guard before qualifying that negative.

Compatibility: old pending calls keep their concrete payload/operation/receipt and CAS. No silent payload upgrade. Existing stored normal operation approval can remain historical but is not required for L1/L2. L3 never inherits OAuth as approval. UNKNOWN reads the original owning Operation; no automatic POST retry. No Auth C04 authority/schema or ACL relaxation. Old planner expects CONFIRM for all writes; the Layer3 runtime Guide/schema explicitly state the approved authorization delta, without changing frozen validator history. Plan validation remains intent-only and must surface aggregate risk independently of any frozen CONFIRM step.

Release stays PARTIAL/BLOCKED pending real L1/L2 Consumer matrix, real L3 approval and refusal/expiry/tamper/replay, anti-decomposition, UNKNOWN/409, Native≤15s, and independent Auth option A closure. Prior external rename remains its exact historical scope, not new direct-write acceptance.

Beta machine threshold:10 distinct destructive targets constitute aggregate L3. Declared concrete plans are assessed before execution; durable serialized account/resource admission across clients also blocks the10th distinct destructive target within15minutes. Failed/UNKNOWN reservations consume budget conservatively until expiry; no deletion/reset to force tests. This is a bounded anti-decomposition rule, not inferred natural-language intent. Existing single-target operations retain L2.

## Existing Core date invariant at Preview

Real Consumer P1 CREATE_ITEM request with all-null start boundary was structurally valid but received original terminal INVALID_FACT. Core already requires a non-null schedule.start.local_date for non-P5 CREATE_ITEM; no owning rule changes. Risk1.1 preflight now rejects this shape before Backend dispatch with CORE_START_LOCAL_DATE_REQUIRED and the exact field path; capability metadata and effective Guide expose the requirement. Unknown time/instant remains legal when a date exists. Missing dates require user input, not inferred Trip dates. Valid writes, original receipts/CAS/UNKNOWN and frozen v1.0 remain unchanged. Original rejected Operation cannot be reused with corrected body; use a new explicit dated intent.

## Beta Item edit-capability projection

Real dated P1 creation succeeded, but the Beta full Item Snapshot inherited closedItemCapabilities from a read-only DTO and always returned canEdit=false. Correct only the betaLifecycle Item Snapshot read projection: canEdit is true only when current normal Manual runtime gate is enabled, family and SET_ITEM_TEXT are enabled, Trip ACTIVE, item not deleted, and existing coreCanManage ACL accepts the actor/Item. Other capability flags remain closed; no permission, policy or SQL change. Existing owning writer rechecks all authority/CAS/semantic rules at Apply. Default/native read DTOs and frozen Layer1/2 artifacts remain unchanged. This repairs a false-negative hint, not a new authorization source.

## Existing P5 nonempty Service identity constraints

A real UNKNOWN/503 exposed blank service identity accepted by structural schemas but rejected by existing PostgreSQL nonempty checks. Risk1.1 preflight now mirrors those checks for P5 CREATE_ITEM and supplied SET_TRANSPORT_DETAILS full/sparse service fields; omitted patches preserve existing values. New early error CORE_P5_SERVICE_IDENTITY_REQUIRED and semantic metadata/Guide identify all five required fields. No Core, SQL, ACL or Auth rule change. Unknown operator/service identity remains BLOCKED_BY_OWNING_INTERFACE pending an explicit owning contract choice; a separate deliberately labelled known synthetic fixture is not evidence of unknown support. Original failed request and UNKNOWN recovery remain immutable.


## Plan enforcement additive delta1.1.1

Private risk-mode write envelopes may carry `executionPlan` using existing risk-plan1.1 schema. This is execution context, never approval. The current concrete call/operation must exactly match one actual APPLY step; duplicate operation identities are rejected. Preview digest binds the full plan when supplied; omitting or changing it at Apply cannot reuse that Preview. All original business DTOs, capabilities and receipts remain unchanged.

A declared plan with ten distinct destructive targets is rejected before any business dispatch. Its validated targets establish immutable, fifteen-minute account/resource fences through the existing restricted admission gateway. This restriction survives Host restart, client changes, omitted executionPlan and new Operation IDs for the same targets; it grants no execution or approval. Ordinary serialized nine-target budget remains the backstop for undeclared decomposition. Classification stays read-only and does not register fences. Failed fence persistence closes execution. There is no supported approved bulk executor: retain NEEDS_CONFIRMATION rather than fabricate a plan approval from an individual Trip decision. Auth C04, normal Native writes and owning ACL remain unchanged.

Fences constrain new admissions during the documented window. They do not cancel or roll back an already admitted operation, infer concealed natural-language plans, or grant approved bulk execution. Mixed-domain or approved multi-step execution is not qualified by the exact ten-destructive-target negative.


## Owner-authorized isolated formal self-grant revocation

Owner explicitly permits the isolated Host to delegate DELETE /auth/v1/user/oauth/grants?client_id=<specified client> to existing Auth. Default-off, finite private account/client scope, explicit normal-user Bearer session, formal getUser qualification, exact client_id/no body/actor overrides. The provider owns revocation and consent state; no C04, scope, ACL, consent-table SQL or second consent authority changes. Authentication and audit must precede delegation. This is a test transport, not an MCP Member Removal capability. No actual revoke before the current real Consumer Preview is recorded. Reconnection occurs only after immutable no-write evidence is frozen; never auto-resume Apply after reconnection.


## Owner B P5 owning identity-state integration candidate

The historical nonempty-preflight section above describes the original failure and remains evidence of that stage. Owner B now adopts the owning optional P5 identity_state version1 representation; see `docs/ops/p5-unknown-20261117/CONTRACT_DELTA.md`. This is a business schema Delta in addition to risk1.1; it does not alter Frozen v1.0 history or its accepted evidence. KNOWN values remain nonempty; UNKNOWN/null and explicitly unnumbered NOT_APPLICABLE service_number require the owning descriptor. Legacy complete request bytes/receipts are unchanged. Original blank requests still fail and are never upgraded/replayed. No risk downgrade, scope/ACL/approval/Receipt/CAS change. Runtime rollout requires compatible owning PostgreSQL/Backend and SQLite81/Native before advertising the new rows. Candidate integration tests are not Consumer qualification.


### P5 stored-profile compatibility followup

Owning `592f92d9c5c1ad33f5fa133b0dc634d0a1ba5972` preserves approved historical no-descriptor P5/NAME stored shapes, whose existing CHECK definitions allow empty strings. This is stored-read compatibility, not permission to create new blank identities. Graph/canonical intent/Receipt bytes remain intact; Views project missing facts as UNKNOWN, and only a new explicit service edit versions those facts under same Item/key and CAS. Source SQL now enforces nonempty KNOWN facts in v1 using JavaScript trim equivalence; its digest differs from the frozen rejected candidate. No backfill, RLS/ACL/role change or original UNKNOWN replay. See owning legacy-compatibility DELTA and current composition result; Runtime/Native/Consumer qualification remains separate.
