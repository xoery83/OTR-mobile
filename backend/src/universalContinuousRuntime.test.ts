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
  pdfConfig: vi.fn(),
  pdfPorts: vi.fn(),
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
vi.mock("./universalContinuousHost", () => ({
  createUniversalContinuousHost: f.host,
}));
vi.mock("./sourcePdfRuntime", () => ({
  readSourcePdfRuntimeConfig: f.pdfConfig,
  createSourcePdfRuntimePorts: f.pdfPorts,
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
