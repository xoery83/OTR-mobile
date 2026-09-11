import { describe, expect, it, vi } from "vitest";

import type { Expense } from "@/domain/expense/types";
import type { ItineraryItem } from "@/domain/itinerary/types";

import {
  createDevExpenseTransport,
  createDevItineraryTransport,
} from "./devCreateTransports";

vi.mock("@/data/auth/authRepository", () => ({ readLocalSession: vi.fn() }));

const response = {
  serverId: "30000000-0000-4000-8000-000000000001",
  version: 1,
  updatedAt: "2026-09-10T00:00:00.000Z",
  idempotentReplay: false,
};

const expense: Expense = {
  id: "expense-local-1",
  serverId: null,
  tripId: "10000000-0000-4000-8000-000000000001",
  title: "Train",
  amountMinor: 2500,
  currencyCode: "NZD",
  paidByMemberId: null,
  occurredAt: null,
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
  syncStatus: "PENDING_CREATE",
  syncVersion: 0,
};

const itinerary: ItineraryItem = {
  id: "itinerary-local-1",
  serverId: null,
  tripId: expense.tripId,
  title: "Museum",
  scheduledDate: "2026-09-11",
  startTime: null,
  location: null,
  notes: null,
  createdAt: expense.createdAt,
  updatedAt: expense.updatedAt,
  syncStatus: "PENDING_CREATE",
  syncVersion: 0,
};

function dependencies(post = vi.fn().mockResolvedValue(response)) {
  return {
    post,
    value: {
      readSession: vi.fn().mockResolvedValue({ accessToken: "access-token" }),
      createClient: vi.fn(() => ({ get: vi.fn(), post, put: vi.fn(), delete: vi.fn() })),
      simulateResponseLoss: vi.fn(() => false),
    },
  };
}

describe("Supabase Dev create transports", () => {
  it("injects the stored session and maps Expense to the typed API", async () => {
    const { post, value } = dependencies();
    const result = await createDevExpenseTransport(value).createExpense({
      expense,
      idempotencyKey: "operation-1",
    });

    expect(value.createClient).toHaveBeenCalledWith("access-token");
    expect(post).toHaveBeenCalledWith(
      `/v1/trips/${expense.tripId}/expenses`,
      expect.objectContaining({ localId: expense.id, amountMinor: 2500 }),
      expect.anything(),
      { "Idempotency-Key": "operation-1" },
    );
    expect(result).toEqual(response);
  });

  it("keeps Expense and Itinerary endpoints isolated", async () => {
    const expenseDependencies = dependencies();
    const itineraryDependencies = dependencies();

    await createDevExpenseTransport(expenseDependencies.value).createExpense({
      expense,
      idempotencyKey: "expense-operation",
    });
    await createDevItineraryTransport(itineraryDependencies.value).createItineraryItem({
      item: itinerary,
      idempotencyKey: "itinerary-operation",
    });

    expect(expenseDependencies.post.mock.calls[0][0]).toContain("/expenses");
    expect(itineraryDependencies.post.mock.calls[0][0]).toContain("/itinerary-items");
  });

  it("surfaces a simulated lost response after the remote create", async () => {
    const { post, value } = dependencies();
    value.simulateResponseLoss.mockReturnValue(true);

    await expect(
      createDevExpenseTransport(value).createExpense({
        expense,
        idempotencyKey: "operation-1",
      }),
    ).rejects.toThrow("ambiguous response loss");
    expect(post).toHaveBeenCalledOnce();
  });

  it("requires a local authenticated session", async () => {
    const { value } = dependencies();
    value.readSession.mockResolvedValue(null);

    await expect(
      createDevExpenseTransport(value).createExpense({
        expense,
        idempotencyKey: "operation-1",
      }),
    ).rejects.toThrow("Supabase Dev session");
  });
});
