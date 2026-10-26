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
  createSourcePgConnection: () => ({}),
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
  createUniversalContinuousHost: () => ({ executeQueued: f.execute }),
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
