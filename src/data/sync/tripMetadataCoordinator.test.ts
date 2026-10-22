import { advanceAccountGeneration } from "../auth/accountGeneration";
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
    undefined,
  );
  expect(mocks.run).toHaveBeenCalledWith("AUTHENTICATED_ONLINE");
});

const target = {
  accountId: "10000000-0000-4000-8000-000000000001",
  tripId: "20000000-0000-4000-8000-000000000001",
  operationId: "30000000-0000-4000-8000-000000000001",
};
it("freezes the explicit dispatch target and rejects foreign accounts before opening SQLite", async () => {
  const mutable = { ...target };
  const run = createNativeTripMetadataSyncRunner(() => true, mutable);
  mutable.operationId = "40000000-0000-4000-8000-000000000001";
  await run();
  expect(mocks.coordinator.mock.calls[0][4]).toEqual(target);
  vi.clearAllMocks();
  await expect(
    createNativeTripMetadataSyncRunner(() => true, {
      ...target,
      accountId: "90000000-0000-4000-8000-000000000001",
    })(),
  ).rejects.toThrow("TRIP_METADATA_ACCOUNT_MISMATCH");
  expect(mocks.readDatabase).not.toHaveBeenCalled();
  expect(mocks.readRepository).not.toHaveBeenCalled();
  expect(mocks.createWorker).not.toHaveBeenCalled();
});
it("keeps an explicit target closed without a port gate", async () => {
  expect(await createNativeTripMetadataSyncRunner(undefined, target)()).toEqual({
    status: "closed",
    processedCount: 0,
  });
  expect(mocks.readDatabase).not.toHaveBeenCalled();
  expect(mocks.createWorker).not.toHaveBeenCalled();
});

it("rejects Account ABA while awaiting the repository before constructing a worker", async () => {
  mocks.readRepository.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    advanceAccountGeneration();
    return mocks.repository;
  });
  await expect(createNativeTripMetadataSyncRunner(() => true, target)()).rejects.toThrow(
    "Account changed",
  );
  expect(mocks.createWorker).not.toHaveBeenCalled();
  expect(mocks.coordinator).not.toHaveBeenCalled();
});
