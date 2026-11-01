// Shared IO only: the injected verifier is synthetic, not JPEG format/Source qualification.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createOriginalStorageProducer } from "./sourcePdfStorageProducer";

const bytes = readFileSync(
  new URL("../../assets/trips/covers/city.jpg", import.meta.url),
);
const sha256 = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const bindingSchema = z.strictObject({
  objectKey: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteCount: z.number().int().positive(),
  mimeType: z.literal("image/jpeg"),
});
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function fixture() {
  let posts = 0,
    gets = 0,
    readMime = "image/jpeg",
    readBytes: Buffer = bytes,
    dropAck = false;
  const tripId = randomUUID(),
    sourceId = randomUUID(),
    representationId = randomUUID(),
    accountId = randomUUID();
  const objectKey = `v1/${tripId}/${sourceId}/${representationId}/payload`;
  const binding = {
    objectKey,
    sha256: sha256(bytes),
    byteCount: bytes.length,
    mimeType: "image/jpeg" as const,
  };
  const server = createServer(async (request, response) => {
    expect(request.headers.authorization).toBe("Bearer synthetic-test-token");
    if (request.method === "POST") {
      posts++;
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(bytes);
      expect(request.headers["content-type"]).toBe("image/jpeg");
      expect(request.headers["x-upsert"]).toBe("false");
      if (dropAck) {
        response.destroy();
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          Id: randomUUID(),
          Key: "trip-source-material/" + objectKey,
        }),
      );
    } else {
      gets++;
      expect(request.headers["cache-control"]).toContain("no-cache");
      response.setHeader("content-type", readMime);
      response.end(readBytes);
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  cleanup.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw Error("TEST_LISTENER");
  const verify = vi.fn(async (_bytes: Uint8Array): Promise<void> => {});
  const guard = {
    assertRequestCurrent: vi.fn(),
    assertCurrent: vi.fn(async () => {}),
  };
  // No JPEG profile ID, decoder result, runtime registration or Source proof is created.
  const producer = createOriginalStorageProducer(
    {
      instanceId: "jpeg-io-fixture",
      origin: `http://127.0.0.1:${address.port}`,
      credentialRef: "fixture-only",
      serviceToken: "synthetic-test-token",
      timeoutMs: 1000,
      localFixture: true,
    },
    bindingSchema,
    verify,
    1048576,
    undefined,
    { accountId, tripId },
    guard,
    "image/jpeg",
  );
  const request = { binding, dispatchId: randomUUID() };
  const scope = {
    accountId,
    tripId,
    sourceId,
    representationId,
    sha256: binding.sha256,
    byteCount: binding.byteCount,
  };
  return {
    producer,
    request,
    scope,
    verify,
    guard,
    counts: () => ({ posts, gets }),
    permitted: () => ({
      ...request,
      readId: randomUUID(),
      terminalEvidenceSha256: "a".repeat(64),
    }),
    readMime: (value: string) => {
      readMime = value;
    },
    readBytes: (value: Buffer) => {
      readBytes = value;
    },
    dropAck: () => {
      dropAck = true;
    },
  };
}
it("retains real baseline JPEG bytes/MIME in no-upsert POST and independently permitted GET", async () => {
  const f = await fixture();
  expect((await f.producer.upload(f.request, bytes)).kind).toBe("COMPLETE_ACK");
  const read = await f.producer.read(f.permitted());
  expect(read.kind).toBe("MATCH");
  expect(read).toMatchObject({
    sha256: sha256(bytes),
    byteCount: bytes.length,
    mimeType: "image/jpeg",
  });
  expect(f.verify).toHaveBeenCalledTimes(2);
  expect(f.counts()).toEqual({ posts: 1, gets: 1 });
});
it("requires independent read identity and terminal evidence, never legacy PDF ack evidence", async () => {
  const f = await fixture();
  for (const permit of [
    f.request,
    { ...f.permitted(), readId: f.request.dispatchId },
    { ...f.request, readId: randomUUID(), ackEvidenceSha256: "a".repeat(64) },
    { ...f.permitted(), terminalEvidenceSha256: "not-a-hash" },
  ])
    await expect(f.producer.read(permit)).rejects.toThrow(
      "JPEG_QUALIFIED_READ_PERMIT_REQUIRED",
    );
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
});
it("verifier denial prevents Storage POST", async () => {
  const f = await fixture();
  f.verify.mockRejectedValue(Error("JPEG_NOT_QUALIFIED"));
  await expect(f.producer.upload(f.request, bytes)).rejects.toThrow(
    "JPEG_NOT_QUALIFIED",
  );
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
});
it("rechecks current scope after verification and before POST", async () => {
  const f = await fixture();
  f.verify.mockImplementation(async () => {
    f.guard.assertCurrent.mockRejectedValue(Error("SCOPE_CLOSED"));
  });
  await expect(f.producer.upload(f.request, bytes)).rejects.toThrow(
    "SCOPE_CLOSED",
  );
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
});
it("rejects changed original identity before POST", async () => {
  const f = await fixture(),
    changed = Buffer.from(bytes);
  changed[changed.length - 1] ^= 1;
  await expect(f.producer.upload(f.request, changed)).rejects.toThrow(
    "STAGE_INTEGRITY_MISMATCH",
  );
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
});
it("a read verifier outage is UNAVAILABLE without rejection or upload", async () => {
  const f = await fixture();
  f.verify.mockRejectedValue(Error("DECODER_UNAVAILABLE"));
  expect((await f.producer.read(f.permitted())).kind).toBe("UNAVAILABLE");
  expect(f.counts()).toEqual({ posts: 0, gets: 1 });
});
it.each(["mime", "hash", "count"])(
  "independent GET rejects %s mismatch",
  async (failure) => {
    const f = await fixture();
    if (failure === "mime") f.readMime("image/png");
    else if (failure === "count") f.readBytes(bytes.subarray(1));
    else {
      const changed = Buffer.from(bytes);
      changed[changed.length - 1] ^= 1;
      f.readBytes(changed);
    }
    expect((await f.producer.read(f.permitted())).kind).toBe("MISMATCH");
    expect(f.verify).not.toHaveBeenCalled();
    expect(f.counts()).toEqual({ posts: 0, gets: 1 });
  },
);
it("lost POST acknowledgement stays UNKNOWN and never automatically retries", async () => {
  const f = await fixture();
  f.dropAck();
  expect((await f.producer.upload(f.request, bytes)).kind).toBe("UNKNOWN");
  expect(f.counts()).toEqual({ posts: 1, gets: 0 });
});
it("read-only custody retains exact account, original bytes and MIME fences", async () => {
  const f = await fixture();
  await expect(
    f.producer.readOriginal({ ...f.scope, accountId: randomUUID() }),
  ).rejects.toThrow();
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
  expect(await f.producer.readOriginal(f.scope)).toEqual(
    Uint8Array.from(bytes),
  );
  f.readMime("image/png");
  await expect(f.producer.readOriginal(f.scope)).rejects.toThrow(
    "PDF_CUSTODY_ORIGINAL_UNCONFIRMED",
  );
  expect(f.counts()).toEqual({ posts: 0, gets: 2 });
});
