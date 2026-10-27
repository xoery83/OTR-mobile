import { readUniversalFiniteConfig } from "./universalFiniteConfig";
import { universalPgTransaction } from "./universalPg";
import { lstat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { ledgerBootstrapResponseSchema } from "../../src/data/api/ledgerReadContracts";
import { createSupabaseDevGateway } from "./supabaseGateway";
import { createPublicationCatalogPgConnection } from "./tripPublicationCatalogPgConnection";
import {
  createSourcePgConnection,
  createModelTaskPgConnection,
} from "./tripCoreV2PgConnection";
import {
  createClosedPersistenceGateway,
  protectedCommands,
} from "./externalIntegrationPersistence";
import { createFlightPrivateCustody } from "./flightPrivateCustody";
import { readUniversalCatalog } from "./universalCatalog";
import { createUniversalSourceReader } from "./universalSourceRead";
import {
  bootstrapUniversalTask,
  initializeUniversalTaskDatabase,
} from "./universalTaskBootstrap";
import { prepareUniversalDispatch, UNIVERSAL_IMPORT_VERSION } from "./universalImport";
import { createUniversalBackendRuntime } from "./universalRuntime";

export {
  universalRuntimePath,
  universalFiniteConfigSchema,
} from "./universalFiniteConfig";

export async function loadDevUniversalRuntime(
  environment: Record<string, string | undefined>,
) {
  const config = await readUniversalFiniteConfig(environment);
  if (!config) return undefined;
  if (!config.task.trip_id) throw Error("UNIVERSAL_RUNTIME_CLOSED");
  let closed = false;
  const assertCurrent = () => {
    if (
      closed ||
      Date.now() < Date.parse(config.startsAt) ||
      Date.now() >= Date.parse(config.expiresAt) ||
      environment.OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT !== "enabled"
    )
      throw Error("UNIVERSAL_RUNTIME_CLOSED");
  };
  assertCurrent();
  const catalogConnection = createPublicationCatalogPgConnection(config.catalogPg);
  const gateway = createSupabaseDevGateway({
    url: environment.OTR_DEV_SUPABASE_URL!,
    publishableKey: environment.OTR_DEV_SUPABASE_PUBLISHABLE_KEY ?? "",
    secretKey: environment.OTR_DEV_SUPABASE_SECRET_KEY ?? "",
  });
  const assertAuth = async () => {
    assertCurrent();
    const user = await gateway.validateAccessToken(config.bearer);
    if (!user || user.id !== config.actorId) throw Error("UNIVERSAL_AUTH_REJECTED");
    assertCurrent();
  };
  let stores: Awaited<ReturnType<typeof createFlightPrivateCustody>> | undefined,
    sql: DatabaseSync | undefined;
  try {
    await assertAuth();
    stores = await createFlightPrivateCustody(config.directory, config.identity);
    const dbStat = await lstat(config.taskDatabase);
    if (
      !dbStat.isFile() ||
      dbStat.isSymbolicLink() ||
      dbStat.uid !== process.getuid!() ||
      (dbStat.mode & 0o777) !== 0o600 ||
      dbStat.nlink !== 1
    )
      throw Error("UNIVERSAL_TASK_DATABASE_CLOSED");
    sql = new DatabaseSync(config.taskDatabase);
    const after = await lstat(config.taskDatabase);
    if (after.ino !== dbStat.ino || after.dev !== dbStat.dev)
      throw Error("UNIVERSAL_TASK_DATABASE_CHANGED");
    const db = initializeUniversalTaskDatabase(sql);
    const sourceConnection = createSourcePgConnection(config.sourcePg),
      taskConnection = createModelTaskPgConnection(config.taskPg);
    const binary = async (
      s: Parameters<Parameters<typeof createUniversalSourceReader>[0]["readBinary"]>[0],
    ) =>
      stores!.custody.read({
        accountId: s.accountId,
        reference: s.representationId,
        sha256: s.sha256,
        byteCount: s.byteCount,
      });
    const readSources = createUniversalSourceReader({
      connection: sourceConnection,
      readBinary: binary,
    });
    // Real SQL Source qualification before applying any owning snapshot/Task cache.
    const manifest = await readSources(config.task);
    const plan = prepareUniversalDispatch(
      config.actorId,
      config.task.import_id!,
      {
        version: UNIVERSAL_IMPORT_VERSION,
        tripId: config.task.trip_id,
        taskId: config.task.task_id,
      },
      manifest,
    );
    const marker = Buffer.from(JSON.stringify(plan.dispatchMarker));
    if (
      !plan.ready.length ||
      config.attempt.request_sha256 !== plan.requestSha256 ||
      config.attempt.request_material_sha256 !==
        createHash("sha256").update(marker).digest("hex")
    )
      throw Error("UNIVERSAL_REQUEST_PINS_CHANGED");
    const catalog = await readUniversalCatalog(
      catalogConnection,
      config.task,
      AbortSignal.timeout(5000),
    );
    const ledger = ledgerBootstrapResponseSchema.parse(
      await gateway.bootstrapLedger(config.actorId, config.task.trip_id),
    );
    await assertAuth();
    const boot = await bootstrapUniversalTask({
      db,
      task: config.task,
      attempt: config.attempt,
      catalog,
      ledger,
      getAccountId: async () => {
        assertCurrent();
        return config.actorId;
      },
      assertCurrent,
    });
    const persistence = createClosedPersistenceGateway({
      gatewayIdentity: "otr_external_integration_call_gateway",
      now: () => new Date().toISOString(),
      async verify(request) {
        await assertAuth();
        return {
          version: 1,
          principal_kind: "TRUSTED_WORKLOAD",
          verified_actor_id: config.actorId,
          verified_account_id: config.actorId,
          verified_client_identity: null,
          verified_external_subject: null,
          verified_environment: "DEV",
          auth_source: "SUPABASE_DEV_USER",
          auth_config_version: 1,
          auth_session_reference: config.sessionReference,
          verified_at: new Date().toISOString(),
          expires_at: config.expiresAt,
          revoked: false,
          request_id: request.requestId,
          request_sha256: request.requestSha256,
          command_kind: request.command,
          gateway_identity: "otr_external_integration_call_gateway",
        };
      },
      async execute(kind, context, command) {
        assertCurrent();
        if (!protectedCommands.includes(kind)) throw Error("UNIVERSAL_COMMAND_FORBIDDEN");
        return universalPgTransaction(
          taskConnection,
          async (lease) =>
            (
              await lease.query(`SELECT public.${kind}($1::jsonb,$2::jsonb) AS value`, [
                JSON.stringify(context),
                JSON.stringify(command),
              ])
            ).rows[0]?.value,
        );
      },
    });
    const runtime = await createUniversalBackendRuntime({
      context: boot.context,
      batchId: config.task.import_id!,
      taskId: config.task.task_id,
      attempt: config.attempt,
      requestMaterialByteCount: marker.length,
      repository: boot.repository,
      stores,
      sourceConnection,
      taskReceiptConnection: taskConnection,
      readBinary: binary,
      gateway: persistence,
      environment: (key) => {
        assertCurrent();
        return environment[key];
      },
      assertCurrentAuth: assertAuth,
    });
    if (!runtime.universalImportPort) throw Error("UNIVERSAL_RUNTIME_CLOSED");
    const port = runtime.universalImportPort;
    const close = async () => {
      if (closed) return;
      closed = true;
      sql?.close();
      sql = undefined;
      await stores?.close();
      await catalogConnection.close();
    };
    const timer = setTimeout(
      () => {
        void close().catch(() => {});
      },
      Date.parse(config.expiresAt) - Date.now(),
    );
    timer.unref();
    return {
      universalImportPort: {
        async readContext(actorId: string, batchId: string, tripId: string) {
          if (actorId !== config.actorId || batchId !== config.task.import_id ||
              tripId !== config.task.trip_id) return null;
          await assertAuth();
          const currentManifest = await readSources(config.task);
          const current = prepareUniversalDispatch(actorId, batchId, {
            version: UNIVERSAL_IMPORT_VERSION,
            tripId,
            taskId: config.task.task_id,
          }, currentManifest);
          if (current.requestSha256 !== plan.requestSha256) return null;
          // Read the existing owning Task after current Source qualification.
          const snapshot = await boot.repository.snapshot(boot.context, config.task.task_id);
          if (snapshot.task.publication_fence !== config.task.publication_fence ||
              snapshot.task.cancellation_disposition !== "NONE") return null;
          await assertAuth();
          return {
            version: "otr.backend.universal-context/1" as const,
            actorId,
            accountId: config.task.account_id,
            tripId,
            batchId,
            taskId: config.task.task_id,
          };
        },
        async execute(...args: Parameters<typeof port.execute>) {
          await assertAuth();
          return port.execute(...args);
        },
        async read(...args: Parameters<typeof port.read>) {
          await assertAuth();
          return port.read(...args);
        },
      },
      catalogConnection,
      async close() {
        clearTimeout(timer);
        await close();
      },
    };
  } catch (error) {
    closed = true;
    sql?.close();
    await stores?.close();
    await catalogConnection.close();
    throw error;
  }
}
