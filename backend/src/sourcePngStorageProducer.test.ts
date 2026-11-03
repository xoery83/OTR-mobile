// Synthetic Storage/sandbox observations exercise IO only, not Source authority.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { PNG_DEV_X64_EXECUTION_PROFILE_SHA256 } from "../../src/domain/trip/sourcePngPreparation";
import { sourcePdfUploadBindingSchema } from "../../src/domain/trip/sourcePdfUploadAuthority";
import {
  createSourcePngStorageProducer,
  SOURCE_PNG_SANDBOX_IMAGE,
  sourcePngStorageBindingSchema,
} from "./sourcePngStorageProducer";
const bytes = readFileSync(
  new URL("../../output/photo/universal-photo-activity-qa.png", import.meta.url),
);
const hash = createHash("sha256").update(bytes).digest("hex");
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
function observation() {
  return {
    imageId: SOURCE_PNG_SANDBOX_IMAGE,
    terminated: true,
    result: {
      protocol_version: 1,
      profile_version: 1,
      profile_sha256: PNG_DEV_X64_EXECUTION_PROFILE_SHA256,
      input_token: "a".repeat(32),
      input_sha256: hash,
      byte_count: bytes.length,
      actual_mime: "image/png",
      format: "PNG",
      status: "PARSE_PASS",
      facts: {
        width: 1000,
        height: 600,
        pixels: 600000,
        frames: 1,
        channels: 4,
        bit_depth: 8,
        interlace: 0,
        decoded_byte_count: 2400000,
      },
    },
  };
}
async function fixture() {
  let posts = 0,
    gets = 0;
  let contentType = "image/png";
  const server = createServer(async (request, response) => {
    expect(request.headers.authorization).toBe("Bearer synthetic-test-token");
    if (request.method === "POST") {
      posts++;
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(bytes);
      expect(request.headers["content-type"]).toBe("image/png");
      expect(request.headers["x-upsert"]).toBe("false");
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          Id: randomUUID(),
          Key: "trip-source-material/" + binding.objectKey,
        }),
      );
    } else {
      gets++;
      expect(request.headers["cache-control"]).toContain("no-cache");
      response.setHeader("content-type", contentType);
      response.end(bytes);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("TEST_LISTENER");
  const tripId = randomUUID(),
    sourceId = randomUUID(),
    representationId = randomUUID();
  const binding = sourcePngStorageBindingSchema.parse({
    operationId: randomUUID(),
    operationKey: "png-upload:fixture",
    operationSha256: "b".repeat(64),
    actorAccountId: randomUUID(),
    tripId,
    sourceId,
    representationId,
    materialRevision: 1,
    sourceRowRevision: 1,
    representationRowRevision: 1,
    parentOperationId: randomUUID(),
    attemptId: randomUUID(),
    attemptGeneration: 1,
    executionPrincipal: "otr_trip_source_command_gateway",
    resourceId: randomUUID(),
    nodeId: randomUUID(),
    resourceKey: "c".repeat(64),
    runToken: randomUUID(),
    provider: "supabase_storage",
    bucket: "trip-source-material",
    objectKey: `v1/${tripId}/${sourceId}/${representationId}/payload`,
    sha256: hash,
    byteCount: bytes.length,
    mimeType: "image/png",
    profileId: "PNG_STATIC_RGB8_RGBA8_V1",
    profileSha256: PNG_DEV_X64_EXECUTION_PROFILE_SHA256,
  });
  const sandbox = vi.fn(async (_bytes: Uint8Array): Promise<unknown> => observation());
  const guard = { assertRequestCurrent: vi.fn(), assertCurrent: vi.fn(async () => {}) };
  const producer = createSourcePngStorageProducer(
    {
      instanceId: "png-fixture",
      origin: `http://127.0.0.1:${address.port}`,
      credentialRef: "fixture-only",
      serviceToken: "synthetic-test-token",
      timeoutMs: 1000,
      localFixture: true,
    },
    sandbox,
    { accountId: binding.actorAccountId, tripId },
    guard,
  );
  return {
    binding,
    sandbox,
    guard,
    producer,
    request: { binding, dispatchId: randomUUID() },
    counts: () => ({ posts, gets }),
    mime: (value: string) => {
      contentType = value;
    },
  };
}
it("uses exact PNG profile and rejects PDF version/profile or foreign object keys", async () => {
  const f = await fixture();
  expect(sourcePdfUploadBindingSchema.safeParse(f.binding).success).toBe(false);
  for (const patch of [
    { uploadVersion: 4 },
    { mimeType: "application/pdf" },
    { profileSha256: "a".repeat(64) },
    { byteCount: 1048577 },
    { objectKey: "capture/foreign" },
  ])
    expect(
      sourcePngStorageBindingSchema.safeParse({ ...f.binding, ...patch }).success,
    ).toBe(false);
});
it("reuses no-upsert POST and separately permitted GET without changing Source state", async () => {
  const f = await fixture();
  expect((await f.producer.upload(f.request, bytes)).kind).toBe("COMPLETE_ACK");
  await expect(f.producer.read(f.request)).rejects.toThrow(
    "PNG_QUALIFIED_READ_PERMIT_REQUIRED",
  );
  await expect(
    f.producer.read({
      ...f.request,
      readId: randomUUID(),
      ackEvidenceSha256: "a".repeat(64),
    }),
  ).rejects.toThrow("PNG_QUALIFIED_READ_PERMIT_REQUIRED");
  expect(f.counts()).toEqual({ posts: 1, gets: 0 });
  expect(
    (
      await f.producer.read({
        ...f.request,
        readId: randomUUID(),
        terminalEvidenceSha256: "a".repeat(64),
      })
    ).kind,
  ).toBe("MATCH");
  expect(f.counts()).toEqual({ posts: 1, gets: 1 });
  expect(f.sandbox).toHaveBeenCalledTimes(2);
});
it.each(["unterminated", "profile", "image", "hash", "dimensions"])(
  "rejects %s sandbox evidence before Storage POST",
  async (fault) => {
    const f = await fixture(),
      result = observation();
    if (fault === "unterminated") result.terminated = false;
    if (fault === "profile") result.result.profile_sha256 = "a".repeat(64);
    if (fault === "image") result.imageId = "sha256:" + "a".repeat(64);
    if (fault === "hash") result.result.input_sha256 = "a".repeat(64);
    if (fault === "dimensions") result.result.facts.pixels = 1;
    f.sandbox.mockResolvedValue(result);
    await expect(f.producer.upload(f.request, bytes)).rejects.toThrow();
    expect(f.counts()).toEqual({ posts: 0, gets: 0 });
  },
);
it("requires current request after sandbox completes before remote POST", async () => {
  const f = await fixture();
  f.sandbox.mockImplementation(async () => {
    f.guard.assertCurrent.mockRejectedValue(Error("SOURCE_CAPABILITY_CLOSED"));
    return observation();
  });
  await expect(f.producer.upload(f.request, bytes)).rejects.toThrow(
    "SOURCE_CAPABILITY_CLOSED",
  );
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
});
it("read-only recovery checks account and bytes; PDF MIME cannot confirm a PNG original", async () => {
  const f = await fixture();
  const scope = {
    accountId: f.binding.actorAccountId,
    tripId: f.binding.tripId,
    sourceId: f.binding.sourceId,
    representationId: f.binding.representationId,
    sha256: hash,
    byteCount: bytes.length,
  };
  await expect(
    f.producer.readOriginal({ ...scope, accountId: randomUUID() }),
  ).rejects.toThrow();
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
  expect(await f.producer.readOriginal(scope)).toEqual(Uint8Array.from(bytes));
  f.mime("application/pdf");
  await expect(f.producer.readOriginal(scope)).rejects.toThrow();
  expect(f.counts()).toEqual({ posts: 0, gets: 2 });
});
it("transient sandbox outage during readback remains unavailable, not format rejection or reupload", async () => {
  const f = await fixture();
  f.sandbox.mockRejectedValue(Error("PNG_SANDBOX_UNAVAILABLE"));
  expect(
    (
      await f.producer.read({
        ...f.request,
        readId: randomUUID(),
        terminalEvidenceSha256: "a".repeat(64),
      })
    ).kind,
  ).toBe("UNAVAILABLE");
  expect(f.counts()).toEqual({ posts: 0, gets: 1 });
});
