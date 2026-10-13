import type * as SQLite from "expo-sqlite";
import type { CreateTripInput, CreateTripItemInput, Trip } from "@/domain/trip/types";
import { coreUuid, coreDefaults } from "@/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { corePayloadSchemas } from "@/domain/trip/tripCoreV2Commands";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import {
  captureAccountScope,
  assertAccountRequestContext,
  withAccountApplyGate,
} from "../auth/accountRequestContext";
import { readInitializedDatabase } from "../db/database";
import { requireActiveUserId } from "../auth/authRepository";
import { createTripCoreV2Repository } from "./tripCoreV2Repository";

type Database = Pick<
  SQLite.SQLiteDatabase,
  "getFirstAsync" | "getAllAsync" | "runAsync" | "withTransactionAsync"
>;
type Core = Pick<
  ReturnType<typeof createTripCoreV2Repository>,
  "captureContext" | "enqueue" | "pending"
>;
type Row = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
};
const trip = (row: Row): Trip => ({
  id: row.id,
  serverId: null,
  name: row.name,
  destination: row.destination,
  startDate: row.start_date,
  endDate: row.end_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: null,
  syncStatus: "PENDING_CREATE",
  syncVersion: 0,
  baseCurrency: null,
  ownerPersonId: null,
});
const title = (value: string) => {
  const result = value.trim();
  if (!result || result.length > 256) throw new Error("TRIP_NAME_INVALID");
  return result;
};
const date = (value: string | null | undefined) =>
  value ? validateCalendarDate(value) : null;

// Account-local creator intent only; no member, financial setting or admission is fabricated.
export function createTripRepository(
  database: Database,
  account: () => Promise<string>,
  core: Core,
  clock = () => new Date().toISOString(),
) {
  async function getTrip(id: string): Promise<Trip | null> {
    coreUuid.parse(id);
    const scope = await captureAccountScope(account);
    const row = await database.getFirstAsync<Row>(
      "SELECT * FROM local_trip_containers WHERE account_id=? AND id=?",
      scope.accountId,
      id,
    );
    await assertAccountRequestContext(scope, account);
    return row ? trip(row) : null;
  }
  return {
    getTrip,
    async listTrips(): Promise<Trip[]> {
      const scope = await captureAccountScope(account);
      const rows = await database.getAllAsync<Row>(
        "SELECT * FROM local_trip_containers WHERE account_id=? ORDER BY created_at DESC,id",
        scope.accountId,
      );
      await assertAccountRequestContext(scope, account);
      return rows.map(trip);
    },
    async createTrip(input: CreateTripInput): Promise<Trip> {
      coreUuid.parse(input.operationId);
      coreUuid.parse(input.tripId);
      const startDate = date(input.startDate),
        endDate = date(input.endDate);
      if (startDate && endDate && endDate < startDate)
        throw new Error("TRIP_DATE_RANGE_INVALID");
      const payload = {
        tripId: input.tripId,
        name: title(input.name),
        destination: input.destination?.trim() || null,
        startDate,
        endDate,
      };
      if (payload.destination && payload.destination.length > 256)
        throw new Error("TRIP_DESTINATION_INVALID");
      const text = canonicalCoreJson(payload as Json);
      const scope = await captureAccountScope(account);
      return withAccountApplyGate(async () => {
        await assertAccountRequestContext(scope, account);
        let result: Trip | null = null;
        await database.withTransactionAsync(async () => {
          const prior = await database.getFirstAsync<{ payload_json: string }>(
            "SELECT payload_json FROM sync_operations WHERE id=? AND owner_user_id=? AND operation_type='CREATE_TRIP'",
            input.operationId,
            scope.accountId,
          );
          if (prior) {
            if (prior.payload_json !== text)
              throw new Error("TRIP_OPERATION_REUSE_MISMATCH");
            const row = await database.getFirstAsync<Row>(
              "SELECT * FROM local_trip_containers WHERE account_id=? AND id=?",
              scope.accountId,
              input.tripId,
            );
            if (!row) throw new Error("TRIP_LOCAL_RECORD_MISSING");
            result = trip(row);
          } else {
            const now = clock();
            await database.runAsync(
              "INSERT INTO local_trip_containers(account_id,id,create_operation_id,name,destination,start_date,end_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
              scope.accountId,
              input.tripId,
              input.operationId,
              payload.name,
              payload.destination,
              startDate,
              endDate,
              now,
              now,
            );
            // The owning Backend initializer is not yet bound; generic workers cannot dispatch this intent.
            await database.runAsync(
              "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,base_version,payload_json,owner_user_id,status,attempt_count,next_attempt_at,last_error_code,created_at,updated_at) VALUES(?,?,?,?,?,?,NULL,?,?,'DEPENDENCY_BLOCKED',0,NULL,'TRIP_INITIALIZATION_REQUIRED',?,?)",
              input.operationId,
              input.tripId,
              "TRIP",
              input.tripId,
              "CREATE_TRIP",
              input.operationId,
              text,
              scope.accountId,
              now,
              now,
            );
            result = trip({
              id: input.tripId,
              name: payload.name,
              destination: payload.destination,
              start_date: startDate,
              end_date: endDate,
              created_at: now,
              updated_at: now,
            });
          }
          await assertAccountRequestContext(scope, account);
        });
        return result!;
      });
    },
    async addItem(tripId: string, input: CreateTripItemInput) {
      const context = await core.captureContext(tripId);
      if (!(await getTrip(tripId))) throw new Error("TRIP_LOCAL_RECORD_MISSING");
      const start = validateCalendarDate(input.startDate),
        end = date(input.endDate);
      if ((end && end < start) || (input.family === "P3" && !end))
        throw new Error("STAY_DATE_RANGE_INVALID");
      await assertAccountRequestContext(context, account);
      return core.enqueue(context, {
        contractVersion: 2,
        intentVersion: 2,
        operationId: coreUuid.parse(input.operationId),
        tripId,
        command: "CREATE_ITEM",
        target: { kind: "ITEM", id: coreUuid.parse(input.itemId) },
        baseVector: [{ kind: "ITEM", id: input.itemId, revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: {
          family: input.family,
          core: { title: title(input.title) },
          schedule: {
            start: coreDateBoundary(start),
            ...(end ? { end: coreDateBoundary(end) } : {}),
          },
          ...coreDefaults("organizer"),
        },
      });
    },
    async pendingItems(tripId: string) {
      const context = await core.captureContext(tripId);
      if (!(await getTrip(tripId))) throw new Error("TRIP_LOCAL_RECORD_MISSING");
      await assertAccountRequestContext(context, account);
      const pending = await core.pending(context);
      return pending.flatMap((intent) => {
        if (intent.command.command !== "CREATE_ITEM") return [];
        const payload = corePayloadSchemas.CREATE_ITEM.parse(intent.command.payload);
        if (payload.family !== "P1" && payload.family !== "P3") return [];
        return [{ ...intent, payload }];
      });
    },
  };
}
export type TripRepository = ReturnType<typeof createTripRepository>;
export async function readLocalTripRepository(): Promise<TripRepository> {
  const database = await readInitializedDatabase();
  const core = createTripCoreV2Repository(
    database,
    requireActiveUserId,
    async (bytes) => {
      const { digest, CryptoDigestAlgorithm } = await import("expo-crypto");
      return Array.from(
        new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes))),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
    },
  );
  return createTripRepository(database, requireActiveUserId, core);
}
