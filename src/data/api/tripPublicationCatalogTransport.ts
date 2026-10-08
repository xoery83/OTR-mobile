import { z } from "zod";
import { createAuthenticatedApiClient } from "./authenticatedClient";
import { ApiClientError, type ApiClientOptions } from "./client";
import { createRequestBoundary, RequestBoundaryError } from "./requestBoundary";
import { tripImportSnapshotSchema } from "./tripImportCatalogContracts";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  captureAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  canonicalEventJson,
  parseEventJson,
  type Json,
} from "@/domain/trip/eventIntentJson";

// Only trusted streaming adapters may be injected; no default/native fetch is installed.
export function createTripPublicationCatalogTransport(
  getAccountId: () => Promise<string>,
  options: Omit<
    ApiClientOptions,
    | "accessToken"
    | "accessTokenProvider"
    | "maxResponseBytes"
    | "assertRequestCurrent"
    | "parseBoundedResponseText"
  > = {},
  tokenProvider?: Parameters<typeof createAuthenticatedApiClient>[1],
) {
  return {
    captureContext: (tripId: string) => {
      z.uuid().parse(tripId);
      return captureAccountRequestContext(tripId, getAccountId);
    },
    async read(original: AccountRequestContext, signal?: AbortSignal) {
      const context = Object.freeze({ ...original });
      z.uuid().parse(context.accountId);
      z.uuid().parse(context.tripId);
      assertAccountRequestGeneration(context);
      if (
        !options.fetchImplementation ||
        typeof ReadableStream === "undefined" ||
        typeof Response === "undefined" ||
        !("body" in Response.prototype)
      )
        throw new ApiClientError(
          "Publication transport is unavailable.",
          "validation",
          undefined,
          "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
        );
      const url = new URL(
        options.baseUrl ?? process.env.EXPO_PUBLIC_OTR_API_BASE_URL ?? "",
      );
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new ApiClientError(
          "Publication transport is unavailable.",
          "validation",
          undefined,
          "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
        );
      const boundary = createRequestBoundary(
        Math.min(options.timeoutMs ?? 30000, 30000),
        signal ?? options.signal,
        () => assertAccountRequestGeneration(context),
      );
      try {
        await boundary.run(() => assertAccountRequestContext(context, getAccountId));
        const api = createAuthenticatedApiClient(
          {
            ...options,
            timeoutMs: Math.min(options.timeoutMs ?? 30000, 30000),
            signal: boundary.signal,
            maxResponseBytes: 4194304,
            parseBoundedResponseText: (text) => parseEventJson(text, 4194304),
          },
          tokenProvider,
          context,
        );
        const snapshot = await boundary.run(() =>
          api.get(
            `/v2/trips/${context.tripId}/source-import-catalogs`,
            tripImportSnapshotSchema,
            { "X-OTR-Publication-Catalog-Version": "1" },
          ),
        );
        await boundary.run(() => assertAccountRequestContext(context, getAccountId));
        if (
          snapshot.actor_account_id !== context.accountId ||
          snapshot.trip_id !== context.tripId
        )
          throw new ApiClientError(
            "Publication catalog scope is invalid.",
            "validation",
            undefined,
            "PUBLICATION_MEMBERSHIP_INTEGRITY",
          );
        if ((signal ?? options.signal)?.aborted)
          throw new ApiClientError(
            "Publication read was canceled.",
            "validation",
            undefined,
            "REQUEST_CANCELED",
          );
        const raw = canonicalEventJson(snapshot as Json);
        if (new TextEncoder().encode(raw).byteLength > 4194304)
          throw new ApiClientError(
            "Publication catalog exceeds its bound.",
            "validation",
            undefined,
            "BODY_LIMIT",
          );
        assertAccountRequestGeneration(context);
        boundary.assertCurrent();
        return raw;
      } catch (error) {
        if (error instanceof RequestBoundaryError)
          throw new ApiClientError(
            "Publication read is unavailable.",
            error.code === "REQUEST_TIMEOUT" ? "timeout" : "validation",
            undefined,
            error.code,
          );
        throw error;
      } finally {
        boundary.close();
      }
    },
  };
}
