import { z } from "zod";
import {
  classifySupabaseAuthAccount,
  isNormalAccount,
} from "../backend/src/authAccountQualification";
import {
  createRequestBoundary,
  readBoundedJson,
  readBoundedBytes,
} from "../src/data/api/requestBoundary";

const scopeSchema = z.strictObject({
  accountId: z.uuid(),
  clientId: z.uuid(),
  expiresAt: z.number().int().positive(),
});
const userSchema = z.object({
  id: z.uuid(),
  is_anonymous: z.boolean(),
  deleted_at: z.string().nullish(),
  banned_until: z.iso.datetime({ offset: true }).nullish(),
});
export function createBetaGrantRevocation(options: {
  issuer: string;
  publishableKey: string;
  scope: unknown;
  request: typeof fetch;
  audit: (event: Record<string, unknown>) => void;
}) {
  const scope = scopeSchema.parse(options.scope),
    origin = new URL(options.issuer);
  if (
    origin.protocol !== "https:" ||
    origin.pathname !== "/auth/v1" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    scope.expiresAt <= Date.now() ||
    scope.expiresAt > Date.now() + 7200000
  )
    throw Error("ISOLATED_REVOCATION_SCOPE_REQUIRED");
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (url.pathname !== "/auth/v1/user/oauth/grants" || request.method !== "DELETE")
      return null;
    const fail = (status: number, code: string) =>
      Response.json(
        { error: { code } },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    if (url.origin !== origin.origin) return fail(404, "NOT_FOUND");
    if (Date.now() >= scope.expiresAt) return fail(503, "ISOLATED_REVOCATION_EXPIRED");
    if (
      [...url.searchParams.keys()].length !== 1 ||
      url.searchParams.getAll("client_id").length !== 1 ||
      url.searchParams.get("client_id") !== scope.clientId
    )
      return fail(400, "EXACT_REVOCATION_CLIENT_REQUIRED");
    const authorization = request.headers.get("authorization");
    if (
      !authorization ||
      !/^Bearer [A-Za-z0-9._~-]+$/.test(authorization) ||
      authorization.length > 8192
    )
      return fail(401, "NORMAL_SESSION_REQUIRED");
    const boundary = createRequestBoundary(10000, request.signal);
    try {
      if (request.body && (await readBoundedBytes(request, 1024, boundary)).length !== 0)
        return fail(400, "REVOCATION_BODY_NOT_ALLOWED");
      const headers = { Authorization: authorization, apikey: options.publishableKey };
      const response = await boundary.run(() =>
        options.request(options.issuer + "/user", {
          method: "GET",
          headers,
          redirect: "error",
          signal: boundary.signal,
        }),
      );
      if (!response.ok) {
        await response.body?.cancel();
        return fail(401, "NORMAL_SESSION_REQUIRED");
      }
      const user = userSchema.parse(await readBoundedJson(response, 65536, boundary));
      const account = classifySupabaseAuthAccount(user);
      if (
        !account ||
        !isNormalAccount(account) ||
        account.id !== scope.accountId ||
        user.deleted_at ||
        (user.banned_until && Date.parse(user.banned_until) > Date.now())
      )
        return fail(403, "REVOCATION_ACCOUNT_FORBIDDEN");
      if (Date.now() >= scope.expiresAt) return fail(503, "ISOLATED_REVOCATION_EXPIRED");
      options.audit({
        event: "FORMAL_SELF_GRANT_REVOCATION_REQUESTED",
        accountId: account.id,
        clientId: scope.clientId,
      });
      const revoked = await boundary.run(() =>
        options.request(
          options.issuer +
            "/user/oauth/grants?client_id=" +
            encodeURIComponent(scope.clientId),
          { method: "DELETE", headers, redirect: "error", signal: boundary.signal },
        ),
      );
      const body = revoked.body
        ? await readBoundedBytes(revoked, 65536, boundary)
        : undefined;
      options.audit({
        event: "FORMAL_SELF_GRANT_REVOCATION_RESPONSE",
        accountId: account.id,
        clientId: scope.clientId,
        status: revoked.status,
      });
      return new Response(
        [204, 205, 304].includes(revoked.status)
          ? null
          : body
            ? Buffer.from(body)
            : undefined,
        {
          status: revoked.status,
          headers: {
            "Cache-Control": "private, no-store",
            ...(revoked.headers.get("content-type")
              ? { "Content-Type": revoked.headers.get("content-type")! }
              : {}),
          },
        },
      );
    } catch {
      return fail(503, "FORMAL_SELF_REVOCATION_UNAVAILABLE_NO_AUTOMATIC_RETRY");
    } finally {
      boundary.close();
    }
  };
}
