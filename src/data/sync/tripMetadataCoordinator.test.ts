import { beforeEach, expect, it, vi } from "vitest";
import { createNativeTripMetadataSyncRunner } from "./tripMetadataCoordinator";
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
vi.mock("./tripMetadataTransport", () => ({
  createTripMetadataTransport: () => mocks.transport,
}));
vi.mock("./tripMetadataSyncWorker", () => ({
  createTripMetadataSyncCoordinator: mocks.coordinator,
  createTripMetadataSyncWorker: mocks.createWorker,
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
  expect(await createNativeTripMetadataSyncRunner()()).toEqual({
    status: "closed",
    processedCount: 0,
  });
  expect(mocks.readDatabase).not.toHaveBeenCalled();
  expect(mocks.createWorker).not.toHaveBeenCalled();
});
it("explicit installed-port composition reaches the existing queue/worker with no alternate lifecycle", async () => {
  expect(await createNativeTripMetadataSyncRunner(() => true)()).toMatchObject({
    status: "syncing",
    processedCount: 1,
  });
  expect(mocks.createWorker).toHaveBeenCalledExactlyOnceWith(
    mocks.repository,
    mocks.transport,
    expect.any(Function),
  );
  expect(mocks.coordinator).toHaveBeenCalledWith(
    mocks.queue,
    mocks.worker,
    mocks.repository,
    expect.any(Function),
  );
  expect(mocks.run).toHaveBeenCalledWith("AUTHENTICATED_ONLINE");
});
