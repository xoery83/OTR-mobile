import { describe, expect, it } from "vitest";

import { createFakeExpenseTransport } from "./fakeExpenseTransport";

const expense = {
  id: "expense-1",
  serverId: null,
  tripId: "trip-1",
  title: "Ferry",
  amountMinor: 1200,
  currencyCode: "NZD",
  paidByMemberId: null,
  occurredAt: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  syncStatus: "PENDING_CREATE" as const,
  syncVersion: 0,
};

describe("Phase 2A fake expense transport", () => {
  it("fails one controlled request then returns a generated server id", async () => {
    const transport = createFakeExpenseTransport();
    transport.failNextCreate();

    await expect(
      transport.createExpense({ expense, idempotencyKey: "operation-1" }),
    ).rejects.toThrow("fake transport failure");
    await expect(
      transport.createExpense({ expense, idempotencyKey: "operation-1" }),
    ).resolves.toEqual({ serverId: "fake_server_expense-1" });
  });
});
