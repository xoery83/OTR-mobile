import { describe, expect, it, vi } from "vitest";

import {
  createDevBackendHandler,
  type DevBackendGateway,
  type StoredCreate,
} from "./app";

const tripId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";

function createGateway(options: { authorized?: boolean } = {}) {
  const expenses = new Map<string, StoredCreate>();
  const itineraryItems = new Map<string, StoredCreate>();
  const gateway: DevBackendGateway = {
    validateAccessToken: vi.fn(async (token) =>
      token === "valid-token" ? { id: userId } : null,
    ),
    canWriteTrip: vi.fn(async () => options.authorized ?? true),
    findExpense: vi.fn(async (id) => expenses.get(id) ?? null),
    createExpense: vi.fn(async (id, requestedTripId, requestedUserId) => {
      const row = {
        id,
        tripId: requestedTripId,
        createdByUserId: requestedUserId,
        updatedAt: "2026-09-10T00:00:00.000Z",
      };
      expenses.set(id, row);
      return row;
    }),
    findItineraryItem: vi.fn(async (id) => itineraryItems.get(id) ?? null),
    createItineraryItem: vi.fn(async (id, requestedTripId, requestedUserId) => {
      const row = {
        id,
        tripId: requestedTripId,
        createdByUserId: requestedUserId,
        updatedAt: "2026-09-10T00:00:00.000Z",
      };
      itineraryItems.set(id, row);
      return row;
    }),
  };

  return { gateway, expenses, itineraryItems };
}

function post(
  resource: "expenses" | "itinerary-items",
  body: unknown,
  token = "valid-token",
) {
  return new Request(`http://localhost/v1/trips/${tripId}/${resource}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "operation-1",
    },
    body: JSON.stringify(body),
  });
}

const expenseBody = {
  localId: "expense-local-1",
  title: "Train",
  amountMinor: 2500,
  currencyCode: "NZD",
  paidByMemberId: null,
  occurredAt: null,
};

const itineraryBody = {
  localId: "itinerary-local-1",
  title: "Museum",
  scheduledDate: "2026-09-11",
  startTime: null,
  location: null,
  notes: null,
};

describe("OTR Dev Backend", () => {
  it("authenticates and creates both approved entity types", async () => {
    const { gateway } = createGateway();
    const handle = createDevBackendHandler({ gateway });

    const expense = await handle(post("expenses", expenseBody));
    const itinerary = await handle(post("itinerary-items", itineraryBody));

    expect(expense.status).toBe(201);
    expect(await expense.json()).toMatchObject({ version: 1, idempotentReplay: false });
    expect(itinerary.status).toBe(201);
    expect(gateway.createExpense).toHaveBeenCalledOnce();
    expect(gateway.createItineraryItem).toHaveBeenCalledOnce();
  });

  it("rejects invalid sessions and unauthorized trips before writing", async () => {
    const { gateway } = createGateway({ authorized: false });
    const handle = createDevBackendHandler({ gateway });

    const invalidSession = await handle(post("expenses", expenseBody, "invalid"));
    const forbidden = await handle(post("expenses", expenseBody));

    expect(invalidSession.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(gateway.createExpense).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads before authorization or writes", async () => {
    const { gateway } = createGateway();
    const response = await createDevBackendHandler({ gateway })(
      post("expenses", { ...expenseBody, amountMinor: -1 }),
    );

    expect(response.status).toBe(400);
    expect(gateway.canWriteTrip).not.toHaveBeenCalled();
    expect(gateway.createExpense).not.toHaveBeenCalled();
  });

  it("returns the original entity for an idempotent retry", async () => {
    const { gateway, expenses } = createGateway();
    const handle = createDevBackendHandler({ gateway });

    const first = await handle(post("expenses", expenseBody));
    const retried = await handle(post("expenses", expenseBody));
    const firstBody = (await first.json()) as { serverId: string };

    expect(await retried.json()).toMatchObject({
      serverId: firstBody.serverId,
      idempotentReplay: true,
    });
    expect(expenses).toHaveLength(1);
    expect(gateway.createExpense).toHaveBeenCalledOnce();
  });

  it("logs metadata without tokens or request content", async () => {
    const { gateway } = createGateway();
    const log = vi.fn();
    await createDevBackendHandler({ gateway, log })(post("expenses", expenseBody));

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ route: "expenses", status: 201 }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("valid-token");
    expect(JSON.stringify(log.mock.calls)).not.toContain("Train");
  });
});
