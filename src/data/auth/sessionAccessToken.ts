import { ApiClientError } from "@/data/api/client";
import type { AccountIdentity, LocalSession } from "@/domain/auth/localSession";

import { readLocalSession, writeLocalSession } from "./authRepository";
import { refreshSupabaseDevSession, SupabaseDevAuthError } from "./devSupabaseAuth";

export const accessTokenRefreshWindowMs = 60_000;

type RefreshSession = (
  refreshToken: string,
  persistSession: (session: LocalSession) => Promise<void>,
  identity: AccountIdentity,
) => Promise<LocalSession>;

type Dependencies = {
  readSession: typeof readLocalSession;
  writeSession: typeof writeLocalSession;
  refreshSession: RefreshSession;
  now: () => number;
};

type TokenRequest = {
  expectedUserId?: string;
  forceRefresh?: boolean;
  rejectedToken?: string;
};

export function createSessionAccessTokenProvider(
  dependencies: Dependencies = {
    readSession: readLocalSession,
    writeSession: writeLocalSession,
    refreshSession: (refreshToken, persistSession, identity) =>
      refreshSupabaseDevSession(refreshToken, { persistSession }, identity),
    now: Date.now,
  },
) {
  const refreshes = new Map<string, Promise<LocalSession>>();

  return async function accessToken(request: TokenRequest = {}) {
    const session = await dependencies.readSession();
    const userId = session?.identity?.userId;
    if (!session?.accessToken || !session.refreshToken || !userId) throw authRequired();
    if (request.expectedUserId && request.expectedUserId !== userId)
      throw authContextChanged();

    const expiresAt = session.expiresAt ? Date.parse(session.expiresAt) : 0;
    const alreadyRefreshed =
      request.forceRefresh &&
      request.rejectedToken &&
      session.accessToken !== request.rejectedToken;
    if (
      alreadyRefreshed ||
      (!request.forceRefresh &&
        Number.isFinite(expiresAt) &&
        expiresAt > dependencies.now() + accessTokenRefreshWindowMs)
    )
      return { token: session.accessToken, userId };

    const refreshKey = `${userId}\0${session.refreshToken}`;
    let refresh = refreshes.get(refreshKey);
    if (!refresh) {
      refresh = refreshOwnedSession(session, dependencies).finally(() => {
        refreshes.delete(refreshKey);
      });
      refreshes.set(refreshKey, refresh);
    }

    try {
      await refresh;
    } catch (error) {
      if (error instanceof ApiClientError) throw error;
      if (error instanceof SupabaseDevAuthError && error.kind === "invalid_session")
        throw authRequired();
      throw new ApiClientError(
        "Authentication refresh is temporarily unavailable.",
        "network",
        undefined,
        "AUTH_REFRESH_UNAVAILABLE",
        error,
      );
    }

    const current = await dependencies.readSession();
    if (current?.identity?.userId !== userId || !current.accessToken)
      throw authContextChanged();
    return { token: current.accessToken, userId };
  };
}

async function refreshOwnedSession(session: LocalSession, dependencies: Dependencies) {
  const identity = session.identity;
  if (!identity || !session.refreshToken) throw authRequired();
  return dependencies.refreshSession(
    session.refreshToken,
    async (refreshed) => {
      const active = await dependencies.readSession();
      if (
        active?.identity?.userId !== identity.userId ||
        active.refreshToken !== session.refreshToken
      )
        throw authContextChanged();
      await dependencies.writeSession(refreshed);
    },
    identity,
  );
}

function authRequired() {
  return new ApiClientError(
    "Authentication is unavailable.",
    "http",
    401,
    "AUTH_REQUIRED",
  );
}

function authContextChanged() {
  return new ApiClientError(
    "The active account changed during authentication.",
    "http",
    401,
    "AUTH_CONTEXT_CHANGED",
  );
}

export const sessionAccessToken = createSessionAccessTokenProvider();
