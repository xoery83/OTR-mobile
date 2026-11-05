import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  selfNicknameRecoverRequestSchema,
  selfNicknameRecoverResponseSchema,
  parseSelfNicknameCommand,
  parseSelfNicknameObservation,
  parseSelfNicknameMutationResponse,
  parseSelfNicknameRecoverResponse,
  type SelfNicknameCommand,
  type SelfNicknameContext,
} from "@/domain/trip/tripPersonSelfNickname";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "@/data/api/requestBoundary";
import { isNormalAccount, type AuthenticatedAccount } from "./authAccountQualification";

export class SelfTripNicknameHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
export type SelfTripNicknameRequest =
  | Readonly<{ kind: "READ"; context: SelfNicknameContext }>
  | Readonly<{
      kind: "EXECUTE";
      context: SelfNicknameContext;
      command: SelfNicknameCommand;
    }>
  | Readonly<{
      kind: "RECOVER";
      context: SelfNicknameContext;
      operationId: string;
      intentDigest: string;
    }>;
const route =
  /^\/v1\/trips\/([^/]+)\/persons\/([^/]+)\/self-nickname(?:\/(commands)|\/operations\/([^/]+)\/recover)?$/;
export function isSelfTripNicknamePath(path: string) {
  const match = route.exec(path);
  return Boolean(
    match &&
    coreUuid.safeParse(match[1]).success &&
    coreUuid.safeParse(match[2]).success &&
    (!match[4] || coreUuid.safeParse(match[4]).success),
  );
}
// user must be supplied by the existing trusted normal-JWT verifier, never body/header claims.
export async function decodeSelfTripNicknameRequest(
  request: Request,
  user: AuthenticatedAccount,
): Promise<SelfTripNicknameRequest> {
  const url = new URL(request.url),
    match = route.exec(url.pathname);
  if (!match || !isSelfTripNicknamePath(url.pathname))
    throw new SelfTripNicknameHttpError(404, "SELF_NICKNAME_NOT_FOUND");
  if (url.search) throw new SelfTripNicknameHttpError(400, "SELF_NICKNAME_INVALID");
  if (!isNormalAccount(user))
    throw new SelfTripNicknameHttpError(403, "SELF_NICKNAME_NORMAL_ACCOUNT_REQUIRED");
  if (!request.headers.get("Authorization")?.match(/^Bearer [^\s]+$/))
    throw new SelfTripNicknameHttpError(401, "SELF_NICKNAME_AUTH_REQUIRED");
  const context = Object.freeze({
    accountId: user.id,
    tripId: match[1],
    personId: match[2],
  });
  if (!match[3] && !match[4]) {
    if (request.method !== "GET")
      throw new SelfTripNicknameHttpError(405, "METHOD_NOT_ALLOWED");
    return Object.freeze({ kind: "READ", context });
  }
  if (request.method !== "POST")
    throw new SelfTripNicknameHttpError(405, "METHOD_NOT_ALLOWED");
  const boundary = createRequestBoundary(15000, request.signal);
  try {
    const raw = await readBoundedJson(new Response(request.body), 16384, boundary);
    if (match[3]) {
      const command = parseSelfNicknameCommand(raw, context);
      if (request.headers.get("Idempotency-Key") !== command.operationId)
        throw new SelfTripNicknameHttpError(400, "SELF_NICKNAME_IDEMPOTENCY_REQUIRED");
      return Object.freeze({ kind: "EXECUTE", context, command: Object.freeze(command) });
    }
    const body = selfNicknameRecoverRequestSchema.parse(raw);
    return Object.freeze({
      kind: "RECOVER",
      context,
      operationId: match[4],
      intentDigest: body.intentDigest,
    });
  } catch (error) {
    if (error instanceof SelfTripNicknameHttpError) throw error;
    if (error instanceof RequestBoundaryError && error.code === "BODY_LIMIT")
      throw new SelfTripNicknameHttpError(413, "SELF_NICKNAME_INVALID");
    if (
      error instanceof RequestBoundaryError &&
      ["REQUEST_TIMEOUT", "REQUEST_CANCELED"].includes(error.code)
    )
      throw new SelfTripNicknameHttpError(503, "SELF_NICKNAME_UNAVAILABLE");
    throw new SelfTripNicknameHttpError(400, "SELF_NICKNAME_INVALID");
  } finally {
    boundary.close();
  }
}
// No port dispatch/mount here until the Core producer's exact typed signature is supplied.
export function encodeSelfTripNicknameResponse(
  input: SelfTripNicknameRequest,
  raw: unknown,
) {
  let result: unknown;
  if (input.kind === "READ") result = parseSelfNicknameObservation(raw, input.context);
  else if (input.kind === "EXECUTE")
    result = parseSelfNicknameMutationResponse(raw, input.command, input.context);
  else {
    const recovered = selfNicknameRecoverResponseSchema.parse(raw);
    if (recovered.kind === "ABSENT_UNCONFIRMED") result = recovered;
    else {
      const r = recovered.receipt;
      // The original intent is hash-bound in the stored receipt; never invent today's revision/name.
      const command = parseSelfNicknameCommand(
        {
          contractVersion: 1,
          command: "SET_SELF_TRIP_NICKNAME",
          operationId: input.operationId,
          tripId: input.context.tripId,
          personId: input.context.personId,
          expectedNicknameRevision: r.expectedNicknameRevision,
          nickname: r.desiredNickname,
          intentDigest: input.intentDigest,
        },
        input.context,
      );
      result = parseSelfNicknameRecoverResponse(recovered, command, input.context);
    }
  }
  return Response.json(result, {
    status: 200,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
  });
}
