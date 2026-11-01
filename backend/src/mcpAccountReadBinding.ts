import { randomUUID } from "node:crypto";
import { createRequestBoundary, RequestBoundaryError } from "@/data/api/requestBoundary";
import { coreHttpBoundary, type CoreHttpConnection } from "./tripCoreV2Http";
import { tripDiscoveryBoundary, type TripDiscoveryPort } from "./tripDiscovery";
import { mcpReadGrantSchema, type McpVerifiedGrant } from "./mcpOAuthGrantVerifier";

export type McpReadStageDiagnostic = Readonly<{
  diagnosticId: string;
  resource: "DISCOVERY" | "COLLECTION" | "ITEM";
  stage: "PRECHECK" | "OWNING_ENTERED" | "OWNING_RETURNED" | "POSTCHECK";
  elapsedMs: number;
  remainingMs: number;
  owningResponseStatus?: number;
  failure?: "EXPIRED" | "CANCELED" | "TIMEOUT" | "UNCLASSIFIED";
}>;
export type ReadPorts = Readonly<{
  readDiagnostic?(event: McpReadStageDiagnostic): void;
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
        // This random identifier correlates logs only, never grants access or identifies an operation.
        const diagnosticId = ports.readDiagnostic ? randomUUID() : undefined;
        const startedAt = Date.now();
        let stage: McpReadStageDiagnostic["stage"] = "PRECHECK";
        let owningResponseStatus: number | undefined;
        let diagnosticFinished = false;
        const observe = (failure?: McpReadStageDiagnostic["failure"]) => {
          if (!diagnosticId || diagnosticFinished) return;
          try {
            ports.readDiagnostic?.({
              diagnosticId,
              resource: discovery
                ? "DISCOVERY"
                : url.pathname.endsWith("/collection")
                  ? "COLLECTION"
                  : "ITEM",
              stage,
              elapsedMs: Math.max(0, Math.min(120000, Date.now() - startedAt)),
              remainingMs: Math.max(0, Math.min(60000, grant.expiresAt - Date.now())),
              ...(owningResponseStatus === undefined ? {} : { owningResponseStatus }),
              ...(failure ? { failure } : {}),
            });
          } catch {
            /* Diagnostics cannot change authorization, returned data or retry behavior. */
          }
        };
        observe();
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
          response = await boundary.run(async () => {
            stage = "OWNING_ENTERED";
            observe();
            const returned = await (discovery
              ? tripDiscoveryBoundary(request, grant.accountId, ports.discovery)
              : coreHttpBoundary(
                  request,
                  grant.accountId,
                  ports.canReadTrip,
                  ports.core,
                ));
            owningResponseStatus = returned.status;
            stage = "OWNING_RETURNED";
            observe();
            return returned;
          });
          stage = "POSTCHECK";
          observe();
          current();
          return response;
        } catch (error) {
          const failure =
            error instanceof RequestBoundaryError
              ? error.code === "REQUEST_TIMEOUT"
                ? "TIMEOUT"
                : error.code === "REQUEST_CANCELED"
                  ? "CANCELED"
                  : "UNCLASSIFIED"
              : error instanceof Error && error.message === "MCP_GRANT_EXPIRED"
                ? "EXPIRED"
                : "UNCLASSIFIED";
          observe(failure);
          void response?.body?.cancel().catch(() => undefined);
          return reply(Date.now() >= grant.expiresAt ? 401 : 503, "MCP_READ_UNAVAILABLE");
        } finally {
          diagnosticFinished = true;
          boundary.close();
        }
      },
    });
  };
}
