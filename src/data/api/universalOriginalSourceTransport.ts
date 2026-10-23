import { fetch as expoFetch } from "expo/fetch";
import { sessionAccessToken } from "../auth/sessionAccessToken";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  canonicalEventJson,
  parseEventJson,
  type Json,
} from "@/domain/trip/eventIntentJson";
import { createRequestBoundary, readBoundedJson } from "./requestBoundary";
export type UniversalOriginalSourceTransport = {
  acquire(context: AccountRequestContext, command: Json): Promise<string>;
  lookup(context: AccountRequestContext, command: Json): Promise<string | null>;
};
// Explicit finite Source caller only: no default worker, auto-retry or authority creation.
export function createUniversalOriginalSourceTransport(
  getAccountId: () => Promise<string>,
  options: {
    baseUrl: string;
    fetchImplementation?: typeof fetch;
    tokenProvider?: typeof sessionAccessToken;
  },
): UniversalOriginalSourceTransport {
  const origin = new URL(options.baseUrl);
  if (
    origin.origin !== options.baseUrl ||
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password
  )
    throw new Error("SOURCE_ORIGIN_INVALID");
  const fetcher = options.fetchImplementation ?? expoFetch;
  async function request(
    context: AccountRequestContext,
    command: Json,
    method: "acquire" | "result",
  ) {
    const body = canonicalEventJson(command);
    if (new TextEncoder().encode(body).byteLength > 2097152)
      throw new Error("INVALID_SOURCE_COMMAND");
    const boundary = createRequestBoundary(15000, undefined, () =>
      assertAccountRequestGeneration(context),
    );
    try {
      await boundary.run(() => assertAccountRequestContext(context, getAccountId));
      const session = await boundary.run(() =>
        (options.tokenProvider ?? sessionAccessToken)({
          expectedUserId: context.accountId,
        }),
      );
      if (session.userId !== context.accountId) throw new Error("SOURCE_ACCOUNT_CHANGED");
      await boundary.run(() => assertAccountRequestContext(context, getAccountId));
      const response = await boundary.run(() =>
        fetcher(
          `${origin.origin}/v2/trips/${context.tripId}/universal-source-originals/${method}`,
          {
            method: "POST",
            redirect: "error",
            signal: boundary.signal,
            headers: {
              Authorization: `Bearer ${session.token}`,
              "Content-Type": "application/json",
              "Accept-Encoding": "identity",
            },
            body,
          },
        ),
      );
      if (response.status !== 200)
        throw new Error(
          response.status === 401
            ? "SOURCE_AUTH_REQUIRED"
            : response.status === 503
              ? "SOURCE_CAPABILITY_CLOSED"
              : "SOURCE_HTTP_REJECTED",
        );
      if (
        !response.headers.get("Content-Type")?.startsWith("application/json") ||
        response.headers.has("Content-Encoding")
      )
        throw new Error("SOURCE_RESPONSE_INVALID");
      const value = await readBoundedJson(response, 262144, boundary, (raw) =>
        parseEventJson(raw, 262144),
      );
      await boundary.run(() => assertAccountRequestContext(context, getAccountId));
      if (value === null) {
        if (method !== "result") throw new Error("SOURCE_RESPONSE_INVALID");
        return null;
      }
      return canonicalEventJson(value as Json);
    } finally {
      boundary.close();
    }
  }
  return {
    acquire: async (c, q) => {
      const r = await request(c, q, "acquire");
      if (r === null) throw new Error("SOURCE_RESPONSE_INVALID");
      return r;
    },
    lookup: (c, q) => request(c, q, "result"),
  };
}
