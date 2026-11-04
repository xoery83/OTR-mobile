import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { intelligenceWakeKind } from "../../src/domain/intelligence/persistence";
import { loadDevUniversalContinuousRuntime } from "./universalContinuousRuntime";

const f = vi.hoisted(() => ({
  config: vi.fn(),
  stat: vi.fn(),
  read: vi.fn(),
  auth: vi.fn(),
  canRead: vi.fn(),
  claim: vi.fn(),
  settle: vi.fn(),
  recover: vi.fn(),
  execute: vi.fn(),
  sourceConnection: vi.fn(),
  host: vi.fn(),
  coreSource: vi.fn(),
  pdfConfig: vi.fn(),
  pdfPorts: vi.fn(),
  pngConfig: vi.fn(),
  pngPorts: vi.fn(),
  pngRead: vi.fn(),
}));
vi.mock("node:sqlite", () => ({
  DatabaseSync: class {
    close() {}
  },
}));
vi.mock("node:fs/promises", () => ({ lstat: f.stat }));
vi.mock("./universalContinuousConfig", () => ({
  readUniversalContinuousConfig: f.config,
}));
vi.mock("./flightPrivateCustody", () => ({
  createFlightPrivateCustody: async () => ({ close: vi.fn() }),
}));
vi.mock("./tripPublicationCatalogPgConnection", () => ({
  createPublicationCatalogPgConnection: () => ({ close: vi.fn() }),
}));
vi.mock("./tripCoreV2PgConnection", () => ({
  createSourcePgConnection: f.sourceConnection,
  createSourcePdfPgConnection: f.sourceConnection,
  createModelTaskPgConnection: () => ({}),
}));
vi.mock("./supabaseGateway", () => ({
  createSupabaseDevGateway: () => ({
    validateAccessToken: f.auth,
    canReadTrip: f.canRead,
  }),
}));
vi.mock("./universalTaskBootstrap", () => ({
  initializeUniversalTaskDatabase: () => ({ getFirstAsync: f.read }),
}));
vi.mock("./universalCoreSourceRead", () => ({
  createCoreUniversalSourceRead: f.coreSource,
}));
vi.mock("./universalContinuousHost", () => ({
  createUniversalContinuousHost: f.host,
}));
vi.mock("./sourcePdfRuntime", () => ({
  readSourcePdfRuntimeConfig: f.pdfConfig,
  createSourcePdfRuntimePorts: f.pdfPorts,
}));
vi.mock("./sourcePngRuntime", () => ({
  readSourcePngRuntimeConfig: f.pngConfig,
  createSourcePngRuntimePorts: f.pngPorts,
}));
vi.mock("../../src/data/sync/syncOperationRepository", () => ({
  createSyncOperationRepository: () => ({ recoverInterrupted: f.recover }),
  createIntelligenceWakeQueue: () => ({ claim: f.claim, settle: f.settle }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  f.config.mockResolvedValue({ taskDatabase: "/unused-test.db" });
  f.stat.mockResolvedValue({
    isFile: () => true,
    isSymbolicLink: () => false,
    uid: process.getuid!(),
    mode: 0o600,
    nlink: 1,
    ino: 1,
    dev: 1,
  });
  f.sourceConnection.mockReturnValue({});
  f.host.mockImplementation(() => ({ executeQueued: f.execute }));
  f.canRead.mockResolvedValue(true);
  f.claim.mockResolvedValue(true);
  f.execute.mockResolvedValue({ status: "CANDIDATES_READY" });
});
for (const kind of [intelligenceWakeKind, "INTELLIGENCE_CONTINUATION"]) {
  it(`targeted drain validates the owning queue operation kind: ${kind}`, async () => {
    const actor = randomUUID(),
      trip = randomUUID(),
      batch = randomUUID(),
      task = randomUUID();
    const operation = { id: "icw:test", operationType: kind, baseVersion: 1 };
    f.auth.mockResolvedValue({ id: actor });
    f.read
      .mockResolvedValueOnce({ sync_operation_id: operation.id })
      .mockResolvedValue(operation);
    const runtime = await loadDevUniversalContinuousRuntime({
      OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
    });
    try {
      const ports = await runtime!.forRequest(
        new Request("https://example.test", {
          headers: { Authorization: "Bearer synthetic-test-only" },
        }),
        actor,
        trip,
      );
      const work = ports.drainTargeted(batch, task);
      if (kind === intelligenceWakeKind) {
        await expect(work).resolves.toMatchObject({ status: "SETTLED" });
        expect(f.claim).toHaveBeenCalledOnce();
        expect(f.execute).toHaveBeenCalledWith(
          batch,
          task,
          expect.objectContaining({ operationId: operation.id, baseVersion: 1 }),
        );
        expect(f.settle).toHaveBeenCalledOnce();
      } else {
        await expect(work).rejects.toThrow("UNIVERSAL_WAKE_MISSING");
        expect(f.claim).not.toHaveBeenCalled();
        expect(f.execute).not.toHaveBeenCalled();
      }
    } finally {
      await runtime?.close();
    }
  });
}

it("overlapping activity and batch reads do not share an occupied Source connection", async () => {
  const actor = randomUUID(),
    trip = randomUUID();
  f.auth.mockResolvedValue({ id: actor });
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.sourceConnection.mockImplementation(() => {
    let occupied = false;
    return {
      async withLease(work: () => Promise<unknown>) {
        if (occupied) throw Error("CORE_CONNECTION_BUSY");
        occupied = true;
        try {
          await blocked;
          return await work();
        } finally {
          occupied = false;
        }
      },
    };
  });
  f.host.mockImplementation(({ runtime }) => ({
    readContext: (batch: string) =>
      runtime.sourceConnection.withLease(async () => ({ batch })),
  }));
  const runtime = await loadDevUniversalContinuousRuntime({
    OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
  });
  try {
    const request = () =>
      new Request("https://example.test", {
        headers: { Authorization: "Bearer synthetic-test-only" },
      });
    const inventory = await runtime!.forRequest(request(), actor, trip);
    const detail = await runtime!.forRequest(request(), actor, trip);
    const first = inventory.universalImportPort.readContext(actor, "inventory", trip);
    const second = detail.universalImportPort.readContext(actor, "detail", trip);
    const reads = Promise.all([first, second]);
    release();
    await expect(reads).resolves.toEqual([{ batch: "inventory" }, { batch: "detail" }]);
    expect(f.execute).not.toHaveBeenCalled();
  } finally {
    release();
    await runtime?.close();
  }
});

it.each(["matching", "other-account", "other-trip"])(
  "execution fence limits new work but preserves Results: %s",
  async (mode) => {
    const actor = randomUUID(),
      trip = randomUUID(),
      result = { existing: true },
      prepare = vi.fn();
    f.auth.mockResolvedValue({ id: actor });
    f.config.mockResolvedValue({
      taskDatabase: "/unused-test.db",
      qaExecutionFence: {
        version: 1,
        accountId: mode === "other-account" ? randomUUID() : actor,
        tripId: mode === "other-trip" ? randomUUID() : trip,
      },
    });
    f.host.mockImplementation(({ assertCurrentAuth, assertNewExecutionAllowed }) => ({
      prepare: async () => {
        await assertCurrentAuth();
        assertNewExecutionAllowed();
        prepare();
        return result;
      },
      readResult: async () => {
        await assertCurrentAuth();
        return result;
      },
    }));
    const runtime = await loadDevUniversalContinuousRuntime({
      OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
    });
    try {
      const ports = await runtime!.forRequest(
        new Request("https://example.test", {
          headers: { Authorization: "Bearer LOCAL_FIXTURE_ONLY" },
        }),
        actor,
        trip,
      );
      if (mode === "matching")
        expect(await ports.prepare(trip, { tripId: trip })).toEqual(result);
      else {
        await expect(ports.prepare(trip, { tripId: trip })).rejects.toThrow(
          "UNIVERSAL_QA_EXECUTION_SCOPE_CLOSED",
        );
        expect(prepare).not.toHaveBeenCalled();
      }
      expect(await ports.universalImportPort.read(actor, "batch", "task")).toEqual(
        result,
      );
    } finally {
      await runtime?.close();
    }
  },
);

it.each([
  ["UNIVERSAL_CONFIGURATION_CHANGED", "UNIVERSAL_CONFIGURATION_CHANGED", false],
  ["UNIVERSAL_SOURCE_CLOSED", "UNIVERSAL_SOURCE_CLOSED", false],
  ["UNIVERSAL_MODEL_TASK_BINDING", "UNIVERSAL_MODEL_TASK_BINDING", false],
  ["UNIVERSAL_TASK_DEADLINE", "UNIVERSAL_TASK_DEADLINE", false],
  ["UNIVERSAL_SCOPE_INVALID", "UNIVERSAL_SCOPE_INVALID", false],
  ["UNIVERSAL_PRICE_UNAVAILABLE", "UNIVERSAL_PRICE_UNAVAILABLE", false],
  [
    "UNIVERSAL_PRICE_PRECISION_UNAVAILABLE",
    "UNIVERSAL_PRICE_PRECISION_UNAVAILABLE",
    false,
  ],

  ["private original contents and Bearer synthetic-token", "UNCLASSIFIED", false],
  ["SOURCE_PRIVATE_ORIGINAL_NAME", "UNCLASSIFIED", false],
  ["AUTH_BEARERABC123", "UNCLASSIFIED", false],
  ["UNIVERSAL_CONFIGURATION_CHANGED", "UNIVERSAL_CONFIGURATION_CHANGED", true],
])(
  "reports a safe targeted failure class without logging request material",
  async (message, code, loggerThrows = false) => {
    const actor = randomUUID(),
      trip = randomUUID(),
      batch = randomUUID(),
      task = randomUUID();
    const operation = {
      id: "icw:test",
      operationType: intelligenceWakeKind,
      baseVersion: 1,
    };
    f.auth.mockResolvedValue({ id: actor });
    f.read
      .mockResolvedValueOnce({ sync_operation_id: operation.id })
      .mockResolvedValue(operation);
    const failure = Error(message);
    f.execute.mockRejectedValue(failure);
    const log = vi.spyOn(console, "info").mockImplementation(() => {
      if (loggerThrows) throw Error("SYNTHETIC_LOGGER_FAILURE");
    });
    const runtime = await loadDevUniversalContinuousRuntime({
      OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
    });
    try {
      const ports = await runtime!.forRequest(
        new Request("https://example.test", {
          headers: { Authorization: "Bearer synthetic-test-only" },
        }),
        actor,
        trip,
      );
      await expect(ports.drainTargeted(batch, task)).rejects.toBe(failure);
      expect(f.settle).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        expect.anything(),
        failure,
      );
      expect(log).toHaveBeenCalledExactlyOnceWith(
        JSON.stringify({ event: "universal_targeted_wake_failed", code }),
      );
    } finally {
      log.mockRestore();
      await runtime?.close();
    }
  },
);

it.each(["enabled", "closed", "invalid", "foreign", "expired"])(
  "pending PDF original lookup follows the composed runtime capability: %s",
  async (mode) => {
    const actor = randomUUID(),
      trip = randomUUID();
    f.auth.mockResolvedValue({ id: actor });
    const query = vi.fn(async (sql: string) => ({
      rows: sql.startsWith("SELECT") ? [{ result: null }] : [],
    }));
    f.sourceConnection.mockReturnValue({
      withLease: async (work: (lease: unknown) => Promise<unknown>) =>
        work({ query, retire: vi.fn() }),
    });
    if (mode !== "closed") f.pdfConfig.mockResolvedValue({});
    if (mode === "invalid")
      f.pdfPorts.mockImplementation(() => {
        throw Error("CLOSED");
      });
    else
      f.pdfPorts.mockReturnValue({
        originalMetadataAllowed: (a: string, t: string) =>
          mode === "enabled" && a === actor && t === trip,
        close: vi.fn(),
      });
    const runtime = await loadDevUniversalContinuousRuntime({
      OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
      OTR_DEV_UNIVERSAL_PDF_RUNTIME: "enabled",
    });
    try {
      const ports = await runtime!.forRequest(
        new Request("https://example.test", {
          headers: { Authorization: "Bearer synthetic-test-only" },
        }),
        actor,
        trip,
      );
      const command = {
        contract_version: 1,
        command: "ACQUIRE_SOURCE",
        operation_id: randomUUID(),
        operation_key: randomUUID(),
        actor_account_id: actor,
        trip_id: trip,
        source_id: randomUUID(),
        operation_sha256: "a".repeat(64),
        payload: {
          acquisition_key: "pdf-test",
          acquisition_sha256: "a".repeat(64),
          source_input: {
            source_kind: "FILE",
            acquisition_channel: "FILES",
            captured_at: null,
            capture_time_basis: "UNKNOWN",
          },
          capture: { completeness: "AS_SUPPLIED", capture_sha256: "a".repeat(64) },
          original: {
            id: randomUUID(),
            material_kind: "BINARY",
            original_filename: "QA.pdf",
            part_key: null,
            mime_type: "application/pdf",
            encoding: null,
            payload_sha256: "b".repeat(64),
            byte_count: 1676,
            text_content: null,
            locator_uri: null,
          },
        },
      };
      const lookup = ports.universalOriginalSourcePort.lookup(actor, trip, command);
      if (mode === "enabled") {
        await expect(lookup).resolves.toBeNull();
        expect(query).toHaveBeenCalledWith(
          "SELECT public.trip_source_lookup_universal_original($1::uuid,$2) AS result",
          expect.any(Array),
        );
      } else {
        await expect(lookup).rejects.toThrow("UNIVERSAL_SOURCE_SCOPE_CLOSED");
        expect(query).not.toHaveBeenCalled();
      }
    } finally {
      await runtime?.close();
    }
  },
);

it("binds retained read-only recovery to request diagnostics and the original Core-held Source port", async () => {
  const actor = randomUUID(),
    trip = randomUUID(),
    batch = randomUUID(),
    task = randomUUID();
  const requestId = randomUUID();
  const lease = { query: vi.fn(), retire: vi.fn() };
  const source = {
    lookup: vi.fn(async () => ({
      actorId: actor,
      tripId: trip,
      batchId: batch,
      taskId: task,
      inputs: [],
    })),
    readManifest: vi.fn(),
    withRetainedMetadata: vi.fn(),
  };
  f.coreSource.mockReturnValue(source);
  f.auth.mockResolvedValue({ id: actor });
  f.host.mockReturnValue({ readPublished: vi.fn(async () => null) });
  const runtime = await loadDevUniversalContinuousRuntime({
    OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
  });
  try {
    await runtime!.forRequest(
      new Request("https://example.test", {
        headers: { Authorization: "Bearer synthetic-test-only" },
      }),
      actor,
      trip,
      requestId,
    );
    expect(f.host.mock.calls[0][0]).toMatchObject({
      sourceReadRequestId: requestId,
      retainedResultsEnabled: true,
    });
    expect(f.host.mock.calls[0][0].publishedSource).toBeUndefined();
    await expect(
      runtime!.readPublished(
        { actorAccountId: actor, tripId: trip, batchId: batch, taskId: task },
        lease,
      ),
    ).resolves.toBeNull();
    expect(f.coreSource).toHaveBeenCalledExactlyOnceWith(
      lease,
      actor,
      trip,
      expect.any(Function),
    );
    expect(f.host.mock.calls[1][0].publishedSource).toBe(source);
    expect(f.host.mock.calls[1][0].sourceReadRequestId).toBeUndefined();
    expect(f.host.mock.calls[1][0].retainedResultsEnabled).toBe(true);
    expect(lease.query).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  } finally {
    await runtime?.close();
  }
});

it.each(["active", "before", "expired"])(
  "finite private batch chooses existing finite ports and enforces its clock: %s",
  async (phase) => {
    const actor = randomUUID(),
      trip = randomUUID(),
      now = Date.now();
    const batch = {
      actorId: actor,
      tripId: trip,
      batchId: randomUUID(),
      submissionSha256: "a".repeat(64),
      inputs: [
        {
          id: randomUUID(),
          source_id: randomUUID(),
          material_revision: 1,
          representation_id: randomUUID(),
          payload_sha256: "b".repeat(64),
          byte_count: 92,
          observed_source_row_revision: 1,
          historical_selection: false,
        },
      ],
    };
    const selection = { priceScheduleId: randomUUID() };
    f.auth.mockResolvedValue({ id: actor });
    f.config.mockResolvedValue({
      taskDatabase: "/unused-test.db",
      finiteNative: {
        version: 1,
        batch,
        selection,
        startsAt: new Date(now + (phase === "before" ? 60000 : -60000)).toISOString(),
        expiresAt: new Date(now + (phase === "expired" ? -1000 : 120000)).toISOString(),
      },
    });
    const runtime = await loadDevUniversalContinuousRuntime({
      OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
    });
    try {
      await runtime!.forRequest(
        new Request("https://example.test", {
          headers: { Authorization: "Bearer LOCAL_FIXTURE_ONLY" },
        }),
        actor,
        trip,
      );
      const options = f.host.mock.calls.at(-1)![0];
      expect(options.finiteBatch).toMatchObject(batch);
      expect(options.finiteDeadline).toBeDefined();
      if (phase === "active")
        expect(() => options.assertNewExecutionAllowed()).not.toThrow();
      else
        expect(() => options.assertNewExecutionAllowed()).toThrow(
          "UNIVERSAL_QA_EXECUTION_SCOPE_CLOSED",
        );
      // Metadata selection is inert even after expiry; reserve/dispatch remain owning gates.
      expect(
        await options.selectProvider({ ...options.finiteBatch, owningBinding: {} }),
      ).toBe(selection);
      await expect(
        options.selectProvider({
          ...options.finiteBatch,
          batchId: randomUUID(),
          owningBinding: {},
        }),
      ).rejects.toThrow("UNIVERSAL_BINDING_SCOPE");
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.claim).not.toHaveBeenCalled();
    } finally {
      await runtime?.close();
    }
  },
);

it("retained PNG wiring keeps Host/Source guards after positive config close and rejects changed pins", async () => {
  const actor = randomUUID(),
    trip = randomUUID(),
    batch = randomUUID(),
    task = randomUUID();
  const image = {
    accountId: actor,
    tripId: trip,
    sourceId: randomUUID(),
    representationId: randomUUID(),
    sha256: "a".repeat(64),
    byteCount: 3,
    mimeType: "image/png",
  };
  const bytes = Uint8Array.from([1, 2, 3]);
  f.pngConfig.mockResolvedValue({});
  f.pngPorts.mockImplementation((_config, deps) => ({
    close: vi.fn(),
    originalMetadataAllowed: () => false,
    readOriginal: async (...args: unknown[]) => {
      deps.assertReadEnabled();
      return f.pngRead(...args);
    },
  }));
  f.pngRead.mockResolvedValue(bytes);
  f.coreSource.mockReturnValue({
    lookup: vi.fn(async () => ({
      actorId: actor,
      tripId: trip,
      batchId: batch,
      taskId: task,
      inputs: [
        {
          source_id: image.sourceId,
          representation_id: image.representationId,
          payload_sha256: image.sha256,
          byte_count: image.byteCount,
        },
      ],
    })),
  });
  f.host.mockReturnValue({ readPublished: vi.fn(async () => ({})) });
  const env = {
    OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
    OTR_DEV_UNIVERSAL_PNG_RUNTIME: "enabled",
    OTR_DEV_UNIVERSAL_PNG_RUNTIME_SHA256: "a".repeat(64),
  };
  const runtime = await loadDevUniversalContinuousRuntime(env);
  try {
    env.OTR_DEV_UNIVERSAL_PNG_RUNTIME = "disabled";
    env.OTR_DEV_UNIVERSAL_PNG_RUNTIME_SHA256 = "closed";
    const deps = f.pngPorts.mock.calls[0][1];
    expect(() => deps.assertEnabled()).toThrow("SOURCE_CAPABILITY_CLOSED");
    const result = await runtime!.readPublished(
      { actorAccountId: actor, tripId: trip, batchId: batch, taskId: task },
      { query: vi.fn(), retire: vi.fn() },
    );
    expect(await result!.readBinary(image)).toEqual(bytes);
    for (const field of [
      "accountId",
      "tripId",
      "sourceId",
      "representationId",
      "sha256",
      "byteCount",
    ] as const) {
      await expect(
        result!.readBinary({
          ...image,
          [field]:
            field === "byteCount"
              ? 4
              : field === "sha256"
                ? "b".repeat(64)
                : randomUUID(),
        }),
      ).rejects.toThrow("SOURCE_ACCESS_DENIED");
    }
    expect(f.pngRead).toHaveBeenCalledOnce();
    env.OTR_DEV_UNIVERSAL_CONTINUOUS_HOST = "disabled";
    await expect(result!.readBinary(image)).rejects.toThrow(
      "UNIVERSAL_CONTINUOUS_CLOSED",
    );
    expect(f.pngRead).toHaveBeenCalledOnce();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.claim).not.toHaveBeenCalled();
  } finally {
    await runtime?.close();
  }
});
