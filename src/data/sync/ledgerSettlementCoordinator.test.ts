import { beforeEach, describe, expect, it, vi } from "vitest";

const preflight = vi.fn();
vi.mock("./ledgerSettlementTransport", () => ({
  createLedgerSettlementTransport: () => ({ preflight }),
}));
vi.mock("@/data/repositories/defaultLedgerSettlementRepository", () => ({
  getDefaultLedgerSettlementRepository: vi.fn(),
}));
vi.mock("@/data/repositories/replayFixtureGuard", () => ({
  assertReplayFixtureWritable: vi.fn(),
}));

// eslint-disable-next-line import/first
import { preflightSettlementFx } from "./ledgerSettlementCoordinator";

describe("foreground settlement FX preflight", () => {
  beforeEach(() => vi.clearAllMocks());

  it("drains bounded Journey batches without polling the global scanner", async () => {
    preflight
      .mockResolvedValueOnce({
        claimed: 4,
        accepted: 4,
        unavailableExpenseIds: [],
        pendingPublicationExpenseIds: [],
      })
      .mockResolvedValueOnce({
        claimed: 2,
        accepted: 2,
        unavailableExpenseIds: ["bad"],
        pendingPublicationExpenseIds: ["waiting"],
      });
    await expect(preflightSettlementFx("journey-one", true)).resolves.toEqual({
      unavailable: new Set(["bad"]),
      pendingPublication: new Set(["waiting"]),
    });
    expect(preflight.mock.calls).toEqual([
      ["journey-one", true],
      ["journey-one", false],
    ]);
  });

  it("caps a continuously full queue and propagates failure to the caller", async () => {
    preflight.mockResolvedValue({
      claimed: 4,
      accepted: 4,
      unavailableExpenseIds: [],
      pendingPublicationExpenseIds: [],
    });
    await preflightSettlementFx("journey-one");
    expect(preflight).toHaveBeenCalledTimes(8);
    preflight.mockRejectedValue(new Error("offline"));
    await expect(preflightSettlementFx("journey-one")).rejects.toThrow("offline");
  });
});
