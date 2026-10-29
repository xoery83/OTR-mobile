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
vi.mock("./universalOriginalSource", () => ({
  createUniversalOriginalSourceConnection: () => ({}),
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
