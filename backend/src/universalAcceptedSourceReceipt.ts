import type { CorePgLease } from "./tripCoreV2PgStorage";
import type { CoreSourceScopeV2, CoreSourceStoredSlotV2 } from "./tripCoreV2Source";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
const json = (value: unknown) => canonicalCoreJson(value as Json);
// This grants no Create capability: only an existing exact accepted receipt may finish its Source journal.
export async function hasAcceptedUniversalSourceReceipt(
  lease: CorePgLease,
  scope: CoreSourceScopeV2,
  slot: CoreSourceStoredSlotV2,
) {
  if (
    !slot.receipt ||
    !slot.domainReceiptId ||
    !slot.intentSha256 ||
    !["DOMAIN_SUCCEEDED", "EVIDENCE_PENDING", "COMPLETE"].includes(slot.state) ||
    !["APPLIED", "NO_CHANGE"].includes(slot.receipt.outcome)
  )
    return false;
  const row = (
    await lease.query(
      `SELECT EXISTS(SELECT 1 FROM public.trip_source_core_v2_slots s
     JOIN public.trip_core_command_receipts r ON r.actor_account_id=s.account_id AND r.trip_id=s.trip_id AND r.operation_id=s.operation_id AND r.intent_sha256=s.intent_sha256
     WHERE s.account_id=$1::uuid AND s.trip_id=$2::uuid AND s.source_id=$3::uuid
     AND s.output_slot_id=$4::uuid AND s.operation_id=$5::uuid AND s.target_kind='ITEM' AND s.target_id=$6::uuid
     AND s.intent_sha256=$7 AND r.id=$8::uuid AND r.receipt_sha256=$9 AND r.body=$10::jsonb
     AND s.plan_id=$11::uuid AND s.candidate_id=$12::uuid
     AND (s.domain_receipt_id IS NULL OR s.domain_receipt_id=r.id)
     AND r.outcome IN ('APPLIED','NO_CHANGE') AND r.body->>'command'=s.command
     AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.body->'targetVector') v WHERE v->>'kind'='ITEM' AND v->>'id'=s.target_id::text AND (v->>'committedRevision')::bigint>0)) AS accepted`,
      [
        scope.actorAccountId,
        scope.tripId,
        scope.sourceId,
        slot.proposed.slotId,
        slot.proposed.operationId,
        slot.proposed.target.id,
        slot.intentSha256,
        slot.domainReceiptId,
        slot.receipt.receiptSha256,
        json(slot.receipt),
        scope.planId,
        slot.proposed.candidateId,
      ],
    )
  ).rows[0];
  return row?.accepted === true;
}

type ReceiptRead = { scope: CoreSourceScopeV2; slot: CoreSourceStoredSlotV2 };
const receiptReads = new WeakMap<CorePgLease, ReceiptRead>();
async function currentCoreScope(lease: CorePgLease, scope: CoreSourceScopeV2) {
  const identity = (
    await lease.query(
      "SELECT session_user AS principal,current_user AS role,current_setting('otr.core.actor',true) AS actor,current_setting('otr.core.trip',true) AS trip",
    )
  ).rows[0];
  return (
    identity?.principal === "otr_trip_core_v2_gateway" &&
    identity.role === "otr_trip_core_v2_writer" &&
    identity.actor === scope.actorAccountId &&
    identity.trip === scope.tripId
  );
}
// Only the existing finalization catalog read is wrapped. No SQL capability is changed.
export async function withAcceptedUniversalReceiptRead<T>(
  lease: CorePgLease,
  scope: CoreSourceScopeV2,
  slot: CoreSourceStoredSlotV2,
  work: () => Promise<T>,
) {
  if (receiptReads.has(lease)) throw Error("CORE_SCOPE_MISMATCH");
  if (!slot.p1 || !(await hasAcceptedUniversalSourceReceipt(lease, scope, slot)))
    return work();
  if (!(await currentCoreScope(lease, scope))) throw Error("CORE_SCOPE_MISMATCH");
  receiptReads.set(lease, structuredClone({ scope, slot }));
  try {
    return await work();
  } finally {
    receiptReads.delete(lease);
  }
}
export async function hasAcceptedUniversalReceiptRead(
  lease: CorePgLease,
  actor: string,
  trip: string,
) {
  const read = receiptReads.get(lease);
  if (
    !read ||
    read.scope.actorAccountId !== actor ||
    read.scope.tripId !== trip ||
    !(await currentCoreScope(lease, read.scope))
  )
    return false;
  return hasAcceptedUniversalSourceReceipt(lease, read.scope, read.slot);
}
