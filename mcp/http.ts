import { createServer } from "node:http";
import { once } from "node:events";

// Hop-by-hop framing belongs to each HTTP connection, not the upstream fetch.
export function proxyRequestHeaders(source: Headers) {
  const headers = new Headers(source);
  const connectionHeaders = (headers.get("connection") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  for (const name of [
    ...connectionHeaders,
    "host",
    "connection",
    "content-length",
    "transfer-encoding",
    "keep-alive",
    "te",
    "trailer",
    "upgrade",
    "proxy-connection",
    "proxy-authorization",
  ])
    headers.delete(name);
  return headers;
}

// Internal loopback harness only; public routing belongs to the existing Backend host.
export function loopbackServer(
  handle: (request: Request) => Promise<Response>,
  bodyLimit = 16384,
) {
  return createServer(
    { requestTimeout: 35000, headersTimeout: 10000 },
    async (incoming, outgoing) => {
      const controller = new AbortController();
      outgoing.on("close", () => {
        if (!outgoing.writableFinished) controller.abort();
      });
      try {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of incoming) {
          size += chunk.length;
          if (size > bodyLimit) {
            outgoing.writeHead(413, { "Cache-Control": "private, no-store" }).end();
            return;
          }
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks);
        const request = new Request(
          `http://${incoming.headers.host ?? "127.0.0.1"}${incoming.url ?? "/"}`,
          {
            method: incoming.method,
            headers: incoming.headers as HeadersInit,
            ...(body.length ? { body } : {}),
            signal: controller.signal,
          },
        );
        const response = await handle(request);
        if (outgoing.destroyed) return;
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body) {
          for await (const chunk of response.body) {
            if (outgoing.destroyed) break;
            if (!outgoing.write(Buffer.from(chunk)))
              await once(outgoing, "drain", { signal: controller.signal });
          }
        }
        outgoing.end();
      } catch {
        if (!outgoing.headersSent)
          outgoing.writeHead(503, { "Cache-Control": "private, no-store" });
        outgoing.end();
      }
    },
  );
}
