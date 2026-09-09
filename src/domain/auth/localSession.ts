import type { AuthState } from "./authState";

export type LocalSession = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
};

export function stateFromLocalSession(session: LocalSession | null): AuthState {
  return session ? "AUTHENTICATED_OFFLINE" : "SIGNED_OUT";
}
