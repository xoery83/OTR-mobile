import type { AuthState } from "./authState";

export type LocalSession = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
};

export function stateFromLocalSession(session: LocalSession | null): AuthState {
  return session ? "AUTHENTICATED_OFFLINE" : "SIGNED_OUT";
}

export function stateFromSessionAndNetwork(
  session: LocalSession | null,
  isOnline: boolean,
  now = Date.now(),
): AuthState {
  if (!session) return "SIGNED_OUT";
  if (!isOnline || !session.accessToken || !session.expiresAt) {
    return "AUTHENTICATED_OFFLINE";
  }

  return Date.parse(session.expiresAt) > now
    ? "AUTHENTICATED_ONLINE"
    : "AUTHENTICATED_OFFLINE";
}
