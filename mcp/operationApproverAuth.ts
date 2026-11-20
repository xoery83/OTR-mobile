import { decodeJwt } from "jose";
import { z } from "zod";
import type { createBetaPrincipalVerifier } from "./betaOAuth";
const claimsSchema = z.object({
  iss: z.url(),
  sub: z.uuid(),
  aud: z.union([z.literal("authenticated"), z.tuple([z.literal("authenticated")])]),
  role: z.literal("authenticated"),
  is_anonymous: z.literal(false),
  exp: z.number(),
  session_id: z.uuid(),
  client_id: z.never().optional(),
  otr_scopes: z.never().optional(),
});
// Normal Auth verifies the token; decoded fields never establish identity by themselves.
export function createOperationApproverAuthenticator(options: {
  accountId: string;
  clientId: string;
  resource: string;
  validateToken(token: string): Promise<{ id: string } | null>;
  verifyGrant: ReturnType<typeof createBetaPrincipalVerifier>;
}) {
  return async (token: string, signal: AbortSignal) => {
    try {
      const claims = claimsSchema.parse(decodeJwt(token));
      if (
        claims.exp * 1000 <= Date.now() ||
        claims.iss !== new URL(options.resource).origin + "/auth/v1"
      )
        return null;
      const user = await options.validateToken(token);
      signal.throwIfAborted();
      if (!user || user.id !== claims.sub || user.id !== options.accountId) return null;
      const live = await options.verifyGrant(
        {
          accountId: user.id,
          clientId: options.clientId,
          resource: options.resource,
          expiresAt: claims.exp * 1000,
        },
        signal,
        { accessToken: token },
      );
      signal.throwIfAborted();
      return live ? { accountId: user.id, sessionId: claims.session_id } : null;
    } catch {
      return null;
    }
  };
}
