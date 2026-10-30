import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import {
  createSourcePdfV2StorageProducer,
  createSourcePdfStorageProducer,
} from "./sourcePdfStorageProducer";
const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});
async function fixture(serviceToken = "synthetic") {
  const bytes = Buffer.from("%PDF-synthetic-original");
  const scope = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    sourceId: randomUUID(),
    representationId: randomUUID(),
    byteCount: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  let count = 0,
    status = 200;
  let body: Buffer = bytes;
  const headers: Record<string, string> = { "Content-Type": "application/pdf" };
  const paths: string[] = [];
  const server = createServer((request, response) => {
    count++;
    paths.push(request.url!);
    if (
      serviceToken.startsWith("sb_secret_") &&
      (request.headers.apikey !== serviceToken ||
        request.headers.authorization !== undefined)
    ) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "INVALID_JWT_FIXTURE" }));
      return;
    }
    response.writeHead(status, headers);
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address() as { port: number };
  const config = {
    instanceId: "synthetic-custody",
    origin: `http://127.0.0.1:${address.port}`,
    credentialRef: "synthetic",
    serviceToken,
    timeoutMs: 500,
    localFixture: true as const,
  };
  const worker = vi.fn();
  const producer = createSourcePdfV2StorageProducer(config, worker, {
    accountId: scope.accountId,
    tripId: scope.tripId,
  });
  return {
    bytes,
    scope,
    config,
    producer,
    worker,
    paths,
    count: () => count,
    headers,
    response: (value: Buffer, code = 200) => {
      body = value;
      status = code;
    },
  };
}
it("custody is closed by default and legacy producer gains no byte-reader surface", async () => {
  const f = await fixture();
  await expect(
    createSourcePdfV2StorageProducer(f.config).readOriginal(f.scope),
  ).rejects.toThrow("PDF_CUSTODY_SCOPE_CLOSED");
  expect(createSourcePdfStorageProducer(f.config)).not.toHaveProperty("readOriginal");
  expect(f.count()).toBe(0);
});
it("fresh exact bytes reuse bounded GET without parsing or producing a verification receipt", async () => {
  const f = await fixture();
  const first = await f.producer.readOriginal(f.scope);
  first[0] = 0;
  expect(await f.producer.readOriginal(f.scope)).toEqual(Uint8Array.from(f.bytes));
  expect(f.paths).toEqual(
    Array(2).fill(
      `/object/authenticated/trip-source-material/v1/${f.scope.tripId}/${f.scope.sourceId}/${f.scope.representationId}/payload`,
    ),
  );
  expect(f.worker).not.toHaveBeenCalled();
});
it.each(["actor", "trip", "size", "identity"])(
  "rejects %s mismatch before Storage IO",
  async (kind) => {
    const f = await fixture();
    const scope: Parameters<typeof f.producer.readOriginal>[0] = { ...f.scope };
    if (kind === "actor") scope.accountId = randomUUID();
    if (kind === "trip") scope.tripId = randomUUID();
    if (kind === "size") scope.byteCount = 4194305;
    if (kind === "identity") scope.sourceId = "../../another-source";
    await expect(f.producer.readOriginal(scope)).rejects.toThrow();
    expect(f.count()).toBe(0);
  },
);
it.each(["hash", "mime", "compressed", "partial", "redirect", "overrun"])(
  "rejects %s response without retry or worker call",
  async (kind) => {
    const f = await fixture();
    if (kind === "hash") f.response(Buffer.from("x".repeat(f.bytes.length)));
    if (kind === "mime") f.headers["Content-Type"] = "text/plain";
    if (kind === "compressed") f.headers["Content-Encoding"] = "gzip";
    if (kind === "partial") f.headers["Content-Range"] = "bytes 0-10/200";
    if (kind === "redirect") {
      f.headers.Location = f.config.origin + "/redirect";
      f.response(f.bytes, 302);
    }
    if (kind === "overrun") f.response(Buffer.concat([f.bytes, Buffer.from("x")]));
    await expect(f.producer.readOriginal(f.scope)).rejects.toThrow(
      "PDF_CUSTODY_ORIGINAL_UNCONFIRMED",
    );
    expect(f.count()).toBe(1);
    expect(f.worker).not.toHaveBeenCalled();
  },
);
it("custody scope is copied and included in the provider fingerprint", async () => {
  const f = await fixture(),
    scope = { accountId: f.scope.accountId, tripId: f.scope.tripId };
  const producer = createSourcePdfV2StorageProducer(f.config, undefined, scope);
  scope.tripId = randomUUID();
  expect(await producer.readOriginal(f.scope)).toEqual(Uint8Array.from(f.bytes));
  expect(producer.configurationSha256).not.toBe(
    createSourcePdfV2StorageProducer(f.config).configurationSha256,
  );
});
it("request guard checks normal access around GET without changing the fixed provider identity", async () => {
  const f = await fixture();
  let allowed = false,
    checks = 0;
  const guard = {
    assertRequestCurrent() {},
    async assertCurrent() {
      checks++;
      if (!allowed) throw Error("PDF_SCOPE_FORBIDDEN");
    },
  };
  const guarded = createSourcePdfV2StorageProducer(
    f.config,
    f.worker,
    { accountId: f.scope.accountId, tripId: f.scope.tripId },
    guard,
  );
  expect(guarded.configurationSha256).toBe(f.producer.configurationSha256);
  await expect(guarded.readOriginal(f.scope)).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
  expect(f.count()).toBe(0);
  allowed = true;
  checks = 0;
  guard.assertCurrent = async () => {
    checks++;
    if (checks > 1) throw Error("PDF_SCOPE_FORBIDDEN");
  };
  await expect(guarded.readOriginal(f.scope)).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
  expect(f.count()).toBe(1);
  expect(checks).toBe(2);
});

it("uses the secret API key header for custody, never interprets it as a JWT", async () => {
  const f = await fixture("sb_secret_local_fixture");
  await expect(f.producer.readOriginal(f.scope)).resolves.toEqual(
    new Uint8Array(f.bytes),
  );
  expect(f.count()).toBe(1);
});
