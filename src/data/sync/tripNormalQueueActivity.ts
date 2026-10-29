import type * as SQLite from "expo-sqlite";
import {
  cloudSourceP1QueueSql,
  cloudSourceP1Command,
  normalTripSyncScopeSchema,
  type NormalTripSyncScope,
} from "./tripNormalSync";
import { structuredTripCreateRequestSchema } from "@/domain/trip/tripStructuredDestinationContract";
import { tripMetadataWireUpdateSchema } from "@/domain/trip/tripMetadataV2Contract";
import {
  personCloudCreateKind,
  personCloudCreateSchema,
} from "@/domain/trip/tripPersonCloudCreate";
import { retainedDeferredTripMetadataSchema } from "@/domain/trip/tripDeferredMetadata";
import {
  validateCoreCommand,
  isReviewedSourceCreate,
} from "@/domain/trip/tripCoreV2Commands";
import { readTripMetadataConfirmation } from "../repositories/tripMetadataConfirmation";
import { createTripPersonRepository } from "../repositories/tripPersonRepository";
import { p1SharedParticipantsReady } from "./p1SharedParticipantQualification";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
type Database = Pick<SQLite.SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;
type Row = {
  id: string;
  trip_id: string;
  entity_type: string;
  entity_id: string;
  operation_type: string;
  idempotency_key: string;
  payload_json: string;
  status: string;
  failure_category: string | null;
  dependency_operation_id: string | null;
  next_attempt_at: string | null;
  last_error_code: string | null;
  lease_expires_at: string | null;
};
const json = (v: unknown) => canonicalCoreJson(v as Json);
// Pure owning selection. The existing operational scheduler remains the only timer/retry owner.
export async function getNormalTripQueueActivity(
  database: Database,
  input: NormalTripSyncScope,
  now = Date.now(),
) {
  const scope = normalTripSyncScopeSchema.parse(input);
  let actionableNow = 0;
  let nextActionableAt: number | null = null;
  const creates = await database.getAllAsync<Row>(
    "SELECT op.* FROM local_trip_containers t JOIN sync_operations op ON op.id=t.create_operation_id AND op.owner_user_id=t.account_id AND op.trip_id=t.id WHERE t.account_id=? AND t.created_at>=? AND op.entity_type='TRIP' AND op.operation_type='CREATE_TRIP'",
    scope.accountId,
    scope.newTripsFrom,
  );
  const roster = createTripPersonRepository(database, async () => scope.accountId);
  for (const create of creates) {
    try {
      const original = structuredTripCreateRequestSchema.parse({
        ...JSON.parse(create.payload_json),
        operationId: create.id,
      });
      if (
        original.tripId !== create.trip_id ||
        create.entity_id !== create.trip_id ||
        create.idempotency_key !== create.id
      )
        continue;
      const ops = await database.getAllAsync<Row>(
        "SELECT * FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND status IN ('PENDING','RETRYABLE','DEPENDENCY_BLOCKED','PROCESSING') ORDER BY created_at,rowid",
        scope.accountId,
        create.trip_id,
      );
      for (const op of ops) {
        try {
          if (op.id !== op.idempotency_key || op.failure_category === "AUTH") continue;
          let eligible = false;
          if (op.id === create.id) eligible = true;
          else if (create.status !== "COMPLETED") continue;
          else if (
            op.entity_type === "TRIP_READBACK" &&
            op.operation_type === "TRIP_NORMAL_READBACK"
          ) {
            const r = JSON.parse(op.payload_json);
            eligible =
              r.version === 1 &&
              r.tripId === create.trip_id &&
              r.createOperationId === create.id &&
              op.entity_id === create.trip_id;
          } else if (
            op.entity_type === "TRIP_LOCAL_ACTION" &&
            op.operation_type === "TRIP_METADATA_DEFERRED"
          ) {
            const a = retainedDeferredTripMetadataSchema.parse(
              JSON.parse(op.payload_json),
            );
            if (
              a.actionId !== op.id ||
              a.tripId !== create.trip_id ||
              op.entity_id !== create.trip_id
            )
              continue;
            const parent = await database.getFirstAsync<{ status: string }>(
              "SELECT status FROM sync_operations WHERE id=? AND owner_user_id=? AND trip_id=?",
              a.dependencyOperationId,
              scope.accountId,
              create.trip_id,
            );
            const confirmed = await readTripMetadataConfirmation(
              database,
              scope.accountId,
              create.trip_id,
            );
            eligible =
              parent?.status === "COMPLETED" &&
              !!confirmed &&
              json(confirmed.metadata) === json(a.before);
          } else if (
            op.entity_type === "TRIP" &&
            op.operation_type === "UPDATE_TRIP_METADATA"
          ) {
            const m = tripMetadataWireUpdateSchema.parse(JSON.parse(op.payload_json));
            eligible =
              "formatVersion" in m &&
              m.formatVersion === 3 &&
              m.tripId === create.trip_id &&
              m.operationId === op.id &&
              op.entity_id === create.trip_id;
          } else if (
            op.entity_type === "TRIP_PERSON" &&
            op.operation_type === personCloudCreateKind
          ) {
            const p = personCloudCreateSchema.parse(JSON.parse(op.payload_json));
            eligible =
              p.operationId === op.id &&
              p.tripId === create.trip_id &&
              p.personId === op.entity_id &&
              p.tripCreateOperationId === create.id;
          } else if (
            op.entity_type === "TRIP_CORE_V2" &&
            op.operation_type === "CORE_V2_COMMAND"
          ) {
            if (
              op.status === "DEPENDENCY_BLOCKED" &&
              op.last_error_code &&
              op.last_error_code !== "DEPENDENCY_BLOCKED"
            )
              continue;
            const c = validateCoreCommand(JSON.parse(op.payload_json));
            if (
              c.tripId !== create.trip_id ||
              c.operationId !== op.id ||
              c.target.kind !== "ITEM" ||
              c.target.id !== op.entity_id ||
              (c.admission.mode !== "MANUAL" && !isReviewedSourceCreate(c))
            )
              continue;
            const item = await database.getFirstAsync<{
              experience_family: string;
            }>(
              "SELECT experience_family FROM trip_core_itinerary_events WHERE cache_account_id=? AND trip_id=? AND id=?",
              scope.accountId,
              create.trip_id,
              c.target.id,
            );
            const manual =
              isReviewedSourceCreate(c) ||
              (c.admission.mode === "MANUAL" && c.command === "CREATE_SPARSE_FLIGHT") ||
              (c.admission.mode === "MANUAL" &&
                item?.experience_family === "P2" &&
                ["SET_AUTHORED_FLIGHT_DETAILS", "SET_ITEM_PARTICIPATION"].includes(
                  c.command,
                )) ||
              (c.command === "CREATE_ITEM"
                ? ["P1", "P3", "P4", "P5", "P6"].includes(
                    (c.payload as { family: string }).family,
                  )
                : item?.experience_family === "P1" &&
                  [
                    "SET_ITEM_TEXT",
                    "SET_ITEM_SCHEDULE",
                    "SET_ITEM_PLACE",
                    "SET_ITEM_PARTICIPATION",
                  ].includes(c.command)) ||
              (item?.experience_family === "P3" &&
                c.admission.mode === "MANUAL" &&
                [
                  "SET_ITEM_TEXT",
                  "SET_ITEM_SCHEDULE",
                  "SET_ITEM_PLACE",
                  "SET_ITEM_PARTICIPATION",
                  "SET_STAY_DETAILS",
                ].includes(c.command)) ||
              (item?.experience_family === "P4" &&
                c.admission.mode === "MANUAL" &&
                [
                  "SET_ITEM_TEXT",
                  "SET_ITEM_SCHEDULE",
                  "SET_ITEM_PARTICIPATION",
                  "SET_RENTAL_DETAILS",
                ].includes(c.command)) ||
              (item?.experience_family === "P5" &&
                c.admission.mode === "MANUAL" &&
                [
                  "SET_ITEM_TEXT",
                  "SET_ITEM_PARTICIPATION",
                  "SET_TRANSPORT_DETAILS",
                ].includes(c.command)) ||
              (item?.experience_family === "P6" &&
                c.admission.mode === "MANUAL" &&
                [
                  "SET_ITEM_TEXT",
                  "SET_ITEM_SCHEDULE",
                  "SET_ITEM_PLACE",
                  "SET_ITEM_PARTICIPATION",
                  "SET_ACTIVITY_DETAILS",
                ].includes(c.command));
            eligible =
              !!manual &&
              p1SharedParticipantsReady(c, await roster.listTripPersons(create.trip_id));
          }
          if (!eligible) continue;
          if (op.dependency_operation_id) {
            const parent = await database.getFirstAsync<{ status: string }>(
              "SELECT status FROM sync_operations WHERE id=? AND owner_user_id=? AND trip_id=?",
              op.dependency_operation_id,
              scope.accountId,
              create.trip_id,
            );
            if (parent?.status !== "COMPLETED") continue;
          }
          const due =
            op.status === "PROCESSING"
              ? op.lease_expires_at
                ? Date.parse(op.lease_expires_at)
                : NaN
              : op.next_attempt_at
                ? Date.parse(op.next_attempt_at)
                : now;
          if (!Number.isFinite(due)) continue;
          if (due <= now) actionableNow++;
          else nextActionableAt = Math.min(nextActionableAt ?? Infinity, due);
        } catch {
          /* Unknown or unsupported individual history cannot crash/wake the queue. */
        }
      }
    } catch {
      /* Invalid owning Create does not authorize this Trip's queue. */
    }
  }
  const sourceRows = await database.getAllAsync<Row>(
    cloudSourceP1QueueSql,
    scope.accountId,
    scope.newTripsFrom,
  );
  for (const op of sourceRows) {
    if (op.failure_category === "AUTH") continue;
    const command = cloudSourceP1Command(op);
    if (!command) continue;
    if (
      op.status === "DEPENDENCY_BLOCKED" &&
      op.last_error_code &&
      ![
        "DEPENDENCY_BLOCKED",
        "CORE_SOURCE_EVIDENCE_PENDING",
        "CORE_SOURCE_FINALIZER_CLOSED",
      ].includes(op.last_error_code)
    )
      continue;
    if (!p1SharedParticipantsReady(command, await roster.listTripPersons(op.trip_id)))
      continue;
    if (op.dependency_operation_id) {
      const parent = await database.getFirstAsync<{ status: string }>(
        "SELECT status FROM sync_operations WHERE id=? AND owner_user_id=? AND trip_id=?",
        op.dependency_operation_id,
        scope.accountId,
        op.trip_id,
      );
      if (parent?.status !== "COMPLETED") continue;
    }
    const due =
      op.status === "PROCESSING"
        ? op.lease_expires_at
          ? Date.parse(op.lease_expires_at)
          : NaN
        : op.next_attempt_at
          ? Date.parse(op.next_attempt_at)
          : now;
    if (!Number.isFinite(due)) continue;
    if (due <= now) actionableNow++;
    else nextActionableAt = Math.min(nextActionableAt ?? Infinity, due);
  }
  return { actionableNow, nextActionableAt };
}
