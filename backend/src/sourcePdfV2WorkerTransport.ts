import { createServer, request } from "node:http";
import { isAbsolute } from "node:path";
import { Readable } from "node:stream";
import {
  createRequestBoundary,
  readBoundedBytes,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import { profile } from "../../scripts/source-pdf-v2-linux/profile.mjs";
import { runSourcePdfV2LinuxWorker } from "./sourcePdfV2LinuxWorker";

// Parse only: no DB, credentials, caller-selected image or Source authority.
// No startup/listen binding; socket ownership and mounting need a separate host gate.
export function createSourcePdfV2WorkerServer(run = runSourcePdfV2LinuxWorker) {
  let busy = false,
    quarantined = false;
  const server = createServer((incoming, outgoing) => {
    const reply = (status: number, value: unknown) => {
      if (outgoing.destroyed) return;
      const encoded = JSON.stringify(value);
      if (typeof encoded !== "string" || Buffer.byteLength(encoded) > profile.outputBytes)
        throw Error("PDF_V2_WORKER_OUTPUT_LIMIT");
      outgoing.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Connection: "close",
      });
      outgoing.end(encoded);
    };
    void (async () => {
      if (incoming.socket.remoteAddress !== undefined)
        return reply(403, { error: "PDF_V2_WORKER_PRIVATE_SOCKET_REQUIRED" });
      if (
        incoming.method !== "POST" ||
        incoming.url !== "/parse" ||
        incoming.headers["content-type"] !== "application/pdf" ||
        incoming.headers["content-encoding"]
      )
        return reply(400, { error: "PDF_V2_WORKER_INPUT_INVALID" });
      if (busy || quarantined) return reply(503, { error: "PDF_V2_WORKER_BUSY" });
      busy = true;
      try {
        const boundary = createRequestBoundary(15000);
        let bytes: Uint8Array;
        try {
          bytes = await readBoundedBytes(
            { body: Readable.toWeb(incoming) as NonNullable<Response["body"]> },
            profile.maxOriginalBytes,
            boundary,
          );
        } finally {
          boundary.close();
        }
        if (!bytes.length) return reply(400, { error: "PDF_V2_WORKER_INPUT_INVALID" });
        reply(200, await run(bytes));
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "PDF_V2_WORKER_TERMINATION_UNKNOWN"
        )
          quarantined = true;
        throw error;
      } finally {
        busy = false;
      }
    })().catch(() => {
      if (!outgoing.headersSent) reply(503, { error: "PDF_V2_WORKER_UNAVAILABLE" });
      else outgoing.destroy();
    });
  });
  server.maxConnections = 2;
  server.headersTimeout = 5000;
  server.requestTimeout = 15000;
  server.keepAliveTimeout = 1000;
  return server;
}

// Trusted server composition supplies a private socket; never read from request JSON.
export function createSourcePdfV2WorkerClient(socketPath: string) {
  if (!isAbsolute(socketPath) || socketPath.includes("\0"))
    throw Error("PDF_V2_WORKER_SOCKET_INVALID");
  return async (bytes: Uint8Array): Promise<unknown> => {
    if (
      !(bytes instanceof Uint8Array) ||
      !bytes.length ||
      bytes.length > profile.maxOriginalBytes
    )
      throw Error("PDF_V2_INPUT_LIMIT");
    const boundary = createRequestBoundary(profile.wallMs + 15000);
    try {
      return await boundary.run(
        () =>
          new Promise<unknown>((resolve, reject) => {
            const call = request(
              {
                socketPath,
                path: "/parse",
                method: "POST",
                agent: false,
                maxHeaderSize: 16384,
                signal: boundary.signal,
                headers: {
                  "Content-Type": "application/pdf",
                  "Content-Length": bytes.length,
                },
              },
              (response) => {
                if (
                  response.statusCode !== 200 ||
                  response.headers["content-type"] !== "application/json" ||
                  response.headers["content-encoding"]
                ) {
                  response.destroy();
                  reject(Error("PDF_V2_WORKER_UNAVAILABLE"));
                  return;
                }
                void readBoundedJson(
                  new Response(Readable.toWeb(response) as NonNullable<Response["body"]>),
                  profile.outputBytes,
                  boundary,
                ).then(resolve, reject);
              },
            );
            call.on("error", () => reject(Error("PDF_V2_WORKER_UNAVAILABLE")));
            call.end(Buffer.from(bytes));
          }),
      );
    } catch {
      throw Error("PDF_V2_WORKER_UNAVAILABLE");
    } finally {
      boundary.close();
    }
  };
}
