import type { AuthState } from "./authState";

export type AccountIdentity = {
  userId: string;
  displayName: string;
  email: string | null;
};

export type LocalSession = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  identity?: AccountIdentity;
};

export function identityFromAccessToken(accessToken: string | null) {
  if (!accessToken) return null;
  try {
    const encoded = accessToken.split(".")[1];
    if (!encoded) return null;
    const padded = encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    const metadata = isRecord(payload.user_metadata) ? payload.user_metadata : {};
    const email = typeof payload.email === "string" ? payload.email : null;
    const displayName = [metadata.display_name, metadata.full_name, metadata.name].find(
      (value): value is string => typeof value === "string" && Boolean(value.trim()),
    );
    return {
      userId: payload.sub,
      displayName: displayName?.trim() || email?.split("@")[0] || "Account",
      email,
    } satisfies AccountIdentity;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
