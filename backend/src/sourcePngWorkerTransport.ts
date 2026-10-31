import { createServer, createConnection, type Socket } from "node:net";
import { isAbsolute } from "node:path";
import { z } from "zod";
import {
  createSourcePngOwnedSandbox,
  type SourcePngExecutionOwner,
} from "./sourcePngOwnedSandbox";
import {
  sourcePngStorageBindingSchema,
  verifySourcePngSandboxObservation,
  type SourcePngStorageBinding,
} from "./sourcePngStorageProducer";
import { parseCoreJson } from "../../src/domain/trip/tripCoreV2Json";

const terminal = z.strictObject({
  containerId: z.string().regex(/^[a-f0-9]{64}$/),
  observedAt: z.iso.datetime({ precision: 6 }),
  evidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  result: z.enum([
    "PARSE_PASS",
    "FORMAT_REJECTED",
    "PARSER_TIMEOUT",
    "PARSER_CRASH",
    "PARSER_PROTOCOL",
  ]),
});
const event = z.discriminatedUnion("action", [
  z.strictObject({ seq: z.number().int().positive(), action: z.literal("current") }),
  z.strictObject({
    seq: z.number().int().positive(),
    action: z.literal("attach"),
    containerId: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({ seq: z.number().int().positive(), action: z.literal("running") }),
  z.strictObject({
    seq: z.number().int().positive(),
    action: z.literal("terminal"),
    observation: terminal,
  }),
]);
const initial = z.strictObject({
  version: z.literal(1),
  binding: sourcePngStorageBindingSchema,
  originalBase64: z.string().min(4).max(1398104),
});
function frames(socket: Socket, limit: number, consume: (raw: unknown) => Promise<void>) {
  let pending = Buffer.alloc(0),
    received = 0,
    chain = Promise.resolve();
  socket.on("data", (chunk: Buffer) => {
    received += chunk.length;
    if (received > limit + 65536) {
      socket.destroy();
      return;
    }
    pending = Buffer.concat([pending, chunk]);
    let end: number;
    while ((end = pending.indexOf(10)) >= 0) {
      const line = pending.subarray(0, end);
      pending = pending.subarray(end + 1);
      if (line.length > limit) {
        socket.destroy();
        return;
      }
      chain = chain
        .then(() => consume(parseCoreJson(line.toString("utf8"), limit)))
        .catch(() => {
          socket.destroy();
        });
    }
    if (pending.length > limit) socket.destroy();
  });
}
function send(socket: Socket, value: unknown) {
  if (socket.destroyed || !socket.writable) throw Error("PNG_WORKER_DISCONNECTED");
  socket.write(JSON.stringify(value) + "\n");
}

// Only physical decoder work crosses the private socket. PG/Storage credentials stay in Backend.
export function createSourcePngWorkerServer(
  directory: string,
  run = createSourcePngOwnedSandbox,
) {
  let busy = false,
    quarantined = false;
  const server = createServer((socket) => {
    if (socket.remoteAddress !== undefined || busy || quarantined) {
      socket.destroy();
      return;
    }
    busy = true;
    let started = false,
      executing = false,
      seq = 0;
    let waiting: { seq: number; resolve(): void; reject(error: Error): void } | undefined;
    // Owning PG acknowledgements share the HTTP budget; decoder CPU remains separately bounded.
    const timer = setTimeout(() => socket.destroy(), 90000);
    socket.on("error", () => {});
    socket.on("close", () => {
      clearTimeout(timer);
      waiting?.reject(Error("PNG_WORKER_DISCONNECTED"));
    });
    const ask = async (value: Record<string, unknown>) => {
      if (waiting) throw Error("PNG_WORKER_PROTOCOL");
      await new Promise<void>((resolve, reject) => {
        waiting = { seq: ++seq, resolve, reject };
        try {
          send(socket, { ...value, seq });
        } catch (error) {
          waiting = undefined;
          reject(error);
        }
      });
    };
    frames(socket, 1500000, async (raw) => {
      if (started) {
        const ack = z.strictObject({ ack: z.number().int().positive() }).parse(raw);
        if (!waiting || waiting.seq !== ack.ack) throw Error("PNG_WORKER_PROTOCOL");
        const current = waiting;
        waiting = undefined;
        current.resolve();
        return;
      }
      started = true;
      const q = initial.parse(raw),
        bytes = Uint8Array.from(Buffer.from(q.originalBase64, "base64"));
      if (
        Buffer.from(bytes).toString("base64") !== q.originalBase64 ||
        bytes.length > 1048576
      )
        throw Error("PNG_WORKER_PROTOCOL");
      const owner: SourcePngExecutionOwner = {
        assertCurrent: () => ask({ action: "current" }),
        attach: (_binding, containerId) => ask({ action: "attach", containerId }),
        running: () => ask({ action: "running" }),
        terminal: (_binding, observation) => ask({ action: "terminal", observation }),
      };
      // Do not await here: the same connection must receive owning journal acknowledgements.
      executing = true;
      void Promise.resolve()
        .then(() => run(directory, owner)(q.binding, bytes))
        .then((result) => {
          send(socket, { done: result });
          socket.end();
        })
        .catch((error: unknown) => {
          if (
            error instanceof Error &&
            error.message === "PNG_SANDBOX_TERMINATION_UNKNOWN"
          )
            quarantined = true;
          socket.destroy();
        })
        .finally(() => {
          busy = false;
          clearTimeout(timer);
        });
    });
    socket.on("close", () => {
      if (!executing) busy = false;
    });
  });
  server.maxConnections = 2;
  return server;
}

// Trusted runtime supplies the socket and owning callbacks; callers cannot select Docker options.
export function createSourcePngWorkerClient(socketPath: string) {
  if (!isAbsolute(socketPath) || socketPath.includes("\0"))
    throw Error("PNG_WORKER_SOCKET_INVALID");
  return (
    binding: SourcePngStorageBinding,
    bytes: Uint8Array,
    owner: SourcePngExecutionOwner,
    signal: AbortSignal,
  ): Promise<unknown> => {
    const q = initial.parse({
      version: 1,
      binding,
      originalBase64: Buffer.from(bytes).toString("base64"),
    });
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const socket = createConnection({ path: socketPath, signal });
      let seq = 0,
        attached = false,
        running = false,
        ended = false,
        completed = false;
      const timer = setTimeout(() => socket.destroy(Error("PNG_WORKER_TIMEOUT")), 90000);
      socket.on("connect", () => send(socket, q));
      socket.on("error", () => reject(Error("PNG_WORKER_UNAVAILABLE")));
      socket.on("close", () => {
        clearTimeout(timer);
        if (!completed) reject(Error("PNG_WORKER_UNCONFIRMED"));
      });
      frames(socket, 8192, async (raw) => {
        signal.throwIfAborted();
        if (raw && typeof raw === "object" && "done" in raw) {
          const done = z.strictObject({ done: z.unknown() }).parse(raw);
          if (!ended) throw Error("PNG_WORKER_PROTOCOL");
          verifySourcePngSandboxObservation(bytes, done.done);
          completed = true;
          resolve(done.done);
          socket.end();
          return;
        }
        const e = event.parse(raw);
        if (e.seq !== ++seq || seq > 64 || ended) throw Error("PNG_WORKER_PROTOCOL");
        await owner.assertCurrent(binding);
        if (e.action === "attach") {
          if (attached || running) throw Error("PNG_WORKER_PROTOCOL");
          await owner.attach(binding, e.containerId);
          attached = true;
        } else if (e.action === "running") {
          if (!attached || running) throw Error("PNG_WORKER_PROTOCOL");
          await owner.running(binding);
          running = true;
        } else if (e.action === "terminal") {
          if (!attached) throw Error("PNG_WORKER_PROTOCOL");
          await owner.terminal(binding, e.observation);
          ended = true;
        }
        signal.throwIfAborted();
        send(socket, { ack: e.seq });
      });
    });
  };
}
