import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  type AccountScope,
} from "@/data/auth/accountRequestContext";
import { createApiClient, type ApiClientOptions } from "./client";
import { sessionAccessToken } from "@/data/auth/sessionAccessToken";

type TokenProvider = typeof sessionAccessToken;

export function createAuthenticatedApiClient(
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider: TokenProvider = sessionAccessToken,
  context?: AccountScope,
) {
  let userId: string | undefined = context?.accountId;
  return createApiClient({
    ...options,
    ...(context
      ? { assertRequestCurrent: () => assertAccountRequestGeneration(context) }
      : {}),
    ...(context
      ? {
          fetchImplementation: ((...args) => {
            assertAccountRequestGeneration(context);
            return (options.fetchImplementation ?? fetch)(...args);
          }) as typeof fetch,
        }
      : {}),
    accessTokenProvider: async (forceRefresh, rejectedToken) => {
      if (context) assertAccountRequestGeneration(context);
      const session = await tokenProvider({
        expectedUserId: userId,
        forceRefresh,
        rejectedToken,
      });
      if (context) await assertAccountRequestContext(context, async () => session.userId);
      userId ??= session.userId;
      return session.token;
    },
  });
}
