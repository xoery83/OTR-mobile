import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createFlightTextDevBackend } from "../flightTextDevBackend";
import type { DevBackendGateway } from "../app";
// Disposable acceptance host only; no real credentials or Supabase Auth service.
if (
  !/^otr-core-v2-test-[a-f0-9]{12}$/.test(process.env.OTR_CORE_OWNED_SQL_FIXTURE ?? "") ||
  !process.send
)
  throw new Error("OWNED_FIXTURE_REQUIRED");
process.once("message", async (input: { actor: string; trip: string; port: number }) => {
  const ca = await readFile(process.env.OTR_FLIGHT_TEXT_CA!, "utf8");
  const base = {
    host: "localhost",
    port: Number(process.env.OTR_FLIGHT_TEXT_PORT),
    database: "postgres",
    ca,
  };
  const gateway = {
    validateAccessToken: async (token: string) =>
      token === "synthetic-owner"
        ? { id: input.actor }
        : token === "synthetic-other"
          ? { id: "00000000-0000-4000-8000-000000000002" }
          : null,
    canReadTrip: async (_a: string, t: string) => t === input.trip,
  } as unknown as DevBackendGateway;
  const handle = createFlightTextDevBackend(
    { gateway },
    {
      core: { ...base, password: "synthetic-core-text" },
      source: { ...base, password: "synthetic-source-text" },
    },
  );
  const http = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2097152) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const result = await handle(
        new Request(`http://127.0.0.1${req.url}`, {
          method: req.method,
          headers: req.headers as HeadersInit,
          body: chunks.length ? Buffer.concat(chunks) : undefined,
        }),
      );
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      res.writeHead(503).end();
    }
  });
  http.listen(input.port, "127.0.0.1", () =>
    process.send!({ port: (http.address() as { port: number }).port }),
  );
});
