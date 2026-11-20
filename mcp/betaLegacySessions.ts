import { randomUUID } from "node:crypto";
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
  isInitializeRequest,
  isLegacyRequest,
} from "@modelcontextprotocol/server";
import type { McpAuthorization } from "./server";
// Transport state only: no tokens, business data, grants or automatic mutation retries.
export function createBetaLegacySessions() {
  const sessions = new Map<
    string,
    {
      auth: Pick<McpAuthorization, "accountId" | "clientId" | "resource">;
      expiresAt: number;
      server: McpServer;
      transport: WebStandardStreamableHTTPServerTransport;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  async function remove(id: string) {
    const entry = sessions.get(id);
    if (!entry) return;
    sessions.delete(id);
    clearTimeout(entry.timer);
    await entry.server.close();
  }
  return {
    async handle(
      request: Request,
      auth: Pick<McpAuthorization, "accountId" | "clientId" | "resource" | "expiresAt">,
      build: () => McpServer,
    ): Promise<Response | undefined> {
      const id = request.headers.get("Mcp-Session-Id");
      if (!id && !(await isLegacyRequest(request))) return;
      const denied = (status: number, code: string) =>
        Response.json(
          { error: { code } },
          {
            status,
            headers: { "Cache-Control": "private, no-store", Vary: "Authorization" },
          },
        );
      if (id) {
        const entry = sessions.get(id);
        if (!entry) return denied(404, "MCP_SESSION_NOT_FOUND");
        if (entry.expiresAt <= Date.now()) {
          await remove(id);
          return denied(404, "MCP_SESSION_EXPIRED");
        }
        if (
          entry.auth.accountId !== auth.accountId ||
          entry.auth.clientId !== auth.clientId ||
          entry.auth.resource !== auth.resource
        )
          return denied(403, "MCP_SESSION_ACCOUNT_MISMATCH");
        return entry.transport.handleRequest(request);
      }
      if (request.method !== "POST") return;
      const body = await request
        .clone()
        .json()
        .catch(() => null);
      if (!isInitializeRequest(body)) return;
      for (const [key, value] of sessions)
        if (value.expiresAt <= Date.now()) await remove(key);
      if (sessions.size >= 32) return denied(429, "MCP_SESSION_CAPACITY");
      const server = build(),
        sessionId = randomUUID(),
        expiresAt = Math.min(auth.expiresAt, Date.now() + 600000);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId,
        maxRequestBodySize: 1048576,
        onsessionclosed: () => remove(sessionId),
      });
      const timer = setTimeout(
        () => {
          void remove(sessionId);
        },
        Math.max(1, expiresAt - Date.now()),
      );
      timer.unref();
      sessions.set(sessionId, {
        auth: {
          accountId: auth.accountId,
          clientId: auth.clientId,
          resource: auth.resource,
        },
        expiresAt,
        server,
        transport,
        timer,
      });
      try {
        await server.connect(transport);
        const response = await transport.handleRequest(request, { parsedBody: body });
        if (response.status >= 400) await remove(sessionId);
        return response;
      } catch (error) {
        await remove(sessionId);
        throw error;
      }
    },
    async close() {
      await Promise.all([...sessions.keys()].map(remove));
    },
  };
}
