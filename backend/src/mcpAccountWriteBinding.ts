import { randomUUID } from "node:crypto";
import { createRequestBoundary, RequestBoundaryError } from "@/data/api/requestBoundary";
import { mcpWriteGrantSchema, type McpVerifiedGrant } from "./mcpOAuthGrantVerifier";
import { createMcpAccountReadBinding, type ReadPorts } from "./mcpAccountReadBinding";
import { coreHttpBoundary } from "./tripCoreV2Http";

export type CommandRequest = Readonly<{
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}>;
export type McpWriteStageDiagnostic = Readonly<{
  diagnosticId: string;
  method: "GET" | "POST";
  stage: "PRECHECK" | "CORE_BOUNDARY_ENTERED" | "CORE_RETURNED" | "POSTCHECK";
  elapsedMs: number;
  coreStatus?: number;
  failure?: "EXPIRED" | "CANCELED" | "TIMEOUT" | "GRANT_NOT_CURRENT" | "UNCLASSIFIED";
}>;
type WritePorts = ReadPorts & {
  diagnostic?(event: McpWriteStageDiagnostic): void;
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
        let postEntered = false;
        const startedAt = Date.now();
        // Log-only ID; it never replaces the command or MCP request identity.
        const diagnosticId = ports.diagnostic ? randomUUID() : undefined;
        let stage: McpWriteStageDiagnostic["stage"] = "PRECHECK";
        let coreStatus: number | undefined;
        let diagnosticFinished = false;
        const observe = (failure?: McpWriteStageDiagnostic["failure"]) => {
          if (diagnosticFinished || !diagnosticId) return;
          try {
            ports.diagnostic?.({
              diagnosticId,
              method,
              stage,
              elapsedMs: Math.max(0, Math.min(120000, Date.now() - startedAt)),
              ...(coreStatus === undefined ? {} : { coreStatus }),
              ...(failure ? { failure } : {}),
            });
          } catch {
            /* Diagnostics never alter authorization or recovery. */
          }
        };
        observe();
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
          response = await boundary.run(async () => {
            postEntered = method === "POST";
            stage = "CORE_BOUNDARY_ENTERED";
            observe();
            const returned = await coreHttpBoundary(
              request,
              grant.accountId,
              ports.canReadTrip,
              ports.core,
            );
            if (
              Number.isInteger(returned.status) &&
              returned.status >= 100 &&
              returned.status <= 599
            )
              coreStatus = returned.status;
            stage = "CORE_RETURNED";
            observe();
            return returned;
          });
          stage = "POSTCHECK";
          observe();
          await current();
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
                : inactive
                  ? "GRANT_NOT_CURRENT"
                  : "UNCLASSIFIED";
          observe(failure);
          void response?.body?.cancel().catch(() => undefined);
          return reply(
            // Once POST enters Core, suppressed results cannot prove non-commit.
            !postEntered && (inactive || Date.now() >= grant.expiresAt) ? 401 : 503,
            "MCP_WRITE_UNAVAILABLE",
          );
        } finally {
          diagnosticFinished = true;
          boundary.close();
        }
      },
    });
  };
}
