import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/data/api/client";

const { repository, transport } = vi.hoisted(() => ({
  repository: {
    getCursor: vi.fn(),
    applyChanges: vi.fn(),
    applyHistoricalList: vi.fn(),
    applyFxProjectionList: vi.fn(),
  },
  transport: {
    changes: vi.fn(),
    list: vi.fn(),
  },
}));

vi.mock("@/data/db/database", () => ({ openDatabase: vi.fn(async () => ({})) }));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: vi.fn(async () => "user-a"),
}));
vi.mock("@/data/repositories/ledgerPersonalPaymentRepository", () => ({
  createLedgerPersonalPaymentRepository: vi.fn(() => repository),
}));
vi.mock("./ledgerPersonalPaymentTransport", () => ({
  createLedgerPersonalPaymentTransport: vi.fn(() => transport),
}));

// eslint-disable-next-line import/first
import { refreshLedgerPersonalPayments } from "./ledgerPersonalPaymentCoordinator";

describe("Personal Payment pull recovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("replaces only the affected scoped cursor after structured INVALID_CURSOR", async () => {
    repository.getCursor
      .mockResolvedValueOnce({ cursor: "invalid" })
      .mockResolvedValueOnce({ cursor: "invalid" })
      .mockResolvedValueOnce({ cursor: null });
    transport.changes
      .mockRejectedValueOnce(new ApiClientError("invalid", "http", 400, "INVALID_CURSOR"))
      .mockResolvedValueOnce({
        changes: [],
        cursor: "fresh",
        hasMore: false,
        serverTime: "now",
      });
    transport.list.mockResolvedValue({
      payments: [],
      projections: [],
      serverTime: "now",
    });

    await expect(refreshLedgerPersonalPayments("journey-a")).resolves.toBe(false);

    expect(transport.list).toHaveBeenCalledWith("journey-a", true);
    expect(repository.applyHistoricalList).toHaveBeenCalledWith("journey-a", [], "now");
    expect(transport.changes.mock.calls).toEqual([
      ["journey-a", "invalid"],
      ["journey-a", null],
    ]);
    expect(repository.applyChanges).toHaveBeenCalledOnce();
  });

  it("does not bootstrap for an unrelated pull failure", async () => {
    repository.getCursor
      .mockResolvedValueOnce({ cursor: "saved" })
      .mockResolvedValueOnce({ cursor: "saved" });
    transport.changes.mockRejectedValue(new ApiClientError("offline", "network"));

    await expect(refreshLedgerPersonalPayments("journey-a")).rejects.toMatchObject({
      kind: "network",
    });
    expect(transport.list).not.toHaveBeenCalled();
  });
});
