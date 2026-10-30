import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  privateAccountProfilePath,
  privateAccountProfileMutationSchema,
  privateAccountProfileReceiptSchema,
  privateAccountProfileSnapshotSchema,
  type PrivateAccountProfileMutation,
} from "../../src/data/api/privateAccountProfileContracts";
import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import type { AuthenticatedUser } from "./app";

type ProfileScope = Readonly<{ accountId: string; accessToken: string }>;
export type PrivateAccountProfilePort = {
  read(scope: ProfileScope, signal: AbortSignal): Promise<unknown>;
  save(
    scope: ProfileScope,
    input: PrivateAccountProfileMutation,
    signal: AbortSignal,
  ): Promise<unknown>;
  receipt(
    scope: ProfileScope,
    operationId: string,
    signal: AbortSignal,
  ): Promise<unknown | null>;
};
export class PrivateAccountProfileError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}
const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
  });
const failure = (status: number, code: string) =>
  reply(status, { error: { code, message: code } });

// Optional owning port only; this module is not mounted by Bootstrap.
export async function privateAccountProfileBoundary(
  request: Request,
  user: AuthenticatedUser,
  port?: PrivateAccountProfilePort,
) {
  const url = new URL(request.url),
    operations = privateAccountProfilePath + "/operations";
  const operation = url.pathname.startsWith(operations + "/")
    ? coreUuid.safeParse(url.pathname.slice(operations.length + 1))
    : null;
  if (![privateAccountProfilePath, operations].includes(url.pathname) && !operation)
    return failure(404, "PROFILE_NOT_FOUND");
  if (url.search || (operation && !operation.success))
    return failure(400, "PROFILE_INVALID");
  if (user.accountClass !== "NORMAL_ACCOUNT" || !coreUuid.safeParse(user.id).success)
    return failure(403, "PROFILE_NORMAL_ACCOUNT_REQUIRED");
  const bearer = request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!bearer) return failure(401, "PROFILE_AUTH_REQUIRED");
  if (!port) return failure(503, "PROFILE_CLOSED");
  const scope = Object.freeze({ accountId: user.id, accessToken: bearer });
  const boundary = createRequestBoundary(15000, request.signal);
  try {
    if (url.pathname === privateAccountProfilePath && request.method === "GET") {
      const result = privateAccountProfileSnapshotSchema.parse(
        await boundary.run(() => port.read(scope, boundary.signal)),
      );
      if (result.accountId !== scope.accountId)
        return failure(503, "PROFILE_RESULT_BINDING");
      return reply(200, result);
    }
    if (url.pathname === operations && request.method === "POST") {
      let input: PrivateAccountProfileMutation;
      try {
        input = privateAccountProfileMutationSchema.parse(
          await readBoundedJson(new Response(request.body), 16384, boundary),
        );
      } catch {
        return failure(400, "PROFILE_INVALID");
      }
      if (request.headers.get("Idempotency-Key") !== input.operationId)
        return failure(400, "PROFILE_INVALID");
      const result = privateAccountProfileReceiptSchema.parse(
        await boundary.run(() => port.save(scope, input, boundary.signal)),
      );
      if (
        result.accountId !== scope.accountId ||
        result.operationId !== input.operationId ||
        result.revision !== input.expectedRevision + 1
      )
        return failure(503, "PROFILE_RESULT_BINDING");
      return reply(200, result);
    }
    if (operation?.success && request.method === "GET") {
      const raw = await boundary.run(() =>
        port.receipt(scope, operation.data, boundary.signal),
      );
      if (raw === null) return failure(404, "PROFILE_RECEIPT_NOT_FOUND");
      const result = privateAccountProfileReceiptSchema.parse(raw);
      if (result.accountId !== scope.accountId || result.operationId !== operation.data)
        return failure(503, "PROFILE_RESULT_BINDING");
      return reply(200, result);
    }
    return failure(405, "METHOD_NOT_ALLOWED");
  } catch (error) {
    if (error instanceof PrivateAccountProfileError)
      return failure(error.status, error.code);
    return failure(503, "PROFILE_UNAVAILABLE");
  } finally {
    boundary.close();
  }
}
