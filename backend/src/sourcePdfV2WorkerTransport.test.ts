import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSourcePdfV2WorkerClient,
  createSourcePdfV2WorkerServer,
} from "./sourcePdfV2WorkerTransport";
const retained = new TextEncoder().encode("%PDF-transport-only-fixture");
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function listen(server: Server) {
  const dir = await mkdtemp(
    join(process.platform === "darwin" ? "/private/tmp" : tmpdir(), "otr-pdf-worker-"),
  );
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "worker.sock");
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, resolve);
  });
  cleanup.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  return { path, read: createSourcePdfV2WorkerClient(path) };
}
describe.skipIf(process.platform === "win32")(
  "private parse-only transport; no PDF proof or Source writes",
  () => {
    it("does not listen on construction and carries only bytes and bounded producer observations", async () => {
      // This sentinel proves IPC only, never a PDF seal or verification receipt.
      const run = vi.fn(async () => ({ testOnlyTransportResult: true }));
      const server = createSourcePdfV2WorkerServer(run);
      expect(server.listening).toBe(false);
      const f = await listen(server);
      expect(await f.read(retained)).toEqual({ testOnlyTransportResult: true });
      expect(run).toHaveBeenCalledExactlyOnceWith(retained);
    });
    it("rejects TCP even if a future caller accidentally binds it publicly", async () => {
      const run = vi.fn();
      const server = createSourcePdfV2WorkerServer(run);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      cleanup.push(
        () =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
          }),
      );
      const address = server.address();
      if (!address || typeof address === "string") throw Error("TEST_ADDRESS");
      const response = await fetch(`http://127.0.0.1:${address.port}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: retained,
      });
      expect(response.status).toBe(403);
      expect(run).not.toHaveBeenCalled();
    });
    it("rejects a second in-flight decode without queuing another worker", async () => {
      let release!: (output: unknown) => void;
      const run = vi.fn(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const f = await listen(createSourcePdfV2WorkerServer(run));
      const first = f.read(retained);
      await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
      await expect(f.read(retained)).rejects.toThrow("PDF_V2_WORKER_UNAVAILABLE");
      release({ testOnlyTransportResult: true });
      await first;
      expect(run).toHaveBeenCalledOnce();
    });
    it("does not pass worker exceptions or socket paths to callers", async () => {
      const f = await listen(
        createSourcePdfV2WorkerServer(async () => {
          throw Error("PRIVATE_PATH_AND_TOKEN");
        }),
      );
      await expect(f.read(retained)).rejects.toThrow(/^PDF_V2_WORKER_UNAVAILABLE$/);
    });
    it("rejects oversized input before starting IO", async () => {
      const client = createSourcePdfV2WorkerClient("/not-a-real-source-worker.sock");
      await expect(client(new Uint8Array(10485761))).rejects.toThrow(
        "PDF_V2_INPUT_LIMIT",
      );
      await expect(client(new Uint8Array())).rejects.toThrow("PDF_V2_INPUT_LIMIT");
    });
    it("caps actual chunked input at the private listener before starting a worker", async () => {
      const run = vi.fn();
      const f = await listen(createSourcePdfV2WorkerServer(run));
      await new Promise<void>((resolve) => {
        const call = request(
          {
            socketPath: f.path,
            path: "/parse",
            method: "POST",
            headers: { "Content-Type": "application/pdf" },
          },
          (response) => {
            response.resume();
            response.on("end", resolve);
          },
        );
        call.on("error", () => resolve());
        call.end(Buffer.alloc(10485761));
      });
      expect(run).not.toHaveBeenCalled();
    });
    it("bounds producer output before disclosing it", async () => {
      const f = await listen(
        createSourcePdfV2WorkerServer(async () => ({ text: "x".repeat(2097152) })),
      );
      await expect(f.read(retained)).rejects.toThrow("PDF_V2_WORKER_UNAVAILABLE");
    });
    it("bounds response bytes even from a different local listener", async () => {
      const f = await listen(
        createServer((_request, response) => {
          response.writeHead(200, { "Content-Type": "application/json" });
          response.end('"' + "x".repeat(2097152) + '"');
        }),
      );
      await expect(f.read(retained)).rejects.toThrow("PDF_V2_WORKER_UNAVAILABLE");
    });
    it("only supports the fixed parse action, never URLs or worker configuration", async () => {
      const run = vi.fn();
      const f = await listen(createSourcePdfV2WorkerServer(run));
      const status = await new Promise<number>((resolve, reject) => {
        const call = request(
          {
            socketPath: f.path,
            path: "/parse?image=untrusted",
            method: "POST",
            headers: { "Content-Type": "application/pdf" },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode!);
          },
        );
        call.on("error", reject);
        call.end(retained);
      });
      expect(status).toBe(400);
      expect(run).not.toHaveBeenCalled();
    });
  },
);
