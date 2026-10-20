import type { LocalSession } from "./localSession";
import type { AuthState } from "./authState";

export class ReauthRequiredError extends Error {
  constructor() {
    super("The server rejected the local refresh session.");
  }
}

export type AuthRefreshResult = {
  authState: AuthState;
  session: LocalSession | null;
};

export async function refreshInBackground(
  session: LocalSession | null,
  refresh: (session: LocalSession) => Promise<LocalSession>,
): Promise<AuthRefreshResult> {
  if (!session) {
    return { authState: "SIGNED_OUT", session: null };
  }

  try {
    return {
      authState: "AUTHENTICATED_ONLINE",
      session: await refresh(session),
    };
  } catch (error) {
    if (error instanceof ReauthRequiredError) {
      return { authState: "REAUTH_REQUIRED", session: null };
    }

    return { authState: "AUTHENTICATED_OFFLINE", session };
  }
}
