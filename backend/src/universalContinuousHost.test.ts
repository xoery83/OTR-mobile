// Network-none composition fixture: actual Task SQLite/Repository/Queue and
// ContinuationHost. Source/Catalog/Provider/usage-proof ports are controlled
// synthetic fixtures, NOT DEV, real Provider, Auth or Admission acceptance.
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import {
  createIntelligenceWakeQueue,
  type SyncOperation,
} from "../../src/data/sync/syncOperationRepository";
import { tripImportCatalogSchemas } from "../../src/data/api/tripImportCatalogContracts";
import { universalImportSnapshotSchema } from "../../src/data/api/tripImportCatalogContracts";
import catalogFixture from "../../src/data/repositories/__fixtures__/tripImportCatalogs.json";
import { createUniversalContinuousHost } from "./universalContinuousHost";
import { initializeUniversalTaskDatabase } from "./universalTaskBootstrap";
import {
  universalRunBindingSchema,
  universalBatchIdentity,
} from "./universalBatchSource";
import { createUniversalContinuationHost } from "./universalContinuationHost";
import { createUniversalSourceReader } from "./universalSourceRead";
import { createUniversalPort } from "./universalImport";
import type { UniversalRuntimeProvisioning } from "./universalRuntime";
import { persistenceDigest } from "./externalIntegrationPersistence";
const fakeRuntime = vi.hoisted(() => vi.fn());
vi.mock("./universalRuntime", () => ({ createUniversalBackendRuntime: fakeRuntime }));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
it("normal preparation, targeted claim, publication and repeat wake use one synthetic send; GET never sends", async () => {
  const sql = new DatabaseSync(":memory:"),
    db = initializeUniversalTaskDatabase(sql);
  try {
    const actor = catalogFixture.actor_account_id,
      trip = catalogFixture.trip_id,
      batch = randomUUID(),
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
    const { run_id: _run, confirmation_id: _confirmation, ...pin } = input;
    const inputPins = [
      {
        kind: "SOURCE",
        source_id: pin.source_id,
        material_revision: 1,
        representation_id: pin.representation_id,
        payload_sha256: pin.payload_sha256,
        byte_count: pin.byte_count,
        input_id: pin.id,
        transform_sha256: null,
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
      inputs: [pin],
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
          mime: "text/plain",
          text: rep.text_content,
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
      trip_source_representations: [rep],
      trip_source_runs: [run],
      trip_source_inputs: [input],
    };
    universalImportSnapshotSchema.parse(catalog);
    let registered = false,
      sourceCurrent = true,
      authorized = true,
      manifestAvailable = true;
    const sourceQuery = vi.fn(async (q: string) => {
      if (!manifestAvailable && q.includes("trip_source_read_sustained_universal_inputs"))
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
      withLease: async <T>(work: (lease: any) => Promise<T>) =>
        work({ query: sourceQuery, retire() {} }),
    };
    const catalogConnection = {
      withLease: async <T>(work: (lease: any) => Promise<T>) =>
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
    const sends = vi.fn(async () => ({
      output: { v: 2, items: [], bookings: [], tickets: [], links: [], issues: [] },
      providerReceipt: { outcome: "SETTLED" as const, requestId: "synthetic-no-network" },
    }));
    fakeRuntime.mockImplementation(async (p: UniversalRuntimeProvisioning) => ({
      status: "CONFIGURED_NOT_ACTIVATED",
      universalImportPort: createUniversalPort(
        createUniversalContinuationHost({
          ...p,
          ...p.stores,
          readSourceManifest: createUniversalSourceReader({
            connection: sourceConnection,
            continuous: true,
            readBinary: async () => {
              throw Error("NO_BINARY_FIXTURE");
            },
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
        readBinary: async () => {
          throw Error("NO_BINARY_FIXTURE");
        },
        environment: () => undefined,
      },
      readAdmittedPrice: async () => {
        throw Error("NO_UNSETTLED_RECOVERY_FIXTURE");
      },
    };
    const unprepared = createUniversalContinuousHost({
      ...hostDeps,
      publishedSource: {
        lookup: async () => null,
        readManifest: async () => {
          throw Error("UNPREPARED_MATERIAL_READ");
        },
      },
    });
    await expect(unprepared.readContext(batch)).rejects.toThrow(
      "UNIVERSAL_BATCH_NOT_PREPARED",
    );
    expect(sends).not.toHaveBeenCalled();
    expect(
      sql.prepare("SELECT count(*) AS n FROM intelligence_continuations").get(),
    ).toEqual({ n: 0 });
    const host = createUniversalContinuousHost(hostDeps);
    const prepare = {
      batchId: batch,
      submissionSha256: binding.submissionSha256,
      inputs: [pin],
    };
    expect((await host.prepare(prepare)).status).toBe("QUEUED");
    expect((await host.prepare(prepare)).status).toBe("EXISTING");
    expect((await host.readContext(batch)).activity).toMatchObject({
      state: "PENDING",
      attemptCount: 0,
      rowRevision: 2,
      recordedAt: now,
    });
    manifestAvailable = false;
    const materialReads = () =>
      sourceQuery.mock.calls.filter(([query]) =>
        query.includes("trip_source_read_sustained_universal_inputs"),
      ).length;
    const beforeStatusRead = materialReads();
    await expect(host.readContext(batch)).resolves.toMatchObject({
      taskId,
      activity: { state: "PENDING" },
    });
    expect(materialReads()).toBe(beforeStatusRead);
    authorized = false;
    const failedLogger = vi.spyOn(console, "info").mockImplementationOnce(() => {
      throw Error("FIXTURE_LOG_SINK_FAILED");
    });
    try {
      await expect(host.readContext(batch)).rejects.toBe(revokedAuthFailure);
    } finally {
      failedLogger.mockRestore();
    }
    authorized = true;
    sourceCurrent = false;
    await expect(host.readContext(batch)).rejects.toThrow("INPUT_STALE");
    sourceCurrent = true;
    await expect(host.readResult(batch, taskId)).rejects.toThrow(
      "ORIGINAL_TEMPORARY_COPY_UNAVAILABLE",
    );
    expect(sends).not.toHaveBeenCalled();
    manifestAvailable = true;
    expect(await host.readResult(batch, taskId)).toBeNull();
    expect(await host.readPublished(batch, taskId)).toBeNull();
    expect(sends).not.toHaveBeenCalled();
    const queue = createIntelligenceWakeQueue(db, {
      getAccountId: async () => actor,
      sha256: async (b) => sha(b),
      now: () => new Date().toISOString(),
    });
    async function operation() {
      return (await db.getFirstAsync<SyncOperation>(
        `SELECT id,owner_user_id AS ownerUserId,trip_id AS tripId,entity_type AS entityType,entity_id AS entityId,operation_type AS operationType,idempotency_key AS idempotencyKey,base_version AS baseVersion,payload_json AS payloadJson,status,attempt_count AS attemptCount,next_attempt_at AS nextAttemptAt,claim_owner AS claimOwner,created_at AS createdAt,updated_at AS updatedAt FROM sync_operations WHERE entity_type='INTELLIGENCE_CONTINUATION' AND entity_id=?`,
        taskId,
      ))!;
    }
    const first = await operation();
    await expect(
      host.executeQueued(batch, taskId, {
        operationId: first.id,
        owner: "unclaimed",
        baseVersion: first.baseVersion!,
      }),
    ).rejects.toThrow("QUEUE_SCOPE");
    expect(sends).not.toHaveBeenCalled();
    expect(await queue.claim(context, first, "fixture-worker")).toBe(true);
    const selectionFailure = Error("PRIVATE_SOURCE_ORIGINAL_NAME");
    for (const loggerThrows of [false, true]) {
      const log = vi.spyOn(console, "info").mockImplementation(() => {
        if (loggerThrows) throw Error("SYNTHETIC_LOGGER_FAILURE");
      });
      try {
        const failing = createUniversalContinuousHost({
          ...hostDeps,
          selectProvider: async () => {
            throw selectionFailure;
          },
        });
        await expect(
          failing.executeQueued(batch, taskId, {
            operationId: first.id,
            owner: first.claimOwner!,
            baseVersion: first.baseVersion!,
          }),
        ).rejects.toBe(selectionFailure);
        expect(log).toHaveBeenCalledExactlyOnceWith(
          JSON.stringify({
            event: "universal_execution_phase_failed",
            phase: "PROVIDER_SELECTION",
            kind: "OTHER",
          }),
        );
        expect(sends).not.toHaveBeenCalled();
        expect(
          sql
            .prepare("SELECT count(*) AS n FROM intelligence_continuation_attempts")
            .get(),
        ).toEqual({ n: 0 });
      } finally {
        log.mockRestore();
      }
    }
    const schemaFailure = z.string().safeParse(1).error!;
    for (const [failure, kind] of [
      [schemaFailure, "SCHEMA"],
      [TypeError("PRIVATE_ORIGINAL"), "TYPE"],
    ] as const) {
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      fakeRuntime.mockRejectedValueOnce(failure);
      try {
        await expect(
          host.executeQueued(batch, taskId, {
            operationId: first.id,
            owner: first.claimOwner!,
            baseVersion: first.baseVersion!,
          }),
        ).rejects.toBe(failure);
        expect(log).toHaveBeenCalledExactlyOnceWith(
          JSON.stringify({
            event: "universal_execution_phase_failed",
            phase: "RUNTIME_PREPARATION",
            kind,
          }),
        );
        expect(sends).not.toHaveBeenCalled();
        expect(
          sql
            .prepare("SELECT count(*) AS n FROM intelligence_continuation_attempts")
            .get(),
        ).toEqual({ n: 0 });
      } finally {
        log.mockRestore();
      }
    }
    const result = await host.executeQueued(batch, taskId, {
      operationId: first.id,
      owner: first.claimOwner!,
      baseVersion: first.baseVersion!,
    });
    expect(result?.providerOutcome).toBe("SETTLED");
    await queue.settle(context, first);
    expect(sends).toHaveBeenCalledTimes(1);
    // A fresh Host reads the owning persisted state, not elapsed screen time.
    expect(
      (await createUniversalContinuousHost(hostDeps).readContext(batch)).activity,
    ).toMatchObject({ state: "RESULTS_READY", attemptCount: 1 });
    expect(sends).toHaveBeenCalledTimes(1);
    const published = await host.readPublished(batch, taskId);
    expect(published?.result).toEqual(result);
    expect(published?.resultSha256).toMatch(/^[a-f0-9]{64}$/);
    const beforeRead = sourceQuery.mock.calls.filter(([q]) =>
      q.includes("trip_source_read_sustained_universal_inputs"),
    ).length;
    expect(await host.readResult(batch, taskId)).toEqual(result);
    expect(
      sourceQuery.mock.calls.filter(([q]) =>
        q.includes("trip_source_read_sustained_universal_inputs"),
      ).length - beforeRead,
    ).toBe(2);
    const sourceRead = sourceQuery.getMockImplementation()!;
    for (const corrupt of ["MATERIAL", "SECOND_SNAPSHOT"] as const) {
      let reads = 0;
      sourceQuery.mockImplementation(async (q) => {
        const rows = await sourceRead(q);
        if (q.includes("trip_source_read_sustained_universal_inputs")) {
          reads++;
          const row = rows.rows[0];
          if (!row || !("manifest" in row) || !row.manifest)
            throw Error("MANIFEST_FIXTURE_MISSING");
          if (corrupt === "MATERIAL" && reads === 1)
            row.manifest.representations[0].text += "tampered";
          if (corrupt === "SECOND_SNAPSHOT" && reads === 2)
            row.manifest.representations[0].revision++;
        }
        return rows;
      });
      try {
        await expect(host.readResult(batch, taskId)).rejects.toThrow(
          corrupt === "MATERIAL"
            ? "UNIVERSAL_SOURCE_MATERIAL_INVALID"
            : "UNIVERSAL_SOURCE_CHANGED",
        );
      } finally {
        sourceQuery.mockImplementation(sourceRead);
      }
    }
    const readMaterial = stores.custody.read;
    const custodyRead = vi
      .spyOn(stores.custody, "read")
      .mockImplementation(async (input) => {
        const bytes = await readMaterial(input);
        authorized = false;
        return bytes;
      });
    try {
      await expect(host.readResult(batch, taskId)).rejects.toThrow(
        "AUTH_REVOKED_FIXTURE",
      );
    } finally {
      authorized = true;
      custodyRead.mockRestore();
    }
    expect(sends).toHaveBeenCalledTimes(1);
    const noSecondSource = {
      withLease: async () => {
        throw Error("SECOND_SOURCE_TRANSACTION_FORBIDDEN");
      },
    };
    let mutateFence = false;
    const snapshot = vi.fn(async () => {
      if (!sourceCurrent) throw Error("INPUT_STALE");
      if (mutateFence) {
        mutateFence = false;
        await db.runAsync(
          "UPDATE intelligence_continuations SET row_revision=row_revision+1 WHERE task_id=?",
          taskId,
        );
      }
      return structuredClone(manifest);
    });
    const held = createUniversalContinuousHost({
      ...hostDeps,
      runtime: { ...hostDeps.runtime, sourceConnection: noSecondSource },
      publishedSource: {
        lookup: async () => universalRunBindingSchema.parse(structuredClone(binding)),
        readManifest: createUniversalSourceReader({
          connection: noSecondSource,
          readSnapshot: snapshot,
          readBinary: async () => {
            throw Error("NO_BINARY_FIXTURE");
          },
        }),
      },
    });
    expect((await held.readPublished(batch, taskId))?.result).toEqual(result);
    expect(snapshot).toHaveBeenCalled();
    mutateFence = true;
    await expect(held.readPublished(batch, taskId)).rejects.toThrow(
      "UNIVERSAL_PUBLICATION_CHANGED",
    );
    sourceCurrent = false;
    await expect(held.readPublished(batch, taskId)).rejects.toThrow("INPUT_STALE");
    sourceCurrent = true;

    expect(sends).toHaveBeenCalledTimes(1);
    // Re-delivery of this same durable Queue operation still reads its accepted result.
    await db.runAsync(
      "UPDATE sync_operations SET status='RETRYABLE',claim_owner=NULL WHERE id=?",
      first.id,
    );
    const repeated = await operation();
    expect(await queue.claim(context, repeated, "fixture-replay")).toBe(true);
    expect(
      await host.executeQueued(batch, taskId, {
        operationId: repeated.id,
        owner: repeated.claimOwner!,
        baseVersion: repeated.baseVersion!,
      }),
    ).toEqual(result);
    await queue.settle(context, repeated);
    expect(sends).toHaveBeenCalledTimes(1);
    sourceCurrent = false;
    await expect(host.readPublished(batch, taskId)).rejects.toThrow("INPUT_STALE");
    sourceCurrent = true;
    authorized = false;
    await expect(host.readContext(batch)).rejects.toThrow("AUTH_REVOKED_FIXTURE");
    expect(sends).toHaveBeenCalledTimes(1);
    expect(
      sql.prepare("SELECT count(*) AS n FROM intelligence_continuations").get(),
    ).toMatchObject({ n: 1 });
  } finally {
    sql.close();
    fakeRuntime.mockReset();
  }
});
