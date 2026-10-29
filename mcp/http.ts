import { createServer } from "node:http";

// Internal loopback harness only; public routing belongs to the existing Backend host.
export function loopbackServer(handle: (request: Request) => Promise<Response>) {
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
          if (size > 16384) {
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
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        if (!outgoing.headersSent)
          outgoing.writeHead(503, { "Cache-Control": "private, no-store" });
        outgoing.end();
      }
    },
  );
}
