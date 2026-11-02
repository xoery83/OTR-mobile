import { Buffer } from "node:buffer";
import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { DevBackendGateway } from "./app";
import { isNormalAccount } from "./authAccountQualification";
import { isOAuthResourceToken } from "./authResourceTokenBoundary";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import type { RealtimeAuthorityScope } from "./tripPrivateRealtimeAuthority";

const id = coreUuid.refine((value) => value !== "00000000-0000-0000-0000-000000000000");
const claimsSchema = z.object({
  sub: id,
  session_id: id,
  exp: z.number().int().positive().safe(),
  role: z.literal("authenticated"),
  aud: z.union([z.literal("authenticated"), z.array(z.string()).min(1).max(8)]),
  is_anonymous: z.boolean().optional(),
});
const identitySchema = z.strictObject({ sessionId: id, accountId: id, tripId: id });

// Prepare before BEGIN: getUser verifies the exact bearer; decoding alone grants nothing.
export async function preparePrivateRealtimeSession(
  gateway: Pick<DevBackendGateway, "validateAccessToken">,
  scope: Pick<RealtimeAuthorityScope, "accountId" | "tripId" | "accessToken">,
) {
  const accountId = id.parse(scope.accountId),
    tripId = id.parse(scope.tripId);
  const token = scope.accessToken;
  if (token.length > 16384 || isOAuthResourceToken(token))
    throw Error("PRIVATE_REALTIME_NORMAL_SESSION_REQUIRED");
  const user = await gateway.validateAccessToken(token);
  if (!user || !isNormalAccount(user) || user.id !== accountId)
    throw Error("PRIVATE_REALTIME_NORMAL_SESSION_REQUIRED");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part)))
    throw Error("PRIVATE_REALTIME_SESSION_CLAIMS_INVALID");
  const claims = claimsSchema.parse(
    JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")),
  );
  const expiresAt = claims.exp * 1000;
  if (
    claims.sub !== accountId ||
    claims.is_anonymous === true ||
    !claims.aud.includes("authenticated") ||
    !Number.isSafeInteger(expiresAt)
  )
    throw Error("PRIVATE_REALTIME_SESSION_CLAIMS_INVALID");
  const unexpired = () => {
    if (Date.now() >= expiresAt) throw Error("PRIVATE_REALTIME_ACCESS_TOKEN_EXPIRED");
  };
  unexpired();
  return Object.freeze({
    async currentSession(held: Pick<CorePgLease, "query">) {
      unexpired();
      const result = await held.query(
        "SELECT public.otr_private_realtime_current_session($1::uuid,$2::uuid) AS identity",
        [claims.session_id, tripId],
      );
      unexpired();
      if (result.rows.length !== 1) throw Error("PRIVATE_REALTIME_SESSION_UNAVAILABLE");
      const identity = identitySchema.parse(result.rows[0].identity);
      if (
        identity.accountId !== accountId ||
        identity.tripId !== tripId ||
        identity.sessionId !== claims.session_id
      )
        throw Error("PRIVATE_REALTIME_SESSION_BINDING");
      return Object.freeze({
        sessionId: identity.sessionId,
        accountId: identity.accountId,
      });
    },
  });
}
