import https from "node:https";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createDevBackendHandler, type BackendDependencies } from "./app";
import { createCorePgHttpConnection } from "./tripCoreV2PgHttpConnection";
import { createSustainedDevTripPorts } from "./tripSustainedRuntime";
import { createRetainedPngReader } from "./universalRetainedPngRead";
import { createSourcePngRuntimePorts } from "./sourcePngRuntime";
import { PDF_V2_OPTIONS_SHA } from "./sourcePdfV2Contracts";
// Network-none composition fixture: actual Task SQLite/Repository/Queue and
// ContinuationHost. Source/Catalog/Provider/usage-proof ports are controlled
// synthetic fixtures, NOT DEV, real Provider, Auth or Admission acceptance.
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import {
  createIntelligenceWakeQueue,
  type SyncOperation,
} from "../../src/data/sync/syncOperationRepository";
import {
  tripImportCatalogSchemas,
  universalImportSnapshotSchema,
} from "../../src/data/api/tripImportCatalogContracts";
import catalogFixture from "../../src/data/repositories/__fixtures__/tripImportCatalogs.json";
import { createUniversalContinuousHost } from "./universalContinuousHost";
import { initializeUniversalTaskDatabase } from "./universalTaskBootstrap";
import {
  universalBatchIdentity,
  universalRunBindingSchema,
} from "./universalBatchSource";
import { createUniversalContinuationHost } from "./universalContinuationHost";
import { createUniversalSourceReader } from "./universalSourceRead";
import {
  createUniversalPort,
  sealedUniversalDispatchMarker,
  prepareUniversalDispatch as candidateDispatch,
} from "./universalImport";
import type { UniversalRuntimeProvisioning } from "./universalRuntime";
import { persistenceDigest } from "./externalIntegrationPersistence";
const fakeRuntime = vi.hoisted(() => vi.fn());
vi.mock("./universalRuntime", () => ({
  createUniversalBackendRuntime: fakeRuntime,
}));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const hostCases = [{ expired: false, pdf: false, unknown: false }];
it.each(hostCases)(
  "reopens the same PUBLISHED PNG without temporary original bytes",
  async ({ expired, pdf, unknown }) => {
    const sql = new DatabaseSync(":memory:"),
      db = initializeUniversalTaskDatabase(sql);
    try {
      const actor = catalogFixture.actor_account_id,
        trip = catalogFixture.trip_id,
        batch = "a0000000-0000-4000-8000-000000000001",
        now = new Date().toISOString();
      const runId = universalBatchIdentity(actor, trip, batch, "run"),
        taskId = universalBatchIdentity(actor, trip, batch, "task");
      const source = structuredClone(catalogFixture.trip_sources[0]),
        rep = structuredClone(catalogFixture.trip_source_representations[0]),
        revision = structuredClone(catalogFixture.trip_source_revisions[0]);
      const input = {
        ...structuredClone(catalogFixture.trip_source_inputs[0]),
        run_id: runId,
      };
      const originalBytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
        "base64",
      );
      let originalUnavailable = false;
      const originalRead = vi.fn(async () => {
        if (originalUnavailable) throw Error("SOURCE_CAPABILITY_CLOSED");
        return originalBytes;
      });
      Object.assign(source, {
        source_kind: "IMAGE",
        acquisition_channel: "FILE",
      });
      Object.assign(rep, {
        material_kind: "BINARY",
        encoding: null,
        mime_type: "image/png",
        text_content: null,
        remote_state: "VERIFIED",
        byte_count: originalBytes.length,
        payload_sha256: sha(originalBytes),
        verified_at: now.replace("Z", "000Z"),
      });
      Object.assign(input, {
        byte_count: originalBytes.length,
        payload_sha256: sha(originalBytes),
      });
      const { run_id: _run, confirmation_id: _confirmation, ...pin } = input;
      const pdfSource = pdf
        ? {
            original: {
              representationId: randomUUID(),
              sha256: "d".repeat(64),
              byteCount: 1700,
            },
            sealSha256: "e".repeat(64),
            pageMapSha256: "f".repeat(64),
            transformOptionsSha256: PDF_V2_OPTIONS_SHA,
          }
        : undefined;
      const originalPdf = pdfSource
        ? {
            ...rep,
            id: pdfSource.original.representationId,
            role: "ORIGINAL",
            material_kind: "BINARY",
            encoding: null,
            text_content: null,
            mime_type: "application/pdf",
            original_filename: "Fixture.pdf",
            byte_count: pdfSource.original.byteCount,
            payload_sha256: pdfSource.original.sha256,
            remote_state: "VERIFIED",
            verified_at: now.replace("Z", "000Z"),
            storage_provider: "supabase_storage",
            storage_bucket: "trip-source-material",
            object_key: `v1/${trip}/${source.id}/${pdfSource.original.representationId}/payload`,
          }
        : undefined;
      if (pdfSource) {
        Object.assign(rep, {
          role: "DERIVED",
          parent_ids: [pdfSource.original.representationId],
          transform_key: "otr.pdf.qpdf-poppler",
          transform_version: "2",
          transform_options_sha256: PDF_V2_OPTIONS_SHA,
          regenerability: "POSSIBLE",
        });
        revision.original_representation_ids = [pdfSource.original.representationId];
      }
      const inputPins = [
        {
          kind: "SOURCE",
          source_id: pin.source_id,
          material_revision: 1,
          representation_id: pin.representation_id,
          payload_sha256: pin.payload_sha256,
          byte_count: pin.byte_count,
          input_id: pin.id,
          transform_sha256: pdfSource?.transformOptionsSha256 ?? null,
        },
      ];
      const binding = {
        actorId: actor,
        tripId: trip,
        batchId: batch,
        submissionSha256: "a".repeat(64),
        runId,
        taskId,
        generation: 1,
        createdAt: now,
        inputs: [{ ...pin, ...(pdfSource ? { pdfSource } : {}) }],
      };
      const manifest = {
        accountId: actor,
        tripId: trip,
        batchId: batch,
        runId,
        taskId,
        submissionSha256: binding.submissionSha256,
        representations: [
          {
            inputId: pin.id,
            sourceId: pin.source_id,
            representationId: pin.representation_id,
            revision: 1,
            sha256: pin.payload_sha256,
            byteCount: pin.byte_count,
            mime: "image/png",
            text: null,
            pngSource: {
              actorAccountId: actor,
              tripId: trip,
              sourceId: pin.source_id,
              representationId: pin.representation_id,
              sourceRevision: 1,
              sourceRowRevision: pin.observed_source_row_revision,
              sha256: pin.payload_sha256,
              byteCount: pin.byte_count,
              verification: {
                attemptId: randomUUID(),
                operationId: randomUUID(),
                terminalEvidenceSha256: "e".repeat(64),
                profileId: "PNG_STATIC_RGB8_RGBA8_V1",
                profileSha256:
                  "0e22d87a595129dbd9a3b2b00a771379f0e26d15d7a46781c76c7c08ed65a726",
              },
            },
            ...(pdfSource ? { pdfSource } : {}),
          },
        ],
      };
      const run = {
        ...structuredClone(catalogFixture.trip_source_runs[0]),
        id: runId,
        state: "PENDING",
        row_revision: 1,
        completed_at: null,
        created_at: now.replace("Z", "000Z"),
        input_sha256: persistenceDigest(inputPins),
        extractor_key: "otr-universal-interpretation-v1",
      };
      const catalog = {
        version: 2,
        actor_account_id: actor,
        trip_id: trip,
        ...Object.fromEntries(Object.keys(tripImportCatalogSchemas).map((k) => [k, []])),
        trip_sources: [source],
        trip_source_revisions: [revision],
        trip_source_representations: originalPdf ? [originalPdf, rep] : [rep],
        trip_source_runs: [run],
        trip_source_inputs: [input],
      };
      universalImportSnapshotSchema.parse(catalog);
      let registered = false,
        sourceCurrent = true,
        authorized = true,
        manifestAvailable = true;
      const sourceQuery = vi.fn(async (q: string) => {
        if (
          !manifestAvailable &&
          q.includes("trip_source_read_sustained_universal_inputs")
        )
          throw Error("ORIGINAL_TEMPORARY_COPY_UNAVAILABLE");
        if (!sourceCurrent && q.startsWith("SELECT")) throw Error("INPUT_STALE");
        if (q.includes("trip_source_find_sustained_universal_binding"))
          return { rows: [{ binding: registered ? binding : null }] };
        if (q.includes("trip_source_begin_sustained_universal_inputs")) {
          registered = true;
          return { rows: [{ run: binding }] };
        }
        if (q.includes("trip_source_read_sustained_universal_inputs"))
          return { rows: [{ manifest: structuredClone(manifest) }] };
        return { rows: [] };
      });
      const sourceConnection = {
        withLease: async <T,>(work: (lease: any) => Promise<T>) =>
          work({ query: sourceQuery, retire() {} }),
      };
      const catalogConnection = {
        withLease: async <T,>(work: (lease: any) => Promise<T>) =>
          work({
            query: async (q: string) => ({
              rows: q.includes("session_user")
                ? [{ principal: "otr_trip_publication_catalog_reader" }]
                : q.includes("trip_source_read_import_catalogs")
                  ? [{ catalog }]
                  : [],
            }),
          }),
      };
      const materials = new Map<string, Uint8Array>(),
        pins = new Map<string, unknown>();
      const stores = {
        custody: {
          async put(v: any) {
            expect(sha(v.bytes)).toBe(v.sha256);
            materials.set(v.reservationId, v.bytes);
          },
          async read(v: any) {
            const b = materials.get(v.reference);
            if (!b || sha(b) !== v.sha256 || b.byteLength !== v.byteCount)
              throw Error("FIXTURE_CUSTODY_MISMATCH");
            return b;
          },
        },
        retained: {
          async put(a: any, p: any) {
            pins.set(a.attempt_id, p);
          },
          async read(a: any) {
            return pins.get(a.attempt_id) ?? null;
          },
        },
        retainRaw: vi.fn(),
        readRaw: vi.fn(),
      };
      const sends = vi.fn(async () => {
        return {
          output: {
            v: 2,
            items: [],
            bookings: [],
            tickets: [],
            links: [],
            issues: [],
          },
          providerReceipt: {
            outcome: unknown ? ("UNKNOWN" as const) : ("SETTLED" as const),
            requestId: "synthetic-no-network",
          },
        };
      });
      fakeRuntime.mockImplementation(async (p: UniversalRuntimeProvisioning) => ({
        status: "CONFIGURED_NOT_ACTIVATED",
        universalImportPort: createUniversalPort(
          createUniversalContinuationHost({
            ...p,
            ...p.stores,
            readSourceManifest: createUniversalSourceReader({
              connection: sourceConnection,
              continuous: true,
              readBinary: originalRead,
            }),
            assertDurableStart: async () => {},
            assertCompletion: async () => {},
          }),
          // Simulates the hosted receipt grammar without any HTTP/Provider I/O.
          { mode: "HOSTED", interpret: sends },
        ),
      }));
      const context = await captureAccountRequestContext(trip, async () => actor);
      const revokedAuthFailure = new Error("AUTH_REVOKED_FIXTURE");
      const hostDeps: Parameters<typeof createUniversalContinuousHost>[0] = {
        enabled: true,
        context,
        db,
        assertCurrentAuth: async () => {
          if (!authorized) throw revokedAuthFailure;
        },
        catalogConnection,
        bootstrapLedger: async () => ({
          journey: {
            id: trip,
            title: "Synthetic only",
            startDate: null,
            endDate: null,
            settlementCurrency: "NZD",
            settlementScale: 2,
            valuationPolicy: "REFERENCE_RATE",
            updatedAt: now,
          },
          members: [],
          households: [],
          expenses: [],
          corrections: [],
          rateQuotes: [],
          actor: {
            userId: actor,
            memberId: null,
            role: "owner",
            capabilities: {
              canRead: true,
              canCreateExpense: false,
              canEditOwnExpense: false,
              canCorrectAnyExpense: false,
              canSuggestCorrection: false,
              canResolveOwnExpenseConflict: false,
            },
          },
          cursor: null,
          serverTime: now,
        }),
        selectProvider: async () => ({
          integrationId: "synthetic",
          configVersion: 2,
          configurationSha256: "c".repeat(64),
          providerConfigId: "70000000-0000-4000-8000-000000000001",
          priceScheduleId: "70000000-0000-4000-8000-000000000002",
          providerId: "DeepSeek",
          modelId: "deepseek-flash",
          modelVersion: "DeepSeek-V4.1-Flash",
          adapterVersion: "fixture",
          region: "fixture",
          route: "fixture",
          maxCostNanos: "1000000000",
          taskLifetimeMs: 600000,
        }),
        runtime: {
          stores: stores as never,
          sourceConnection,
          taskReceiptConnection: sourceConnection,
          gateway: {} as never,
          readBinary: originalRead,
          environment: () => undefined,
        },
        readAdmittedPrice: async () => {
          throw Error("NO_UNSETTLED_RECOVERY_FIXTURE");
        },
      };
      const host = createUniversalContinuousHost(hostDeps);
      const prepared = await host.prepare({
        batchId: batch,
        submissionSha256: binding.submissionSha256,
        inputs: [pin],
      });
      expect(prepared.context.taskId).toBe(taskId);
      const dispatchManifest = {
        accountId: actor,
        tripId: trip,
        batchId: batch,
        representations: [
          {
            accountId: actor,
            tripId: trip,
            batchId: batch,
            inputId: pin.id,
            sourceId: pin.source_id,
            representationId: pin.representation_id,
            revision: 1,
            originalSha256: pin.payload_sha256,
            mime: "image/png",
            bytes: originalBytes,
          },
        ],
      };
      const request = {
        version: "otr.backend.universal-interpretation/1" as const,
        tripId: trip,
        taskId,
      };
      // Frozen from f86008f0 prepareUniversalDispatch for this fixed PNG fixture.
      expect(
        sha(
          Buffer.from(
            JSON.stringify(
              candidateDispatch(actor, batch, request, dispatchManifest).dispatchMarker,
            ),
          ),
        ),
      ).toBe("7fa1d0b88ec7b94fa6820a2dce5afcbdd87741eb3701c40410e11ec7e934fb8c");
      originalUnavailable = true;
      const pendingReader = createUniversalContinuousHost({
        ...hostDeps,
        retainedResultsEnabled: true,
      });
      await expect(pendingReader.readResult(batch, taskId)).rejects.toThrow(
        "SOURCE_CAPABILITY_CLOSED",
      );
      await expect(pendingReader.readPublished(batch, taskId)).rejects.toThrow(
        "SOURCE_CAPABILITY_CLOSED",
      );
      expect(sends).not.toHaveBeenCalled();
      originalUnavailable = false;
      const operation = (await db.getFirstAsync<SyncOperation>(
        `SELECT id,owner_user_id AS ownerUserId,trip_id AS tripId,entity_type AS entityType,entity_id AS entityId,operation_type AS operationType,idempotency_key AS idempotencyKey,base_version AS baseVersion,payload_json AS payloadJson,status,attempt_count AS attemptCount,next_attempt_at AS nextAttemptAt,claim_owner AS claimOwner,created_at AS createdAt,updated_at AS updatedAt FROM sync_operations WHERE entity_id=?`,
        taskId,
      ))!;
      const queue = createIntelligenceWakeQueue(db, {
        getAccountId: async () => actor,
        sha256: async (b) => sha(b),
        now: () => new Date().toISOString(),
      });
      expect(await queue.claim(context, operation, "retained-fixture")).toBe(true);
      const result = await host.executeQueued(batch, taskId, {
        operationId: operation.id,
        owner: operation.claimOwner!,
        baseVersion: operation.baseVersion!,
      });
      expect(result?.providerOutcome).toBe("SETTLED");
      await queue.settle(context, operation);
      originalUnavailable = true;
      expect((await host.readContext(batch)).activity?.state).toBe("RESULTS_READY");
      await expect(host.readResult(batch, taskId)).rejects.toThrow(
        "SOURCE_CAPABILITY_CLOSED",
      );
      await expect(host.readPublished(batch, taskId)).rejects.toThrow(
        "SOURCE_CAPABILITY_CLOSED",
      );
      const reads = originalRead.mock.calls.length;
      const reopen = createUniversalContinuousHost({
        ...hostDeps,
        retainedResultsEnabled: true,
      });
      expect(await reopen.readResult(batch, taskId)).toEqual(result);
      expect((await reopen.readPublished(batch, taskId))?.result).toEqual(result);
      const noSecond = {
        withLease: async () => {
          throw Error("SECOND_SOURCE_CONNECTION_FORBIDDEN");
        },
      };
      const owningMetadata = createUniversalSourceReader({
        connection: noSecond,
        readSnapshot: async () => structuredClone(manifest),
        readBinary: async () => {
          throw Error("SOURCE_CAPABILITY_CLOSED");
        },
      });
      const owningPort = {
        lookup: async () => universalRunBindingSchema.parse(structuredClone(binding)),
        readManifest: async () => {
          throw Error("SOURCE_CAPABILITY_CLOSED");
        },
      };
      const legacyHeld = createUniversalContinuousHost({
        ...hostDeps,
        retainedResultsEnabled: true,
        runtime: { ...hostDeps.runtime, sourceConnection: noSecond },
        publishedSource: owningPort,
      });
      await expect(legacyHeld.readPublished(batch, taskId)).rejects.toThrow(
        "SOURCE_CAPABILITY_CLOSED",
      );
      const held = createUniversalContinuousHost({
        ...hostDeps,
        retainedResultsEnabled: true,
        runtime: { ...hostDeps.runtime, sourceConnection: noSecond },
        publishedSource: {
          ...owningPort,
          withRetainedMetadata: owningMetadata.withRetainedMetadata,
        },
      });
      expect(await held.readResult(batch, taskId)).toEqual(result);
      expect((await held.readPublished(batch, taskId))?.result).toEqual(result);

      expect(originalRead).toHaveBeenCalledTimes(reads);
      expect(sends).toHaveBeenCalledTimes(1);
      const count = sql
        .prepare("SELECT count(*) AS n FROM intelligence_continuation_attempts")
        .get();
      expect(count).toEqual({ n: 1 });
      const taskRow = sql
        .prepare("SELECT * FROM intelligence_continuations WHERE task_id=?")
        .get(taskId)!;
      const attempt = sql
        .prepare("SELECT * FROM intelligence_continuation_attempts WHERE task_id=?")
        .get(taskId)!;
      // Exercise the actual Capture router and sustained Core composition with a different
      // active finite selection. Only storage transport and SQL responses are synthetic.
      const target = {
        accountId: actor,
        tripId: trip,
        batchId: batch,
        taskId,
        runId,
        inputId: pin.id,
        sourceId: source.id,
        representationId: rep.id,
        sourceRevision: pin.material_revision,
        sourceRowRevision: pin.observed_source_row_revision,
        representationRowRevision: 2,
        sha256: pin.payload_sha256,
        byteCount: pin.byte_count,
      };
      const finite = { accountId: randomUUID(), tripId: randomUUID() };
      let role = "otr_trip_core_v2_gateway",
        gate = true,
        representationRevision = 2,
        sourceRevisionValid = true,
        coreScopeValid = true,
        currentActor = actor,
        tripAccess = true,
        resultBytes = originalBytes,
        onGet = () => {};
      const coreRun = {
        ...run,
        capture_batch_id: batch,
        interpretation_task_id: taskId,
        capture_submission_sha256: binding.submissionSha256,
        scope_source_ids: [source.id],
      };
      const coreQuery = vi.fn(async (q: string, args: unknown[] = []) => {
        const rows = (value: Record<string, unknown>) => ({ rows: [value] });
        if (/^(BEGIN|SET LOCAL|COMMIT|ROLLBACK)/.test(q)) {
          if (q.startsWith("SET LOCAL ROLE")) role = q.split(" ").at(-1)!;
          return { rows: [] };
        }
        if (q.includes("session_user"))
          return rows({ principal: "otr_trip_core_v2_gateway", role, actor, trip });
        if (q.includes("set_config")) {
          expect(args).toEqual([actor, trip]);
          return { rows: [] };
        }
        if (q.includes("trip_sustained_core_read_scope_allowed"))
          return rows({ allowed: gate });
        if (q.includes("trip_core_lock_actor_scope"))
          return rows({ actor: { accountId: actor, tripId: trip, active: true } });
        if (q.includes("trip_core_lock_source_scope")) {
          expect(role).toBe("otr_trip_core_v2_gateway");
          expect(args).toEqual([actor, trip, JSON.stringify([source.id])]);
          return rows({ source_count: 1, allowed: coreScopeValid });
        }
        expect(role).toBe("otr_trip_core_v2_writer");
        if (q.includes("WITH actual AS MATERIALIZED"))
          return rows({
            run: coreRun,
            pins: [{ pin, valid: true, representationRole: "ORIGINAL" }],
            checked_hash: coreRun.input_sha256,
          });
        if (q.includes("AS run FROM")) return rows({ run: coreRun });
        if (q.includes("r.row_revision::float8 AS revision")) {
          expect(args).toEqual([
            actor,
            trip,
            source.id,
            rep.id,
            1,
            1,
            pin.payload_sha256,
            pin.byte_count,
          ]);
          return sourceRevisionValid
            ? rows({ revision: representationRevision })
            : { rows: [] };
        }
        if (q.includes("material_kind,encoding")) return rows(rep);
        if (q.includes("trip_source_read_sustained_png_proof"))
          return rows({ proof: manifest.representations[0].pngSource });
        throw Error("UNEXPECTED_CORE_SQL");
      });
      const coreConnection = {
        withLease: async <T>(work: (lease: any) => Promise<T>) =>
          work({ query: coreQuery, retire: vi.fn() }),
      };
      const {
        batchId,
        taskId: retainedTask,
        runId: retainedRun,
        inputId,
        sourceRevision,
        sourceRowRevision,
        representationRowRevision,
        ...oldSource
      } = target;
      const png = createSourcePngRuntimePorts(
        {
          version: "OTR_DEV_UNIVERSAL_PNG/1",
          enabled: true,
          environment: "DEV",
          project: "tuqigdxrvrerfewsxqgm",
          actorId: finite.accountId,
          tripId: finite.tripId,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          nodeId: randomUUID(),
          retainedOriginalRead: {
            ...oldSource,
            publication: {
              batchId,
              taskId: retainedTask,
              runId: retainedRun,
              inputId,
              sourceRevision,
              sourceRowRevision,
              representationRowRevision,
            },
          },
        },
        {
          gateway: {} as never,
          connection: sourceConnection,
          storageToken: "offline-fixture",
          assertEnabled: () => {
            throw Error("NO_WORKER_EXPECTED");
          },
          assertReadEnabled: () => {},
        },
      );
      const storage = vi.spyOn(https, "request").mockImplementation((...args) => {
        const [url, options, respond] = args as unknown as [
          URL,
          { method: string },
          (stream: PassThrough) => void,
        ];
        expect(options.method).toBe("GET");
        expect(url.pathname).toMatch(
          new RegExp(`/v1/${trip}/${source.id}/${rep.id}/payload$`),
        );
        return Object.assign(new EventEmitter(), {
          writableFinished: true,
          end(body: unknown) {
            expect(body).toBeUndefined();
            onGet();
            const response = Object.assign(new PassThrough(), {
              statusCode: 200,
              complete: true,
              headers: { "content-type": "image/png" },
              rawHeaders: ["Content-Type", "image/png"],
            });
            respond(response);
            response.end(resultBytes);
          },
        }) as unknown as ReturnType<typeof https.request>;
      });
      const retainedPng = createRetainedPngReader(
        target,
        db,
        stores as never,
        png.readOriginal,
      );
      const ordinaryRead = vi.fn(async () => result);
      const forRequest = vi.fn(async () => ({
        universalImportPort: { read: ordinaryRead },
      }));
      const start = vi.fn((_options: BackendDependencies) => ({
        once: vi.fn(),
        close: vi.fn(),
      }));
      vi.doMock("./serverStartup", () => ({ startDevBackend: start }));
      vi.doMock("./flight-enrichment/devRuntime", () => ({
        loadDevFlightEnrichmentRuntime: async () => undefined,
      }));
      vi.doMock("./captureCustodyRuntime", () => ({
        loadDevCaptureCustody: async () => undefined,
      }));
      vi.doMock("./universalContinuousRuntime", () => ({
        loadDevUniversalContinuousRuntime: async () => ({ retainedPng, forRequest }),
      }));
      vi.doMock("./tripMetadataRuntime", () => ({
        loadDevTripMetadataV2Runtime: async () => undefined,
      }));
      vi.doMock("./tripCreateRuntime", () => ({
        loadDevTripCreateRuntime: async (
          _env: unknown,
          p1: unknown,
          options: { retainedPng: typeof retainedPng },
        ) => {
          expect(p1).toBeUndefined();
          expect(options.retainedPng).toBe(retainedPng);
          const core = createCorePgHttpConnection(
            coreConnection,
            async (b) => sha(b),
            undefined,
            { sustainedDev: true },
            undefined,
            options,
          );
          return {
            ...createSustainedDevTripPorts(
              { create: {} as never, metadata: {} as never, core },
              true,
            ),
            tripMetadataV2Port: {},
          };
        },
      }));
      vi.stubEnv("OTR_DEV_UNIVERSAL_CONTINUOUS_HOST", "enabled");
      vi.stubEnv("OTR_DEV_UNIVERSAL_SETTLED_RECOVERY", undefined);
      vi.stubEnv("OTR_DEV_UNIVERSAL_P1_SOURCE_REVIEW", undefined);
      const processOnce = vi.spyOn(process, "once").mockImplementation(() => process);
      try {
        await import("./serverCapture");
        await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
        const handle = createDevBackendHandler({
          ...start.mock.calls[0][0],
          gateway: {
            async validateAccessToken() {
              return { id: currentActor, accountClass: "NORMAL_ACCOUNT" };
            },
            async canReadTrip() {
              return tripAccess;
            },
          } as unknown as BackendDependencies["gateway"],
        });
        const path = `https://local/v2/import-batches/${batch}/interpretations/${taskId}?tripId=${trip}`;
        const get = (suffix = "&retainedOriginal=1", headers: HeadersInit = {}) =>
          handle(
            new Request(path + suffix, {
              headers: { Authorization: "Bearer fixture", ...headers },
            }),
          );
        const noBytes = async (response: Response, status: number) => {
          expect(response.status).toBe(status);
          expect(await response.arrayBuffer()).toHaveProperty("byteLength", 0);
        };
        const totalChanges = () => sql.prepare("SELECT total_changes() AS n").get()?.n;
        const changes = totalChanges();
        const response = await get();
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("vary")).toBe("Authorization");
        expect(response.headers.get("content-length")).toBe(String(originalBytes.length));
        expect(response.headers.get("etag")).toBe('"' + sha(originalBytes) + '"');
        expect(Buffer.from(await response.arrayBuffer())).toEqual(originalBytes);
        expect(storage).toHaveBeenCalledOnce();
        const statements = coreQuery.mock.calls.map(([q]) => q);
        expect(statements.findIndex((q) => q.includes("trip_core_lock_source_scope")))
          .toBeLessThan(statements.findIndex((q) => q.includes("trip_core_lock_actor_scope")));
        expect(forRequest).not.toHaveBeenCalled();
        expect(await (await get("")).json()).toEqual(result);
        expect(ordinaryRead).toHaveBeenCalledOnce();
        await noBytes(await get("&retainedOriginal=1&retainedOriginal=1"), 400);
        await noBytes(await get(undefined, { Range: "bytes=0-8" }), 400);
        await noBytes(await get(undefined, { "Content-Length": "1" }), 400);
        await noBytes(
          await handle(
            new Request(path.replace(taskId, randomUUID()) + "&retainedOriginal=1", {
              headers: { Authorization: "Bearer fixture" },
            }),
          ),
          404,
        );
        currentActor = finite.accountId;
        await noBytes(await get(), 404);
        currentActor = actor;
        tripAccess = false;
        await noBytes(await get(), 403);
        tripAccess = true;
        gate = false;
        await noBytes(await get(), 503);
        gate = true;
        coreScopeValid = false;
        await noBytes(await get(), 503);
        coreScopeValid = true;
        representationRevision = 3;
        await noBytes(await get(), 503);
        representationRevision = 2;
        sourceRevisionValid = false;
        await noBytes(await get(), 503);
        sourceRevisionValid = true;
        expect(storage).toHaveBeenCalledOnce();
        onGet = () => {
          representationRevision = 3;
        };
        await noBytes(await get(), 503);
        representationRevision = 2;
        onGet = () => {
          tripAccess = false;
        };
        await noBytes(await get(), 403);
        tripAccess = true;
        onGet = () => {};
        resultBytes = Buffer.from(originalBytes);
        resultBytes[25] ^= 1;
        await noBytes(await get(), 503);
        resultBytes = originalBytes;
        expect(totalChanges()).toBe(changes);
        expect(sends).toHaveBeenCalledTimes(1);
        const first = db.getFirstAsync.bind(db);
        let publicationChanged = false;
        onGet = () => {
          publicationChanged = true;
        };
        const drift = vi
          .spyOn(db, "getFirstAsync")
          .mockImplementation(async (q, ...args) => {
            const row = await first<Record<string, unknown>>(q, ...args);
            return publicationChanged &&
              row &&
              q.includes("FROM intelligence_continuations")
              ? { ...row, publication_fence: Number(row.publication_fence) + 1 }
              : row;
          });
        try {
          await noBytes(await get(), 503);
        } finally {
          drift.mockRestore();
        }
        expect(totalChanges()).toBe(changes);
        expect(storage).toHaveBeenCalledTimes(5);
        expect(forRequest).toHaveBeenCalledOnce();
        expect(
          coreQuery.mock.calls.some(([q]) => /^(INSERT|UPDATE|DELETE)/.test(q)),
        ).toBe(false);
      } finally {
        processOnce.mockRestore();
        storage.mockRestore();
        png.close();
        vi.unstubAllEnvs();
        for (const mod of [
          "./serverStartup",
          "./flight-enrichment/devRuntime",
          "./captureCustodyRuntime",
          "./universalContinuousRuntime",
          "./tripMetadataRuntime",
          "./tripCreateRuntime",
        ])
          vi.doUnmock(mod);
      }

      // A metadata/Task pins and B binding/sealed marker/response each pass their own checks.
      // Their shared row revision must not substitute for checking every cross-boundary pin.
      const bindingA = structuredClone(binding.inputs[0]);
      const bindingB = {
        ...bindingA,
        id: randomUUID(),
        source_id: randomUUID(),
        representation_id: randomUUID(),
        payload_sha256: "b".repeat(64),
        byte_count: bindingA.byte_count + 1,
      };
      const resultB = structuredClone(result!);
      Object.assign(resultB.sourceBindings[0], {
        inputId: bindingB.id,
        sourceId: bindingB.source_id,
        representationId: bindingB.representation_id,
        originalSha256: bindingB.payload_sha256,
        submittedSha256: bindingB.payload_sha256,
      });
      resultB.requestSha256 = sha(
        Buffer.from(
          JSON.stringify({
            version: resultB.version,
            actorId: actor,
            accountId: actor,
            tripId: trip,
            batchId: batch,
            bindings: resultB.sourceBindings,
          }),
        ),
      );
      const markerB = Buffer.from(JSON.stringify(sealedUniversalDispatchMarker(resultB))),
        responseB = Buffer.from(JSON.stringify(resultB));
      const requestRef = String(attempt.request_material_reference),
        resultRef = String(attempt.response_material_reference);
      const savedMarker = materials.get(requestRef)!,
        savedResponse = materials.get(resultRef)!,
        savedPin = pins.get(String(attempt.attempt_id));
      materials.set(requestRef, markerB);
      materials.set(resultRef, responseB);
      pins.set(String(attempt.attempt_id), {
        reference: resultRef,
        sha256: sha(responseB),
        byteCount: responseB.length,
      });
      binding.inputs[0] = bindingB;
      const mapB = (row: any) =>
        !row
          ? row
          : row.attempt_id
            ? {
                ...row,
                request_sha256: resultB.requestSha256,
                request_material_sha256: sha(markerB),
                response_sha256: sha(responseB),
                response_material_sha256: sha(responseB),
              }
            : row.work_disposition
              ? {
                  ...row,
                  result_sha256: sha(responseB),
                  publication_sha256: sha(responseB),
                }
              : row;
      const firstA = db.getFirstAsync.bind(db),
        allA = db.getAllAsync.bind(db);
      const firstB = vi
        .spyOn(db, "getFirstAsync")
        .mockImplementation(async (q, ...args) => mapB(await firstA(q, ...args)));
      const allB = vi
        .spyOn(db, "getAllAsync")
        .mockImplementation(async (q, ...args) => (await allA(q, ...args)).map(mapB));
      const disclose = vi.spyOn(stores.custody, "read");
      try {
        expect(bindingB.observed_source_row_revision).toBe(
          manifest.representations[0].pngSource.sourceRowRevision,
        );
        await expect(reopen.readResult(batch, taskId)).rejects.toThrow(
          "UNIVERSAL_SOURCE_IMAGE_UNQUALIFIED",
        );
        expect(disclose).not.toHaveBeenCalled();
      } finally {
        disclose.mockRestore();
        firstB.mockRestore();
        allB.mockRestore();
        binding.inputs[0] = bindingA;
        materials.set(requestRef, savedMarker);
        materials.set(resultRef, savedResponse);
        pins.set(String(attempt.attempt_id), savedPin);
      }
      const ref = String(attempt.request_material_reference),
        marker = materials.get(ref)!;
      materials.set(ref, Buffer.from("corrupt"));
      await expect(reopen.readResult(batch, taskId)).rejects.toThrow();
      materials.set(ref, marker);
      const responseRef = String(attempt.response_material_reference),
        response = materials.get(responseRef)!;
      materials.set(responseRef, Buffer.from("corrupt"));
      await expect(reopen.readResult(batch, taskId)).rejects.toThrow();
      materials.set(responseRef, response);
      const proof = manifest.representations[0].pngSource;
      proof.sourceRowRevision++;
      await expect(reopen.readResult(batch, taskId)).rejects.toThrow(
        "UNIVERSAL_SOURCE_IMAGE_UNQUALIFIED",
      );
      proof.sourceRowRevision--;
      const query = sourceQuery.getMockImplementation()!;
      let snapshots = 0;
      sourceQuery.mockImplementation(async (q) => {
        const value = await query(q);
        if (
          q.includes("trip_source_read_sustained_universal_inputs") &&
          ++snapshots === 2
        )
          (
            value.rows[0] as any
          ).manifest.representations[0].pngSource.verification.terminalEvidenceSha256 =
            "f".repeat(64);
        return value;
      });
      await expect(reopen.readResult(batch, taskId)).rejects.toThrow(
        "UNIVERSAL_SOURCE_CHANGED",
      );
      sourceQuery.mockImplementation(query);
      sourceCurrent = false;
      await expect(reopen.readResult(batch, taskId)).rejects.toThrow("INPUT_STALE");
      sourceCurrent = true;
      authorized = false;
      await expect(reopen.readResult(batch, taskId)).rejects.toBe(revokedAuthFailure);
      authorized = true;
      const getAll = db.getAllAsync.bind(db);
      const uninstalled = vi
        .spyOn(db, "getAllAsync")
        .mockImplementation(async (q, ...args) => {
          const rows = await getAll(q, ...args);
          return q.includes("FROM intelligence_continuation_attempts")
            ? rows.map((row) => ({
                ...(row as any),
                result_install_disposition: "NONE",
              }))
            : rows;
        });
      await expect(reopen.readResult(batch, taskId)).rejects.toThrow();
      uninstalled.mockRestore();
      expect(
        sql
          .prepare("SELECT * FROM intelligence_continuations WHERE task_id=?")
          .get(taskId),
      ).toEqual(taskRow);
      expect(await reopen.readResult(batch, taskId)).toEqual(result);
      expect(originalRead).toHaveBeenCalledTimes(reads);
      expect(sends).toHaveBeenCalledTimes(1);
    } finally {
      sql.close();
      fakeRuntime.mockReset();
    }
  },
);
