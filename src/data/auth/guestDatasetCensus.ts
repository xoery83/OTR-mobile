import { isKnownGuestSqliteSchema } from "./guestSqliteSchema";
import { isTripCoverAssetId } from "@/domain/trip/tripCoverAssets";
import { retainedDeferredTripMetadataSchema } from "@/domain/trip/tripDeferredMetadata";
import { z } from "zod";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { validateCoreCommand } from "@/domain/trip/tripCoreV2Commands";
import { withAccountApplyGate } from "./accountRequestContext";
import { getSchemaVersion, type MigrationDatabase } from "../db/migrationRunner";
import type { CoreDatabase } from "../repositories/tripCoreV2Repository";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import { requireLocalTripPersonCreator } from "../repositories/localTripPersonRepository";

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const ownedEntry = z.strictObject({
  id: coreUuid,
  sha256: digest,
  bytes: z.number().int().nonnegative().safe(),
});
export const guestExternalInventorySchema = z.strictObject({
  sourceGuestLocalId: coreUuid,
  generation: z.number().int().nonnegative().safe(),
  files: z.strictObject({ status: z.literal("COMPLETE"), entries: z.array(ownedEntry) }),
  liveDrafts: z.strictObject({
    status: z.literal("COMPLETE"),
    entries: z.array(ownedEntry),
  }),
});
export type GuestExternalInventory = z.infer<typeof guestExternalInventorySchema>;

const supported = new Set([
  "local_trip_containers",
  "local_trip_destinations",
  "local_trip_ledger_bindings",
  "ledger_journeys",
  "ledger_members",
  "ledger_actor_context",
  "account_trip_cover_preferences",
  "sync_operations",
  "trip_core_pending_intents",
]);
const bookkeeping = new Set(["schema_migrations", "sqlite_sequence"]);
const supportedOperations = new Set([
  "TRIP:CREATE_TRIP",
  "TRIP_CORE_V2:CORE_V2_COMMAND",
  "TRIP_LOCAL_ACTION:TRIP_METADATA_DEFERRED",
  "TRIP_PERSON:TRIP_PERSON_CREATE",
]);
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const sha = (value: unknown) =>
  tripCoreSha256Hex(new TextEncoder().encode(canonicalCoreJson(value as Json)));

// Inventory metadata only: no conversion, upload, receipt or Session installation.
export function createGuestDatasetCensus(
  database: CoreDatabase & MigrationDatabase,
  localOwner: () => Promise<string>,
  scope: Readonly<{ kind: "GUEST"; localId: string; generation: number }>,
) {
  return async (externalInput?: GuestExternalInventory) =>
    withAccountApplyGate(async () => {
      if ((await localOwner()) !== scope.localId)
        throw Error("GUEST_CENSUS_SCOPE_CHANGED");
      const external =
        externalInput === undefined
          ? null
          : guestExternalInventorySchema.parse(externalInput);
      if (
        external &&
        (external.sourceGuestLocalId !== scope.localId ||
          external.generation !== scope.generation)
      )
        throw Error("GUEST_CENSUS_EXTERNAL_SCOPE");
      for (const collection of external ? [external.files, external.liveDrafts] : []) {
        if (
          new Set(collection.entries.map((entry) => entry.id)).size !==
          collection.entries.length
        )
          throw Error("GUEST_CENSUS_DUPLICATE_EXTERNAL_ID");
      }
      let result!: {
        schemaId: "otr.auth.guest-census/1";
        scope: typeof scope;
        sqliteVersion: number;
        tripIds: readonly string[];
        tables: { name: string; rows: number; sha256: string | null }[];
        blockers: string[];
        readyForServerPreflight: boolean;
        inventorySha256: string | null;
        totals: {
          trips: number;
          people: number;
          p1Items: number;
          files: number | null;
          fileBytes: number | null;
          liveDrafts: number | null;
        };
      };
      await database.withTransactionAsync(async () => {
        const sqliteVersion = await getSchemaVersion(database);
        const blockers: string[] = [];
        // Photo75 rows remain unsupported; only its empty registered table is compatible.
        if (!(await isKnownGuestSqliteSchema(database, sqliteVersion)))
          blockers.push("SQLITE_SCHEMA_UNSUPPORTED");
        if (!external) blockers.push("FILE_AND_LIVE_DRAFT_COLLECTORS_REQUIRED");
        const tripRows = await database.getAllAsync<{
          id: string;
          accepted_at: string | null;
        }>(
          "SELECT id,accepted_at FROM local_trip_containers WHERE account_id=?",
          scope.localId,
        );
        const tripIds = new Set(tripRows.map((trip) => coreUuid.parse(trip.id)));
        if (tripRows.some((trip) => trip.accepted_at !== null))
          blockers.push("GUEST_HAS_CLOUD_ACCEPTANCE");
        for (const tripId of tripIds)
          await requireLocalTripPersonCreator(
            database,
            { accountId: scope.localId, tripId, generation: scope.generation },
            localOwner,
          );
        const tables: typeof result.tables = [];
        let p1Items = 0;
        const catalog = await database.getAllAsync<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        );
        for (const { name } of catalog) {
          const table = quote(name);
          const count = (await database.getFirstAsync<{ n: number }>(
            `SELECT count(*) AS n FROM ${table}`,
          ))!.n;
          if (bookkeeping.has(name) || !count) {
            tables.push({ name, rows: count, sha256: null });
            continue;
          }
          if (!supported.has(name)) {
            blockers.push(`UNSUPPORTED_TABLE:${name}`);
            tables.push({ name, rows: count, sha256: null });
            continue;
          }
          const columns = (
            await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`)
          ).map((column) => column.name);
          for (const column of ["account_id", "owner_user_id", "user_id"].filter(
            (column) => columns.includes(column),
          )) {
            if (
              await database.getFirstAsync(
                `SELECT 1 FROM ${table} WHERE ${quote(column)} IS NULL OR ${quote(column)}<>? LIMIT 1`,
                scope.localId,
              )
            )
              throw Error("GUEST_CENSUS_FOREIGN_OWNER");
          }
          const tripColumn = columns.includes("trip_id")
            ? "trip_id"
            : columns.includes("journey_id")
              ? "journey_id"
              : null;
          if (tripColumn) {
            const references = await database.getAllAsync<Record<string, string | null>>(
              `SELECT DISTINCT ${quote(tripColumn)} FROM ${table}`,
            );
            if (
              references.some((row) => !row[tripColumn] || !tripIds.has(row[tripColumn]!))
            )
              throw Error("GUEST_CENSUS_FOREIGN_TRIP");
          }
          const rows = await database.getAllAsync<Record<string, Json>>(
            `SELECT * FROM ${table}`,
          );
          if (
            name === "local_trip_containers" ||
            name === "account_trip_cover_preferences"
          ) {
            if (
              rows.some(
                (row) =>
                  row.selected_cover_asset_id !== null &&
                  !isTripCoverAssetId(row.selected_cover_asset_id),
              )
            )
              blockers.push("UNSUPPORTED_GUEST_COVER_REFERENCE");
          }
          if (name === "sync_operations") {
            for (const row of rows) {
              if (
                row.entity_type !== "TRIP_LOCAL_ACTION" ||
                row.operation_type !== "TRIP_METADATA_DEFERRED"
              )
                continue;
              const action = retainedDeferredTripMetadataSchema.parse(
                JSON.parse(row.payload_json as string),
              );
              if (action.actionId !== row.id || action.tripId !== row.trip_id)
                throw Error("GUEST_CENSUS_DEFERRED_SCOPE");
              if (
                action.cover &&
                [action.cover.before, action.cover.after].some(
                  (value) => value !== null && !isTripCoverAssetId(value),
                )
              )
                blockers.push("UNSUPPORTED_GUEST_COVER_REFERENCE");
            }
          }
          if (
            name === "sync_operations" &&
            rows.some(
              (row) =>
                !supportedOperations.has(`${row.entity_type}:${row.operation_type}`),
            )
          )
            blockers.push("UNSUPPORTED_OPERATION");
          if (name === "trip_core_pending_intents") {
            const intents = rows.map((row) => {
              const intent = validateCoreCommand(
                JSON.parse(row.canonical_intent_text as string),
              );
              if (
                intent.tripId !== row.trip_id ||
                intent.operationId !== row.operation_id
              )
                throw Error("GUEST_CENSUS_INTENT_SCOPE");
              return intent;
            });
            const created = new Set<string>();
            for (const intent of intents) {
              if (intent.command === "CREATE_ITEM") {
                if ((intent.payload as { family: string }).family !== "P1")
                  blockers.push("UNSUPPORTED_CORE_FAMILY");
                else created.add(coreUuid.parse(intent.target.id));
              }
            }
            if (
              intents.some(
                (intent) =>
                  intent.admission.mode !== "MANUAL" ||
                  intent.target.kind !== "ITEM" ||
                  !created.has(intent.target.id) ||
                  ![
                    "CREATE_ITEM",
                    "SET_ITEM_TEXT",
                    "SET_ITEM_SCHEDULE",
                    "SET_ITEM_PLACE",
                    "SET_ITEM_PARTICIPATION",
                  ].includes(intent.command),
              )
            )
              blockers.push("UNSUPPORTED_CORE_INTENT");
            p1Items = created.size;
          }
          tables.push({
            name,
            rows: count,
            sha256: await sha(rows.map((row) => canonicalCoreJson(row)).sort()),
          });
          await localOwner();
        }
        const sorted = (entries: GuestExternalInventory["files"]["entries"]) =>
          [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const stable = {
          schemaId: "otr.auth.guest-census/1" as const,
          sourceGuestLocalId: scope.localId,
          sqliteVersion,
          tables: tables.filter((table) => !bookkeeping.has(table.name)),
          files: external ? sorted(external.files.entries) : null,
          liveDrafts: external ? sorted(external.liveDrafts.entries) : null,
        };
        const bytes =
          external?.files.entries.reduce((sum, entry) => sum + entry.bytes, 0) ?? null;
        if (bytes !== null && !Number.isSafeInteger(bytes))
          throw Error("GUEST_CENSUS_BYTE_COUNT_INVALID");
        result = {
          schemaId: stable.schemaId,
          scope,
          sqliteVersion,
          tripIds: Object.freeze([...tripIds].sort()),
          tables,
          blockers,
          readyForServerPreflight: blockers.length === 0,
          inventorySha256: blockers.length ? null : await sha(stable),
          totals: {
            trips: tripRows.length,
            people: tables.find((table) => table.name === "ledger_members")?.rows ?? 0,
            p1Items,
            files: external?.files.entries.length ?? null,
            fileBytes: bytes,
            liveDrafts: external?.liveDrafts.entries.length ?? null,
          },
        };
        await localOwner();
      });
      await localOwner();
      return result;
    });
}
