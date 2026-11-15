import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { fixture, sha256 } from "@/data/repositories/__fixtures__/captureBatchAssessment";
import {
  createTripRepository,
  readLocalTripRepository,
} from "@/data/repositories/tripRepository";
import { createTripCoreV2Repository } from "@/data/repositories/tripCoreV2Repository";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { captureAccountScope } from "@/data/auth/accountRequestContext";
import {
  createTripDiscoveryRepository,
  readLocalTripDiscoveryRepository,
  refreshTripDiscoveryCache,
} from "@/data/repositories/tripDiscoveryRepository";
import { readCaptureTripPrior, listCaptureTripPriors } from "./captureTripPrior";
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/repositories/tripRepository", async (original) => ({
  ...(await original<typeof import("@/data/repositories/tripRepository")>()),
  readLocalTripRepository: vi.fn(),
}));
vi.mock("@/data/repositories/tripDiscoveryRepository", async (original) => ({
  ...(await original<typeof import("@/data/repositories/tripDiscoveryRepository")>()),
  readLocalTripDiscoveryRepository: vi.fn(),
  refreshTripDiscoveryCache: vi.fn(),
}));
it("normal actor-owned local Trip supplies only readonly prior; foreign/missing and stale/ABA scopes cannot bind it", async () => {
  const f = fixture(false, Number.MAX_SAFE_INTEGER),
    actor = await f.getAccount();
  vi.mocked(requireActiveUserId).mockImplementation(f.getAccount);
  const core = createTripCoreV2Repository(f.db, f.getAccount, sha256);
  const repo = createTripRepository(f.db, f.getAccount, core);
  vi.mocked(readLocalTripRepository).mockResolvedValue(repo);
  vi.mocked(readLocalTripDiscoveryRepository).mockResolvedValue(
    createTripDiscoveryRepository(f.db, f.getAccount),
  );
  const tripId = randomUUID();
  await repo.createTrip({ tripId, operationId: randomUUID(), name: "Readonly prior" });
  const scope = await captureAccountScope(f.getAccount);
  expect(await readCaptureTripPrior(tripId, scope)).toEqual({
    id: tripId,
    name: "Readonly prior",
  });
  expect(await readCaptureTripPrior(randomUUID(), scope)).toBeNull();
  await f.switchTo(randomUUID());
  await expect(readCaptureTripPrior(tripId, scope)).rejects.toThrow();
  expect(
    await readCaptureTripPrior(tripId, await captureAccountScope(f.getAccount)),
  ).toBeNull();
  await f.switchTo(actor);
  await expect(readCaptureTripPrior(tripId, scope)).rejects.toThrow();
});

vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));

it("Activity scope labels can use the authorized local catalog without an extra discovery request", async () => {
  const f = fixture(false, Number.MAX_SAFE_INTEGER);
  vi.mocked(requireActiveUserId).mockImplementation(f.getAccount);
  const core = createTripCoreV2Repository(f.db, f.getAccount, sha256);
  const repo = createTripRepository(f.db, f.getAccount, core);
  vi.mocked(readLocalTripRepository).mockResolvedValue(repo);
  vi.mocked(readLocalTripDiscoveryRepository).mockResolvedValue(
    createTripDiscoveryRepository(f.db, f.getAccount),
  );
  const tripId = randomUUID();
  await repo.createTrip({ tripId, operationId: randomUUID(), name: "Actual Trip" });
  const before = process.env.EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED;
  process.env.EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED = "true";
  try {
    expect(
      await listCaptureTripPriors(await captureAccountScope(f.getAccount), {
        refresh: false,
      }),
    ).toContainEqual({ id: tripId, name: "Actual Trip" });
    expect(refreshTripDiscoveryCache).not.toHaveBeenCalled();
  } finally {
    if (before === undefined)
      delete process.env.EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED;
    else process.env.EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED = before;
  }
});
