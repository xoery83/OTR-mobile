import {
  assertAccountRequestContext,
  captureAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  participationCommandSchema,
  participationIntentBytes,
  participationOperationType,
  type ParticipationCommand,
} from "@/domain/trip/personParticipationCommand";
import { hashTripPersonBytes } from "./tripPersonCertificate";
import type { LedgerReadDatabase } from "./ledgerReadRepository";
export function createTripPersonParticipationPendingRepository(
  database: LedgerReadDatabase,
  getUserId: () => Promise<string>,
) {
  async function validate(command: ParticipationCommand, context: AccountRequestContext) {
    if (
      context.accountId !== command.actorUserId ||
      context.tripId !== command.tripId ||
      (await hashTripPersonBytes(participationIntentBytes(command))) !==
        command.intentDigest
    )
      throw new Error("Participation intent binding mismatch.");
    await assertAccountRequestContext(context, getUserId);
  }
  async function read(operationId: string, context: AccountRequestContext) {
    const row = await database.getFirstAsync<{
      owner: string;
      trip: string;
      person: string;
      kind: string;
      entity: string;
      key: string;
      payload: string;
      base: number | null;
    }>(
      "SELECT owner_user_id AS owner,trip_id AS trip,entity_id AS person,operation_type AS kind,entity_type AS entity,idempotency_key AS key,payload_json AS payload,base_version AS base FROM sync_operations WHERE id=?",
      operationId,
    );
    if (!row) return null;
    const command = participationCommandSchema.parse(JSON.parse(row.payload));
    await validate(command, context);
    if (
      row.owner !== context.accountId ||
      row.trip !== context.tripId ||
      row.person !== command.personId ||
      row.kind !== participationOperationType ||
      row.entity !== "TRIP_PERSON" ||
      row.key !== operationId ||
      row.base !== command.expectedParticipation.revision ||
      command.operationId !== operationId
    )
      throw new Error("Participation stored operation mismatch.");
    return command;
  }
  return {
    async retain(input: ParticipationCommand, context?: AccountRequestContext) {
      const command = participationCommandSchema.parse(input);
      const captured =
        context ?? (await captureAccountRequestContext(command.tripId, getUserId));
      await validate(command, captured);
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          await assertAccountRequestContext(captured, getUserId);
          const existing = await read(command.operationId, captured);
          if (existing) {
            if (
              participationIntentBytes(existing) !== participationIntentBytes(command) ||
              existing.intentDigest !== command.intentDigest
            )
              throw new Error("Participation key reused with changed intent.");
          } else {
            const unresolved = await database.getFirstAsync<{ id: string }>(
              "SELECT id FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND entity_type='TRIP_PERSON' AND entity_id=? AND operation_type=? AND status NOT IN ('COMPLETED','CONFLICT') LIMIT 1",
              captured.accountId,
              command.tripId,
              command.personId,
              participationOperationType,
            );
            if (unresolved)
              throw new Error("Participation prior operation remains unresolved.");
            const now = new Date().toISOString();
            // Explicit closed capability hold. No dependency means the existing
            // dependency wake logic cannot promote it; no timer/queue announcement.
            await database.runAsync(
              `INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,base_version,payload_json,owner_user_id,status,attempt_count,next_attempt_at,created_at,updated_at,last_error_code,failure_category)
            VALUES(?,?,'TRIP_PERSON',?,?,?,?,?,?,'DEPENDENCY_BLOCKED',0,NULL,?,?,'PARTICIPATION_COMMANDS_DISABLED','DEPENDENCY')`,
              command.operationId,
              command.tripId,
              command.personId,
              participationOperationType,
              command.operationId,
              command.expectedParticipation.revision,
              JSON.stringify(command),
              captured.accountId,
              now,
              now,
            );
          }
          await assertAccountRequestContext(captured, getUserId);
        }),
      );
      return { context: captured, command };
    },
    async load(tripId: string, operationId: string) {
      participationCommandSchema.shape.tripId.parse(tripId);
      participationCommandSchema.shape.operationId.parse(operationId);
      const context = await captureAccountRequestContext(tripId, getUserId);
      let command: ParticipationCommand | null = null;
      await withAccountApplyGate(async () => {
        command = await read(operationId, context);
        await assertAccountRequestContext(context, getUserId);
      });
      if (!command) throw new Error("Participation operation is unavailable.");
      return { context, command: command as ParticipationCommand };
    },
  };
}
