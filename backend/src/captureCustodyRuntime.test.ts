import { randomUUID, createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  loadDevCaptureCustody,
  captureCustodyRuntimePath,
} from "./captureCustodyRuntime";
import { createFlightPrivateCustody } from "./flightPrivateCustody";
import { createCaptureStorageMaterial } from "./captureStorageMaterial";
vi.mock("node:fs/promises", () => ({ open: vi.fn() }));
vi.mock("./flightPrivateCustody", () => ({
  createFlightPrivateCustody: vi.fn(),
}));
vi.mock("./captureStorageMaterial", () => ({
  createCaptureStorageMaterial: vi.fn(() => ({})),
}));
const bytes = new TextEncoder().encode("%PDF-synthetic");
const one = {
  version: 1 as const,
  accountId: randomUUID(),
  batchId: randomUUID(),
  jobId: randomUUID(),
  inputId: randomUUID(),
  inputRevision: 3,
  captureId: randomUUID(),
  payloadId: randomUUID(),
  captureRevision: 1,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  byteCount: bytes.length,
  mediaType: "application/pdf" as const,
};
const second = { ...one, inputId: randomUUID(), captureId: randomUUID() };
const env = {
  OTR_DEV_BACKEND_NETWORK_MODE: "host",
  OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
  OTR_DEV_SUPABASE_SECRET_KEY: "synthetic-existing-key",
};
const metadata = () => ({
  version: 1,
  directory: "/var/lib/otr/capture-custody",
  identity: { store_id: randomUUID(), device: "1", inode: "2" },
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  batch: { batchId: one.batchId, jobId: one.jobId, inputs: [one, second] },
});
const put = vi.fn(async () => {}),
  read = vi.fn(async () => bytes),
  close = vi.fn(async () => {}),
  fileClose = vi.fn(async () => {});
function file(body = metadata(), stat = {}) {
  vi.mocked(open).mockResolvedValue({
    stat: async () => ({
      isFile: () => true,
      uid: 0,
      gid: 999,
      mode: 0o440,
      nlink: 1,
      size: 1024,
      ...stat,
    }),
    readFile: async () => JSON.stringify(body),
    close: fileClose,
  } as unknown as Awaited<ReturnType<typeof open>>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createFlightPrivateCustody).mockResolvedValue({
    captureMaterial: { put, read },
    close,
  } as unknown as Awaited<ReturnType<typeof createFlightPrivateCustody>>);
});
afterEach(() => vi.useRealTimers());
it("missing explicit metadata stays CLOSED before any credential or store construction", async () => {
  vi.mocked(open).mockRejectedValue(Object.assign(Error(), { code: "ENOENT" }));
  expect(
    await loadDevCaptureCustody(
      new Proxy(
        {},
        {
          get() {
            throw Error("must not read environment");
          },
        },
      ),
    ),
  ).toBeUndefined();
  expect(createCaptureStorageMaterial).not.toHaveBeenCalled();
  expect(createFlightPrivateCustody).not.toHaveBeenCalled();
  expect(open).toHaveBeenCalledWith(
    captureCustodyRuntimePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
});
it("composes only existing secret/config plus attested root; limits exact two tuples and checks expiry", async () => {
  const body = metadata();
  file(body);
  const runtime = await loadDevCaptureCustody(env);
  expect(runtime).toBeDefined();
  expect(createCaptureStorageMaterial).toHaveBeenCalledWith(
    expect.objectContaining({
      serviceToken: env.OTR_DEV_SUPABASE_SECRET_KEY,
      credentialRef: "OTR_DEV_SUPABASE_SECRET_KEY",
    }),
  );
  expect(createFlightPrivateCustody).toHaveBeenCalledWith(
    body.directory,
    body.identity,
    expect.anything(),
  );
  await runtime!.captureMaterialCustody.put(one, bytes);
  expect(await runtime!.captureMaterialCustody.read(second)).toEqual(bytes);
  await expect(
    runtime!.captureMaterialCustody.read({ ...one, inputId: randomUUID() }),
  ).rejects.toThrow("BINDING_CONFLICT");
  vi.useFakeTimers();
  vi.setSystemTime(new Date(Date.parse(body.expiresAt) + 1));
  await expect(runtime!.captureMaterialCustody.put(one, bytes)).rejects.toThrow(
    "RUNTIME_UNAVAILABLE",
  );
  expect(put).toHaveBeenCalledTimes(1);
  await runtime!.close();
  expect(close).toHaveBeenCalled();
  expect(fileClose).toHaveBeenCalledTimes(1);
});
it("expiry after I/O cannot return success", async () => {
  const body = metadata();
  file(body);
  const runtime = await loadDevCaptureCustody(env);
  read.mockImplementationOnce(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(body.expiresAt) + 1));
    return bytes;
  });
  await expect(runtime!.captureMaterialCustody.read(one)).rejects.toThrow(
    "RUNTIME_UNAVAILABLE",
  );
});
it("invalid custody permissions/scope/expiry fail before storage or secret use", async () => {
  for (const stat of [
    { uid: 10001 },
    { gid: 0 },
    { mode: 0o644 },
    { nlink: 2 },
    { size: 8193 },
    { isFile: () => false },
  ]) {
    file(metadata(), stat);
    await expect(loadDevCaptureCustody(env)).rejects.toThrow("RUNTIME_UNAVAILABLE");
  }
  const body = metadata();
  body.batch.inputs[1] = { ...second, accountId: randomUUID() };
  file(body);
  await expect(loadDevCaptureCustody(env)).rejects.toThrow("RUNTIME_UNAVAILABLE");
  file({ ...metadata(), expiresAt: new Date(Date.now() - 1).toISOString() });
  await expect(loadDevCaptureCustody(env)).rejects.toThrow("RUNTIME_UNAVAILABLE");
  file();
  await expect(
    loadDevCaptureCustody({ ...env, OTR_DEV_BACKEND_NETWORK_MODE: "bridge" }),
  ).rejects.toThrow("RUNTIME_UNAVAILABLE");
  expect(createFlightPrivateCustody).not.toHaveBeenCalled();
  expect(createCaptureStorageMaterial).not.toHaveBeenCalled();
});

it("Universal custody v2 admits only its bounded exact N pins and expires within900 seconds; legacy does not imply v2", async () => {
  const pin = {
    ...one,
    version: 2 as const,
    acquisitionSource: "files" as const,
    originalFilename: "synthetic.pdf",
    kind: "FILE" as const,
  };
  const body = {
    ...metadata(),
    version: 2,
    batch: { version: 2, batchId: one.batchId, jobId: one.jobId, inputs: [pin] },
  };
  file(body as unknown as ReturnType<typeof metadata>);
  const runtime = await loadDevCaptureCustody(env);
  await runtime!.captureMaterialCustody.put(pin, bytes);
  await expect(
    runtime!.captureMaterialCustody.read({ ...pin, inputId: randomUUID() }),
  ).rejects.toThrow("BINDING_CONFLICT");
  await runtime!.close();
  file({
    ...body,
    expiresAt: new Date(Date.now() + 901000).toISOString(),
  } as unknown as ReturnType<typeof metadata>);
  await expect(loadDevCaptureCustody(env)).rejects.toThrow("RUNTIME_UNAVAILABLE");
  file(metadata());
  const old = await loadDevCaptureCustody(env);
  await expect(old!.captureMaterialCustody.put(pin, bytes)).rejects.toThrow(
    "BINDING_CONFLICT",
  );
  await old!.close();
});
