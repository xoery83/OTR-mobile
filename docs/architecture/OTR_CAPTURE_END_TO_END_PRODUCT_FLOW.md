# OTR Capture End-to-End Product Flow — Documentation Only

Date: 2026-10-07 (Pacific/Auckland). Status: **READY FOR OWNER REVIEW**.
Workstream: `/Users/xoery/Project/otr-mobile-capture`, branch `trip/capture`.
Audited HEAD: `ed499218ca8acb2ea06c06d8f572d863b6c335bd`; starting worktree clean.

This report records the latest owner direction from
`OTR_CAPTURE_END_TO_END_PRODUCT_FLOW_CODEX_INSTRUCTIONS.md`. It connects first
value, continued local use, identity gates, adoption, normal/offline Capture and
multi-batch Review. It delivers only this document; it authorizes no implementation.

**APPROVED** means owner-supplied product direction. **PROPOSED** means a possible
integration requiring later review. **OPEN** means an unresolved decision.
Product-direction approval does not mean runtime support, an approved production
schema/API, provider activation or reconciliation of existing contracts.

The accepted [Capture UX baseline](OTR_CAPTURE_UX_ARCHITECTURE_BASELINE.md),
[Resolution](OTR_CAPTURE_RESOLUTION_ARCHITECTURE.md),
[Review](OTR_CAPTURE_REVIEW_ARCHITECTURE.md) and
[Evidence & Document Custody](OTR_EVIDENCE_DOCUMENT_CUSTODY_ARCHITECTURE.md)
remain unchanged. Core, Ledger, Import, Source and Experience retain their current
contracts and authorities. Explicit conflicts below require their owners' later
reconciliation; this report does not silently replace executable rules.

## APPROVED — cross-flow state model

### Independent identity, connectivity and entitlement

| Axis         | Conceptual states                                      | Product consequence                                                                                                                                          |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity     | Guest Evaluation / Authenticated Account               | Guest reduces time-to-value and supports conversion, while still allowing a useful local Trip. It does not promise an unlimited free standalone edition.     |
| Connectivity | Online / offline or degraded / service-specific outage | Guest is not synonymous with offline. Authenticated users remain locally usable offline. A reachable device can still encounter an OTR or AI service outage. |
| Entitlement  | Free / future paid tiers                               | Usage policy is independent of Account status and network state. Exact allowances, prices and exhaustion behavior remain OPEN.                               |

Remote computation, cloud custody and an OTR Account are separate. A Guest may use
permitted remote AI or network enrichment within entitlement without giving OTR
cloud ownership of a Trip. Temporary processing transfer is not permanent backup,
Group sharing or permission to retain evidence. A future anonymous installation or
Guest principal may support abuse prevention, rate limiting, remote Job continuity
and entitlement continuity, but is not an OTR Account. Its implementation is OPEN.

### Accounts, credentials, contact destinations and people

One OTR Account may bind multiple authentication credentials/providers. Provider mix
is market-dependent: do not make Apple/Google/email a universal product rule; future
markets may prioritize phone, WeChat, LINE or other methods. Show `Last used` only
where reliable. Prefer long-lived sessions. Future Wallet may require biometric
step-up authentication; it is not a reason to reauthenticate ordinary local travel.
No provider, session duration or biometric/security implementation is selected here.

Authentication credentials and contact destinations are distinct. An invitation
email or phone contact is not proof of Account identity. Never silently merge
Accounts from matching strings. Future duplicate-Account consolidation requires
proof of control of both Accounts. Resolution may help reconcile their data;
identity consolidation remains deterministic security work.

A Trip Person is not an OTR Account. Guest may locally create Trips, people,
Expenses/splits, Review decisions, Documents and supported receipts/attachments,
and complete an organizer-managed group Trip without anyone connecting. Existing
financial/revision rules still apply. This is product direction; the audit records
that current repositories require an authenticated Account context.

### Contextual identity gates versus paywalls

| Gate                | Appropriate reason                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity            | Invite/Join/collaboration, cross-device sync, cloud backup, persistent external connections, shared/cloud services, future cloud Photos/secure Wallet and subscription ownership. |
| Entitlement/paywall | Future limits on new Trips, AI, premium capabilities, storage, Photos or other separately approved service capacity.                                                              |

Gate copy explains the selected action's contextual reason. Registration does not
reset usage. Exhausted entitlement must not delete or lock existing local data or
stop ordinary local travel work. Paid local-only is an OPEN business decision.

First launch has no login wall and needs no large “no registration required”
message. Sign in stays light. The first proactive conversion prompt appears only
after real value and meaningful inspection/engagement, is non-blocking/dismissible,
and may coexist with a quiet `On this iPhone / Not backed up` affordance. These and
all following copy examples are conceptual, not shipped strings/localization keys.

## APPROVED — Flow 1: First-time Guest → first value → soft conversion

1. The empty state treats **Create Trip** and **Add existing plans/Capture** as peer
   intents. Join Trip is separate; an invitation deep link may bypass empty state.
2. First Capture needs no registration. Selecting a persistent Email or ChatGPT
   connection may require contextual sign-in. One-shot local intake does not inherit
   that connection gate. Guest may use permitted remote intelligence.
3. Durably accept supplied material locally before processing. Offline work continues
   within actual capability. Explain real limits without promising that reconnect
   will resolve every ambiguity. Picker selection alone is not durable acceptance.
4. Understand evidence and resolve Trip relevance. When it implies a new Trip,
   present a supported proposal. Explicit **Create** confirmation is required;
   authentication is not. Detailed editing reuses the canonical Trip Form where
   available. Participant suggestions do not silently link Accounts or grant access.
5. Show the formed Trip Home/content and give the user a chance to inspect or engage.
   That is the aha opportunity. Only afterward may a soft backup/sign-in prompt
   appear. A light optional `Sign in to back up` affordance may be available earlier
   without becoming the proactive prompt or a creation prerequisite.
6. If sign-in creates or opens a genuinely empty Account, automatically adopt/sync
   the local Guest world. Do not ask a redundant “Claim this Trip?” question or
   expose internal claim terminology. Preserve the user's original context.

Useful local results, a remote proposal, command preparation and canonical/server
acceptance remain different milestones. This flow does not permit draft proposals
to masquerade as accepted travel facts or bypass current explicit action disposition.

## APPROVED — Flow 2: Guest continues without sign-in

After dismissing the soft prompt, ordinary local edits, Day planning, Trip Persons,
Expenses/splits, local Review/Documents and supported receipts/attachments remain
frictionless. A second Capture is not a registration trigger. The organizer can
maintain a useful group Trip even when every other Person remains unconnected.

Guest and authenticated Free use one continuous entitlement history. Registration
must not refresh Trip, AI or trial allowance. Exact limits and anti-abuse accounting
remain OPEN; current technical intake bounds are not a Free-tier product policy.

If Free entitlement is exhausted, keep existing data readable and locally editable.
Future policy may gate new Capture, new Trips, high-cost processing, premium or cloud
capability. Explain entitlement separately from the reason to sign in; authentication
alone is not a promise of more capacity. No paywall, paid tier or local-only paid
edition is selected by this checkpoint.

## APPROVED — Flow 3: Guest hits an identity gate — Invite Member

1. When the organizer taps Invite for a Trip Person, explain the actual reason,
   conceptually `Sign in to invite Caroline`, rather than a generic login wall.
2. Persist the pending action, Trip, Trip Person and relevant revision/context so
   authentication and adoption can automatically resume Invite. If authentication
   is postponed or fails, retain intent and allow unrelated local work to continue.
3. After auth, transition the device Guest world toward Account ownership as a whole.
   Prioritize the current Trip; other Trips may adopt in the background. Do not make
   the user select each local Trip to claim. Revalidate the pending target and current
   authority before resuming; an old intent does not authorize a changed recipient.
4. Establish only the minimum durable remote collaboration identity:
   **Account → remote Trip identity/shell → stable person/permission context →
   invitation token**. Do not wait for the entire Trip and every attachment to upload.
   This is a required future behavior, not installed remote-shell/Invite support.
5. For a share link, expose the Share Sheet only after a durable server-resolvable
   invitation token exists. OTR knows token creation and Share Sheet presentation;
   it cannot know that the user actually sent the link.
6. For OTR-delivered email, keep invitation creation, delivery request, provider
   delivery/bounce state and recipient acceptance separate. Normal infrastructure
   retry stays in the background. Do not choose an email provider or claim “sent”
   from token creation or request acceptance alone.
7. Acceptance links the recipient Account to the existing TripPerson. Known Account
   selection may simplify finding the recipient, but previous travel or email match
   does not silently grant access to a new Trip. Default direction: the recipient
   accepts each new Trip. A Person remains valid if the recipient never connects.

| User-facing member state | Meaning                                                                           |
| ------------------------ | --------------------------------------------------------------------------------- |
| Not invited              | No applicable durable invitation has been established.                            |
| Invited                  | Invitation exists; this does not assert delivery or acceptance.                   |
| Connected                | Recipient accepted and Account linkage was established under the owning contract. |

These are product meanings, not replacements for current Member role/status enums,
participation observations or effective access. Exact cancel/expiry/reinvite mapping
is OPEN. Never falsely claim Connected, delivery or sending during failure.

Members is not Bottom Bar primary navigation. Trip Menu has a stable Members entry.
Organizer Trip Home contextually surfaces People/Members when uninvited people,
unconnected people or issues matter. Ordinary members de-emphasize management;
Past prominence may decay without erasing people or history. Trip Experience owns
composition and navigation; Core/Member owns identity, access and invitation truth.

## APPROVED — Flow 4: Voluntary sign-in → adoption/reconciliation

Return the user to the original context after authentication. Normal adoption is
not a blocking migration wizard. Conceptual status can progress
`On this iPhone → Syncing → Backed up` while local work continues; actual backup
claims require owner-verified custody and coverage, not merely a successful login.

| Account situation                            | Required behavior                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Genuinely empty Account                      | Automatically adopt the whole Guest world. No redundant per-Trip claim question.                               |
| Existing Account with clearly distinct Trips | Automatically adopt local Trips while cloud Trips sync locally.                                                |
| Possible same Trip                           | Reconcile meaning before domain admission; ask only a genuine ambiguity such as `Same trip` / `Keep separate`. |

For overlap, preserve the local structured Guest world as a high-quality structured
claim/adoption package. Reuse **Trip Resolution → Entity Resolution → deterministic
owning-domain admission**. Do not render structured data to PDF/OCR, SQL-merge rows,
or pick a local/cloud winner from titles or dates. Human-confirmed Guest facts are
strong provenance, with their actual reviewed context; they do not bypass current
permission, revision, financial or evidence rules.

After the smallest necessary Trip choice, domain reconciliation continues without
a giant merge wizard. Do not freeze local editing. New edits after the adoption
baseline must not be overwritten by older package state. Adoption transaction,
identity mappings, progress, partial recovery and command shapes remain OPEN.

Ledger owns Expense/payment/Settlement reconciliation; Documents/Custody and actual
asset owners govern assets; Core/Member owns identity/participation and access.
There is no universal row merge engine. Account switching's legacy single-account
cache adoption is not this Guest-world adoption capability.

Guest usage carries into the Account. Future Account consolidation requires proof
of control of both Accounts; matching email/phone is insufficient. Semantic data
reconciliation cannot substitute for secure identity verification.

## APPROVED — Flow 5: Authenticated user, existing Trip, normal Capture

Trip context is a strong prior, not truth. The surface may say `Add to Japan`
without asking the Trip again when the match is clear. Historical intake context
stays intact; conflicting intent/evidence still needs owning Resolution treatment.

### Compose acquisition before submission

**Picker return is not automatic submission.** Provide a lightweight staging
tray/intake basket: add Files, return, add Photos, return, use Camera, remove
mistaken staged items, then press one final `Add N items`. Do not turn the tray
into a complex file manager. Exact UI, staging recovery and limits remain OPEN.
Staged removal is not deletion of accepted evidence or reversal of a domain write.

After `Add N`, the first milestone is **durable local acceptance**. Only then is
panel dismissal safe for accepted intake. A failed/partially accepted intake must
truthfully identify what was retained; never imply every selected URI was saved.
Per-input acceptance/retry UX is OPEN under existing independent-input contracts.
Accepted work belongs to a durable Job, survives app kill/restart, and does not
depend on the Capture sheet remaining mounted. Reopen the panel from Activity.

### Understand and correlate before happy-path admission

```text
Pass 1: Understand the whole submitted batch
→ Pass 2: Correlate / Resolve across that batch
→ Pass 3: Admit safe semantic results through owning domains
```

Do not write each file's result as soon as its parser finishes. Correlate related
sources first; prefer one complete Flight proposal over CREATE followed immediately
by SUPPLEMENT. This does not make the batch an all-or-nothing transaction, merge
bounded immutable Runs or authorize unsupported booking/passenger fields. Safe
results can progress independently after whole-batch assessment. Policy for very
large/slow batches and partial settling remains OPEN. Unsupported/deferred input
coverage must be explicit rather than silently omitted.

Show only real stages, counts and measured progress. Unknown denominators remain
unknown; no fake AI theater. Received sources, discovered Candidates, prepared
commands and admitted entities are different units. Count “plans added” only from
verified admitted outcomes, never from READY/preparation or queue-pass completion.

### Results, newness, attention and recent verification

Successful imports become normal canonical data. A very light ephemeral newness
marker, such as a dot, may help discovery. **Newness is not attention/error** and
must not become a permanent simplistic `is_new` domain flag. Exact clearing rules
remain OPEN; no final colors or icons are selected.

Attention presentation progresses by actual need:

1. History only.
2. Activity indicator.
3. Contextual newness/change marker where useful; it remains separate from severity.
4. One in-app banner only for mature actionable Blocking/Important Review.
5. OS notification as a stricter, separately reviewed future layer.

Trip Home may temporarily promote **Recent Imports** so the user can verify receipt
and results. It may aggregate recent Jobs/items, plans added/updated and current
attention, then collapse to low-weight Documents/history. Exact recent window,
aggregation and composition belong to later policy, not a timer chosen here.

Mixed staging may fan out into evidence and ordinary Photos/Memory. A light result
summary may say `8 plans added · 2 photos added` when supported by actual outcomes.
Only genuine routing ambiguity interrupts. Ordinary Photos/Memory remains outside
Documents; explicit receipt/attachment intent retains its owning path and rules.

Job processing completion is not completion of all Review. Useful/Informational
unresolved details can remain after Job Complete; outstanding resumable work or
UNKNOWN execution still needs truthful separate status and exact recovery.

## APPROVED — Flow 6: Truly offline/degraded Capture in an existing Trip

**Offline is degraded intelligence/capability, not a degraded product.** Cruise,
flight, remote hiking, glaciers, border transitions and weak connectivity are normal
travel states. **No network-dependent feature may unnecessarily stop unrelated
local travel work.** These rules also apply to service outages.

Show connectivity lightly and distinguish device offline from an OTR/backend or
specific service outage. Do not label our outage as the user's device being offline.
Staging and durable local acceptance are unchanged; accepted Job/evidence must not
be lost on app kill/restart. Durable acceptance is not a promise of uninterrupted
OS background execution.

Use available local file reading, metadata, OCR/Vision, deterministic parsing,
local models, cached data and the local candidate world. This is a capability
strategy, not a claim that every decoder/model is installed. Explicit intent
outranks classification. Global image routing may consider screenshot/camera
provenance, OCR/text density, QR/barcode, vision/model observations and EXIF/layout;
it need not be perfect and does not establish business truth.

| Current uncertainty                       | Product treatment                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Waiting for network/capability/enrichment | Retain resumable work; do not manufacture a human Review merely because processing waits.                  |
| Genuine human semantic decision           | Offer the minimum useful Review with available evidence and current context.                               |
| Genuinely missing evidence                | Explain what is missing; reconnect is not guaranteed to supply it.                                         |
| Locally safe result                       | Resolve/admit through available local owning capabilities and current authorization/revision/domain rules. |

These are conceptual distinctions, not persisted enums or a prediction that remote
AI will definitely solve an issue. They explain why uncertainty currently exists.
For waiting items, the user may choose `Review now` and help manually or leave them
for reconnect. That choice cannot settle uncertain execution or waive admission.

Offline permits whole-batch correlation, local candidate retrieval, Resolution and
local domain writes where supported. Do not hold a locally safe result merely
because remote AI might know more. The local world may be incomplete versus server
or other devices. Reconnect may reveal duplicates/conflicts; use normal revision-safe
sync, lineage and owning-domain reconciliation, not a blind overwrite.

Truly connectivity-dependent work may be `Waiting for connection`, rather than
Complete/Failed. A completed current pass with retained waiting work must say so;
it cannot imply overall processing quiescence or discard reconnect responsibility.
Reconnect automatically resumes enrichment/re-resolution: no Retry/re-Capture ritual.
Unanswered Review may auto-resolve; human-confirmed decisions cannot silently change.
`Not sure` may later auto-resolve while the recorded disposition/history survives.

Persistent offline remains usable. Operationally important missing online information
may become more relevant near use time and justify `Connect to update...`; connectivity
itself is not a stopper. Exact uncertainty, outage presentation and background/resume
contracts remain OPEN. Peer-to-peer offline Trip/Photo sync is plausible future work
and explicitly **OUT OF SCOPE for Beta**.

## APPROVED — Flow 7: Multi-batch intake → re-resolution → Review → completion

Each submitted batch is its own durable Job for audit, retry and provenance. Do not
merge runtime Job identity for UX. Every batch follows Flow 5's whole-batch
Understanding → Correlation/Resolution → safe admission order.

Later Batch B/C creates new Jobs. Do not ask whether a batch is related merely
because it is recent in the same Trip/context. Authorized Resolution/Review may
correlate across relevant Jobs using actual semantic evidence, not recency alone.
Later evidence changes the evidence world; it does not “answer a questionnaire.”

An unanswered Review Requirement may remain, update its alternatives, auto-resolve,
become irrelevant or be superseded by a better semantic question. Human-resolved
choices remain durable; meaningful contradictory evidence requires reconsideration,
not a silent replacement. Minimum questions and canonical Forms retain Review's
constrained product-owned controls; AI does not generate arbitrary UI or write facts.

Activity shows current attention and may regroup/reorder after each batch. Resolved
issues disappear from current attention while authorized history survives in
Documents. Do not proactively announce `3 details resolved` just because new
material solved issues the user never saw. Show current truth.

Recent Imports may aggregate several recent Jobs/batches in presentation; opening
an aggregate can reveal individual Jobs/sources. Exact window is OPEN. Aggregation
never merges durable Jobs, Sources, immutable publications or execution claims.

### Final banner rule — latest owner decision

No required **Done Uploading** action exists. After a submitted batch completes
whole-batch Understanding plus Correlation/Resolution, **one aggregate in-app banner
may appear immediately if mature, actionable Blocking/Important Review remains**.
Do not delay solely to guess whether another batch will arrive. Useful/Informational
issues do not trigger the large banner. Conceptual copy and actions:

> 3 items need your attention — Review / Add more

| Interaction                                                        | Required presentation behavior                                                                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First batch assessed; mature actionable Blocking/Important remains | Banner may appear now; no guessed upload-completion timer.                                                                                               |
| User selects Add more, or starts another related Capture           | Suppress the current banner while new evidence is staged/processed; the evidence world is changing. Activity/history and durable work remain.            |
| New batch assessed and Review recomputed                           | Show a new aggregate banner only if mature actionable Blocking/Important issues still remain. Preserve a prior dismissal for the same interaction cycle. |
| User dismisses the banner                                          | Keep Activity attention, but do not repeatedly re-show the banner in that interaction cycle.                                                             |
| Only low-value or waiting issues remain                            | No large banner merely to report unresolved fields or capability waits. Operational escalation still follows owner policy.                               |

Time may later be an auxiliary resurfacing signal; it is not the core algorithm for
whether the user is “done uploading.” Maturity refers to a completed whole-batch
semantic assessment with an actionable question, not elapsed time. Exact semantic
identity, interaction-cycle boundary and resurfacing policy remain OPEN.

This latest direction supersedes any earlier idea of waiting for a settling timer
before the first banner, including a timer-based interpretation of Review section 11
and its proposed settling concept. The older document stays unchanged. Waiting
while related new intake is actually staged/processed remains valid; guessing that
more intake might arrive is not a prerequisite. Audit G12 records owner reconciliation.

### End state

Jobs can be Complete even with low-value unresolved details. Activity may have zero
current attention; it is not obliged to display every historical question. Documents
retains authorized evidence/provenance subject to custody, retention and access rules,
not a promise of permanent original bytes. Recent Imports and newness decay through
presentation policy. No completion, disappearance or dismissal releases protected
evidence, cancels waiting work or proves UNKNOWN terminality.

## APPROVED — cross-flow invariants

1. Guest is conversion/evaluation mode, not synonymous with offline.
2. Identity, connectivity and entitlement are orthogonal.
3. Remote computation does not imply cloud custody or an OTR Account.
4. Registration does not reset Free entitlement.
5. Trip Person does not require Account connection.
6. Identity gates are contextual and preserve pending user intent.
7. Guest → Account adoption is mostly invisible in normal cases.
8. Existing-account overlap uses semantic reconciliation, not row merge.
9. Authentication credentials are keys to an OTR Account, not separate Accounts.
10. Account consolidation requires proof of control, not AI/email-string guessing.
11. Picker return does not submit Capture; staging composes acquisition sources.
12. Durable local acceptance precedes safe dismissability.
13. The whole submitted batch is understood/correlated before happy-path admission.
14. Newness and attention are separate presentation semantics.
15. Documents is not the primary Review destination; Activity is current attention.
16. Offline remains fully useful where local capability permits.
17. Waiting for capability is not the same as human semantic Review.
18. Reconnect resumes automatically; no re-Capture ritual.
19. Each batch retains durable Job identity; presentation may aggregate.
20. Later evidence re-resolves unanswered Review.
21. Human decisions are not silently overwritten.
22. Large banners follow mature actionable Blocking/Important Review, not a guessed upload-completion timer.
23. Add More/new related Capture suppresses stale banners until recomputation.
24. Infrastructure retry remains background unless the user action cannot be honored.
25. No network-dependent feature unnecessarily stops unrelated local travel work.

## PROPOSED — later integration concepts

These explain possible implementation boundaries without defining a schema, DTO,
command, route, worker, scheduler or provider.

- **Pending intent at identity gates:** retain selected action/target and reviewed
  context through auth, then revalidate under the owning domain before resumption.
  Reuse Account transition/freshness infrastructure where applicable; do not treat
  persisted process generation as permanent authorization.
- **Whole-world adoption with domain handoffs:** retain a baseline and subsequent
  local intent, resolve possible Trip overlap, then route reconciliation to Core,
  Ledger and asset owners. A structured package preserves exact data/provenance;
  no universal importer/SQL merger or PDF conversion is needed. Remote identity
  setup for Invite can precede bulk sync without pretending the latter finished.
- **Job and Review projections:** project durable intake/progress/continuation and
  owner-authorized semantic requirements through repositories. Separate truth,
  attention, human intent, action outcome and original availability. Reuse existing
  queue/work owners; do not add processing states to CP11 Capture rows.
- **Whole-batch planning above bounded Runs:** gather admitted coverage from the
  submitted batch before happy-path action planning. Immutable bounded Runs may
  finish independently; correlation needs exact lineage and supported field scope.
  Any exceptionally large/slow partial-admission policy needs separate review.
- **Presentation reacting to evidence:** suppress a stale banner on actual related
  staging/processing and recompute after the new whole-batch assessment. Keep
  dismissal distinct from resolving truth. Recent Imports/newness are presentation
  projections; no permanent business `is_new` flag or upload-settling timer is needed.
- **Federated Documents and usage continuity:** compose owner-permitted evidence and
  asset observations without duplicate storage or wider access. A future Guest-to-
  Account entitlement binding retains usage rather than issuing a new allowance;
  neither Documents nor Capture becomes a new billing, ACL or custody authority.

## Compatibility audit — current facts, conflicts/gaps and future owners

This is a focused local code/contract audit, not deployed, device, security or release
certification. Evidence includes relevant sections and narrow source symbols, not
an exhaustive repository/legacy scan. The Capture worktree's
[current handoff](../CURRENT_IMPLEMENTATION_STATE.md) governs current status:
CP14 foundations accepted **CLOSED**, SQLite 1–50 / Server 1–83. Historical report
headers and older E0 schema counts do not supersede that handoff. All runtime gates
remain CLOSED; this document opens none.

| ID / area                                         | Current accepted evidence and capability                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Conflict/gap; future responsible owner                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 — Guest local ownership / launch               | [Architecture](../ARCHITECTURE.md#auth), [Offline sync](../OFFLINE_SYNC.md#offline-tolerant-auth); `src/domain/auth/authState.ts`, `localSession.ts` and `src/data/auth/authRepository.ts::requireActiveUserId`: no session is SIGNED_OUT; local-use states are authenticated/refreshing. [Data model](../DATA_MODEL.md), `src/domain/capture/localCapture.ts`, `localCaptureInboxRepository.ts` and its default factory require Account scope and cached Trip actor admission for assignment. | **CONTRACT CONFLICT / CAPABILITY GAP:** no-account Guest world is product direction, not current authorization/storage support. Account-only Capture INBOX means no selected Trip, not no Account. Core/Account + local repository/domain owners must approve Guest ownership and launch policy before implementation; do not substitute a fake Auth UUID.                                                           |
| G2 — Sessions / anonymous principal / credentials | SecureStore/session and generation-isolated remembered Account foundations exist; [Account switching acceptance](../ux/ACCOUNT_SWITCHING_FOUNDATION_ACCEPTANCE.md). Supabase Auth is the current wrapped identity assumption. CP14 inbound uses a trusted injected verifier and protected Account authorization; production OAuth/JWT/public clients remain deferred.                                                                                                                          | **GAP:** no approved Guest principal/session, multi-credential linking, market provider matrix or Account consolidation runtime evidenced. `AccountIdentity.email` is display/account data, not a credential/contact model. Account/Auth/security owns these flows; future biometry belongs to Wallet/security. No provider/config change now.                                                                       |
| G3 — Authenticated offline                        | `src/data/bootstrap/bootstrapApplication.ts` opens SQLite, derives local auth from retained session and starts sync/health without blocking on their failures. Offline auth preserves cached access and writes through existing owning repositories; expired tokens pause remote work.                                                                                                                                                                                                         | **COMPATIBLE FOUNDATION:** preserve silent refresh and explicit rejection/revocation rules. This does not certify every future Trip/document/model capability. Auth + Platform + each domain owns extension; offline usability cannot enable closed Source/Event/Import writers.                                                                                                                                     |
| G4 — Trip ownership / adoption                    | `src/data/repositories/tripRepository.ts` remains list/get stub. `src/data/auth/accountLocalState.ts::adoptLegacyAccountState` assigns null device-local scope only after cached actor proof; it is legacy single-account isolation repair. [API](../API_CONTRACT.md#trips) marks general Trip CRUD as NEEDS_CHANGE.                                                                                                                                                                           | **GAP:** no Guest-world ownership transition, remote shell, structured adoption package, overlap reconciliation or edit-baseline recovery contract. Core/Trip/Account + Platform + Ledger/Custody owners must design exact domain handoffs. Do not reinterpret legacy adoption as Guest capability or as permission for bulk row reassignment.                                                                       |
| G5 — TripPerson versus Account/member             | [A1 identity contract](TRIP_CANONICAL_A1_IDENTITY_MEMBERSHIP_CONTRACT.md), `src/domain/trip/person.ts`, `tripPersonRepository.ts`: stable journey_members Person UUID differs from Account. Local projection exposes name/participation, omits user_id; read requires scoped actor context. Nullable Account linkage and nominal Persons already exist in baseline contracts.                                                                                                                  | **COMPATIBLE DISTINCTION / GAP:** Guest Person creation and public Connected states are not implemented by this read model. No printed name, participation flag, role or link alone grants access. Core/Member owns creation/link/permissions and state projection; Ledger retains stable payer/split identities. Existing role “guest” is not Guest Evaluation.                                                     |
| G6 — Invitation/link/email / recipient acceptance | A1 identifies retained baseline journey_invites and accept_journey_invite/claim_email_invited_journeys/claim_journey_member RPCs, plus legacy email matching and already-member shortcuts. General Member APIs remain NEEDS_CHANGE; focused `backend/src/app.ts` inspection provides no complete Mobile Invite/token/email-delivery flow.                                                                                                                                                      | **POLICY CONFLICT / GAP:** legacy matching is not the proposed proof/recipient-consent policy. Durable minimum shell, target-bound token, pending Invite resumption, Share Sheet gate, delivery/bounce separation and Join first-run need Core/Member + Account/security + Backend/delivery owners. Do not remove or call legacy RPCs as a shortcut. No provider selected.                                           |
| G7 — Entitlement / usage                          | CP11 technical byte/reference limits protect intake integrity. CP14 Server83 and `backend/src/externalIntegrationPersistence.ts` supply protected usage/cost/config foundations; real dispatch/billing remain closed/deferred.                                                                                                                                                                                                                                                                 | **GAP:** these are neither continuous Guest/Free allowances nor subscription entitlement. Guest abuse controls, registration-continuous metering and exhaustion/paywall policy need Product/entitlement + Account + Intelligence/billing owners. Technical quotas/cost observations do not select product limits, prices or paid-local availability.                                                                 |
| G8 — Picker / staging / local acceptance          | `app/(tabs)/capture.tsx` renders a Foundation routing boundary. CP11 repository accepts verified FILE/IMAGE/TEXT originals transactionally with dedup, quotas and CAS; it is not wired as a production intake tray/Job. Ledger receipt acquisition is a distinct form-owned path.                                                                                                                                                                                                              | **CAPABILITY GAP:** neither current picker auto-submit nor mixed Capture staging is evidenced as installed UI; do not claim a bug fix to an existing tray. Capture + native intake + Experience + repositories must implement compose-then-submit semantics later. Preserve partial-input truth and original custody; no new tray UI/limit chosen here.                                                              |
| G9 — Job / Activity / progress                    | [Import architecture](TRIP_IMPORT_ENGINE_ARCHITECTURE.md) and [contract](TRIP_IMPORT_CONTRACT.md) define Batch, immutable Runs, progress and independent intake/pass/quiescence. CP14 continuation/attempt persistence and closed wake adapters exist. `src/data/sync/ledgerQueueActivity.ts` deliberately separates intelligence work from Ledger counts.                                                                                                                                     | **GAP:** no complete Capture Job/Activity panel/reopen surface or Job-to-Batch projection is installed. Platform & Import owns work/lifecycle; Capture + Experience owns presentation/deep links/count units. Notification-ready facts are not sent notifications or a user-visible Job.                                                                                                                             |
| G10 — Whole-batch ordering                        | `src/data/interpretation/flightInterpretation.ts::interpretFlightBatch` returns correlated immutable observations/publication inputs without preparing/executing outputs. CP13B supports N→M consolidation; `flightImportClosureOrchestrator.ts` assesses supported exact candidates and prepares through admission. Import permits bounded Runs to publish before other Runs finish; Review section 18 says correlate “where practical.”                                                      | **ORDERING CONTRACT GAP:** current closed foundation does not guarantee a whole submitted user batch barrier across all partitions/modalities before admission. Latest happy path is stricter than per-Run completion. Platform & Import + domain owners must reconcile coverage/planning order and large/slow exceptions without rewriting READY Runs or inventing an atomic batch transaction.                     |
| G11 — Automatic admission / confirmation          | Import “Confirmation and commit,” CP13A/B and CP14 B2 require explicit disposition, exact reviewed pins/current authority, supported typed commands and target CAS. READY/PREPARED is not ACCEPTED; five C operations remain scheduler-denied.                                                                                                                                                                                                                                                 | **CONFLICT IF** effortless/automatic product results omit mandatory action approval. Trip matching may remove redundant Trip questions, not current consent. Platform & Import + each domain owns future auto-action policy. Same-Trip Day mismatch also retains Import's current explicit-review requirement pending the Resolution audit's reconciliation.                                                         |
| G12 — Review / attention / first banner           | Review section 11 and PROPOSED concept 6 leave settling/escalation open; latest owner Flow 7 now permits immediate first aggregate banner after whole-batch semantic assessment. Current Import/`src/domain/trip/flightImportClosure.ts` use versioned NONE/DEFERRED/ACTION_REQUIRED/URGENT with evidenced deadlines; C2 notification-ready facts remain closed.                                                                                                                               | **SUPERSEDED DIRECTION / MAPPING GAP:** any first-banner settling-timer requirement is superseded in this report; older text remains untouched. No equivalence to conceptual Blocking/Important/Useful/Informational or production Capture banner is claimed. Capture + Experience + Import/CXE owns maturity, importance, dismissal-cycle and recomputation mapping; OS delivery needs a separate owner checkpoint. |
| G13 — Documents / Recent Imports / newness        | Custody defines Documents as caller-authorized provenance projection, not storage owner; Review excludes ordinary Photos/Memory. No dedicated production Documents/Recent Imports surface is evidenced in the current handoff/Capture route.                                                                                                                                                                                                                                                   | **GAP / WORDING CONFLICT:** UX baseline's broad “all captured/imported source material” must not imply all photos or permanent bytes. Capture + Experience + Source/Ledger/Media owners reconcile projection coverage and navigation. Newness is presentation, not an attention flag or canonical column. No window/lifetime chosen.                                                                                 |
| G14 — Offline waiting / reconnect                 | Import distinguishes WAITING_FOR_NETWORK/REMOTE_INTELLIGENCE/ENRICHMENT. SQLite50 and `intelligenceContinuationWakeWorker.ts` retain independent wait/execution/install/meter states; operational sync supports an injected continuation adapter for cold-start/reconnect. Current handoff records no default provider/startup activation.                                                                                                                                                     | **COMPATIBLE CLOSED FOUNDATION / GAP:** automatic production enrichment, uncertainty classification, Review now and device/background scheduling remain unactivated or unspecified. Platform & Import + Intelligence + native lifecycle owners reconcile full flow. Wake-pass completion/lease expiry cannot authorize replay under UNKNOWN; no second scheduler or indefinite background guarantee.                 |
| G15 — Conflict / reconciliation / human decisions | Import I1/I2 and CP13A preserve lineage CREATE fences, target revisions and exact receipts. CP14 B2 seals authenticated decisions and rejects stale NEW dispositions. [Ledger conflict model](../ledger/LEDGER_2_0_SYNC_CONFLICT_MODEL.md), API Expense Consistency v2 and [Ledger personal Review](../ledger/REVIEW_2_0_PHASE_2_PERSONAL_DECISIONS_AND_VISIBILITY.md) protect domain intent/history.                                                                                          | **COMPATIBLE SAFETY / GAP:** no general Guest adoption or cross-Job semantic requirement engine follows from these mechanisms. Platform & Import + owning domains govern reconciliation. Human Guest provenance cannot fabricate server receipts; Capture Skip/Not sure is not Ledger ACK/DISMISS or automatically B2 DEFER/REJECT. Frozen Settlement inputs and newer local edits remain protected.                 |
| G16 — Source/Representation / Guest custody       | [Source provenance](TRIP_CANONICAL_C_I1_SOURCE_PROVENANCE_CONTRACT.md), sections C–E/O, retains acquiring Account, exactly one stable Trip scope, immutable original/derived material and independent authorization; CP13A explicitly binds Capture→Source NEW/REUSE/REPLACEMENT. Source IO_UNKNOWN/provider terminality remain blocked.                                                                                                                                                       | **CONTRACT CONFLICT / GAP:** Guest custody/adoption is not a supported acquiring-Account rewrite, Source move or arbitrary replacement of material IDs/hashes. Source/Import + Account + asset/security owners must admit Guest evidence handoff and structured provenance. Remote AI never implies backup; completed Review/Job cannot release bytes or widen disclosure.                                           |
| G17 — Experience ownership                        | Preserved Trip Experience E0 identifies missing general Trip root/lifecycle, selected-Trip, ticket/asset/privacy contracts; shell/composition belongs to Experience. Product's long-term navigation is Today/Ledger/Trip/Album; current Capture route is transitional.                                                                                                                                                                                                                         | **OWNERSHIP INTEGRATION GAP:** Capture cannot add Members to Bottom Bar or decide shell, home priority, recent window/newness visuals or lifecycle boundaries. Experience + Core/Member owns stable Trip Menu and role/context-dependent Home composition. Recent Imports must not displace genuine operational priority; Past de-emphasis does not delete data.                                                     |
| G18 — Local receipts/attachments / mixed Media    | Product and existing [receipt/attachment design](../EXPENSE_ATTACHMENTS_RECEIPT_SCAN_1_0_DESIGN.md) keep New Expense OCR/form Save, existing-Expense attachment-only behavior and Ledger-owned durable uploads. Custody forbids duplicate assets merely for Documents.                                                                                                                                                                                                                         | **GAP:** Guest asset ownership and mixed-batch fan-out need Ledger/entity + Media + Capture/Source contracts. Preserve current OCR eligibility, supported attachment bounds and upload intent; do not turn imported financial evidence into automatic Expense/payment writes or pretend Photo cloud backup exists.                                                                                                   |
| G19 — Data Health / recovery                      | [Data Health plan](OTR_DATA_HEALTH_AND_SELF_HEALING_PLAN.md) and Offline Sync record scoped protected-intent manifests, narrow queue repairs, normal-sync convergence and coalesced lifecycle scheduling. Protected local originals require verified recoverability before eviction.                                                                                                                                                                                                           | **COMPATIBLE SAFETY / GAP:** Health is not Guest adoption, semantic merger, entitlement reset, custody inventory or cleanup authority. Data Health + each domain/Source/file owner may extend after proof contracts. Infrastructure retry remains background; missing original evidence or real business ambiguity is not repairable by arbitrary Retry.                                                             |

Trip Experience E0 is absent from this worktree. The preserved report inspected for
context is `/Users/xoery/Documents/Codex/2026-10-06/files-pasted-by-the-user-otr/outputs/TRIP_EXPERIENCE_E0_BASELINE_ARCHITECTURE_REPORT.md`,
dated 2026-10-06, audited at `c4571746b0c300fa3b46842cd37745963567338c`.
Its proposals await review; this is not proof that Experience branch work is installed.
No legacy Web checkout or remote environment was inspected.

Mandatory foundations read: `AGENTS.md`, [Product](../PRODUCT.md),
[Architecture](../ARCHITECTURE.md), [Data model](../DATA_MODEL.md),
[API](../API_CONTRACT.md), [Offline sync](../OFFLINE_SYNC.md),
[environment audit](../ENVIRONMENT_AUDIT.md) and existing
[legacy audit](../legacy/OTR_LEGACY_AUDIT.md). UI examples remain conceptual and must
later follow [UI Foundation](ui-foundation.md) and the
[terminology glossary](OTR_TERMINOLOGY_GLOSSARY.md), not hard-coded copy or controls.

## OPEN — questions and future owners

No numeric limits, timers, quotas, confidence thresholds, banner durations, providers
or prices are selected. Existing technical limits remain authoritative and unchanged.
Owner assignments below identify future responsibility, not approved/scheduled work.

| OPEN decision                                                                                 | Future owner/checkpoint                                                                                           |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Exact Guest principal/session implementation and remote continuity                            | Account/security + Platform/Intelligence: anonymous evaluation boundary distinct from Account.                    |
| Guest local ownership schema/authorization and cached admission                               | Core/Account + repositories + domain owners: local Guest-world contract.                                          |
| Exact Free/paid limits, continuous usage accounting and anti-abuse policy                     | Product/entitlement + Account + Intelligence/billing: registration-continuous service policy.                     |
| Exact provider mix by market, long-lived session behavior and reliable Last used              | Account/Auth + Product/security: market authentication policy.                                                    |
| Credential linking and Account consolidation security flow                                    | Account/security: proof of control, deterministic identity operations and recovery.                               |
| Contact destination versus credential model                                                   | Account + Member/delivery: purpose-specific identities and contact verification.                                  |
| Soft-prompt resurfacing cadence                                                               | Product + Experience: dismissible conversion policy.                                                              |
| Definition of meaningful engagement/aha trigger                                               | Product + Capture/Experience: formed-content inspection, not picker return or first parser result.                |
| Guest → Account adoption transaction/recovery, edit-baseline protection and bulk progress     | Core/Account + Platform + owning domains: resumable whole-world transition.                                       |
| Structured claim/adoption package schema                                                      | Core/Import + Source + Ledger: structured facts, original human provenance and exact lineage.                     |
| Per-domain adoption/reconciliation commands and auto-action consent                           | Core/Member, Trip/Event, Ledger, Source/asset owners: supported admission/correction handoffs.                    |
| Invitation token, minimum remote shell, delivery and email provider architecture              | Core/Member + Backend/delivery + Account/security: durable invitation, separate transport states.                 |
| Join-recipient first-run flow                                                                 | Account/Member + Experience: contextual acceptance/linkage without silent privilege escalation.                   |
| Member role/permission model and Not invited/Invited/Connected projection                     | Core/Member + authorization + Ledger/Experience: preserve link/access/participation distinctions.                 |
| Exact staging tray UI, limits, temporary material handling and partial acceptance/recovery UX | Capture + native intake + repositories/Experience: compose then durable submit.                                   |
| Very large/slow batch partial-settling policy and bounded-Run coverage/admission barrier      | Platform & Import + domain owners: explicit exception to the approved batch happy path.                           |
| Newness marker lifetime/clearing rule                                                         | Experience + Capture: ephemeral discovery independent of attention.                                               |
| Activity icon/badge/banner visual semantics, maturity and dismissal interaction cycle         | Experience + Capture + Import/CXE: conceptual importance mapping; no first-banner settling timer.                 |
| Recent Imports aggregation/window and collapse behavior                                       | Experience + Capture: inspectable multi-Job presentation.                                                         |
| Exact offline uncertainty classification contract and Review now admission                    | Platform & Import + Intelligence + domain/Capture owners: waiting versus human semantics versus missing evidence. |
| Service outage versus device-offline presentation                                             | Platform/network + Experience: truthful service-specific availability.                                            |
| Reconnect scheduling, background execution limits and cold-restart integration                | Platform/sync + native lifecycle + Intelligence: existing scheduler, fresh admission and exact recovery.          |
| Future P2P Trip/Photo sync                                                                    | Platform + Photo/Core/security: advanced future capability, outside Beta.                                         |
| OS notification policy, permission, escalation, grouping and delivery                         | Notification/native platform + Experience/Capture: stricter separately authorized layer.                          |
| Exact paywall behavior after Free exhaustion                                                  | Product/entitlement + each premium/cloud owner: preserve existing local data/work.                                |
| Paid local-only possibility                                                                   | Product/business + entitlement: unresolved business choice.                                                       |
| Guest Source/Custody handoff, backup coverage and authorized provenance availability          | Source/asset + Account/security + Platform: role/custody/permissions without silent Account/Trip reassignment.    |

Other accepted OPEN decisions in Resolution, Review, Custody and E0 remain OPEN,
including canonical field significance, constrained Review identity/schema, Undo,
asset retention/Keep, secure Wallet, Photo custody and lifecycle boundaries. This
report neither resolves them nor chooses separate runtime enums to finish a flow.

## Scope verification and owner-review stop

Deliverable: only `docs/architecture/OTR_CAPTURE_END_TO_END_PRODUCT_FLOW.md`.
Flow 1–7 follow the latest owner decisions, including compose-before-submit,
whole-batch assessment and the immediate mature-actionable banner rule. APPROVED,
PROPOSED and OPEN are separated. Current support, conflicts/gaps and future owners
are explicit; accepted contracts remain authoritative for current implementation.

The four accepted Capture documents, all Core/Ledger/Import/Experience contracts
and `docs/CURRENT_IMPLEMENTATION_STATE.md` remain unchanged. No production code,
test, schema, migration, route, auth provider/configuration, AI runtime, notification
delivery, storage/sync behavior/configuration, dependency or runtime gate changes.
No new product implementation scope, ADR, deployment, remote access, commit or push.

Validation for this documentation-only checkpoint: required-flow/invariant/open-question
coverage, Markdown references, formatting/whitespace, unchanged tracked-file diff,
exact single-file Git scope and unchanged branch/HEAD. Runtime tests, UI guard and
device acceptance are not applicable and are not claimed.

**STOP FOR OWNER REVIEW. No implementation or contract reconciliation begins here.**
