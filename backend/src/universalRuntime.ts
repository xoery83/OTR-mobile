import type { AccountRequestContext } from "../../src/data/auth/accountRequestContext";
import type { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
import type { Attempt } from "../../src/domain/intelligence/persistence";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import type { createFlightPrivateCustody } from "./flightPrivateCustody";
import { createUniversalSourceReader } from "./universalSourceRead";
import { createUniversalContinuationHost } from "./universalContinuationHost";
import {
  createUniversalPort,
  UNIVERSAL_IMPORT_VERSION,
  prepareUniversalDispatch,
  type UniversalPort,
} from "./universalImport";
import { createUniversalDeepSeekProvider } from "./universalDeepSeekProvider";
import { createFlightHttpsSend } from "./flightHttpsTransport";
import { createUniversalPersistenceHost } from "./universalPersistenceHost";
import type { createClosedPersistenceGateway } from "./externalIntegrationPersistence";

export type UniversalRuntimeProvisioning = {
  context: AccountRequestContext;
  assertCurrentAuth(): Promise<void>;
  batchId: string;
  taskId: string;
  attempt: Attempt;
  requestMaterialByteCount: number;
  repository: ReturnType<typeof createIntelligenceContinuationRepository>;
  stores: Pick<
    Awaited<ReturnType<typeof createFlightPrivateCustody>>,
    "custody" | "retained" | "retainRaw"
  >;
  sourceConnection: CorePgConnection;
  taskReceiptConnection: CorePgConnection;
  readBinary: Parameters<typeof createUniversalSourceReader>[0]["readBinary"];
  gateway: ReturnType<typeof createClosedPersistenceGateway>;
  environment(key: string): string | undefined;
};

// Trusted composition only. No constructor fabricates a Batch, Task, Source or
// Provider permission from environment flags or caller JSON. Startup is CLOSED
// until owning provisioning, durable Universal admission and custody all exist.
export async function createUniversalBackendRuntime(
  provisioning?: UniversalRuntimeProvisioning,
): Promise<
  | { status: "CLOSED"; universalImportPort?: never }
  | { status: "CONFIGURED_NOT_ACTIVATED"; universalImportPort: UniversalPort }
> {
  if (!provisioning) return { status: "CLOSED" };
  const p = provisioning;
  const readSourceManifest = createUniversalSourceReader({
    connection: p.sourceConnection,
    readBinary: p.readBinary,
  });
  const lifecycle = createUniversalPersistenceHost({
    connection: p.taskReceiptConnection,
    gateway: p.gateway,
    stores: p.stores,
    attempt: p.attempt,
    requestMaterialByteCount: p.requestMaterialByteCount,
    currentTask: async () => {
      await p.assertCurrentAuth();
      const before = await p.repository.snapshot(p.context, p.taskId);
      const manifest = await readSourceManifest(before.task);
      if (
        !prepareUniversalDispatch(
          p.context.accountId,
          p.batchId,
          {
            version: UNIVERSAL_IMPORT_VERSION,
            tripId: p.context.tripId!,
            taskId: p.taskId,
          },
          manifest,
        ).ready.length
      )
        throw Error("UNIVERSAL_NO_INTERPRETABLE_SOURCE");
      const after = await p.repository.snapshot(p.context, p.taskId);
      if (
        after.task.publication_fence !== before.task.publication_fence ||
        after.task.cancellation_disposition !== "NONE"
      )
        throw Error("UNIVERSAL_TASK_SCOPE_CHANGED");
      return after.task;
    },
    environment: p.environment,
  });
  const priceSchedule = await lifecycle.priceSchedule();
  const host = createUniversalContinuationHost({
    context: p.context,
    batchId: p.batchId,
    taskId: p.taskId,
    attempt: p.attempt,
    requestMaterialByteCount: p.requestMaterialByteCount,
    repository: p.repository,
    ...p.stores,
    readSourceManifest: async (task) => {
      await lifecycle.assertCurrent();
      return readSourceManifest(task);
    },
    assertDurableStart: lifecycle.assertDurableStart,
    assertCompletion: lifecycle.assertCompletion,
  });
  const provider = createUniversalDeepSeekProvider({
    custody: lifecycle.custody,
    priceSchedule,
    send: createFlightHttpsSend(),
  });
  return {
    status: "CONFIGURED_NOT_ACTIVATED",
    universalImportPort: createUniversalPort(host, provider),
  };
}
