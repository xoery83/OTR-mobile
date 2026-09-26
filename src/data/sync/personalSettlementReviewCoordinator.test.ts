import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/data/api/client";

const mocks = vi.hoisted(() => ({ read: vi.fn(), applyRemote: vi.fn() }));
vi.mock("@/data/db/database", () => ({ openDatabase: async () => ({}) }));
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/repositories/personalSettlementReviewRepository", () => ({
  createPersonalSettlementReviewRepository: () => ({ applyRemote: mocks.applyRemote }),
}));
vi.mock("./personalSettlementReviewTransport", () => ({
  createPersonalSettlementReviewTransport: () => ({ read: mocks.read }),
}));
vi.mock("./syncEngine", () => ({ createSyncEngine: vi.fn() }));
vi.mock("./syncOperationRepository", () => ({ createSyncOperationRepository: vi.fn() }));

// eslint-disable-next-line import/first
import { refreshPersonalSettlementReview } from "./personalSettlementReviewCoordinator";

describe("explicit Personal Settlement Review read", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves cached Review and propagates the exact blocked 409 to explicit callers", async () => {
    const blocked = new ApiClientError(
      "blocked",
      "http",
      409,
      "SETTLEMENT_REVIEW_BLOCKED",
    );
    mocks.read.mockRejectedValue(blocked);
    await expect(refreshPersonalSettlementReview("journey-a")).rejects.toBe(blocked);
    expect(mocks.applyRemote).not.toHaveBeenCalled();
  });
});
