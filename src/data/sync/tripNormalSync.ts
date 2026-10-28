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
};
export const cloudSourceP1QueueSql = `SELECT op.* FROM sync_operations op
       LEFT JOIN local_trip_containers trip ON trip.account_id=op.owner_user_id AND trip.id=op.trip_id
       JOIN trip_core_pending_intents intent ON intent.queue_operation_id=op.id AND intent.account_id=op.owner_user_id AND intent.trip_id=op.trip_id
       WHERE op.owner_user_id=? AND op.created_at>=? AND trip.create_operation_id IS NULL
       AND op.entity_type='TRIP_CORE_V2' AND op.operation_type='CORE_V2_COMMAND'
       AND op.status NOT IN ('FAILED','CONFLICT') AND (op.status<>'COMPLETED' OR (intent.state='APPLIED' AND intent.reconciled_revision IS NULL))
       ORDER BY op.created_at,op.id`;
export function cloudSourceP1Command(operation: Row): CoreCommand | null {
  try {
    const command = validateCoreCommand(JSON.parse(operation.payload_json));
    if (
      operation.entity_type !== "TRIP_CORE_V2" ||
      operation.operation_type !== "CORE_V2_COMMAND" ||
      operation.id !== operation.idempotency_key ||
      command.operationId !== operation.id ||
      command.tripId !== operation.trip_id ||
      command.target.id !== operation.entity_id ||
      command.target.kind !== "ITEM" ||
      !isReviewedSourceCreate(command)
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
    family: "P1" | "P3" | "P4",
  ): Promise<boolean>;
  participantsReady(tripId: string, command: CoreCommand): Promise<boolean>;
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
            if (
              operation.entity_type !== "TRIP_CORE_V2" ||
              command.operationId !== operation.id ||
              command.tripId !== row.trip_id ||
              command.target.id !== operation.entity_id ||
              command.target.kind !== "ITEM" ||
              (command.admission.mode !== "MANUAL" && !isReviewedSourceCreate(command))
            )
              continue;
            const manual =
              isReviewedSourceCreate(command) ||
              (command.command === "CREATE_ITEM"
                ? ["P1", "P3", "P4"].includes(
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
                (await deps.isManualItem(row.trip_id, command.target.id, "P4")));
            await guard();
            if (manual) {
              const ready = await deps.participantsReady(row.trip_id, command);
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
    // A reviewed Source can target an authorized cloud Trip without a local Create operation.
    const sourceRows = await deps.database.getAllAsync<Row>(
      cloudSourceP1QueueSql,
      scope.accountId,
      adopted.newTripsFrom,
    );
    await guard();
    for (const operation of sourceRows) {
      const command = cloudSourceP1Command(operation);
      if (!command) continue;
      try {
        const ready = await deps.participantsReady(operation.trip_id, command);
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
