import { isKnownGuestSqliteSchema } from "./guestSqliteSchema";
import { guestTripDraftInventory } from "./guestTripDraftInventory";
import { guestP1DraftInventory } from "./guestP1DraftInventory";
import type { EmptyGuestSessionPreparation } from "./authSessionRepository";
import { readGuestTripP1Source } from "./guestTripP1Source";
import { readGuestRegisteredFileQualification } from "./guestRegisteredFileQualification";
import {
  createGuestAdoptionRecovery,
  type GuestRecoveryFiles,
} from "./guestAdoptionRecovery";
import { createGuestRecoveryFiles } from "./guestRecoveryFiles";
import {
  assertGuestPublicationNotRequested,
  hasGuestPublicationHold,
} from "./guestPublicationHold";
import {
  createGuestDatasetCensus,
  guestExternalInventorySchema,
} from "./guestDatasetCensus";
import { createGuestCaptureInventory } from "./guestCaptureInventory";
import type { LaunchIdentity } from "./guestPrincipalRepository";
import { getAccountGeneration } from "./accountGeneration";
import {
  assertAccountRequestGeneration,
  assertAccountTransitionLease,
  withAccountApplyGate,
} from "./accountRequestContext";
import { requireCommittedGuestPrincipal } from "./authRepository";
import {
  createMigratedDatabaseOpener,
  serializeDatabaseTransactions,
} from "../db/databaseConnection";
import {
  getSchemaVersion,
  runMigrations,
  type MigrationDatabase,
} from "../db/migrationRunner";
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
  recoveryFiles(localId: string): GuestRecoveryFiles;
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
    const recovery = createGuestAdoptionRecovery({
      scope,
      files: deps.recoveryFiles(localId),
      assertGuest: async () => {
        await localOwner();
      },
    });
    await recovery.inspectPublicationRequests();
    await localOwner();
    // Do not migrate or open the original dataset while server publication status is unknown.
    assertGuestPublicationNotRequested(localId);
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
    const database = await withAccountApplyGate(async () => {
      await localOwner();
      assertGuestPublicationNotRequested(localId);
      const database = await open();
      await localOwner();
      assertGuestPublicationNotRequested(localId);
      const prior = inventoryFreezes.get(localId);
      // Only a newly verified current Guest scope may discard an obsolete inventory lease.
      if (prior && prior.generation !== generation && !hasGuestPublicationHold(localId))
        inventoryFreezes.delete(localId);
      return database;
    });
    async function repositoryOwner() {
      assertGuestPublicationNotRequested(localId);
      if (inventoryFreezes.has(localId)) throw Error("GUEST_INVENTORY_FROZEN");
      const owner = await localOwner();
      assertGuestPublicationNotRequested(localId);
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
      inspectPublicationRequests: recovery.inspectPublicationRequests,
      // Empty is a strict current-schema qualification, never a data cleanup/adoption.
      async prepareEmptySessionInstall(): Promise<EmptyGuestSessionPreparation> {
        return withAccountApplyGate(async () => {
          await localOwner();
          assertGuestPublicationNotRequested(localId);
          if (inventoryFreezes.has(localId)) throw Error("GUEST_INVENTORY_FREEZE_ACTIVE");
          const tripDrafts = guestTripDraftInventory.freezeEmpty();
          let p1Drafts: ReturnType<typeof guestP1DraftInventory.freezeEmpty> | undefined;
          const token = Symbol("Empty Guest Session install");
          let released = false;
          const release = () => {
            if (released) return;
            released = true;
            p1Drafts?.release();
            tripDrafts.release();
            if (inventoryFreezes.get(localId)?.token === token)
              inventoryFreezes.delete(localId);
          };
          async function assertEmpty() {
            tripDrafts.assertCurrent();
            p1Drafts?.assertCurrent();
            assertGuestPublicationNotRequested(localId);
            if ((await deps.recoveryFiles(localId).listAttempts()).length !== 0)
              throw Error("GUEST_ADOPTION_PREFLIGHT_REQUIRED");
            await database.withTransactionAsync(async () => {
              const version = await getSchemaVersion(database);
              if (!(await isKnownGuestSqliteSchema(database, version)))
                throw Error("GUEST_ADOPTION_PREFLIGHT_REQUIRED");
              const tables = await database.getAllAsync<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
              );
              for (const { name } of tables) {
                if (name === "schema_migrations" || name === "sqlite_sequence") continue;
                const quoted = '"' + name.replaceAll('"', '""') + '"';
                if (
                  (
                    await database.getFirstAsync<{ n: number }>(
                      `SELECT count(*) AS n FROM ${quoted}`,
                    )
                  )?.n !== 0
                )
                  throw Error("GUEST_ADOPTION_PREFLIGHT_REQUIRED");
              }
            });
            tripDrafts.assertCurrent();
            p1Drafts?.assertCurrent();
          }
          try {
            p1Drafts = guestP1DraftInventory.freezeEmpty();
            inventoryFreezes.set(localId, { token, generation });
            await assertEmpty();
            await localOwner();
            return {
              release,
              async qualify(lease) {
                async function assertCurrent() {
                  assertAccountTransitionLease(lease);
                  if (
                    released ||
                    lease.generation !== generation + 1 ||
                    inventoryFreezes.get(localId)?.token !== token
                  )
                    throw Error("GUEST_LOCAL_SCOPE_CHANGED");
                  const current = await deps.readPrincipal();
                  if (current?.kind !== "GUEST" || current.localId !== localId)
                    throw Error("GUEST_LOCAL_SCOPE_CHANGED");
                  await assertEmpty();
                  const after = await deps.readPrincipal();
                  if (after?.kind !== "GUEST" || after.localId !== localId)
                    throw Error("GUEST_LOCAL_SCOPE_CHANGED");
                  assertGuestPublicationNotRequested(localId);
                  assertAccountTransitionLease(lease);
                  if (released || inventoryFreezes.get(localId)?.token !== token)
                    throw Error("GUEST_LOCAL_SCOPE_CHANGED");
                }
                await assertCurrent();
                return { assertCurrent };
              },
            };
          } catch (error) {
            release();
            throw error;
          }
        });
      },
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
            readTripP1Source() {
              return readGuestTripP1Source({
                database,
                scope,
                owner: localOwner,
                assertCurrent,
                readCensus,
                readCaptureInventory,
              });
            },
            readRegisteredFileQualification() {
              return readGuestRegisteredFileQualification({
                scope,
                assertCurrent,
                readCensus,
                readCaptureInventory,
              });
            },
            async readCaptureInventory() {
              await assertCurrent();
              const result = await readCaptureInventory();
              await assertCurrent();
              return result;
            },
            // Internal UI resumes only; never network or business writes under this gate.
            async release(resumeEditors?: () => Promise<void>) {
              return withAccountApplyGate(async () => {
                if (released) return false;
                await assertCurrent();
                assertGuestPublicationNotRequested(localId);
                let resumeError: unknown;
                try {
                  await resumeEditors?.();
                } catch (error) {
                  resumeError = error;
                }
                await assertCurrent();
                assertGuestPublicationNotRequested(localId);
                released = true;
                inventoryFreezes.delete(localId);
                if (resumeError) throw resumeError;
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
  recoveryFiles: createGuestRecoveryFiles,
  async open(name) {
    // Defer Native module evaluation for headless repository tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SQLite = require("expo-sqlite") as typeof import("expo-sqlite");
    return SQLite.openDatabaseAsync(name);
  },
});
