import { z } from "zod";
import { createAuthenticatedApiClient } from "@/data/api/authenticatedClient";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import {
  requestSchema,
  responseSchema,
  type FlightEnrichmentRequest,
} from "@/domain/intelligence/flightEnrichmentContracts";

// Ephemeral advisory read. No Core/Item write, queue, retry or Import authority.
export async function readFlightEnrichmentRepository(tripId: string) {
  const context = await captureAccountRequestContext(tripId, requireActiveUserId);
  const client = createAuthenticatedApiClient(
    { timeoutMs: 20000, maxResponseBytes: 131072 },
    undefined,
    context,
  );
  const path = `/v1/trips/${encodeURIComponent(tripId)}/flight-enrichment`;
  return {
    async available() {
      try {
        const value = await client.get(
          `${path}/capabilities`,
          z.strictObject({
            version: z.literal("otr-flight-enrichment/1"),
            enabled: z.boolean(),
          }),
        );
        await assertAccountRequestContext(context, requireActiveUserId);
        return value.enabled;
      } catch {
        return false;
      }
    },
    async find(input: FlightEnrichmentRequest, signal: AbortSignal) {
      const request = requestSchema.parse(input);
      const bounded = createAuthenticatedApiClient(
        { signal, timeoutMs: 20000, maxResponseBytes: 131072 },
        undefined,
        context,
      );
      const response = await bounded.post(path, request, responseSchema, {
        "Idempotency-Key": request.idempotencyKey,
      });
      await assertAccountRequestContext(context, requireActiveUserId);
      if (
        response.requestId !== request.requestId ||
        response.idempotencyKey !== request.idempotencyKey ||
        response.mode !== request.mode ||
        response.draft.id !== request.draft.id ||
        response.draft.revision !== request.draft.revision ||
        response.query.flightNumber !== request.flightNumber ||
        response.query.departureLocalDate !== request.departureLocalDate
      )
        throw new Error("ENRICHMENT_RESPONSE_SCOPE");
      return response;
    },
  };
}
