import {
  classifySupabaseAuthAccount,
  isNormalAccount,
} from "../backend/src/authAccountQualification";
import { z } from "zod";
import type { BackendMutation } from "./mutation";
import { createRequestBoundary, readBoundedJson } from "../src/data/api/requestBoundary";
import { createMcpHandler, type McpOptions } from "./server";
import { loopbackServer } from "./http";

export const DEV_BACKEND = "https://api-dev.xoery.art";
export const DEV_AUTH = "https://tuqigdxrvrerfewsxqgm.supabase.co";
// Internal validation only: this deliberately accepts OTR session tokens, not Remote MCP OAuth tokens.
export function internalSessionAuthorizer(
  publishableKey: string,
  controlledMutationTest = false,
): NonNullable<McpOptions["authorize"]> {
  if (!publishableKey.startsWith("sb_publishable_"))
    throw Error("DEV_PUBLISHABLE_KEY_REQUIRED");
  return async (request) => {
    const bearer = request.headers.get("authorization");
    if (!bearer || !/^Bearer [A-Za-z0-9._~-]+$/.test(bearer) || bearer.length > 8192)
      return null;
    const response = await fetch(`${DEV_AUTH}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: bearer },
      signal: request.signal,
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const boundary = createRequestBoundary(10000, request.signal);
    let user: { id: string; is_anonymous: boolean };
    try {
      user = z
        .object({ id: z.uuid(), is_anonymous: z.boolean() })
        .parse(await readBoundedJson(response, 1048576, boundary));
    } finally {
      boundary.close();
    }
    const principal = classifySupabaseAuthAccount(user);
    if (!principal || !isNormalAccount(principal)) return null;
    const backend: BackendMutation = async (q, signal) => {
      const readAllowed =
        q.method === "GET" &&
        /^\/v2\/(?:trip-create-operations\/[0-9a-f-]{36}|trips\/[0-9a-f-]{36}\/core\/(?:capabilities|operations\/[0-9a-f-]{36}))$/.test(
          q.path,
        );
      const writeAllowed =
        q.method === "POST" &&
        /^(?:\/v2\/trips|\/v2\/trips\/[0-9a-f-]{36}\/core\/commands)$/.test(q.path);
      if (!controlledMutationTest || !(readAllowed || writeAllowed))
        throw Error("INTERNAL_MUTATION_PATH_DENIED");
      return fetch(DEV_BACKEND + q.path, {
        method: q.method,
        headers: {
          ...q.headers,
          Authorization: bearer,
          "Content-Type": "application/json",
        },
        ...(q.body === undefined ? {} : { body: JSON.stringify(q.body) }),
        signal,
        redirect: "error",
      });
    };
    return {
      accountId: user.id,
      ...(controlledMutationTest
        ? { clientId: "otr-internal-controlled-qa", backend }
        : {}),
      resource: new URL(request.url).origin + "/mcp",
      scopes: controlledMutationTest
        ? ["otr.trips.read", "otr.trips.write"]
        : ["otr.trips.read"],
      expiresAt: Date.now() + 60000,
      read: (path, signal) => {
        if (
          !/^\/v2\/trips(?:\?limit=\d+(?:&cursor=[0-9a-f-]{36})?|\/[0-9a-f-]{36}\/core\/(?:collection|objects\/ITEM\/[0-9a-f-]{36}))$/.test(
            path,
          )
        )
          throw Error("INTERNAL_READ_PATH_DENIED");
        return fetch(DEV_BACKEND + path, {
          method: "GET",
          headers: {
            Authorization: bearer,
            "X-OTR-Core-Contract-Version": "2",
          },
          signal,
          redirect: "error",
        });
      },
    };
  };
}
if (process.env.OTR_MCP_INTERNAL_SESSION_TEST === "1") {
  const port = z.coerce
    .number()
    .int()
    .min(1024)
    .max(65535)
    .default(8798)
    .parse(process.env.OTR_MCP_PORT);
  const key = z.string().min(1).parse(process.env.OTR_MCP_DEV_PUBLISHABLE_KEY);
  const handle = createMcpHandler({
    resource: `http://127.0.0.1:${port}/mcp`,
    authorize: internalSessionAuthorizer(key),
    log: (event) => console.info(JSON.stringify(event)),
  });
  loopbackServer(handle).listen(port, "127.0.0.1", () =>
    console.info("MCP_INTERNAL_SESSION_TEST_ONLY"),
  );
}
