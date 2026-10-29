import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { captureIdSchema, type CaptureKind } from "@/domain/capture/localCapture";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { withAccountApplyGate } from "./accountRequestContext";
import { getSchemaVersion, type MigrationDatabase } from "../db/migrationRunner";
import { migrations } from "../db/migrations";
import type { CoreDatabase } from "../repositories/tripCoreV2Repository";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import { createLocalCaptureTransactionStore } from "../repositories/localCaptureInboxRepository";
import { requireLocalTripPersonCreator } from "../repositories/localTripPersonRepository";

type Scope = Readonly<{ kind: "GUEST"; localId: string; generation: number }>;
const sha = (value: unknown) =>
  tripCoreSha256Hex(new TextEncoder().encode(canonicalCoreJson(value as Json)));
type Entry = {
  id: string;
  sha256: string;
  bytes: number;
  references: {
    captureId: string;
    tripId: string | null;
    revision: number;
    kind: CaptureKind;
    metadataSha256: string;
  }[];
};

// Only the existing Guest opener supplies this DB and committed-kind/generation getter.
export function createGuestCaptureInventory(
  database: CoreDatabase & MigrationDatabase,
  localOwner: () => Promise<string>,
  scope: Scope,
) {
  scope = Object.freeze({ ...scope, localId: coreUuid.parse(scope.localId) });
  if (scope.kind !== "GUEST") throw Error("GUEST_CAPTURE_SCOPE_REQUIRED");
  const readOnly = async () => {
    throw Error("GUEST_CAPTURE_INVENTORY_READ_ONLY");
  };
  const store = createLocalCaptureTransactionStore(
    {
      getFirstAsync: database.getFirstAsync.bind(database),
      getAllAsync: database.getAllAsync.bind(database),
      runAsync: readOnly,
      withTransactionAsync: readOnly,
    },
    {
      sha256: tripCoreSha256Hex,
      newId: () => {
        throw Error("GUEST_CAPTURE_INVENTORY_READ_ONLY");
      },
      now: () => {
        throw Error("GUEST_CAPTURE_INVENTORY_READ_ONLY");
      },
    },
  );
  async function assertGuest() {
    if ((await localOwner()) !== scope.localId)
      throw Error("GUEST_CAPTURE_SCOPE_CHANGED");
  }
  return async () =>
    withAccountApplyGate(async () => {
      await assertGuest();
      let result!: {
        schemaId: "otr.auth.guest-capture-inventory/1";
        coverage: "CAPTURE_ONLY";
        scope: Scope;
        status: "CAPTURE_COMPLETE" | "BLOCKED";
        sqliteVersion: number;
        entries: Entry[];
        orphanPayloads: number;
        totalPayloads: number;
        verifiedBytes: number;
        blockers: string[];
        inventorySha256: string | null;
      };
      await database.withTransactionAsync(async () => {
        const sqliteVersion = await getSchemaVersion(database);
        if (sqliteVersion !== migrations.at(-1)?.id)
          throw Error("GUEST_CAPTURE_SCHEMA_UNSUPPORTED");
        const payloads = await database.getAllAsync<{ account_id: string; id: string }>(
          "SELECT account_id,id FROM local_capture_payloads ORDER BY id",
        );
        const captures = await database.getAllAsync<{
          account_id: string;
          id: string;
          payload_id: string;
          trip_id: string | null;
        }>(
          "SELECT account_id,id,payload_id,trip_id FROM local_capture_inbox ORDER BY id",
        );
        for (const row of [...payloads, ...captures]) {
          if (row.account_id !== scope.localId)
            throw Error("GUEST_CAPTURE_FOREIGN_OWNER");
          captureIdSchema.parse(row.id);
        }
        const trips = await database.getAllAsync<{
          id: string;
          accepted_at: string | null;
        }>(
          "SELECT id,accepted_at FROM local_trip_containers WHERE account_id=?",
          scope.localId,
        );
        const tripIds = new Set(trips.map((trip) => trip.id));
        const assigned = new Set<string>();
        for (const capture of captures) {
          captureIdSchema.parse(capture.payload_id);
          if (capture.trip_id === null) continue;
          if (
            !tripIds.has(capture.trip_id) ||
            trips.find((trip) => trip.id === capture.trip_id)?.accepted_at !== null
          )
            throw Error("GUEST_CAPTURE_FOREIGN_TRIP");
          assigned.add(capture.trip_id);
        }
        for (const tripId of assigned)
          await requireLocalTripPersonCreator(
            database,
            { accountId: scope.localId, tripId, generation: scope.generation },
            localOwner,
          );
        await assertGuest();
        const referenced = new Set(captures.map((capture) => capture.payload_id));
        const orphans = payloads.filter((payload) => !referenced.has(payload.id));
        const entries = new Map<string, Entry>();
        for (const row of captures) {
          const { capture } = await store.load(scope.localId, row.id);
          if (capture.payloadId !== row.payload_id || capture.tripId !== row.trip_id)
            throw Error("GUEST_CAPTURE_REFERENCE_CHANGED");
          const entry = entries.get(capture.payloadId) ?? {
            id: capture.payloadId,
            sha256: capture.sha256,
            bytes: capture.byteCount,
            references: [],
          };
          if (entry.sha256 !== capture.sha256 || entry.bytes !== capture.byteCount)
            throw Error("GUEST_CAPTURE_PAYLOAD_CHANGED");
          entry.references.push({
            captureId: capture.id,
            tripId: capture.tripId,
            revision: capture.revision,
            kind: capture.kind,
            metadataSha256: await sha(capture),
          });
          entries.set(entry.id, entry);
          await assertGuest();
        }
        const sorted = [...entries.values()].sort((a, b) =>
          a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
        );
        const verifiedBytes = sorted.reduce((sum, entry) => sum + entry.bytes, 0);
        if (!Number.isSafeInteger(verifiedBytes))
          throw Error("GUEST_CAPTURE_BYTE_COUNT_INVALID");
        const blockers = orphans.length ? ["ORPHAN_CAPTURE_PAYLOAD"] : [];
        result = {
          schemaId: "otr.auth.guest-capture-inventory/1",
          coverage: "CAPTURE_ONLY",
          scope,
          status: blockers.length ? "BLOCKED" : "CAPTURE_COMPLETE",
          sqliteVersion,
          entries: sorted,
          orphanPayloads: orphans.length,
          totalPayloads: payloads.length,
          verifiedBytes,
          blockers,
          inventorySha256: blockers.length
            ? null
            : await sha({
                schemaId: "otr.auth.guest-capture-inventory/1",
                coverage: "CAPTURE_ONLY",
                sourceGuestLocalId: scope.localId,
                sqliteVersion,
                entries: sorted,
              }),
        };
        await assertGuest();
      });
      await assertGuest();
      return result;
    });
}
