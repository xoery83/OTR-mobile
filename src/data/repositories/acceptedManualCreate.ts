import type { AccountRequestContext } from "../auth/accountRequestContext";
import type { CoreDatabase } from "./tripCoreV2Repository";
import { validateCoreCommand } from "@/domain/trip/tripCoreV2Commands";
import { validateCoreReceipt } from "@/domain/trip/tripCoreV2Receipt";
import { coreHashValue } from "@/domain/trip/tripCoreV2Read";
import { tripCoreSha256Hex } from "./tripCoreSha256";
// Retained exact MANUAL Create provenance only; caller owns transaction, Actor and revision fences.
export async function hasAcceptedManualCreate(
  database: Pick<CoreDatabase, "getAllAsync">,
  context: AccountRequestContext,
  itemId: string,
  family: "P1" | "P3" | "P4" | "P5" | "P6",
) {
  const rows = await database.getAllAsync<{
    operation_id: string;
    canonical_intent_text: string;
    intent_sha256: string;
    payload_json: string;
    body_json: string;
    receipt_sha256: string;
  }>(
    `SELECT i.operation_id,i.canonical_intent_text,i.intent_sha256,op.payload_json,r.body_json,r.receipt_sha256
       FROM trip_core_pending_intents i JOIN sync_operations op ON op.id=i.queue_operation_id
       AND op.owner_user_id=i.account_id AND op.trip_id=i.trip_id AND op.entity_id=?
       AND op.entity_type='TRIP_CORE_V2' AND op.operation_type='CORE_V2_COMMAND'
       AND op.idempotency_key=i.operation_id AND op.id=i.operation_id AND op.status='COMPLETED'
       JOIN trip_core_trip_core_command_receipts r ON r.account_id=i.account_id AND r.trip_id=i.trip_id
       AND r.operation_id=i.operation_id AND r.intent_sha256=i.intent_sha256
       WHERE i.account_id=? AND i.trip_id=? AND i.state='APPLIED' AND i.reconciled_revision IS NOT NULL`,
    itemId,
    context.accountId,
    context.tripId,
  );
  for (const row of rows) {
    const command = validateCoreCommand(JSON.parse(row.canonical_intent_text));
    if (
      command.command !== "CREATE_ITEM" ||
      command.admission.mode !== "MANUAL" ||
      command.target.id !== itemId ||
      command.tripId !== context.tripId ||
      (command.payload as { family?: string }).family !== family
    )
      continue;
    const receipt = await validateCoreReceipt(
      JSON.parse(row.body_json),
      tripCoreSha256Hex,
    );
    if (
      command.operationId === row.operation_id &&
      row.payload_json === row.canonical_intent_text &&
      (await coreHashValue(
        "otr-trip-core-intent-v2",
        command,
        tripCoreSha256Hex,
      )) === row.intent_sha256 &&
      receipt.actorAccountId === context.accountId &&
      receipt.tripId === context.tripId &&
      receipt.operationId === command.operationId &&
      receipt.command === "CREATE_ITEM" &&
      receipt.intentSha256 === row.intent_sha256 &&
      receipt.receiptSha256 === row.receipt_sha256 &&
      receipt.outcome === "APPLIED"
    )
      return true;
  }
  return false;
}
