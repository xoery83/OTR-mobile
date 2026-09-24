import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshLedgerFxSnapshotCache } from "./ledgerFxSnapshotCoordinator";

const mocks = vi.hoisted(() => ({
  accountId: "user-a",
  list: vi.fn(),
  cacheBundle: vi.fn(),
  referenceRateSnapshots: vi.fn(),
  repositoryFactory: vi.fn(),
}));

vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: vi.fn(async () => mocks.accountId),
}));
vi.mock("@/data/repositories/defaultLedgerFxSnapshotRepository", () => ({
  getDefaultLedgerFxSnapshotRepository: mocks.repositoryFactory,
}));
vi.mock("./ledgerReadTransport", () => ({
  createLedgerReadTransport: vi.fn(() => ({
    referenceRateSnapshots: mocks.referenceRateSnapshots,
  })),
}));

const bundle = {
  provider: "ECB" as const,
  policyVersion: "ECB_LOCAL_SNAPSHOT_V1" as const,
  baseCurrency: "EUR" as const,
  snapshots: [
    {
      referenceDate: "2026-09-23",
      rates: { EUR: "1", ISK: "138", NZD: "2" },
      observedAt: "2026-09-24T04:00:00.000Z",
      expiresAt: "2026-10-24T04:00:00.000Z",
    },
  ],
  sourceReference: "https://www.ecb.europa.eu/",
  providerReference: "https://api.frankfurter.dev/v2/providers/ecb/rates",
};

describe("FX snapshot refresh", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-24T05:00:00.000Z"));
    mocks.repositoryFactory.mockResolvedValue({
      list: mocks.list,
      cacheBundle: mocks.cacheBundle,
    });
    mocks.referenceRateSnapshots.mockResolvedValue(bundle);
  });

  it("uses a bundle observed within 24 hours without a network read", async () => {
    mocks.list.mockResolvedValue(bundle);
    await expect(refreshLedgerFxSnapshotCache()).resolves.toBe(bundle);
    expect(mocks.repositoryFactory).toHaveBeenCalledWith("user-a");
    expect(mocks.referenceRateSnapshots).not.toHaveBeenCalled();
  });

  it("coalesces a stale account refresh and caches the authenticated bundle once", async () => {
    mocks.list.mockResolvedValue(null);
    await Promise.all([refreshLedgerFxSnapshotCache(), refreshLedgerFxSnapshotCache()]);
    expect(mocks.referenceRateSnapshots).toHaveBeenCalledOnce();
    expect(mocks.cacheBundle).toHaveBeenCalledOnce();
    expect(mocks.cacheBundle).toHaveBeenCalledWith(bundle);
  });
});
