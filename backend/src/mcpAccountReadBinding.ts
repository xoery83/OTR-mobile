import { createRequestBoundary } from "@/data/api/requestBoundary";
import { coreHttpBoundary, type CoreHttpConnection } from "./tripCoreV2Http";
import { tripDiscoveryBoundary, type TripDiscoveryPort } from "./tripDiscovery";
import { mcpReadGrantSchema, type McpVerifiedGrant } from "./mcpOAuthGrantVerifier";

type ReadPorts = Readonly<{
  discovery: TripDiscoveryPort;
  canReadTrip(actor: string, trip: string): Promise<boolean>;
  core: CoreHttpConnection;
}>;
const reply = (status: number, code: string) =>
  Response.json(
    { error: { code } },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );

// Request-scoped trusted host port, called only AFTER MCP signature + Auth active checks.
// No HTTP mount, bearer, service credential or new Trip permission authority.
export function createMcpAccountReadBinding(ports?: ReadPorts) {
  return async (input: McpVerifiedGrant, parent: AbortSignal) => {
    if (!ports) throw Error("MCP_ACCOUNT_READ_CLOSED");
    const grant = mcpReadGrantSchema.parse(input);
    parent.throwIfAborted();
    if (Date.now() >= grant.expiresAt) throw Error("MCP_GRANT_EXPIRED");
    return Object.freeze({
      read: async (path: string, signal: AbortSignal): Promise<Response> => {
        if (
          typeof path !== "string" ||
          path.length > 2048 ||
          !path.startsWith("/v2/trips")
        )
          return reply(400, "INVALID_PAYLOAD");
        const url = new URL(path, "https://api-dev.xoery.art");
        if (
          path !== url.pathname + url.search ||
          url.hash ||
          url.origin !== "https://api-dev.xoery.art"
        )
          return reply(400, "INVALID_PAYLOAD");
        const discovery = url.pathname === "/v2/trips";
        const core =
          /^\/v2\/trips\/[0-9a-f-]{36}\/core\/(collection|objects\/ITEM\/[0-9a-f-]{36})$/.test(
            url.pathname,
          );
        if (!discovery && !core) return reply(404, "NOT_VISIBLE");
        const boundary = createRequestBoundary(50000, AbortSignal.any([parent, signal]));
        let response: Response | undefined;
        try {
          const current = () => {
            boundary.assertCurrent();
            if (Date.now() >= grant.expiresAt) throw Error("MCP_GRANT_EXPIRED");
          };
          current();
          const request = new Request(url, {
            method: "GET",
            signal: boundary.signal,
            headers: { "X-OTR-Core-Contract-Version": "2" },
          });
          response = await boundary.run(() =>
            discovery
              ? tripDiscoveryBoundary(request, grant.accountId, ports.discovery)
              : coreHttpBoundary(request, grant.accountId, ports.canReadTrip, ports.core),
          );
          current();
          return response;
        } catch {
          void response?.body?.cancel().catch(() => undefined);
          return reply(Date.now() >= grant.expiresAt ? 401 : 503, "MCP_READ_UNAVAILABLE");
        } finally {
          boundary.close();
        }
      },
    });
  };
}
