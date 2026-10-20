import { beforeEach, expect, it, vi } from "vitest";
import { createNativeTripCreateSyncRunner } from "./tripCreateCoordinator";
const mocks = vi.hoisted(() => ({
  database: {},
  repository: {},
  worker: {},
  queue: {},
  transport: {},
  readDatabase: vi.fn(),
  readRepository: vi.fn(),
  coordinator: vi.fn(),
  run: vi.fn(),
  createWorker: vi.fn(),
}));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: async () => "10000000-0000-4000-8000-000000000001",
}));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: mocks.readDatabase }));
vi.mock("@/data/repositories/tripRepository", () => ({
  readLocalTripRepository: mocks.readRepository,
}));
vi.mock("./syncOperationRepository", () => ({
  createSyncOperationRepository: () => mocks.queue,
}));
vi.mock("./tripCreateTransport", () => ({
  createTripCreateTransport: () => mocks.transport,
}));
vi.mock("./tripCreateSyncWorker", () => ({
  createTripCreateSyncCoordinator: mocks.coordinator,
  createTripCreateSyncWorker: mocks.createWorker,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.readDatabase.mockResolvedValue(mocks.database);
  mocks.readRepository.mockResolvedValue(mocks.repository);
  mocks.createWorker.mockReturnValue(mocks.worker);
  mocks.coordinator.mockReturnValue({ run: mocks.run });
  mocks.run.mockResolvedValue({ status: "syncing", processedCount: 1 });
});
it("normal composition remains CLOSED without opening SQLite or creating transport/worker", async () => {
  expect(await createNativeTripCreateSyncRunner()()).toEqual({
    status: "closed",
    processedCount: 0,
  });
  expect(mocks.readDatabase).not.toHaveBeenCalled();
  expect(mocks.createWorker).not.toHaveBeenCalled();
});
it("explicit composition reuses the existing queue, worker, formal transport and coordinator", async () => {
  const gate = () => true;
  const target = {
    accountId: "10000000-0000-4000-8000-000000000001",
    tripId: "10000000-0000-4000-8000-000000000002",
    operationId: "10000000-0000-4000-8000-000000000003",
  };
  expect(await createNativeTripCreateSyncRunner(target, gate)()).toMatchObject({
    processedCount: 1,
  });
  expect(mocks.createWorker).toHaveBeenCalledWith(
    mocks.repository,
    mocks.transport,
    expect.any(Function),
  );
  expect(mocks.coordinator).toHaveBeenCalledWith(
    mocks.queue,
    mocks.worker,
    mocks.repository,
    gate,
    target,
  );
  expect(mocks.run).toHaveBeenCalledWith("AUTHENTICATED_ONLINE");
});
