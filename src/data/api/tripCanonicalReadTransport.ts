import { utf8Length, EventCollectionError } from "@/data/api/tripEventCollectionCodec";
import { createAuthenticatedApiClient } from "./authenticatedClient";
import type { ApiClientOptions } from "./client";
import {
  assertAccountRequestContext,
  captureAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  canonicalCapabilitiesSchema,
  canonicalEventReadSchema,
  eventOperationReceiptSchema,
} from "./tripCanonicalReadContracts";
import { z } from "zod";

// Transport only: no local cache, queue, semantic revision or persistent apply.
export function createTripCanonicalReadTransport(
  getUserId: () => Promise<string>,
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
) {
  async function read<T>(tripId: string, suffix: string, schema: z.ZodType<T>) {
    z.uuid().parse(tripId);
    const context = await captureAccountRequestContext(tripId, getUserId);
    const api = createAuthenticatedApiClient(options, tokenProvider, context);
    const data = await api.get(`/v2/trips/${tripId}/${suffix}`, schema, {
      "X-OTR-Canonical-Event-Read-Version": "1",
    });
    await assertAccountRequestContext(context, getUserId);
    return { context, data };
  }
  return {
    async collectionPage(
      context: AccountRequestContext,
      cursor: string | null,
    ): Promise<unknown> {
      await assertAccountRequestContext(context, getUserId);
      const api = createAuthenticatedApiClient(
        {
          ...options,
          fetchImplementation: async (...args) => {
            const response = await (options.fetchImplementation ?? fetch)(...args);
            if (
              response.ok &&
              utf8Length(await response.clone().text()) > 4 * 1024 * 1024
            )
              throw new EventCollectionError(503, "CANONICAL_EVENT_SNAPSHOT_LIMIT");
            return response;
          },
        },
        tokenProvider,
        context,
      );
      const data = await api.get(
        `/v2/trips/${context.tripId}/canonical-events/snapshot${cursor === null ? "" : "?cursor=" + encodeURIComponent(cursor)}`,
        z.unknown(),
        {
          "X-OTR-Canonical-Event-Read-Version": "1",
          "X-OTR-Canonical-Event-Collection-Version": "1",
        },
      );
      await assertAccountRequestContext(context, getUserId);
      return data;
    },
    capabilities: (tripId: string) =>
      read(tripId, "canonical-events/capabilities", canonicalCapabilitiesSchema),
    async event(tripId: string, eventId: string) {
      z.uuid().parse(eventId);
      const result = await read(
        tripId,
        `canonical-events/${eventId}`,
        canonicalEventReadSchema,
      );
      if (
        result.data.disposition === "READ_ONLY" &&
        (result.data.event.trip_id !== tripId || result.data.event.id !== eventId)
      )
        throw new Error("Canonical Event read scope mismatch.");
      return result;
    },
    async receipt(tripId: string, operationKey: string) {
      z.uuid().parse(operationKey);
      const result = await read(
        tripId,
        `canonical-event-operations/${operationKey}`,
        eventOperationReceiptSchema,
      );
      if (
        result.data.trip_id !== tripId ||
        result.data.operation_key !== operationKey ||
        result.data.actor_account_id !== result.context.accountId
      )
        throw new Error("Event receipt scope mismatch.");
      return result;
    },
  };
}
