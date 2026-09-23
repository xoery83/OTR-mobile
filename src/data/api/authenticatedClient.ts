import { createApiClient, type ApiClientOptions } from "./client";
import { sessionAccessToken } from "@/data/auth/sessionAccessToken";

type TokenProvider = typeof sessionAccessToken;

export function createAuthenticatedApiClient(
  options: Omit<ApiClientOptions, "accessToken" | "accessTokenProvider"> = {},
  tokenProvider: TokenProvider = sessionAccessToken,
) {
  let userId: string | undefined;
  return createApiClient({
    ...options,
    accessTokenProvider: async (forceRefresh, rejectedToken) => {
      const session = await tokenProvider({
        expectedUserId: userId,
        forceRefresh,
        rejectedToken,
      });
      userId ??= session.userId;
      return session.token;
    },
  });
}
