import {
  createGuestDatasetCensus,
  guestExternalInventorySchema,
} from "./guestDatasetCensus";
import { createGuestCaptureInventory } from "./guestCaptureInventory";
import type { LaunchIdentity } from "./guestPrincipalRepository";
import { getAccountGeneration } from "./accountGeneration";
import {
  assertAccountRequestGeneration,
  withAccountApplyGate,
} from "./accountRequestContext";
import { requireCommittedGuestPrincipal } from "./authRepository";
import {
  createMigratedDatabaseOpener,
  serializeDatabaseTransactions,
} from "../db/databaseConnection";
import { runMigrations, type MigrationDatabase } from "../db/migrationRunner";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  createTripCoreV2Repository,
  type CoreDatabase,
} from "../repositories/tripCoreV2Repository";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import { createTripRepository } from "../repositories/tripRepository";
import { createManualPlanRepository } from "../repositories/manualPlanRepository";
import { createTripLocalManualReader } from "../repositories/tripLocalManualReadRepository";
import { createTripDayFeedReader } from "../repositories/tripDayFeedRepository";

type GuestDatabase = CoreDatabase & MigrationDatabase;
// One process-local fence across openers; publication recovery is a separate durable contract.
const inventoryFreezes = new Map<string, { token: symbol; generation: number }>();

export function createGuestLocalWorkspaceOpener(deps: {
  // Read committed state only; never call the startup principal chooser here.
  readPrincipal(): Promise<LaunchIdentity | null>;
  open(name: string): Promise<GuestDatabase>;
}) {
  const databases = new Map<
    string,
    ReturnType<typeof createMigratedDatabaseOpener<GuestDatabase>>
  >();
  return async function openGuestLocalWorkspace() {
    const generation = getAccountGeneration();
    const principal = await deps.readPrincipal();
    if (principal?.kind !== "GUEST") throw new Error("GUEST_LOCAL_SCOPE_REQUIRED");
    const localId = coreUuid.parse(principal.localId);
    const scope = Object.freeze({ kind: "GUEST" as const, localId, generation });
    async function localOwner() {
      assertAccountRequestGeneration({ accountId: localId, generation });
      const current = await deps.readPrincipal();
      if (current?.kind !== "GUEST" || current.localId !== localId)
        throw new Error("GUEST_LOCAL_SCOPE_CHANGED");
      assertAccountRequestGeneration({ accountId: localId, generation });
      return localId;
    }
    await localOwner();
    let open = databases.get(localId);
    if (!open) {
      open = createMigratedDatabaseOpener(
        () => deps.open(`otr-guest-${localId}.db`),
        async (database) => {
          await runMigrations(database);
          serializeDatabaseTransactions(database);
        },
      );
      databases.set(localId, open);
    }
    const database = await open();
    await localOwner();
    await withAccountApplyGate(async () => {
      await localOwner();
      const prior = inventoryFreezes.get(localId);
      // Only a newly verified current Guest scope may discard an obsolete inventory lease.
      if (prior && prior.generation !== generation) inventoryFreezes.delete(localId);
    });
    async function repositoryOwner() {
      if (inventoryFreezes.has(localId)) throw Error("GUEST_INVENTORY_FROZEN");
      const owner = await localOwner();
      if (inventoryFreezes.has(localId)) throw Error("GUEST_INVENTORY_FROZEN");
      return owner;
    }
    const readCensus = createGuestDatasetCensus(database, localOwner, scope);
    const readCaptureInventory = createGuestCaptureInventory(database, localOwner, scope);
    const core = createTripCoreV2Repository(database, repositoryOwner, tripCoreSha256Hex);
    // A Guest has no Account profile name; explicit local creator input stays local.
    const repository = createTripRepository(
      database,
      repositoryOwner,
      core,
      undefined,
      async () => "",
    );
    const localManual = createTripLocalManualReader(database, repositoryOwner, core);
    const trips = {
      createTrip: repository.createTrip,
      getTrip: repository.getTrip,
      listTrips: repository.listTrips,
      canUpdateMetadata: repository.canUpdateMetadata,
      readMetadataEditBase: repository.readMetadataEditBase,
      readDeferredMetadataEditBase: repository.readDeferredMetadataEditBase,
      deferMetadataUpdate: (
        input: Parameters<typeof repository.deferMetadataUpdate>[0],
      ) => {
        if (input.cover !== undefined)
          throw new Error("GUEST_PHOTO_STORAGE_NOT_AVAILABLE");
        return repository.deferMetadataUpdate(input);
      },
      updateMetadata: (...args: Parameters<typeof repository.updateMetadata>) => {
        if (args[1] !== undefined) throw new Error("GUEST_PHOTO_STORAGE_NOT_AVAILABLE");
        return repository.updateMetadata(...args);
      },
      selectBuiltInCover: repository.selectBuiltInCover,
    };
    return Object.freeze({
      kind: "GUEST_LOCAL" as const,
      scope,
      syncAllowed: false as const,
      readCensus,
      readCaptureInventory,
      async freezeForInventory() {
        return withAccountApplyGate(async () => {
          await localOwner();
          if (inventoryFreezes.has(localId)) throw Error("GUEST_INVENTORY_FREEZE_ACTIVE");
          const token = Symbol("Guest inventory freeze");
          inventoryFreezes.set(localId, { token, generation });
          let released = false;
          async function assertCurrent() {
            await localOwner();
            if (released || inventoryFreezes.get(localId)?.token !== token)
              throw Error("GUEST_INVENTORY_FREEZE_RELEASED");
          }
          return Object.freeze({
            schemaId: "otr.auth.guest-inventory-freeze/1" as const,
            scope,
            assertCurrent,
            async readCensus(external?: Parameters<typeof readCensus>[0]) {
              const snapshot =
                external === undefined
                  ? undefined
                  : guestExternalInventorySchema.parse(external);
              await assertCurrent();
              const result = await readCensus(snapshot);
              await assertCurrent();
              return result;
            },
            async readCaptureInventory() {
              await assertCurrent();
              const result = await readCaptureInventory();
              await assertCurrent();
              return result;
            },
            async release() {
              return withAccountApplyGate(async () => {
                if (released) return false;
                await assertCurrent();
                released = true;
                inventoryFreezes.delete(localId);
                return true;
              });
            },
          });
        });
      },
      trips,
      plan: createManualPlanRepository(database, repositoryOwner, core),
      days: createTripDayFeedReader({
        account: localOwner,
        localManual,
        projection: async () => null,
        candidates: async () =>
          (await trips.listTrips()).map((trip) => ({
            journeyId: trip.id,
            title: trip.name,
          })),
        services: async () => ({}),
      }),
    });
  };
}

export type GuestLocalWorkspace = Awaited<
  ReturnType<ReturnType<typeof createGuestLocalWorkspaceOpener>>
>;

export const openGuestLocalWorkspace = createGuestLocalWorkspaceOpener({
  readPrincipal: requireCommittedGuestPrincipal,
  async open(name) {
    // Defer Native module evaluation for headless repository tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SQLite = require("expo-sqlite") as typeof import("expo-sqlite");
    return SQLite.openDatabaseAsync(name);
  },
});
