# Self Trip Nickname — Root1 semantic supplement for Root2

Request: `AUTH-C03-TRIP-NICKNAME-OWNING-PORT-20261105-01`. Fixed product candidate: `33de92963d1396f462dd40de7e64be2b674f2383`; reviewed SQL SHA `f512abd58f33aadea9a6e26b36d2564ef0d7929b760518c70d38a0bb974aca63`. This supplement changes **documentation only**. Existing author23 isolated PG and independent14 Adapter evidence are reused; no new execution or Hosted check is claimed.

Root2 return references supplied by parent: `SOURCE_QUALIFICATION_RETURN` SHA `5c11044881e564dbdb2097b883f062fce35c48e159ae0742838b11798f78cf75`; `MINIMUM_METADATA_QUERY_PLAN` SHA `1fb3d070d67372343fdb140a103f7ba236575a207578cf5cffc9a2639158dcdb`. Their OPS paths/content were not available to this author and are not invented here.

## 1. Named nickname writers and counter semantics

These are **static source observations**, not a complete inventory of actual installed functions, dynamic SQL, effective grants or every future writer. Root2 must reconcile actual catalog definitions and triggers against them. `journey_members.display_name` remains the sole Trip nickname; no private Account Profile value is another authority for it.

| Exact source / function | Actual name write | Effect after the new trigger |
|---|---|---|
| `backend/sql/tripPersonSelfNickname.sql:90–175`, `trip_person_self_nickname`, EXECUTE | Existing current linked-self row only; `display_name=desired`, `updated_at=at_time` | Correct base and changed value: exact immutable same-transaction receipt precedes UPDATE, counter advances once. Null Clear stores `''`; no Profile fallback. Equal value: UNCHANGED receipt, no UPDATE/counter advance. |
| `supabase/migrations/20260910000100_canonical_production_baseline.sql:2042–2133`, `claim_email_invited_journeys()`; assignment at2110 | Its existing selector is `status IN ('unlinked','invite_pending')`; fills blank from profile/Traveler while linking | Previously unlinked/invite_pending actual name change advances counter once, under the existing function's separate ACL/Claim semantics. It grants the nickname RPC no email matching. It cannot select an already-linked cleared name. This is a historical source path, not a claim the function remains callable in DEV. |
| `supabase/migrations/20260913000500_ledger_stage_9_import.sql:4,69–76`, `ledger_import_stage9_v1(...)` | Replaces the auto-created Owner row's ID/name/role/status during historical import | Auto-created Owner is already linked; a changed name/identity without canonical same-transaction nickname witness is rejected. No privileged fixture exception is added. Unchanged name does not bump the counter. |
| `supabase/migrations/20260914000100_ledger_ui_polish_fixture.sql:3,74–81`, `ledger_create_ui_polish_fixture_v1(...)` | Same existing Owner-row replacement pattern for synthetic UI fixture | Same linked-row rejection/no new authority. These historical fixture functions must not be treated as ordinary nickname producers. |
| `supabase/dev-forward/trip-sustained-sync/20261024000300_trip_person_cloud_create.sql:50–51`, `trip_person_cloud_create_command(...)` | INSERT of an unlinked Person with explicit name | New counter default0; trigger rejects a nonzero caller-provided initial revision. No Account linking implied. |
| Baseline Trip-owner INSERT triggers and other existing Person INSERT producers | Initial name at Person birth, not an UPDATE/revision CAS | Initial counter0. Installed INSERT producers must be catalog-checked, not silently granted permission by this supplement. |

Direct named **non-name writers** are relevant compatibility boundaries:

- `docs/ops/auth-c04-20261103/pg-candidate/MEMBER_CLAIM_CANDIDATE.sql`, `trip_member_claim_transaction`, CLAIM update183: only `user_id/status/linked_at/updated_at`; linked replay uses existing receipt/identity. No name change, no nickname revision bump. The approved Claim body is not rewritten by this candidate.
- Baseline `accept_journey_invite` update1996, `claim_journey_member` update2183, and `update_own_journey_member_notes` update2538: link/role/notes effects are not nickname authority. No new nickname permission is inferred from their existence.
- `trip_person_set_participation` (`supabase/migrations/20261004000600_trip_person_command_foundation.sql:297`) updates only participation fields; nickname revision is not participation revision. Normal nickname self-access does not require `participation_active=true`.

The new transition guard (`tripPersonSelfNickname.sql:47–76`) requires the incoming UPDATE counter equal the old counter. Unchanged names preserve it; actual changes reject overflow and increment exactly once. Old unlinked/invite_pending name changes preserve their independent original ACL. Already-linked changes require precise current-transaction actor/Trip/Person/prior/result receipt witness and unchanged linked Account identity. Counter/Receipt checks do not themselves grant UPDATE. SQL may reject an incompatible legacy name change; no renderer is authorized to drop that guard to keep a fixture working.

## 2. Exact nickname predicate and shared-Gate gap

A NEW nickname mutation requires **all** of these predicates, not merely a feature bit:

1. `current_user=postgres`, `session_user=otr_trip_core_v2_gateway`; exact nonnull Actor/Trip/Person and supported method/strict payload.
2. Existing `trip_sustained_core_read_scope_allowed(actor,trip)` true: actual existing normal role graph, trusted transaction Actor/Trip settings, registered non-guest/nonbanned Account, no removed-user denial, supported rolled-out Trip and unique current linked membership. The actual helper body/ACL remains a Root2 dependency, not a name-only trust assumption.
3. Target row is precisely `id=person AND trip_id=trip AND user_id=actor AND status='linked'`. Owner/Organizer status is not a substitute. Revalidated under the owning locks.
4. After exact original-operation replay lookup, `trip_person_nickname_write_scope(actor,trip)` requires `gate.self_nickname_enabled=true`, exact existing `scope_actor_account_id/ scope_trip_id`, finite `scope_started_at/scope_expires_at`, and `started_at <= clock_timestamp() < expires_at`. Checked before NEW processing and again after row/receipt work; a failure aborts the transaction.
5. Strict command/Actor-bound canonical digest and nickname-specific expected revision. Neither Account-private Profile revision, participation revision, access revision, UI draft flags nor a queue attempt count qualifies this CAS.

The nickname helper intentionally **does not set or require** `runtime_enabled`, `enabled_commands`, `enabled_families`, `enabled_admission_modes`, `member_revoke_enabled` or Import policy bits. Source installation defaults the new bit false and grants no EXECUTE.

| Known existing shared-state consumer | Known source predicate / why Root2 must preserve it |
|---|---|
| `trip_core_finite_scope_allowed` in `supabase/dev-forward/core-v2/20261014000300_trip_core_v2_finite_activation_contract.sql:22–39` | Gate `runtime_enabled` plus matching Actor/Trip/time, role graph; later sustained patch can also admit via `trip_sustained_dev_scope_allowed(...,'CORE')`. Changing the existing runtime bit/scope may affect old Core authority. |
| `trip_core_guard_write` and `trip_core_service_statement_guard` (`20261011000100_trip_core_v2_foundation.sql:809`, `20261011000200_trip_core_v2_version_dispatch.sql:66–70`; sustained patch131–133) | Existing writer checks include the same row's runtime bit, or a separately qualified sustained path. Their complete installed bodies and other command/family/admission checks must be pinned; the nickname bit does not replace those checks. |
| `backend/src/tripSustainedGate.ts:5–35` and `tripNormalP1Policy.ts` | Non-sustained readers consume the row's command/family/admission arrays. P1 Manual accepts its five exact names; P3/P4/P5/P6/Sparse P2 profiles add family-specific commands. Reviewed Source profiles are separate. A Runtime/array change to satisfy a nickname window must not expand these profiles. These readers recognize profiles; they do not create DB authority. |
| `trip_core_member_scope_allowed`, `backend/sql/tripCoreMemberAccess.sql:16–25` | Same Actor/Trip/time columns plus independent `member_revoke_enabled`; leave its effective capability unchanged. If another protected session uses this row, Root2 must arbitrate that shared resource. |
| `trip_sustained_core_capabilities` (`20261024000200_trip_sustained_dev.sql:74–80`) | Source version returns a Manual P1 profile from separately qualified sustained policy, even independently of the row's runtime bit. Later family profiles must be catalog-pinned. Nickname activation must not alter sustained policy. |
| `trip_sustained_import_p1_capabilities` (`backend/sql/universal_p1_source_admission_candidate.sql:5–17`, later P2/continuous candidates) | Independent enabled Import policy/exact review scope/expiry and other prerequisites. The nickname bit is not a Source/Admission permission. Actual installed version must remain unchanged. |

**Unique unresolved nickname-only activation gap:** the historical `finite_core_scope_contract` (`20261014000300…:15–20`) requires all shared scope fields NULL when `runtime_enabled=false`; its active finite arm sets `runtime_enabled=true` and a `CREATE_ITEM/P1,P3/MANUAL` profile. The later normal-dev arm (`supabase/dev-forward/trip-normal-sync/20261024000100_trip_normal_dev_scope.sql:37–45`) allows another Manual P1 profile, not a nickname-only false-runtime scope. The nickname candidate does not alter this constraint. The minimal23 PG fixture did not install this full parent constraint and cannot prove a realizable isolated activation row.

Therefore **SOURCE_QUALIFICATION is incomplete for activation** until Root2 pins the actual complete constraint and effective shared predicates and can prove a valid bounded nickname-only row without newly enabling any unrelated command. Do not set `runtime_enabled=true` or fill Manual/Reviewed arrays merely to make an old constraint pass. If the actual installed constraint has the stated incompatibility, return its exact hash/constraint expression to Root1 for a separately reviewed minimal owning difference; this document does not authorize or design that change. Existing already-authorized ordinary Core capabilities need not be globally disabled: the required invariant is **no new non-nickname capability relative to the qualified preimage**.

## 3. Original operation, transaction and recovery boundaries

| Observation | Allowed meaning / action |
|---|---|
| Local pending intent | Client draft/queue fact only; no server receipt or actual nickname revision may be invented. Auth owns its existing consumer state, not this connector. |
| APPLIED receipt | Original operation atomically changed the name and incremented nickname revision once. It is historical accepted truth; later changes may exist. |
| UNCHANGED / REVISION_CONFLICT receipt | Terminal original request result with no name/counter change. A conflict is not automatic permission to rebase/reissue under another ID. |
| Identical EXECUTE replay | Same Actor/operation/Trip/Person/full payload returns the original receipt with `idempotentReplay=true`; changed payload fails `23505`. Replay follows current self access but precedes the NEW-write-bit check. It does not mutate after closure. |
| RECEIPT / EXACT_RECEIPT | Query only original operation+digest+current Actor/Trip/Person. The strict reply has no mutation replay flag and is not a fresh current-state observation. |
| ABSENT_UNCONFIRMED, timeout, 404/503, failed/lost COMMIT | Does not prove NoCommit or authorize replacement write. Preserve original ID/digest/UNKNOWN and query the same operation under existing recovery policy. No reset, automatic model call or replacement identity. Queue count0 is not never-submitted evidence. |
| READ | A separate current nickname/revision observation, not validation that the last submitted operation caused it. A matching visible name cannot settle UNKNOWN. |

The PG connector (`backend/src/tripPersonSelfNicknamePg.ts:42–110`) uses one existing lease: BEGIN → existing transaction Actor/Trip binding → single fixed RPC → strict response binding/validation → COMMIT. Failure requests ROLLBACK, retires the lease if rollback fails, returns a sanitized failure, and does not retry. A response received before an uncertain COMMIT is not a delivered APPLIED fact.

The RPC (`tripPersonSelfNickname.sql:103–175`) locks the Trip `FOR UPDATE` for EXECUTE and `FOR SHARE` for READ/RECEIPT. It checks the real self link, then serializes Actor+original-operation identity with an advisory transaction lock. NEW processing locks the gate `FOR SHARE`, target Person `FOR UPDATE`, revalidates access, inserts the immutable receipt and updates the name in the **same** transaction. The before-update guard uses that exact transaction witness; neither receipt nor row survives rollback alone. Distinct same-base operations serialize to one APPLIED and one conflict; identical operations return one receipt. Existing Claim/Member Revoke Trip-lock protocols are dependencies; actual trigger order/deadlock/error handling must be qualified. A deadlock/timeout is failure/rollback, not permission for an automatic new operation.

Closing **only** the nickname write bit leaves READ, original RECEIPT and identical original replay available if actual current normal self access still exists. Revoked/removed/unlinked/ambiguous Account identity denies them; closure is not a bypass of revocation. Other global normal-read policy or role revocation may legitimately deny access. Accepted receipts/counter facts must remain stored regardless. Installing an old runtime/rollback that drops the compatible reader/guard or resets accepted history is not authorized.

## 4. Root1 / Root2 handoff boundary

Root1 has fixed canonical command/digest/receipt, source transaction/guard/counter semantics, direct Adapter and scoped source Review. Author23/independent14 evidence proves only the declared local scope. No new SQL, Runtime, Grant or authorization has been executed for this supplement.

Root2 must independently pin actual DEV identities and catalog preimages: function bodies/config/Owner/ACL (normal read helper and canonical time/hash/key dependencies included), role graph/session constraints, table/schema/default privileges, all effective name writers and trigger order, immutable accepted-history presence, complete Gate constraints and before/after non-nickname capability predicates. It must then prepare the exact protected install/close/rollback package and obtain its required authorization. New RPC EXECUTE is not inherited from software deployment; source installation alone grants none. Qualified rollback must retain accepted receipts/compatible readers and refuse history deletion/reset.

This source supplement supplies semantics for that work; it is **not** `READY_INSTALL`, an activation row, a Runtime switch design, a permission renewal, a Hosted PASS or an instruction to repeat historical E2E.
