import { Readable } from "node:stream";
import https from "node:https";
import { build } from "esbuild";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Buffer } from "node:buffer";
import { mkdtemp, rm, readFile, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSourcePdfPrivateStage } from "./sourcePdfPrivateStage";
import { createSourcePdfStorageProducer } from "./sourcePdfStorageProducer";
import {
  createSourcePdfBackendPreparation,
  type PdfPreparationAuthority,
  type PdfReservedContext,
} from "./sourcePdfBackendPreparation";
import { type DevBackendGateway } from "./app";
import { encodeProfilePdf, pdfHash } from "./sourcePdfProfile";
import { PDF_UPLOAD_PROFILE_V1 } from "../../src/domain/trip/sourcePdfUploadAuthority";

const bytes = encodeProfilePdf(["NZ1 AKL CHC", "NZ2 CHC AKL"]);
const roots: string[] = [];
const servers: http.Server[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
  }
  for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true });
});
async function setup(origin?: string, timeout = 1000) {
  const root = await mkdtemp(join(tmpdir(), "otr-pdf-preparation-"));
  roots.push(root);
  const tripId = randomUUID(),
    sourceId = randomUUID(),
    representationId = randomUUID(),
    actor = randomUUID();
  const binding = {
    uploadVersion: 1 as const,
    operationId: randomUUID(),
    operationKey: randomUUID(),
    operationSha256: "a".repeat(64),
    actorAccountId: actor,
    tripId,
    sourceId,
    representationId,
    materialRevision: 1,
    sourceRowRevision: 1,
    representationRowRevision: 1,
    parentOperationId: randomUUID(),
    attemptId: randomUUID(),
    attemptGeneration: 1,
    executionPrincipal: "otr_trip_source_command_gateway" as const,
    resourceId: randomUUID(),
    nodeId: randomUUID(),
    resourceKey: "b".repeat(64),
    runToken: randomUUID(),
    provider: "supabase_storage" as const,
    bucket: "trip-source-material" as const,
    objectKey: `v1/${tripId}/${sourceId}/${representationId}/payload`,
    sha256: pdfHash(bytes),
    byteCount: bytes.length,
    mimeType: "application/pdf" as const,
    profileId: PDF_UPLOAD_PROFILE_V1.profileId,
    profileSha256: PDF_UPLOAD_PROFILE_V1.profileSha256,
  };
  const current: PdfReservedContext = {
    binding,
    accountGeneration: 1,
    dispatchId: randomUUID(),
    ownerRun: randomUUID(),
    ownerFence: 1,
  };
  const gateway = {
    validateAccessToken: vi.fn(async (token: string) =>
      token === "synthetic-session" ? { id: actor } : null,
    ),
    canReadTrip: vi.fn(async () => true),
  } as unknown as DevBackendGateway;
  // CLOSED security port test double; never emits Source v2 evidence or FINAL.
  let consumed = false;
  const authority: PdfPreparationAuthority = {
    resolveReserved: vi.fn(async () => current),
    assertCurrent: vi.fn(async () => {}),
    recordObservation: vi.fn(async () => "synthetic-internal-reference"),
    consumeDispatch: vi.fn(async () => {
      if (consumed) return null;
      consumed = true;
      return { dispatchId: current.dispatchId! };
    }),
  };
  const stage = createSourcePdfPrivateStage(root),
    provider = createSourcePdfStorageProducer({
      instanceId: "synthetic-fixture",
      origin: origin || "http://127.0.0.1:1",
      credentialRef: "synthetic-ref",
      serviceToken: "synthetic-secret",
      timeoutMs: timeout,
      localFixture: true,
    });
  const adapter = createSourcePdfBackendPreparation(gateway, authority, stage, provider);
  const identity = {
    tripId,
    sourceId,
    representationId,
    operationId: binding.operationId,
    accountGeneration: 1,
  };
  const request = (
    payload: Uint8Array = bytes,
    mime = "application/pdf",
    token = "synthetic-session",
  ) =>
    new Request("http://127.0.0.1/internal-unregistered", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "content-type": mime },
      body: Buffer.from(payload),
    });
  return {
    root,
    binding,
    current,
    gateway,
    authority,
    stage,
    provider,
    adapter,
    identity,
    request,
  };
}
async function fixture(mode = "normal") {
  let writes = 0;
  let retained = Buffer.from(bytes);
  const s = http.createServer(async (req, res) => {
    const parts: Buffer[] = [];
    for await (const chunk of req) parts.push(chunk);
    if (req.method === "POST") {
      writes++;
      retained = Buffer.concat(parts);
      expect(req.headers["x-upsert"]).toBe("false");
      expect(req.headers.authorization).toBe("Bearer synthetic-secret");
      if (mode === "timeout") return;
      if (mode === "disconnect") {
        req.socket.destroy();
        return;
      }
      if (mode === "redirect") {
        res.writeHead(307, { location: "/unexpected" });
        res.end();
        return;
      }
      if (mode === "incomplete") {
        res.writeHead(200, { "content-length": "10000" });
        res.write('{"Id":');
        res.destroy();
        return;
      }
      if (mode === "badshape") {
        res.end("{}");
        return;
      }
      res.writeHead(200, {
        "content-type": "application/json",
        "x-request-id": "synthetic-correlation",
      });
      res.end(
        JSON.stringify({ Id: randomUUID(), Key: req.url!.slice("/object/".length) }),
      );
    } else {
      res.writeHead(200, {
        "content-type": mode === "wrongmime" ? "image/png" : "application/pdf",
      });
      res.end(
        mode === "mismatch" ? Buffer.from(encodeProfilePdf(["NZ9 AKL CHC"])) : retained,
      );
    }
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return {
    origin: "http://127.0.0.1:" + (s.address() as { port: number }).port,
    writes: () => writes,
  };
}
describe("CLOSED bounded Backend PDF preparation (no Source v2 acceptance)", () => {
  it("authenticates, streams exact bytes, seals and reopens across adapter construction", async () => {
    const f = await setup();
    const r = await f.adapter.ingress(f.request(), f.identity);
    expect(r.stage.sha256).toBe(pdfHash(bytes));
    expect(await createSourcePdfPrivateStage(f.root).reopen(f.binding)).toEqual(
      Buffer.from(bytes),
    );
    expect((await stat(join(f.root, f.binding.resourceId))).mode & 0o777).toBe(0o400);
    expect(JSON.stringify(r)).not.toContain("synthetic-secret");
  });
  it("streams authenticated ingress through a fixture-only Node HTTP host", async () => {
    const f = await setup();
    const server = http.createServer(async (incoming, outgoing) => {
      try {
        const request = new Request("http://127.0.0.1/internal-fixture", {
          method: "POST",
          headers: {
            Authorization: String(incoming.headers.authorization || ""),
            "content-type": String(incoming.headers["content-type"] || ""),
            "content-length": String(incoming.headers["content-length"] || ""),
          },
          body: Readable.toWeb(incoming) as ReadableStream,
          duplex: "half",
        } as RequestInit & { duplex: "half" });
        const result = await f.adapter.ingress(request, f.identity);
        outgoing.writeHead(200, { "content-type": "application/json" });
        outgoing.end(
          JSON.stringify({
            sha256: result.stage.sha256,
            byteCount: result.stage.byteCount,
          }),
        );
      } catch {
        outgoing.writeHead(400);
        outgoing.end();
      }
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const response = await fetch(
      "http://127.0.0.1:" + (server.address() as { port: number }).port,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer synthetic-session",
          "content-type": "application/pdf",
        },
        body: Buffer.from(bytes),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sha256: pdfHash(bytes),
      byteCount: bytes.length,
    });
    expect(f.authority.consumeDispatch).not.toHaveBeenCalled();
  });
  it("cancels stalled ingress without dispatch or quota release", async () => {
    const f = await setup();
    const abort = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 10));
      },
    });
    const request = new Request("http://127.0.0.1/internal-fixture", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-session",
        "content-type": "application/pdf",
      },
      body: stream,
      duplex: "half",
      signal: abort.signal,
    } as RequestInit & { duplex: "half" });
    const pending = f.adapter.ingress(request, f.identity);
    setTimeout(() => abort.abort(), 10);
    await expect(pending).rejects.toThrow();
    expect(f.authority.consumeDispatch).not.toHaveBeenCalled();
  });
  it("reopens the immutable closed file after a crash between link and temporary unlink", async () => {
    const f = await setup();
    await f.adapter.ingress(f.request(), f.identity);
    await (
      await import("node:fs/promises")
    ).link(join(f.root, f.binding.resourceId), join(f.root, ".partial-synthetic-crash"));
    expect(await createSourcePdfPrivateStage(f.root).reopen(f.binding)).toEqual(
      Buffer.from(bytes),
    );
  });
  it("reopens a sealed stage from a fresh Node process", async () => {
    const f = await setup();
    await f.adapter.ingress(f.request(), f.identity);
    const entry = join(f.root, "reopen.mjs");
    await build({
      stdin: {
        contents: `import {createSourcePdfPrivateStage} from ${JSON.stringify(new URL("./sourcePdfPrivateStage.ts", import.meta.url).pathname)}; import {pdfHash} from ${JSON.stringify(new URL("./sourcePdfProfile.ts", import.meta.url).pathname)}; const [root,binding]=process.argv.slice(2); console.log(pdfHash(await createSourcePdfPrivateStage(root).reopen(JSON.parse(binding))));`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      outfile: entry,
    });
    const result = await promisify(execFile)(
      process.execPath,
      [entry, f.root, JSON.stringify(f.binding)],
      { timeout: 10000 },
    );
    expect(result.stdout.trim()).toBe(pdfHash(bytes));
  }, 20000);
  it("records operational ACK before rejecting newly revoked scope", async () => {
    const s = await fixture();
    const f = await setup(s.origin);
    await f.adapter.ingress(f.request(), f.identity);
    vi.mocked(f.authority.recordObservation).mockImplementation(async () => {
      vi.mocked(f.authority.assertCurrent).mockRejectedValue(new Error("REVOKED"));
      return "synthetic-internal-reference";
    });
    await expect(f.adapter.upload(f.request(), f.identity)).rejects.toThrow("REVOKED");
    expect(f.authority.recordObservation).toHaveBeenCalledOnce();
    expect(s.writes()).toBe(1);
  });
  it.each(["oversized", "truncated", "changed", "mime", "quartz"])(
    "rejects %s before Provider dispatch",
    async (mode) => {
      const f = await setup();
      let payload: Uint8Array = bytes;
      if (mode === "oversized") payload = new Uint8Array(65537);
      if (mode === "truncated") payload = bytes.slice(0, -1);
      if (mode === "changed") payload = encodeProfilePdf(["NZ9 AKL CHC", "NZ2 CHC AKL"]);
      if (mode === "quartz") {
        payload = new TextEncoder().encode("%PDF-1.7\nQuartz unsupported");
        f.current.binding = {
          ...f.binding,
          sha256: pdfHash(payload),
          byteCount: payload.length,
        };
      }
      await expect(
        f.adapter.ingress(
          f.request(payload, mode === "mime" ? "image/png" : "application/pdf"),
          f.identity,
        ),
      ).rejects.toThrow();
      expect(f.authority.consumeDispatch).not.toHaveBeenCalled();
    },
  );
  it.each([
    "account",
    "trip",
    "source",
    "representation",
    "operation",
    "generation",
    "revoked",
    "unauthenticated",
  ])("rejects %s context", async (mode) => {
    const f = await setup();
    const identity = { ...f.identity };
    if (mode === "account")
      f.current.binding = { ...f.binding, actorAccountId: randomUUID() };
    if (mode === "trip") identity.tripId = randomUUID();
    if (mode === "source") identity.sourceId = randomUUID();
    if (mode === "representation") identity.representationId = randomUUID();
    if (mode === "operation") identity.operationId = randomUUID();
    if (mode === "generation") identity.accountGeneration = 2;
    if (mode === "revoked")
      vi.mocked(f.authority.assertCurrent).mockRejectedValue(new Error("REVOKED"));
    await expect(
      f.adapter.ingress(
        f.request(
          bytes,
          "application/pdf",
          mode === "unauthenticated" ? "invalid" : "synthetic-session",
        ),
        identity,
      ),
    ).rejects.toThrow();
  });
  it("rejects changed binding/content under one sealed resource and symlink substitution", async () => {
    const f = await setup();
    await f.adapter.ingress(f.request(), f.identity);
    await expect(
      f.stage.seal(
        { ...f.binding, operationId: randomUUID() },
        (async function* () {
          yield bytes;
        })(),
      ),
    ).rejects.toThrow("STAGE_BINDING_MISMATCH");
    const changed = encodeProfilePdf(["NZ9 AKL CHC", "NZ2 CHC AKL"]);
    await expect(
      f.stage.seal(
        { ...f.binding, sha256: pdfHash(changed) },
        (async function* () {
          yield changed;
        })(),
      ),
    ).rejects.toThrow();
    expect(await f.stage.reopen(f.binding)).toEqual(Buffer.from(bytes));
    const bad = { ...f.binding, resourceId: randomUUID() };
    await symlink(join(f.root, f.binding.resourceId), join(f.root, bad.resourceId));
    await expect(f.stage.reopen(bad)).rejects.toThrow();
  });
  it("uses the identity returned by the durable grant for an undispatched reservation", async () => {
    const s = await fixture();
    const f = await setup(s.origin);
    const dispatchId = randomUUID();
    f.current.dispatchId = null;
    vi.mocked(f.authority.consumeDispatch).mockResolvedValueOnce({ dispatchId });
    await f.adapter.ingress(f.request(), f.identity);
    const ack = await f.adapter.upload(f.request(), f.identity);
    expect(ack.kind).toBe("COMPLETE_ACK");
    expect(ack.request.dispatchId).toBe(dispatchId);
    expect(s.writes()).toBe(1);
  });
  it("records complete bound ACK separately from independent GET and rejects duplicates", async () => {
    const server = await fixture();
    const f = await setup(server.origin);
    await f.adapter.ingress(f.request(), f.identity);
    const all = await Promise.allSettled([
      f.adapter.upload(f.request(), f.identity),
      f.adapter.upload(f.request(), f.identity),
    ]);
    expect(all.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(server.writes()).toBe(1);
    const ack = (
      all.find((x) => x.status === "fulfilled") as PromiseFulfilledResult<
        Awaited<ReturnType<typeof f.adapter.upload>>
      >
    ).value;
    expect(ack.kind).toBe("COMPLETE_ACK");
    if (ack.kind === "COMPLETE_ACK") {
      expect(ack.status).toBe(200);
      expect(ack.responseHeaders).toContain("synthetic-correlation");
      expect(ack.headers["x-request-id"]).toBe("synthetic-correlation");
      expect(ack.request.binding.operationId).toBe(f.binding.operationId);
      expect(ack.localInputClosed).toBe(true);
    }
    expect((await f.adapter.observeRetained(f.request(), f.identity)).kind).toBe("MATCH");
    const reopened = createSourcePdfBackendPreparation(
      f.gateway,
      f.authority,
      createSourcePdfPrivateStage(f.root),
      f.provider,
    );
    await expect(reopened.upload(f.request(), f.identity)).rejects.toThrow(
      "PDF_DUPLICATE_DISPATCH",
    );
    expect(server.writes()).toBe(1);
  });
  it.each(["timeout", "disconnect", "incomplete", "badshape", "redirect"])(
    "retains %s as UNKNOWN and does not retry",
    async (mode) => {
      const s = await fixture(mode),
        f = await setup(s.origin, 80);
      await f.adapter.ingress(f.request(), f.identity);
      expect((await f.adapter.upload(f.request(), f.identity)).kind).toBe("UNKNOWN");
      await expect(f.adapter.upload(f.request(), f.identity)).rejects.toThrow();
      expect(s.writes()).toBe(1);
    },
  );
  it.each(["mismatch", "wrongmime"])("independent GET rejects %s", async (mode) => {
    const s = await fixture(mode),
      f = await setup(s.origin);
    expect((await f.adapter.observeRetained(f.request(), f.identity)).kind).toBe(
      "MISMATCH",
    );
    expect(s.writes()).toBe(0);
  });
  it("rejects declared length mismatch and unsafe stage permissions", async () => {
    const f = await setup();
    const request = f.request();
    request.headers.set("content-length", "65537");
    await expect(f.adapter.ingress(request, f.identity)).rejects.toThrow(
      "PDF_LENGTH_MISMATCH",
    );
    await (await import("node:fs/promises")).chmod(f.root, 0o755);
    await expect(f.stage.reopen(f.binding)).rejects.toThrow(
      "PRIVATE_STAGE_ROOT_REQUIRED",
    );
  });
  it("rejects an untrusted Provider TLS certificate without retry", async () => {
    const f = await setup();
    const key = join(f.root, "synthetic-tls.key"),
      cert = join(f.root, "synthetic-tls.crt");
    await promisify(execFile)(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
        "-keyout",
        key,
        "-out",
        cert,
      ],
      { timeout: 10000 },
    );
    let writes = 0;
    const server = https.createServer(
      { key: await readFile(key), cert: await readFile(cert) },
      (_req, res) => {
        writes++;
        res.end();
      },
    );
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const p = createSourcePdfStorageProducer({
      origin: "https://127.0.0.1:" + (server.address() as { port: number }).port,
      instanceId: "synthetic-tls",
      credentialRef: "synthetic-ref",
      serviceToken: "synthetic-secret",
      timeoutMs: 1000,
    });
    expect(
      (await p.upload({ binding: f.binding, dispatchId: f.current.dispatchId! }, bytes))
        .kind,
    ).toBe("UNKNOWN");
    expect(writes).toBe(0);
  }, 20000);
  it("requires fixed private origin and bounded configuration", () => {
    expect(() =>
      createSourcePdfStorageProducer({
        origin: "http://example.org",
        instanceId: "fixture",
        credentialRef: "ref",
        serviceToken: "secret",
        timeoutMs: 1000,
        localFixture: true,
      }),
    ).toThrow();
  });
  it.skipIf(!process.env.OTR_PDF_STORAGE_FIXTURE)(
    "actual disposable Supabase complete ACK + retained match without Source FINAL",
    async () => {
      const env = JSON.parse(
        await readFile(process.env.OTR_PDF_STORAGE_FIXTURE!, "utf8"),
      );
      expect(env.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      for (let i = 0; i < 70; i++) {
        try {
          if ((await fetch(env.origin + "/status")).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 200));
      }
      const bucket = await fetch(env.origin + "/bucket", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.token,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: "trip-source-material",
          name: "trip-source-material",
          public: false,
          file_size_limit: 65536,
          allowed_mime_types: ["application/pdf"],
        }),
      });
      expect(bucket.status).toBe(200);
      const f = await setup(env.origin);
      const producer = createSourcePdfStorageProducer({
        origin: env.origin,
        instanceId: "pinned-1.73.1-disposable",
        credentialRef: "generated-synthetic-only",
        serviceToken: env.token,
        timeoutMs: 5000,
        localFixture: true,
      });
      const adapter = createSourcePdfBackendPreparation(
        f.gateway,
        f.authority,
        f.stage,
        producer,
      );
      await adapter.ingress(f.request(), f.identity);
      const ack = await adapter.upload(f.request(), f.identity);
      expect(ack.kind).toBe("COMPLETE_ACK");
      expect((await adapter.observeRetained(f.request(), f.identity)).kind).toBe("MATCH");
      await expect(adapter.upload(f.request(), f.identity)).rejects.toThrow(
        "PDF_DUPLICATE_DISPATCH",
      );
    },
    30000,
  );
});
