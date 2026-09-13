import { ApiClientError, createApiClient } from "@/data/api/client";
import {
  createSyncResponseSchema,
  type CreateExpenseRequest,
  type CreateItineraryItemRequest,
} from "@/data/api/devSyncContracts";
import { readLocalSession } from "@/data/auth/authRepository";

import type { ExpenseCreateTransport } from "./expenseSyncWorker";
import type { ItineraryCreateTransport } from "./itinerarySyncWorker";

type AuthenticatedClient = ReturnType<typeof createApiClient>;

export type DevTransportDependencies = {
  readSession?: typeof readLocalSession;
  createClient?: (accessToken: string) => AuthenticatedClient;
  simulateResponseLoss?: (entity: "expense" | "itinerary") => boolean;
};

const consumedResponseLoss = new Set<string>();

function configuredResponseLoss(entity: "expense" | "itinerary") {
  if (
    process.env.EXPO_PUBLIC_OTR_DEV_SIMULATE_RESPONSE_LOSS_ONCE !== entity ||
    consumedResponseLoss.has(entity)
  ) {
    return false;
  }
  consumedResponseLoss.add(entity);
  return true;
}

async function authenticatedClient(dependencies: DevTransportDependencies) {
  const session = await (dependencies.readSession ?? readLocalSession)();
  if (!session?.accessToken)
    throw new ApiClientError(
      "Authentication is unavailable.",
      "http",
      401,
      "AUTH_REQUIRED",
    );
  return (
    dependencies.createClient ?? ((token) => createApiClient({ accessToken: token }))
  )(session.accessToken);
}

function maybeLoseResponse(
  entity: "expense" | "itinerary",
  dependencies: DevTransportDependencies,
) {
  if ((dependencies.simulateResponseLoss ?? configuredResponseLoss)(entity)) {
    throw new Error("Simulated ambiguous response loss after remote create.");
  }
}

export function createDevExpenseTransport(
  dependencies: DevTransportDependencies = {},
): ExpenseCreateTransport {
  return {
    async createExpense({ expense, idempotencyKey }) {
      const client = await authenticatedClient(dependencies);
      const body: CreateExpenseRequest = {
        localId: expense.id,
        title: expense.title,
        amountMinor: expense.amountMinor,
        currencyCode: expense.currencyCode,
        paidByMemberId: expense.paidByMemberId,
        occurredAt: expense.occurredAt,
      };
      const response = await client.post(
        `/v1/trips/${expense.tripId}/expenses`,
        body,
        createSyncResponseSchema,
        { "Idempotency-Key": idempotencyKey },
      );
      maybeLoseResponse("expense", dependencies);
      return response;
    },
  };
}

export function createDevItineraryTransport(
  dependencies: DevTransportDependencies = {},
): ItineraryCreateTransport {
  return {
    async createItineraryItem({ item, idempotencyKey }) {
      const client = await authenticatedClient(dependencies);
      const body: CreateItineraryItemRequest = {
        localId: item.id,
        title: item.title,
        scheduledDate: item.scheduledDate,
        startTime: item.startTime,
        location: item.location,
        notes: item.notes,
      };
      const response = await client.post(
        `/v1/trips/${item.tripId}/itinerary-items`,
        body,
        createSyncResponseSchema,
        { "Idempotency-Key": idempotencyKey },
      );
      maybeLoseResponse("itinerary", dependencies);
      return response;
    },
  };
}
