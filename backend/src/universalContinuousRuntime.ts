import { measureSourcePdfPhase } from "./sourcePdfTiming";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import {
  readSourcePngRuntimeConfig,
  createSourcePngRuntimePorts,
} from "./sourcePngRuntime";
import {
  readSourcePdfRuntimeConfig,
  createSourcePdfRuntimePorts,
} from "./sourcePdfRuntime";
import { serializeUniversalSourceConnections } from "./universalSourceConnection";
import { createRetainedPngReader } from "./universalRetainedPngRead";
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
  createSourcePdfPgConnection,
  createModelTaskPgConnection,
} from "./tripCoreV2PgConnection";
import { createFlightPrivateCustody } from "./flightPrivateCustody";
import {
  createClosedPersistenceGateway,
  protectedCommands,
} from "./externalIntegrationPersistence";
import { createUniversalOriginalSourceConnection } from "./universalOriginalSource";
import {
  isAiCostGuardEnabled,
  universalProviderPgTransaction,
  universalPgTransaction,
} from "./universalPg";
import { initializeUniversalTaskDatabase } from "./universalTaskBootstrap";
import { readUniversalContinuousConfig } from "./universalContinuousConfig";
import { createUniversalContinuousHost } from "./universalContinuousHost";
import { universalContinuousSelectionSchema } from "./universalRegisteredTaskDraft";
import { universalPriceScheduleFromUnits } from "./universalPersistenceHost";
import {
  universalBatchInputsSchema,
  universalProviderBatchContext,
} from "./universalBatchSource";
import { isNormalAccount } from "./authAccountQualification";
import {
  prepareUniversalRetainedOriginals,
  universalRetainedOriginalPrepareSchema,
} from "./universalRetainedOriginalPreparation";
import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
// Explicit V2 private configuration only. Never opens App SQLite or stores App tokens.
export async function loadDevUniversalContinuousRuntime(
  env: Record<string, string | undefined>,
) {
  let assertForwardConfig: (() => void) | undefined;
  const config = await readUniversalContinuousConfig(env, (assertCurrent) => {
    assertForwardConfig = assertCurrent;
  });
  if (!config) return undefined;
  const costGuardEnabled = isAiCostGuardEnabled((key) => env[key]);
  const executionFence = config.qaExecutionFence;
  const finite = config.finiteNative;
  const forward = finite?.mixedBForwardRecovery;
  const acquisition = config.mixedBInitialAcquisition;
  if ((forward || acquisition) && !assertForwardConfig)
    throw Error("MIXED_B_FORWARD_CONFIG_CHANGED");
  const finiteBatch = finite
    ? universalProviderBatchContext(finite.batch.actorId, finite.batch.tripId, {
        batchId: finite.batch.batchId,
        submissionSha256: finite.batch.submissionSha256,
        inputs: finite.batch.inputs,
      })
    : undefined;
  let sourcePg: ReturnType<typeof createSourcePgConnection> | undefined;
  let pdfPg: ReturnType<typeof createSourcePdfPgConnection> | undefined;
  let pdf: ReturnType<typeof createSourcePdfRuntimePorts> | undefined;
  let png: ReturnType<typeof createSourcePngRuntimePorts> | undefined;
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
    const ordinarySourcePg = createSourcePgConnection(config.sourcePg, !finite && !acquisition);
    sourcePg = ordinarySourcePg;
    if (env.OTR_DEV_UNIVERSAL_PDF_RUNTIME === "enabled")
      pdfPg = createSourcePdfPgConnection(config.sourcePg);
    const [sourceConnection, pdfConnection] = serializeUniversalSourceConnections(
      [
        {
          async withLease(work) {
            // Both budgets share the existing one-session Source role.
            await pdfPg?.discardIdle();
            return ordinarySourcePg.withLease(work);
          },
        },
        ...(pdfPg ? [{
          async withLease<T>(work: (lease: CorePgLease) => Promise<T>) {
            await ordinarySourcePg.discardIdle();
            return pdfPg!.withLease(work);
          },
        }] : []),
      ],
      guard,
    );
    try {
      const pdfConfig = await readSourcePdfRuntimeConfig(env);
      if (pdfConfig) {
        const configSha = env.OTR_DEV_UNIVERSAL_PDF_RUNTIME_SHA256;
        pdf = createSourcePdfRuntimePorts(pdfConfig, {
          gateway,
          connection: pdfConnection,
          storageToken: env.OTR_DEV_SUPABASE_SECRET_KEY ?? "",
          assertEnabled() {
            guard();
            if (
              env.OTR_DEV_UNIVERSAL_PDF_RUNTIME !== "enabled" ||
              env.OTR_DEV_UNIVERSAL_PDF_RUNTIME_SHA256 !== configSha
            )
              throw Error("SOURCE_CAPABILITY_CLOSED");
          },
        });
      }
    } catch {
      console.info("UNIVERSAL_PDF_RUNTIME_CLOSED");
    }
    let retainedPng: ReturnType<typeof createRetainedPngReader> | undefined;
    try {
      const pngConfig = await readSourcePngRuntimeConfig(env);
      if (pngConfig) {
        const configSha = env.OTR_DEV_UNIVERSAL_PNG_RUNTIME_SHA256;
        png = createSourcePngRuntimePorts(pngConfig, {
          gateway,
          connection: sourceConnection,
          storageToken: env.OTR_DEV_SUPABASE_SECRET_KEY ?? "",
          assertReadEnabled: guard,
          assertEnabled() {
            guard();
            if (
              env.OTR_DEV_UNIVERSAL_PNG_RUNTIME !== "enabled" ||
              env.OTR_DEV_UNIVERSAL_PNG_RUNTIME_SHA256 !== configSha
            )
              throw Error("SOURCE_CAPABILITY_CLOSED");
          },
        });
        const retained = pngConfig.retainedOriginalRead;
        if (retained?.publication) {
          const { publication, ...scope } = retained;
          const readOriginal = png.readOriginal;
          retainedPng = createRetainedPngReader(
            { ...scope, ...publication },
            db,
            stores,
            (target, assertCurrent) =>
              readOriginal(target, async () => {
                guard();
                if (
                  env.OTR_DEV_UNIVERSAL_PNG_RUNTIME !== "enabled" ||
                  env.OTR_DEV_UNIVERSAL_PNG_RUNTIME_SHA256 !== configSha
                )
                  throw Error("SOURCE_CAPABILITY_CLOSED");
                await assertCurrent();
              }),
          );
        }
      }
    } catch {
      console.info("UNIVERSAL_PNG_RUNTIME_CLOSED");
    }
    async function host(
      actor: string,
      trip: string,
      assertCurrentAuth: () => Promise<void>,
      sourceReadRequestId?: string,
      publishedSource?: Parameters<
        typeof createUniversalContinuousHost
      >[0]["publishedSource"],
      mixedBPristineSource?: Parameters<
        typeof createUniversalContinuousHost
      >[0]["mixedBPristineSource"],
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
          return universalProviderPgTransaction(
            taskConnection,
            costGuardEnabled,
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
        finiteBatch,
        finiteDeadline: finite?.expiresAt ?? (mixedBPristineSource && acquisition?.expiresAt),
        ...(mixedBPristineSource && acquisition
          ? { mixedBInitial: acquisition.initial, mixedBPristineSource }
          : {}),
        ...(forward &&
        assertForwardConfig &&
        forward.initial.actorId === actor &&
        forward.initial.tripId === trip
          ? {
              mixedBInitial: forward.initial,
              mixedBForwardRecovery: {
                taskDatabase: sql!,
                materialInputSha256: forward.materialInputSha256,
                assertConfigCurrent: assertForwardConfig,
              },
            }
          : {}),
        context,
        db,
        catalogConnection,
        assertCurrentAuth,
        assertNewExecutionAllowed: () => {
          guard();
          if (
            finite &&
            (Date.now() < Date.parse(finite.startsAt) ||
              Date.now() >= Date.parse(finite.expiresAt))
          )
            throw Error("UNIVERSAL_QA_EXECUTION_SCOPE_CLOSED");
          if (acquisition && mixedBPristineSource) assertInitialAcquisitionCurrent();
          if (
            executionFence &&
            (executionFence.accountId !== actor || executionFence.tripId !== trip)
          )
            throw Error("UNIVERSAL_QA_EXECUTION_SCOPE_CLOSED");
        },
        publishedSource,
        sourceReadRequestId,
        retainedResultsEnabled: true,
        bootstrapLedger: () =>
          measureSourcePdfPhase("ledger_bootstrap", () => gateway.bootstrapLedger(actor, trip)),
        async selectProvider(binding) {
          guard();
          await assertCurrentAuth();
          if (finite && finiteBatch) {
            const { owningBinding: _, ...original } = binding;
            if (
              canonicalEventJson(original as Json) !==
              canonicalEventJson(finiteBatch as Json)
            )
              throw Error("UNIVERSAL_BINDING_SCOPE");
            // Inert private metadata only; actual reserve/dispatch still uses finite owning SQL.
            if (costGuardEnabled && finite.selection.priceScheduleId === null)
              throw Error("UNIVERSAL_PRICE_UNAVAILABLE");
            return costGuardEnabled
              ? finite.selection
              : { ...finite.selection, priceScheduleId: null };
          }
          const raw = await universalProviderPgTransaction(
            taskConnection,
            costGuardEnabled,
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
          if (costGuardEnabled && selected?.priceScheduleId === null)
            throw Error("UNIVERSAL_PRICE_UNAVAILABLE");
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
          return Array.isArray(raw) && raw.length === 0
            ? undefined
            : universalPriceScheduleFromUnits(raw);
        },
        runtime: {
          stores: stores!,
          sourceConnection,
          taskReceiptConnection: taskConnection,
          gateway: persistence,
          readBinary: (scope) => {
            if (scope.accountId !== actor || scope.tripId !== trip)
              throw Error("SOURCE_ACCESS_DENIED");
            return scope.mimeType === "image/png" && png
              ? png.readOriginal(scope, assertCurrentAuth)
              : stores!.custody.read({
                  accountId: scope.accountId,
                  reference: scope.representationId,
                  sha256: scope.sha256,
                  byteCount: scope.byteCount,
                });
          },
          environment: (key) => {
            guard();
            return env[key];
          },
        },
      });
    }
    function assertInitialAcquisitionCurrent() {
      guard();
      if (
        !acquisition ||
        !assertForwardConfig ||
        Date.now() < Date.parse(acquisition.startsAt) ||
        Date.now() >= Date.parse(acquisition.expiresAt)
      )
        throw Error("MIXED_B_WINDOW_CLOSED");
      assertForwardConfig();
    }
    async function forRequest(
      request: Request,
      verifiedActor: string,
      tripId: string,
      requestId?: string,
    ) {
      guard();
      const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("Authorization") ?? "");
      if (!match) throw Error("UNIVERSAL_AUTH_REQUIRED");
      const token = match[1];
      const authorize = async (normalOnly = false) => {
        guard();
        const user = await measureSourcePdfPhase("auth", () => gateway.validateAccessToken(token));
        if (
          !user ||
          user.id !== verifiedActor ||
          (normalOnly && !isNormalAccount(user)) ||
          !(await measureSourcePdfPhase("trip_access", () => gateway.canReadTrip(verifiedActor, tripId)))
        )
          throw Error("UNIVERSAL_AUTH_REJECTED");
        guard();
      };
      const originalOptions = {
        pendingPdf: pdf?.originalMetadataAllowed(verifiedActor, tripId) === true,
        pendingPng: png?.originalMetadataAllowed(verifiedActor, tripId) === true,
      };
      const initialOriginal =
        acquisition &&
        acquisition.initial.actorId === verifiedActor &&
        acquisition.initial.tripId === tripId
          ? createUniversalOriginalSourceConnection(sourceConnection, hash, {
              ...originalOptions,
              mixedBInitial: {
                manifest: acquisition.initial,
                taskDb: sql!,
                assertCurrent: assertInitialAcquisitionCurrent,
              },
            })
          : undefined;
      const original = initialOriginal ??
        createUniversalOriginalSourceConnection(sourceConnection, hash, originalOptions);
      const scoped = await host(verifiedActor, tripId, authorize, requestId, undefined, initialOriginal);
      let protectedPrepareReplay = false;
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
          readMaterialReady: async (actor: string, batch: string, trip: string) => {
            if (actor !== verifiedActor || trip !== tripId) throw Error("SOURCE_ACCESS_DENIED");
            return scoped.readMaterialReady(batch);
          },
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
          const { tripId: _trip, retainedOriginals, originalUpload: _upload, ...input } = q;
          let completeRetainedOriginals: (() => Promise<void>) | undefined;
          if (retainedOriginals !== undefined) {
            if (finite || acquisition) throw Error("UNIVERSAL_RETAINED_SOURCE_UNAVAILABLE");
            const retained = universalRetainedOriginalPrepareSchema.parse(q);
            if (retained.retainedOriginals.length !== retained.inputs.length)
              throw Error("UNIVERSAL_RETAINED_SOURCE_SCOPE");
            const batch = universalBatchInputsSchema.parse(input);
            const signal = AbortSignal.any([request.signal, AbortSignal.timeout(80000)]);
            const sourceRequest = (path: string, method = "POST") =>
              new Request(new URL(path, request.url), {
                method,
                headers: { Authorization: match[0] },
                signal,
              });
            const openPdf = pdf?.sourcePdfV2ForRequest;
            const openPdfUpload = pdf?.sourcePdfV4PreparationForRequest;
            const openPng = png?.sourcePngPreparationForRequest;
            await authorize(true);
            completeRetainedOriginals = () => prepareUniversalRetainedOriginals(
              { actorId: verifiedActor, tripId, signal },
              batch,
              retained.retainedOriginals,
              {
                hash,
                assertCurrent: () => authorize(true),
                originalUpload: retained.originalUpload,
                acquire: (command) => original.acquire(verifiedActor, tripId, command),
                lookupAcquisition: (command) => original.lookup(verifiedActor, tripId, command),
                lookupOperation: (command) => universalPgTransaction(
                  sourceConnection,
                  async (lease) => (
                    await lease.query(
                      "SELECT public.trip_source_operation_lookup($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6) AS result",
                      [verifiedActor, tripId, command.source_id, command.operation_id,
                        command.operation_key, command.operation_sha256],
                    )
                  ).rows[0]?.result,
                  true,
                  () => signal.throwIfAborted(),
                ),
                uploadPdf: openPdfUpload && (async (commands, requireBytes) => {
                  const q = commands.upload;
                  const base = `/v2/trips/${tripId}/sources/${q.source_id}/representations/${q.payload.representation_id}/pdf-v4/${q.operation_id}`;
                  await authorize(true);
                  // Reservation writes must retain the ordinary request's fresh Session checks.
                  const owned = await openPdfUpload(
                    sourceRequest(`${base}/status`, "GET"),
                    verifiedActor,
                  );
                  try {
                    const { preparation, reservation } = owned.port;
                    const identity = {
                      tripId,
                      sourceId: q.source_id,
                      representationId: q.payload.representation_id,
                      operationId: q.operation_id,
                      accountGeneration: owned.initialGeneration,
                    };
                    const raw = canonicalCoreJson(q);
                    let status = await reservation.status(verifiedActor, identity);
                    let bytes: Buffer | undefined;
                    if (status === "NO_ACTIVE_ATTEMPT") {
                      bytes = requireBytes();
                      const prepared = await reservation.prepare(
                        verifiedActor, canonicalCoreJson(commands.prepare),
                        { ...identity, operationId: commands.prepare.operation_id },
                      );
                      if (prepared.outcome !== "APPLIED")
                        throw Error("PDF_SOURCE_PREPARATION_REJECTED");
                      const reserved = await reservation.reserve(verifiedActor, raw, identity);
                      if ("receipt" in reserved) return reserved.receipt;
                      status = await reservation.status(verifiedActor, identity);
                    }
                    if (status === "RESERVED") {
                      bytes ??= requireBytes();
                      const stage = new Request(new URL(`${base}/stage`, request.url), {
                        method: "POST",
                        headers: {
                          Authorization: match[0],
                          "Content-Type": "application/pdf",
                          "Content-Length": String(bytes.length),
                        },
                        body: Uint8Array.from(bytes),
                        signal,
                      });
                      await preparation.ingress(stage, identity);
                      status = "STAGED";
                    }
                    signal.throwIfAborted();
                    if (status !== "READ_OBSERVED") {
                      if (status !== "STAGED" && status !== "ACK_OBSERVED")
                        throw Error("PDF_UPLOAD_OUTCOME_UNRESOLVED");
                      await authorize(true);
                      const advance = sourceRequest(`${base}/advance`);
                      const advancing = await openPdfUpload(advance, verifiedActor, {
                        request: advance, actorId: verifiedActor, tripId,
                      });
                      try {
                        if (!(await advancing.port.preparation.advance?.(advance, {
                          ...identity,
                          accountGeneration: advancing.initialGeneration,
                        })))
                          throw Error("PDF_UPLOAD_OUTCOME_UNRESOLVED");
                      } finally {
                        advancing.close();
                      }
                    }
                    signal.throwIfAborted();
                    return await reservation.finish(verifiedActor, raw, identity);
                  } finally {
                    owned.close();
                  }
                }),
                openPdf: openPdf && (() => openPdf(
                  sourceRequest(`/v2/trips/${tripId}/sources/pdf-v2/verify-original`), verifiedActor,
                )),
                openPng: openPng && (() => openPng(
                  sourceRequest(`/v2/trips/${tripId}/universal-source-originals/png/execute`), verifiedActor,
                )),
              },
            );
          }
          const result = await scoped.prepare(input, completeRetainedOriginals);
          protectedPrepareReplay =
            result.status === "EXISTING" &&
            result.context.batchId === forward?.initial.batchId &&
            result.context.taskId === forward.initial.taskId;
          return result;
        },
        async resume(trip: string, batch: string, task: string) {
          if (trip !== tripId) throw Error("SOURCE_ACCESS_DENIED");
          return scoped.resume(batch, task);
        },
        readPublished: (batch: string, task: string) => scoped.readPublished(batch, task),
        async drainTargeted(batch: string, task: string) {
          await authorize();
          if (protectedPrepareReplay && batch === forward?.initial.batchId && task === forward.initial.taskId)
            return { status: "NOT_CLAIMED" as const };
          const owner = `universal-${randomUUID()}`;
          const mixed = await scoped.claimTargetedMixedBWake(batch, task, owner);
          const context = await captureAccountRequestContext(
            tripId,
            async () => verifiedActor,
          );
          const ordinaryQueueDb = {
            ...db,
            withTransactionAsync: (work: () => Promise<void>) =>
              db.withImmediateTransactionAsync(async () => {
                await scoped.assertOrdinaryWake(batch, task);
                await work();
              }),
          };
          let operation: SyncOperation;
          if (mixed) {
            operation = mixed.operation;
          } else {
            const owning = await db.getFirstAsync<{ sync_operation_id: string }>(
              "SELECT sync_operation_id FROM intelligence_continuations WHERE account_id=? AND trip_id=? AND task_id=?",
              verifiedActor,
              tripId,
              task,
            );
            if (!owning?.sync_operation_id) throw Error("UNIVERSAL_WAKE_MISSING");
            await ordinaryQueueDb.withTransactionAsync(() =>
              createSyncOperationRepository(db, async () => verifiedActor, undefined, {
                accountId: verifiedActor,
                tripId,
                operationId: owning.sync_operation_id,
              }).recoverInterrupted(),
            );
            const row = await db.getFirstAsync<SyncOperation>(
              `SELECT id,owner_user_id AS ownerUserId,trip_id AS tripId,entity_type AS entityType,entity_id AS entityId,operation_type AS operationType,idempotency_key AS idempotencyKey,base_version AS baseVersion,payload_json AS payloadJson,status,attempt_count AS attemptCount,next_attempt_at AS nextAttemptAt,claim_owner AS claimOwner,created_at AS createdAt,updated_at AS updatedAt FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND entity_type='INTELLIGENCE_CONTINUATION' AND entity_id=?`,
              verifiedActor,
              tripId,
              task,
            );
            if (!row || row.operationType !== intelligenceWakeKind)
              throw Error("UNIVERSAL_WAKE_MISSING");
            operation = row;
          }
          const queue = createIntelligenceWakeQueue(mixed ? db : ordinaryQueueDb, {
            getAccountId: async () => verifiedActor,
            sha256: hash,
            now: () => new Date().toISOString(),
          });
          if (!mixed && !(await queue.claim(context, operation, owner)))
            return { status: "NOT_CLAIMED" as const };
          try {
            const result = await scoped.executeQueued(
              batch,
              task,
              mixed?.claim ?? {
                operationId: operation.id,
                owner,
                baseVersion: operation.baseVersion!,
              },
            );
            if (mixed && result?.providerOutcome !== "SETTLED")
              throw Error("MIXED_B_TASK_OUTCOME_UNQUALIFIED");
            await queue.settle(context, operation);
            return { status: "SETTLED" as const, result };
          } catch (error) {
            try {
              const message = error instanceof Error ? error.message : "";
              console.info(
                JSON.stringify({
                  event: "universal_targeted_wake_failed",
                  code: [
                    "UNIVERSAL_CONFIGURATION_CHANGED",
                    "UNIVERSAL_TASK_CHANGED",
                    "UNIVERSAL_PROVIDER_CLOSED",
                    "UNIVERSAL_SOURCE_CLOSED",
                    "UNIVERSAL_MODEL_TASK_BINDING",
                    "UNIVERSAL_TASK_DEADLINE",
                    "UNIVERSAL_SCOPE_INVALID",
                    "UNIVERSAL_PRICE_UNAVAILABLE",
                    "UNIVERSAL_PRICE_PRECISION_UNAVAILABLE",

                    "UNIVERSAL_AUTH_REJECTED",
                    "UNIVERSAL_CONTINUOUS_CLOSED",
                    "UNIVERSAL_SOURCE_RUN_UNAVAILABLE",
                    "UNIVERSAL_TASK_UNAVAILABLE",
                    "CORE_CONNECTION_BUSY",
                    "CORE_SCOPE_MISMATCH",
                    "INTELLIGENCE_QUEUE_SCOPE",
                    "INPUT_STALE",
                  ].includes(message)
                    ? message
                    : "UNCLASSIFIED",
                }),
              );
            } catch {
              // Diagnostics must not interfere with queue settlement.
            }
            // Exact B retains its claim for owning disposition on any failed forward fence.
            if (!mixed)
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
      retainedPng,
      sourcePdfV4PreparationForRequest: pdf?.sourcePdfV4PreparationForRequest,
      sourcePngPreparationForRequest: png?.sourcePngPreparationForRequest,
      sourcePdfV2ForRequest: pdf?.sourcePdfV2ForRequest,
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
          source = createCoreUniversalSourceRead(lease, a, t, async (image) => {
            guard();
            if (!stores || image.accountId !== a || image.tripId !== t)
              throw Error("SOURCE_ACCESS_DENIED");
            const bytes = png
              ? await png.readOriginal(image, async () => {
                  guard();
                })
              : await stores.custody.read({
                  accountId: a,
                  reference: image.representationId,
                  sha256: image.sha256,
                  byteCount: image.byteCount,
                });
            guard();
            return bytes;
          });
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
        const published = await (
          await host(a, t, authorize, undefined, currentSource)
        ).readPublished(scope.batchId, scope.taskId);
        if (!published) return null;
        return {
          ...published,
          readBinary: async (image: {
            accountId: string;
            tripId: string;
            sourceId: string;
            representationId: string;
            sha256: string;
            byteCount: number;
            mimeType?: string;
          }) => {
            guard();
            if (
              !stores ||
              image.accountId !== a ||
              image.tripId !== t ||
              !binding.inputs.some(
                (p) =>
                  p.source_id === image.sourceId &&
                  p.representation_id === image.representationId &&
                  p.payload_sha256 === image.sha256 &&
                  p.byte_count === image.byteCount,
              )
            )
              throw Error("SOURCE_ACCESS_DENIED");
            const bytes =
              image.mimeType === "image/png" && png
                ? await png.readOriginal(image, async () => {
                    guard();
                  })
                : await stores.custody.read({
                    accountId: a,
                    reference: image.representationId,
                    sha256: image.sha256,
                    byteCount: image.byteCount,
                  });
            guard();
            return bytes;
          },
        };
      },
      async close() {
        if (closed) return;
        closed = true;
        png?.close();
        pdf?.close();
        await sourcePg?.close();
        await pdfPg?.close();
        sql?.close();
        sql = undefined;
        await stores?.close();
        await catalogConnection.close();
      },
    };
  } catch (error) {
    closed = true;
    png?.close();
    pdf?.close();
    await sourcePg?.close();
    await pdfPg?.close();
    sql?.close();
    await stores?.close();
    await catalogConnection.close();
    throw error;
  }
}
