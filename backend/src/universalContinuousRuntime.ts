import { createCoreUniversalSourceRead } from "./universalCoreSourceRead";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import { DatabaseSync } from "node:sqlite";
import { intelligenceWakeKind } from "../../src/domain/intelligence/persistence";
import { createHash, randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import { z } from "zod";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import {
  createSyncOperationRepository,
  createIntelligenceWakeQueue,
  type SyncOperation,
} from "../../src/data/sync/syncOperationRepository";
import { createSupabaseDevGateway } from "./supabaseGateway";
import { createPublicationCatalogPgConnection } from "./tripPublicationCatalogPgConnection";
import {
  createSourcePgConnection,
  createModelTaskPgConnection,
} from "./tripCoreV2PgConnection";
import { createFlightPrivateCustody } from "./flightPrivateCustody";
import {
  createClosedPersistenceGateway,
  protectedCommands,
} from "./externalIntegrationPersistence";
import { createUniversalOriginalSourceConnection } from "./universalOriginalSource";
import { universalPgTransaction } from "./universalPg";
import { initializeUniversalTaskDatabase } from "./universalTaskBootstrap";
import { readUniversalContinuousConfig } from "./universalContinuousConfig";
import { createUniversalContinuousHost } from "./universalContinuousHost";
import { universalContinuousSelectionSchema } from "./universalRegisteredTaskDraft";
import { universalPriceScheduleFromUnits } from "./universalPersistenceHost";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
// Explicit V2 private configuration only. Never opens App SQLite or stores App tokens.
export async function loadDevUniversalContinuousRuntime(
  env: Record<string, string | undefined>,
) {
  const config = await readUniversalContinuousConfig(env);
  if (!config) return undefined;
  let closed = false,
    stores: Awaited<ReturnType<typeof createFlightPrivateCustody>> | undefined,
    sql: DatabaseSync | undefined;
  const catalogConnection = createPublicationCatalogPgConnection(config.catalogPg);
  try {
    stores = await createFlightPrivateCustody(config.directory, config.identity);
    const before = await lstat(config.taskDatabase);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.uid !== process.getuid!() ||
      (before.mode & 0o777) !== 0o600 ||
      before.nlink !== 1
    )
      throw Error("UNIVERSAL_TASK_DATABASE_CLOSED");
    sql = new DatabaseSync(config.taskDatabase);
    const after = await lstat(config.taskDatabase);
    if (before.ino !== after.ino || before.dev !== after.dev)
      throw Error("UNIVERSAL_TASK_DATABASE_CHANGED");
    const db = initializeUniversalTaskDatabase(sql),
      sourceConnection = createSourcePgConnection(config.sourcePg),
      taskConnection = createModelTaskPgConnection(config.taskPg);
    const gateway = createSupabaseDevGateway({
      url: env.OTR_DEV_SUPABASE_URL!,
      publishableKey: env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY ?? "",
      secretKey: env.OTR_DEV_SUPABASE_SECRET_KEY ?? "",
    });
    const guard = () => {
      if (closed || env.OTR_DEV_UNIVERSAL_CONTINUOUS_HOST !== "enabled")
        throw Error("UNIVERSAL_CONTINUOUS_CLOSED");
    };
    async function host(
      actor: string,
      trip: string,
      assertCurrentAuth: () => Promise<void>,
      publishedSource?: Parameters<
        typeof createUniversalContinuousHost
      >[0]["publishedSource"],
    ) {
      z.uuid().parse(actor);
      z.uuid().parse(trip);
      guard();
      await assertCurrentAuth();
      const context = await captureAccountRequestContext(trip, async () => actor);
      const persistence = createClosedPersistenceGateway({
        gatewayIdentity: "otr_external_integration_call_gateway",
        now: () => new Date().toISOString(),
        async verify(request) {
          guard();
          await assertCurrentAuth();
          const stamp = new Date();
          return {
            version: 1,
            principal_kind: "TRUSTED_WORKLOAD",
            verified_actor_id: actor,
            verified_account_id: actor,
            verified_client_identity: null,
            verified_external_subject: null,
            verified_environment: "DEV",
            auth_source: "SUPABASE_DEV_USER",
            auth_config_version: 1,
            auth_session_reference: `vault:otr/dev/auth-request/${randomUUID()}`,
            verified_at: stamp.toISOString(),
            expires_at: new Date(stamp.getTime() + 60000).toISOString(),
            revoked: false,
            request_id: request.requestId,
            request_sha256: request.requestSha256,
            command_kind: request.command,
            gateway_identity: "otr_external_integration_call_gateway",
          };
        },
        async execute(kind, context, command) {
          guard();
          if (!protectedCommands.includes(kind))
            throw Error("UNIVERSAL_COMMAND_FORBIDDEN");
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
      return createUniversalContinuousHost({
        enabled: true,
        context,
        db,
        catalogConnection,
        assertCurrentAuth,
        publishedSource,
        bootstrapLedger: () => gateway.bootstrapLedger(actor, trip),
        async selectProvider() {
          guard();
          await assertCurrentAuth();
          const raw = await universalPgTransaction(
            taskConnection,
            async (lease) =>
              (
                await lease.query(
                  "SELECT public.universal_import_select_continuous($1::uuid,$2::uuid,$3) AS selection",
                  [actor, trip, config!.integrationId],
                )
              ).rows[0]?.selection,
          );
          // Scope/grant metadata stays Backend-only; Task receives only immutable selection fields.
          const selected = raw as Record<string, unknown>;
          return universalContinuousSelectionSchema.parse(
            Object.fromEntries(
              Object.keys(universalContinuousSelectionSchema.shape).map((k) => [
                k,
                selected?.[k],
              ]),
            ),
          );
        },
        async readAdmittedPrice(t, a) {
          const raw = await universalPgTransaction(
            taskConnection,
            async (lease) =>
              (
                await lease.query(
                  "SELECT public.universal_import_read_admitted_price($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS units",
                  [actor, t.task_id, a.attempt_id, a.usage_correlation_id],
                )
              ).rows[0]?.units,
            false,
          );
          return universalPriceScheduleFromUnits(raw);
        },
        runtime: {
          stores: stores!,
          sourceConnection,
          taskReceiptConnection: taskConnection,
          gateway: persistence,
          readBinary: (scope) =>
            stores!.custody.read({
              accountId: scope.accountId,
              reference: scope.representationId,
              sha256: scope.sha256,
              byteCount: scope.byteCount,
            }),
          environment: (key) => {
            guard();
            return env[key];
          },
        },
      });
    }
    async function forRequest(request: Request, verifiedActor: string, tripId: string) {
      guard();
      const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("Authorization") ?? "");
      if (!match) throw Error("UNIVERSAL_AUTH_REQUIRED");
      const token = match[1];
      const authorize = async () => {
        guard();
        const user = await gateway.validateAccessToken(token);
        if (
          !user ||
          user.id !== verifiedActor ||
          !(await gateway.canReadTrip(verifiedActor, tripId))
        )
          throw Error("UNIVERSAL_AUTH_REJECTED");
        guard();
      };
      const scoped = await host(verifiedActor, tripId, authorize),
        original = createUniversalOriginalSourceConnection(sourceConnection, hash);
      return {
        universalOriginalSourcePort: {
          async acquire(actor: string, trip: string, raw: unknown) {
            if (actor !== verifiedActor || trip !== tripId)
              throw Error("SOURCE_ACCESS_DENIED");
            await authorize();
            const value = await original.acquire(actor, trip, raw);
            await authorize();
            return value;
          },
          async lookup(actor: string, trip: string, raw: unknown) {
            if (actor !== verifiedActor || trip !== tripId)
              throw Error("SOURCE_ACCESS_DENIED");
            await authorize();
            const value = await original.lookup(actor, trip, raw);
            await authorize();
            return value;
          },
        },
        universalImportPort: {
          readContext: async (actor: string, batch: string, trip: string) => {
            if (actor !== verifiedActor || trip !== tripId)
              throw Error("SOURCE_ACCESS_DENIED");
            return scoped.readContext(batch);
          },
          read: async (actor: string, batch: string, task: string) => {
            if (actor !== verifiedActor) throw Error("SOURCE_ACCESS_DENIED");
            return scoped.readResult(batch, task);
          },
          async execute() {
            throw Error("UNIVERSAL_QUEUED_PREPARE_REQUIRED");
          },
        },
        async prepare(trip: string, raw: unknown) {
          if (trip !== tripId) throw Error("SOURCE_ACCESS_DENIED");
          const q = z
            .object({ tripId: z.literal(tripId) })
            .passthrough()
            .parse(raw);
          const { tripId: _trip, ...input } = q;
          return scoped.prepare(input);
        },
        readPublished: (batch: string, task: string) => scoped.readPublished(batch, task),
        async drainTargeted(batch: string, task: string) {
          await authorize();
          const context = await captureAccountRequestContext(
            tripId,
            async () => verifiedActor,
          );
          const owning = await db.getFirstAsync<{ sync_operation_id: string }>(
            "SELECT sync_operation_id FROM intelligence_continuations WHERE account_id=? AND trip_id=? AND task_id=?",
            verifiedActor,
            tripId,
            task,
          );
          if (!owning?.sync_operation_id) throw Error("UNIVERSAL_WAKE_MISSING");
          await createSyncOperationRepository(db, async () => verifiedActor, undefined, {
            accountId: verifiedActor,
            tripId,
            operationId: owning.sync_operation_id,
          }).recoverInterrupted();
          const operation = await db.getFirstAsync<SyncOperation>(
            `SELECT id,owner_user_id AS ownerUserId,trip_id AS tripId,entity_type AS entityType,entity_id AS entityId,operation_type AS operationType,idempotency_key AS idempotencyKey,base_version AS baseVersion,payload_json AS payloadJson,status,attempt_count AS attemptCount,next_attempt_at AS nextAttemptAt,claim_owner AS claimOwner,created_at AS createdAt,updated_at AS updatedAt FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND entity_type='INTELLIGENCE_CONTINUATION' AND entity_id=?`,
            verifiedActor,
            tripId,
            task,
          );
          if (!operation || operation.operationType !== intelligenceWakeKind)
            throw Error("UNIVERSAL_WAKE_MISSING");
          const queue = createIntelligenceWakeQueue(db, {
            getAccountId: async () => verifiedActor,
            sha256: hash,
            now: () => new Date().toISOString(),
          });
          const owner = `universal-${randomUUID()}`;
          if (!(await queue.claim(context, operation, owner)))
            return { status: "NOT_CLAIMED" as const };
          try {
            const result = await scoped.executeQueued(batch, task, {
              operationId: operation.id,
              owner,
              baseVersion: operation.baseVersion!,
            });
            await queue.settle(context, operation);
            return { status: "SETTLED" as const, result };
          } catch (error) {
            await queue.settle(
              context,
              operation,
              error instanceof Error ? error : Error("UNIVERSAL_EXECUTION_FAILED"),
            );
            throw error;
          }
        },
      };
    }
    const coreSources = new WeakMap<
      CorePgLease,
      ReturnType<typeof createCoreUniversalSourceRead>
    >();
    return {
      catalogConnection,
      forRequest,
      // Called only by the existing Core Source authority after its normal Auth,
      // Actor/Trip locks and capability checks; it grants no mutation authority.
      async readPublished(
        scope: {
          actorAccountId: string;
          tripId: string;
          batchId: string;
          taskId: string;
        },
        lease: CorePgLease,
      ) {
        const a = scope.actorAccountId,
          t = scope.tripId;
        let source = coreSources.get(lease);
        if (!source) {
          source = createCoreUniversalSourceRead(lease, a, t);
          coreSources.set(lease, source);
        }
        const currentSource = source;
        guard();
        // The canonical lookup validates the real Actor and retains all Source scope locks.
        const binding = await currentSource.lookup(a, t, scope.batchId);
        if (
          !binding ||
          binding.actorId !== a ||
          binding.tripId !== t ||
          binding.batchId !== scope.batchId ||
          binding.taskId !== scope.taskId
        )
          throw Error("UNIVERSAL_BINDING_SCOPE");
        const authorize = async () => {
          guard();
        };
        return (await host(a, t, authorize, currentSource)).readPublished(
          scope.batchId,
          scope.taskId,
        );
      },
      async close() {
        if (closed) return;
        closed = true;
        sql?.close();
        sql = undefined;
        await stores?.close();
        await catalogConnection.close();
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
