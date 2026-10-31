import { createRequestBoundary } from "@/data/api/requestBoundary";
import { mcpWriteGrantSchema, type McpVerifiedGrant } from "./mcpOAuthGrantVerifier";
import { createMcpAccountReadBinding, type ReadPorts } from "./mcpAccountReadBinding";
import { coreHttpBoundary } from "./tripCoreV2Http";

export type CommandRequest = Readonly<{
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}>;
type WritePorts = ReadPorts & {
  isWriteGrantCurrent(grant: McpVerifiedGrant, signal: AbortSignal): Promise<boolean>;
};
const reply = (status: number, code: string) =>
  Response.json(
    { error: { code } },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );

// Unmounted: signature, active grant and fresh explicit Write Consent must precede binding.
// Existing MCP ConfirmChanges owns exact-operation confirmation before this trusted port.
export function createMcpAccountWriteBinding(ports?: WritePorts) {
  return async (input: McpVerifiedGrant, parent: AbortSignal) => {
    if (!ports) throw Error("MCP_ACCOUNT_WRITE_CLOSED");
    const grant = mcpWriteGrantSchema.parse(input);
    const reads = await createMcpAccountReadBinding(ports)(
      { ...grant, scopes: ["otr.trips.read"] },
      parent,
    );
    const qualification = createRequestBoundary(10000, parent);
    try {
      const active = await qualification.run(() =>
        ports.isWriteGrantCurrent(grant, qualification.signal),
      );
      qualification.assertCurrent();
      if (!active) throw Error("MCP_GRANT_INACTIVE");
      if (Date.now() >= grant.expiresAt) throw Error("MCP_GRANT_EXPIRED");
    } finally {
      qualification.close();
    }
    return Object.freeze({
      ...reads,
      backend: async (input: CommandRequest, signal: AbortSignal): Promise<Response> => {
        const { path, method } = input;
        if (
          typeof path !== "string" ||
          path.length > 2048 ||
          !path.startsWith("/v2/trips/")
        )
          return reply(400, "INVALID_PAYLOAD");
        const url = new URL(path, "https://api-dev.xoery.art");
        if (
          path !== url.pathname + url.search ||
          url.hash ||
          url.origin !== "https://api-dev.xoery.art"
        )
          return reply(400, "INVALID_PAYLOAD");
        const command = /^\/v2\/trips\/[0-9a-f-]{36}\/core\/commands$/.test(path);
        const operation =
          /^\/v2\/trips\/[0-9a-f-]{36}\/core\/operations\/[0-9a-f-]{36}$/.test(path);
        if (!((method === "POST" && command) || (method === "GET" && operation)))
          return reply(404, "NOT_VISIBLE");
        let body: string | undefined;
        try {
          if (method === "POST") body = JSON.stringify(input.body);
        } catch {
          return reply(400, "INVALID_PAYLOAD");
        }
        const boundary = createRequestBoundary(50000, AbortSignal.any([parent, signal]));
        let response: Response | undefined;
        let inactive = false;
        try {
          const current = async () => {
            boundary.assertCurrent();
            if (Date.now() >= grant.expiresAt) throw Error("MCP_GRANT_EXPIRED");
            if (
              !(await boundary.run(() =>
                ports.isWriteGrantCurrent(grant, boundary.signal),
              ))
            ) {
              inactive = true;
              throw Error("MCP_GRANT_INACTIVE");
            }
            boundary.assertCurrent();
            if (Date.now() >= grant.expiresAt) throw Error("MCP_GRANT_EXPIRED");
          };
          await current();
          const request = new Request(url, {
            method,
            signal: boundary.signal,
            headers: { "X-OTR-Core-Contract-Version": "2" },
            ...(method === "POST" ? { body } : {}),
          });
          response = await boundary.run(() =>
            coreHttpBoundary(request, grant.accountId, ports.canReadTrip, ports.core),
          );
          await current();
          return response;
        } catch {
          void response?.body?.cancel().catch(() => undefined);
          return reply(
            inactive || Date.now() >= grant.expiresAt ? 401 : 503,
            "MCP_WRITE_UNAVAILABLE",
          );
        } finally {
          boundary.close();
        }
      },
    });
  };
}
