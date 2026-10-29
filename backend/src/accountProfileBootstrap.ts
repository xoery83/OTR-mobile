import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import {
  accountProfileBootstrapPath,
  accountProfileBootstrapSchema,
  type AccountProfileBootstrap,
} from "@/data/api/accountProfileContracts";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "@/data/api/requestBoundary";
import type { AuthenticatedUser } from "./app";

export type AccountProfileBootstrapPort = {
  ensure(
    accountId: string,
    accessToken: string,
    signal: AbortSignal,
  ): Promise<AccountProfileBootstrap>;
};
const ownProfile = z.strictObject({ id: coreUuid });

// Same normal JWT for Auth validation and PostgREST; never a service-role mutation.
export function createAccountProfileBootstrapPort(config: {
  url: string;
  publishableKey: string;
  fetchImplementation?: typeof fetch;
}): AccountProfileBootstrapPort {
  const origin = "https://tuqigdxrvrerfewsxqgm.supabase.co";
  if (![origin, origin + "/"].includes(config.url) || !config.publishableKey)
    throw Error("ACCOUNT_PROFILE_DEV_CONFIG_REQUIRED");
  return {
    async ensure(accountId, accessToken, signal) {
      coreUuid.parse(accountId);
      if (!accessToken || signal.aborted) throw Error("ACCOUNT_PROFILE_UNAVAILABLE");
      const wire = config.fetchImplementation ?? fetch;
      const client = createClient(origin, config.publishableKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: { Authorization: `Bearer ${accessToken}` },
          fetch: (input, init) => wire(input, { ...init, signal }),
        },
      });
      const { data: identity, error: identityError } =
        await client.auth.getUser(accessToken);
      if (identityError || identity.user.id !== accountId)
        throw Error("ACCOUNT_PROFILE_IDENTITY_REQUIRED");
      async function read() {
        const { data, error } = await client
          .from("profiles")
          .select("id")
          .eq("id", accountId)
          .maybeSingle();
        if (error) throw Error("ACCOUNT_PROFILE_UNAVAILABLE");
        if (data !== null && ownProfile.parse(data).id !== accountId)
          throw Error("ACCOUNT_PROFILE_IDENTITY_REQUIRED");
        return data;
      }
      if (!(await read())) {
        const { error } = await client
          .from("profiles")
          .insert({ id: accountId, display_name: "" });
        if (error && error.code !== "23505") throw Error("ACCOUNT_PROFILE_UNAVAILABLE");
        if (!(await read())) throw Error("ACCOUNT_PROFILE_UNVERIFIED");
      }
      if (signal.aborted) throw Error("ACCOUNT_PROFILE_UNAVAILABLE");
      return { schemaId: "otr.auth.account-profile-bootstrap/1", accountId, ready: true };
    },
  };
}

const reply = (status: number, body: unknown) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
  });
const failure = (status: number, code: string) =>
  reply(status, { error: { code, message: code } });

// Existing Backend authenticate() must supply user. No caller-provided Account input.
export async function accountProfileBootstrapBoundary(
  request: Request,
  user: AuthenticatedUser,
  port?: AccountProfileBootstrapPort,
) {
  const url = new URL(request.url);
  if (url.pathname !== accountProfileBootstrapPath)
    return failure(404, "ACCOUNT_PROFILE_NOT_FOUND");
  if (request.method !== "POST") return failure(405, "METHOD_NOT_ALLOWED");
  if (url.search) return failure(400, "ACCOUNT_PROFILE_INVALID");
  const actor = coreUuid.safeParse(user.id),
    authorization = request.headers.get("Authorization"),
    bearer = authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!actor.success || !bearer) return failure(401, "AUTHENTICATION_REQUIRED");
  if (!port) return failure(503, "ACCOUNT_PROFILE_CLOSED");
  const boundary = createRequestBoundary(15000, request.signal);
  try {
    const body = await readBoundedJson(new Response(request.body), 256, boundary);
    if (!z.strictObject({}).safeParse(body).success)
      return failure(400, "ACCOUNT_PROFILE_INVALID");
    const result = accountProfileBootstrapSchema.parse(
      await boundary.run(() => port.ensure(actor.data, bearer, boundary.signal)),
    );
    boundary.assertCurrent();
    if (result.accountId !== actor.data)
      return failure(503, "ACCOUNT_PROFILE_UNVERIFIED");
    return reply(200, result);
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      if (error.code === "BODY_LIMIT") return failure(413, "ACCOUNT_PROFILE_INVALID");
      if (["INVALID_RESPONSE", "STREAM_UNAVAILABLE"].includes(error.code))
        return failure(400, "ACCOUNT_PROFILE_INVALID");
    }
    return failure(503, "ACCOUNT_PROFILE_UNAVAILABLE");
  } finally {
    boundary.close();
  }
}
