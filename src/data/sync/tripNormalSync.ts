import type { CoreInstructionParentScope } from "@/domain/trip/tripCoreInstructionParent";
import {
  personCloudCreateKind,
  personCloudCreateSchema,
} from "@/domain/trip/tripPersonCloudCreate";
import type * as SQLite from "expo-sqlite";
import { z } from "zod";
import { structuredTripCreateRequestSchema } from "@/domain/trip/tripStructuredDestinationContract";
import { tripMetadataWireUpdateSchema } from "@/domain/trip/tripMetadataV2Contract";
import type { CoreCommand } from "@/domain/trip/tripCoreV2Commands";
import {
  validateCoreCommand,
  isReviewedSourceCreate,
} from "@/domain/trip/tripCoreV2Commands";
import type { TripCreateTarget } from "@/domain/trip/tripCreateContract";
import {
  captureAccountScope,
  assertAccountRequestContext,
} from "../auth/accountRequestContext";
import type { createTripDeferredMetadataRepository } from "../repositories/tripDeferredMetadataRepository";

export const normalTripSyncScopeSchema = z.strictObject({
  accountId: z.uuid(),
  newTripsFrom: z.iso.datetime(),
  manualOnly: z.boolean().optional(),
});
export type NormalTripSyncScope = z.infer<typeof normalTripSyncScopeSchema>;
type Row = {
  id: string;
  trip_id: string;
  entity_id: string;
  idempotency_key: string;
  entity_type: string;
  operation_type: string;
  payload_json: string;
  attempt_count?: number;
  intent_state?: string;
  status?: string;
  claim_owner?: string | null;
  last_attempt_at?: string | null;
};
export const cloudSourceP1QueueSql = `SELECT op.*,intent.state AS intent_state FROM sync_operations op
       LEFT JOIN local_trip_containers trip ON trip.account_id=op.owner_user_id AND trip.id=op.trip_id
       JOIN trip_core_pending_intents intent ON intent.queue_operation_id=op.id AND intent.account_id=op.owner_user_id AND intent.trip_id=op.trip_id
       WHERE op.owner_user_id=? AND op.created_at>=? AND trip.create_operation_id IS NULL
       AND op.entity_type='TRIP_CORE_V2' AND op.operation_type='CORE_V2_COMMAND'
       AND op.status NOT IN ('FAILED','CONFLICT') AND (op.status<>'COMPLETED' OR (intent.state='APPLIED' AND intent.reconciled_revision IS NULL))
       ORDER BY op.created_at,op.id`;
export function cloudSourceP1Command(operation: Row): CoreCommand | null {
  return cloudCommand(operation, false);
}
export const acceptedEditFamilies = ["P3", "P4", "P6"] as const;
export function isManualInstructionEditCommand(command: CoreCommand) {
  return (
    command.target.kind === "INSTRUCTION" &&
    command.admission.mode === "MANUAL" &&
    ["APPEND_INSTRUCTION", "CORRECT_INSTRUCTION"].includes(command.command)
  );
}
// Positive prior-claim evidence only selects original receipt recovery. Its
// absence is never proof that a new submission is allowed (in particular count0).
function instructionNeedsReceiptRecovery(operation: Row) {
  return (
    (operation.attempt_count ?? 0) > 0 ||
    operation.intent_state === "IN_FLIGHT" ||
    operation.status === "PROCESSING" ||
    !!operation.claim_owner ||
    !!operation.last_attempt_at
  );
}
function cloudManualInstructionCommand(operation: Row): CoreCommand | null {
  const command = cloudCommand(operation, true, true);
  return command && isManualInstructionEditCommand(command) ? command : null;
}

export function isManualLocalDocumentCommand(command: CoreCommand) {
  if (command.admission.mode !== "MANUAL") return false;
  if (command.command === "CREATE_DOCUMENT_METADATA") return command.target.kind === "DOCUMENT";
  if (command.command !== "RECONCILE_ITEM_DOCUMENTS" || command.target.kind !== "ITEM") return false;
  const payload = command.payload as { add: string[]; remove: string[] };
  return payload.add.length > 0 && payload.add.length <= 5 && payload.remove.length === 0 &&
    payload.add.every((id) => command.baseVector.some((base) => base.kind === "DOCUMENT" && base.id === id));
}

// The historical-Trip Review emits only private, self-owned P3/P6 creates.
export function cloudManualCreatePerson(command: CoreCommand): string | null {
  if (
    command.command !== "CREATE_ITEM" ||
    command.target.kind !== "ITEM" ||
    command.admission.mode !== "MANUAL" ||
    command.baseVector.length !== 1
  ) return null;
  const [base] = command.baseVector;
  if (base.kind !== "ITEM" || base.id !== command.target.id || base.revision !== null)
    return null;
  const { family, participation, acl } = command.payload as {
    family: string;
    participation: { mode: string; selfPersonId: string | null; people: unknown[] };
    acl: { visibility: string; people: unknown[] };
  };
  return (family === "P3" || family === "P6") &&
    participation.mode === "SELF" && participation.people.length === 0 &&
    acl.visibility === "PRIVATE" && acl.people.length === 0
    ? participation.selfPersonId
    : null;
}

export function isManualAcceptedEditCommand(
  command: CoreCommand,
  family?: (typeof acceptedEditFamilies)[number],
) {
  return (
    command.target.kind === "ITEM" &&
    command.admission.mode === "MANUAL" &&
    (["SET_ITEM_TEXT", "SET_ITEM_SCHEDULE", "SET_ITEM_PARTICIPATION"].includes(
      command.command,
    ) ||
      (family !== "P4" && command.command === "SET_ITEM_PLACE") ||
      ((family === undefined || family === "P3") &&
        command.command === "SET_STAY_DETAILS") ||
      ((family === undefined || family === "P4") &&
        command.command === "SET_RENTAL_DETAILS") ||
      ((family === undefined || family === "P6") &&
        command.command === "SET_ACTIVITY_DETAILS"))
  );
}
// Preserve the published P6-only helpers for existing consumers.
export function isManualP6EditCommand(command: CoreCommand) {
  return isManualAcceptedEditCommand(command, "P6");
}
export function cloudManualP6EditCommand(operation: Row): CoreCommand | null {
  const command = cloudCommand(operation, true);
  return command && isManualP6EditCommand(command) ? command : null;
}
function cloudCommand(
  operation: Row,
  manual: boolean,
  instruction = false,
): CoreCommand | null {
  try {
    const command = validateCoreCommand(JSON.parse(operation.payload_json));
    if (
      operation.entity_type !== "TRIP_CORE_V2" ||
      operation.operation_type !== "CORE_V2_COMMAND" ||
      operation.id !== operation.idempotency_key ||
      command.operationId !== operation.id ||
      command.tripId !== operation.trip_id ||
      command.target.id !== operation.entity_id ||
      (command.target.kind !== "ITEM" && !isManualLocalDocumentCommand(command) &&
        !(instruction && isManualInstructionEditCommand(command))) ||
      !(manual
        ? isManualAcceptedEditCommand(command) || isManualLocalDocumentCommand(command) ||
          !!cloudManualCreatePerson(command) ||
          (instruction && isManualInstructionEditCommand(command))
        : isReviewedSourceCreate(command))
    )
      return null;
    return command;
  } catch {
    return null;
  }
}

type Deps = {
  database: Pick<SQLite.SQLiteDatabase, "getAllAsync">;
  account(): Promise<string>;
  enabled(): boolean;
  deferred: Pick<
    ReturnType<typeof createTripDeferredMetadataRepository>,
    "materializeDeferredMetadata"
  >;
  recoverP1Readback(tripId: string): Promise<void>;
  recoverTripReadback(tripId: string, createOperationId: string): Promise<void>;
  runCreate(target: TripCreateTarget): Promise<unknown>;
  runMetadata(target: TripCreateTarget): Promise<unknown>;
  /** Existing Core worker must still enforce capabilities, Actor, Person and receipt contracts. */
  runP1(target: TripCreateTarget): Promise<unknown>;
  runPerson(target: TripCreateTarget): Promise<unknown>;
  isManualItem(
    tripId: string,
    itemId: string,
    family: "P1" | "P2" | "P3" | "P4" | "P5" | "P6",
  ): Promise<boolean>;
  participantsReady(tripId: string, command: CoreCommand): Promise<boolean>;
  // Separate integration switch, default absent/closed. Never a business capability.
  instructionSubmissionEnabled?(): boolean;
  resolveInstructionParent?(
    tripId: string,
    command: CoreCommand,
  ): Promise<CoreInstructionParentScope | null>;
};
// One wake composes existing exact-target runners; no timer, retry loop or historical replay.
export function createNormalTripSyncWake(deps: Deps, input: NormalTripSyncScope) {
  const adopted = normalTripSyncScopeSchema.parse(input);
  return async (authState: string) => {
    if (!deps.enabled() || authState !== "AUTHENTICATED_ONLINE")
      return { status: "closed" as const, runnerCalls: 0 };
    const scope = await captureAccountScope(deps.account);
    if (scope.accountId !== adopted.accountId) throw Error("TRIP_SYNC_ACCOUNT_MISMATCH");
    const guard = async () => {
      await assertAccountRequestContext(scope, deps.account);
      if (!deps.enabled()) throw Error("TRIP_SYNC_PORT_CLOSED");
    };
    const creates = await deps.database.getAllAsync<Row>(
      `SELECT op.* FROM local_trip_containers trip JOIN sync_operations op
       ON op.id=trip.create_operation_id AND op.owner_user_id=trip.account_id AND op.trip_id=trip.id
       WHERE trip.account_id=? AND trip.created_at>=? AND op.entity_type='TRIP' AND op.operation_type='CREATE_TRIP'
       ORDER BY trip.created_at,trip.id`,
      scope.accountId,
      adopted.newTripsFrom,
    );
    await guard();
    let runnerCalls = 0;
    const blockedTripIds: string[] = [];
    const tripIds: string[] = [];
    for (const row of creates) {
      // Unknown/V1 history remains retained, not silently upgraded or an all-queue parse failure.
      let request;
      try {
        request = structuredTripCreateRequestSchema.safeParse({
          ...JSON.parse(row.payload_json),
          operationId: row.id,
        });
      } catch {
        continue;
      }
      if (
        !request.success ||
        request.data.tripId !== row.trip_id ||
        row.entity_id !== row.trip_id ||
        row.idempotency_key !== row.id
      )
        continue;
      tripIds.push(row.trip_id);
      const target = {
        accountId: scope.accountId,
        tripId: row.trip_id,
        operationId: row.id,
      };
      try {
        await guard();
        await deps.runCreate(target);
        await guard();
        runnerCalls++;
        try {
          await deps.recoverTripReadback(row.trip_id, row.id);
          await guard();
          await deps.deferred.materializeDeferredMetadata(row.trip_id);
          await deps.recoverP1Readback(row.trip_id);
        } catch {
          await guard();
          blockedTripIds.push(row.trip_id);
          continue;
        }
        await guard();
        const pending = await deps.database.getAllAsync<Row>(
          "SELECT * FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND status NOT IN ('COMPLETED','FAILED','CONFLICT') AND operation_type IN ('UPDATE_TRIP_METADATA','TRIP_PERSON_CLOUD_CREATE','CORE_V2_COMMAND') ORDER BY created_at,rowid",
          scope.accountId,
          row.trip_id,
        );
        await guard();
        for (const operation of pending) {
          const selected = { ...target, operationId: operation.id };
          if (operation.idempotency_key !== operation.id) continue;
          if (operation.operation_type === "UPDATE_TRIP_METADATA") {
            let wire;
            try {
              wire = tripMetadataWireUpdateSchema.safeParse(
                JSON.parse(operation.payload_json),
              );
            } catch {
              continue;
            }
            if (
              !wire.success ||
              !("formatVersion" in wire.data) ||
              wire.data.formatVersion !== 3 ||
              wire.data.tripId !== row.trip_id ||
              wire.data.operationId !== operation.id ||
              operation.entity_id !== row.trip_id ||
              operation.entity_type !== "TRIP"
            )
              continue;
            await guard();
            await deps.runMetadata(selected);
            await guard();
            await deps.recoverTripReadback(row.trip_id, row.id);
            await guard();
            runnerCalls++;
          } else if (operation.operation_type === personCloudCreateKind) {
            let person;
            try {
              person = personCloudCreateSchema.parse(JSON.parse(operation.payload_json));
            } catch {
              continue;
            }
            if (
              operation.entity_type !== "TRIP_PERSON" ||
              person.operationId !== operation.id ||
              person.tripId !== row.trip_id ||
              person.personId !== operation.entity_id ||
              person.tripCreateOperationId !== row.id
            )
              continue;
            await guard();
            await deps.runPerson(selected);
            await guard();
            runnerCalls++;
          } else {
            let command;
            try {
              command = validateCoreCommand(JSON.parse(operation.payload_json));
            } catch {
              continue;
            }
            const instruction = isManualInstructionEditCommand(command);
            const recoveringInstruction =
              instruction &&
              !!deps.instructionSubmissionEnabled?.() &&
              instructionNeedsReceiptRecovery(operation);
            if (
              operation.entity_type !== "TRIP_CORE_V2" ||
              command.operationId !== operation.id ||
              command.tripId !== row.trip_id ||
              command.target.id !== operation.entity_id ||
              (command.target.kind !== "ITEM" && !isManualLocalDocumentCommand(command) &&
                !(instruction && deps.instructionSubmissionEnabled?.())) ||
              (command.admission.mode !== "MANUAL" && !isReviewedSourceCreate(command)) ||
              (adopted.manualOnly === true && command.admission.mode !== "MANUAL")
            )
              continue;
            const instructionScope =
              instruction &&
              !recoveringInstruction &&
              deps.instructionSubmissionEnabled?.()
                ? await deps.resolveInstructionParent?.(row.trip_id, command)
                : null;
            const manual =
              (instruction &&
                (recoveringInstruction ||
                  (instructionScope?.family === "P3" &&
                    ["ARRIVAL", "DEPARTURE"].includes(instructionScope.section) &&
                    (await deps.isManualItem(
                      row.trip_id,
                      instructionScope.parentItemId,
                      "P3",
                    ))))) ||
              isReviewedSourceCreate(command) || isManualLocalDocumentCommand(command) ||
              (command.admission.mode === "MANUAL" &&
                command.command === "CREATE_SPARSE_FLIGHT") ||
              (command.admission.mode === "MANUAL" &&
                ["SET_AUTHORED_FLIGHT_DETAILS", "SET_ITEM_PARTICIPATION"].includes(
                  command.command,
                ) &&
                (await deps.isManualItem(row.trip_id, command.target.id, "P2"))) ||
              (command.command === "CREATE_ITEM"
                ? ["P1", "P3", "P4", "P5", "P6"].includes(
                    (command.payload as { family: string }).family,
                  )
                : [
                    "SET_ITEM_TEXT",
                    "SET_ITEM_SCHEDULE",
                    "SET_ITEM_PLACE",
                    "SET_ITEM_PARTICIPATION",
                  ].includes(command.command) &&
                  (await deps.isManualItem(row.trip_id, command.target.id, "P1"))) ||
              ([
                "SET_ITEM_TEXT",
                "SET_ITEM_SCHEDULE",
                "SET_ITEM_PLACE",
                "SET_ITEM_PARTICIPATION",
                "SET_STAY_DETAILS",
              ].includes(command.command) &&
                command.admission.mode === "MANUAL" &&
                (await deps.isManualItem(row.trip_id, command.target.id, "P3"))) ||
              ([
                "SET_ITEM_TEXT",
                "SET_ITEM_SCHEDULE",
                "SET_ITEM_PARTICIPATION",
                "SET_RENTAL_DETAILS",
              ].includes(command.command) &&
                command.admission.mode === "MANUAL" &&
                (await deps.isManualItem(row.trip_id, command.target.id, "P4"))) ||
              ([
                "SET_ITEM_TEXT",
                "SET_ITEM_PARTICIPATION",
                "SET_TRANSPORT_DETAILS",
              ].includes(command.command) &&
                command.admission.mode === "MANUAL" &&
                (await deps.isManualItem(row.trip_id, command.target.id, "P5"))) ||
              ([
                "SET_ITEM_TEXT",
                "SET_ITEM_SCHEDULE",
                "SET_ITEM_PLACE",
                "SET_ITEM_PARTICIPATION",
                "SET_ACTIVITY_DETAILS",
              ].includes(command.command) &&
                command.admission.mode === "MANUAL" &&
                (await deps.isManualItem(row.trip_id, command.target.id, "P6")));
            await guard();
            if (manual) {
              const ready =
                recoveringInstruction ||
                (await deps.participantsReady(row.trip_id, command));
              await guard();
              if (ready) {
                await deps.runP1(selected);
                await guard();
                runnerCalls++;
              }
            }
          }
        }
      } catch {
        await guard(); // Security/account revocation remains a fatal fence, never a per-Trip fallback.
        if (!blockedTripIds.includes(row.trip_id)) blockedTripIds.push(row.trip_id);
      }
    }
    // Authorized cloud-only Manual and reviewed Source commands reuse the exact existing queue.
    const sourceRows = await deps.database.getAllAsync<Row>(
      cloudSourceP1QueueSql,
      scope.accountId,
      adopted.newTripsFrom,
    );
    await guard();
    for (const operation of sourceRows) {
      const instruction = deps.instructionSubmissionEnabled?.()
        ? cloudManualInstructionCommand(operation)
        : null;
      const manual = cloudCommand(operation, true) ?? instruction;
      const command =
        manual ?? (adopted.manualOnly ? null : cloudSourceP1Command(operation));
      if (!command) continue;
      try {
        // Retained attempts reach receipt/status recovery even after the target disappears.
        const recovering =
          !!manual &&
          ((operation.attempt_count ?? 0) > 0 ||
            operation.intent_state === "IN_FLIGHT" ||
            (!!instruction && instructionNeedsReceiptRecovery(operation)));
        if (instruction && !recovering) {
          const parent = await deps.resolveInstructionParent?.(
            operation.trip_id,
            instruction,
          );
          if (
            !parent ||
            parent.family !== "P3" ||
            !["ARRIVAL", "DEPARTURE"].includes(parent.section) ||
            !(await deps.isManualItem(operation.trip_id, parent.parentItemId, "P3"))
          )
            continue;
        } else if (manual && !recovering &&
          !isManualLocalDocumentCommand(command) && !cloudManualCreatePerson(command)) {
          let eligible = false;
          for (const family of acceptedEditFamilies) {
            if (
              isManualAcceptedEditCommand(command, family) &&
              (await deps.isManualItem(operation.trip_id, command.target.id, family))
            ) {
              eligible = true;
              break;
            }
          }
          if (!eligible) continue;
        }
        await guard();
        const ready =
          recovering || (await deps.participantsReady(operation.trip_id, command));
        await guard();
        if (!ready) continue;
        await deps.runP1({
          accountId: scope.accountId,
          tripId: operation.trip_id,
          operationId: operation.id,
        });
        await guard();
        runnerCalls++;
        if (!tripIds.includes(operation.trip_id)) tripIds.push(operation.trip_id);
      } catch {
        await guard();
        if (!blockedTripIds.includes(operation.trip_id))
          blockedTripIds.push(operation.trip_id);
      }
    }
    return { status: "ready" as const, runnerCalls, blockedTripIds, tripIds };
  };
}
