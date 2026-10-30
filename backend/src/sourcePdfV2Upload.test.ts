// Synthetic worker observations test custody boundaries; not real parser/Source authority.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import {
  PDF_UPLOAD_QPDF_V4,
  sourcePdfV2UploadBindingSchema,
  sourcePdfV2UploadGetSchema,
} from "../../src/domain/trip/sourcePdfV2Upload";
import { sourcePdfUploadBindingSchema } from "../../src/domain/trip/sourcePdfUploadAuthority";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import {
  createSourcePdfPrivateStage,
  createSourcePdfV2PrivateStage,
} from "./sourcePdfPrivateStage";
import {
  createSourcePdfStorageProducer,
  createSourcePdfV2StorageProducer,
} from "./sourcePdfStorageProducer";
import { runSourcePdfV2LinuxWorker } from "./sourcePdfV2LinuxWorker";
vi.mock("./sourcePdfV2LinuxWorker", () => ({
  SOURCE_PDF_V2_LINUX_IMAGE:
    "sha256:d27ddd7b09410b0a3b220b2768c0f6b2b25c32da528a42041bc50ea19eefc1b7",
  runSourcePdfV2LinuxWorker: vi.fn(),
}));
const digest = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()));
  vi.resetAllMocks();
});
async function fixture() {
  const bytes = Buffer.alloc(70000, 37),
    tripId = randomUUID(),
    sourceId = randomUUID(),
    representationId = randomUUID();
  const binding = sourcePdfV2UploadBindingSchema.parse({
    uploadVersion: 4,
    operationId: randomUUID(),
    operationKey: "upload-v4",
    operationSha256: "a".repeat(64),
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
    resourceKey: "b".repeat(64),
    runToken: randomUUID(),
    provider: "supabase_storage",
    bucket: "trip-source-material",
    objectKey: `v1/${tripId}/${sourceId}/${representationId}/payload`,
    sha256: digest(bytes),
    byteCount: bytes.length,
    mimeType: "application/pdf",
    profileId: PDF_UPLOAD_QPDF_V4.profileId,
    profileSha256: PDF_UPLOAD_QPDF_V4.profileSha256,
    producerId: randomUUID(),
    providerInstanceSha256: "c".repeat(64),
  });
  vi.mocked(runSourcePdfV2LinuxWorker).mockResolvedValue({
    engine: "qpdf-poppler",
    version: 1,
    originalSha256: binding.sha256,
    originalByteCount: bytes.length,
    text: "NZ5069",
    pages: [{ pageIndex: 0, start: 0, end: 6 }],
    toleratedUnreferencedZeroOffsetObjects: [],
  });
  const root = await mkdtemp(join(tmpdir(), "otr-source-v4-test-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  return { bytes, binding, root };
}
it("versions the fixed profile and rejects C2 object aliases or cross-version binding", async () => {
  const f = await fixture();
  const { profileSha256, ...profile } = PDF_UPLOAD_QPDF_V4;
  expect(digest(canonicalCoreJson(profile))).toBe(profileSha256);
  expect(sourcePdfUploadBindingSchema.safeParse(f.binding).success).toBe(false);
  expect(
    sourcePdfV2UploadBindingSchema.safeParse({
      ...f.binding,
      objectKey: `capture/${f.binding.actorAccountId}/${randomUUID()}`,
    }).success,
  ).toBe(false);
  expect(
    sourcePdfV2UploadBindingSchema.safeParse({ ...f.binding, byteCount: 10485761 })
      .success,
  ).toBe(false);
  await expect(
    createSourcePdfPrivateStage(f.root).reopen(f.binding as never),
  ).rejects.toThrow();
});
it("seals/reopens >64KiB exact originals with independent validation, preserving V1 rejection", async () => {
  const f = await fixture(),
    stage = createSourcePdfV2PrivateStage(f.root);
  await stage.seal(
    f.binding,
    (async function* () {
      yield f.bytes.subarray(0, 30000);
      yield f.bytes.subarray(30000);
    })(),
  );
  expect(await stage.reopen(f.binding)).toEqual(f.bytes);
  expect(runSourcePdfV2LinuxWorker).toHaveBeenCalledTimes(3);
  await expect(
    stage.reopen({ ...f.binding, resourceKey: "d".repeat(64) }),
  ).rejects.toThrow("STAGE_BINDING_MISMATCH");
});
it("cleans only its partial ingress after failed actual decoder validation", async () => {
  const f = await fixture();
  vi.mocked(runSourcePdfV2LinuxWorker).mockRejectedValue(
    new Error("PDF_V2_WORKER_FAILED"),
  );
  await expect(
    createSourcePdfV2PrivateStage(f.root).seal(
      f.binding,
      (async function* () {
        yield f.bytes;
      })(),
    ),
  ).rejects.toThrow("PDF_V2_WORKER_FAILED");
  expect(await readdir(f.root)).toEqual([]);
});
it("uses existing no-upsert producer lifecycle and causal authorized readback for a large original", async () => {
  const f = await fixture();
  let posts = 0,
    gets = 0;
  const server = createServer(async (request, response) => {
    expect(request.headers.authorization).toBe("Bearer synthetic-test-token");
    if (request.method === "POST") {
      posts++;
      const parts: Buffer[] = [];
      for await (const part of request) parts.push(Buffer.from(part));
      expect(Buffer.concat(parts)).toEqual(f.bytes);
      expect(request.headers["x-upsert"]).toBe("false");
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          Id: randomUUID(),
          Key: "trip-source-material/" + f.binding.objectKey,
        }),
      );
    } else {
      gets++;
      expect(request.headers["cache-control"]).toContain("no-cache");
      response.setHeader("content-type", "application/pdf");
      response.setHeader("content-length", f.bytes.length);
      response.end(f.bytes);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("test listener unavailable");
  const config = {
    instanceId: "fixture",
    origin: `http://127.0.0.1:${address.port}`,
    credentialRef: "fixture-only",
    serviceToken: "synthetic-test-token",
    timeoutMs: 5000,
    localFixture: true as const,
  };
  const producer = createSourcePdfV2StorageProducer(config),
    request = { binding: f.binding, dispatchId: randomUUID() };
  await expect(
    createSourcePdfStorageProducer(config).upload(request as never, f.bytes),
  ).rejects.toThrow();
  expect((await producer.upload(request, f.bytes)).kind).toBe("COMPLETE_ACK");
  await expect(producer.read(request)).rejects.toThrow("PDF_CAUSAL_READ_PERMIT_REQUIRED");
  expect(gets).toBe(0);
  expect(
    (
      await producer.read({
        ...request,
        readId: randomUUID(),
        ackEvidenceSha256: "a".repeat(64),
      })
    ).kind,
  ).toBe("MATCH");
  expect(posts).toBe(1);
  expect(gets).toBe(1);
  expect(sourcePdfV2UploadGetSchema.safeParse({}).success).toBe(false);
});

it("keeps a transient V4 worker failure distinct from unsupported original content", async () => {
  const f = await fixture();
  vi.mocked(runSourcePdfV2LinuxWorker).mockRejectedValue(
    Error("PDF_V2_WORKER_UNAVAILABLE"),
  );
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "application/pdf");
    response.end(f.bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("TEST_ADDRESS");
  const producer = createSourcePdfV2StorageProducer({
    instanceId: "fixture",
    origin: `http://127.0.0.1:${address.port}`,
    credentialRef: "fixture-only",
    serviceToken: "synthetic-test-token",
    timeoutMs: 1000,
    localFixture: true,
  });
  expect(
    (
      await producer.read({
        binding: f.binding,
        dispatchId: randomUUID(),
        readId: randomUUID(),
        ackEvidenceSha256: "a".repeat(64),
      })
    ).kind,
  ).toBe("UNAVAILABLE");
});
it("closed request during decode cannot subsequently send the Storage POST", async () => {
  const f = await fixture();
  let requests = 0,
    closed = false,
    release!: () => void;
  const server = createServer((_request, response) => {
    requests++;
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        Key: "trip-source-material/" + f.binding.objectKey,
        Id: randomUUID(),
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address() as { port: number };
  const output = await vi.mocked(runSourcePdfV2LinuxWorker).getMockImplementation()!(
    f.bytes,
  );
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const worker = vi.fn(async () => {
    await gate;
    return output;
  });
  const assertRequestCurrent = () => {
    if (closed) throw Error("PDF_SCOPE_FORBIDDEN");
  };
  const producer = createSourcePdfV2StorageProducer(
    {
      instanceId: "synthetic",
      origin: `http://127.0.0.1:${address.port}`,
      credentialRef: "synthetic",
      serviceToken: "synthetic",
      timeoutMs: 500,
      localFixture: true,
    },
    worker,
    { accountId: f.binding.actorAccountId, tripId: f.binding.tripId },
    { assertCurrent: async () => assertRequestCurrent(), assertRequestCurrent },
  );
  const pending = producer.upload(
    { binding: f.binding, dispatchId: randomUUID() },
    f.bytes,
  );
  await vi.waitFor(() => expect(worker).toHaveBeenCalledOnce());
  closed = true;
  release();
  await expect(pending).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
  expect(requests).toBe(0);
});
