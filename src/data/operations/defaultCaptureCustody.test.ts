import { captureCustodyDevFailure } from "./captureCustodyDev";
import { createHash, randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import {
  runDefaultCaptureCustodyBatch,
  verifyDefaultCaptureCustodyBatch,
} from "./defaultCaptureCustody";
import { createCaptureCustodyOperation } from "./captureCustody";
import { requireActiveUserId } from "../auth/authRepository";
vi.mock("../auth/authRepository", () => ({
  requireActiveUserId: vi.fn(),
  clearLocalSession: vi.fn(),
  readLocalSession: vi.fn(),
  writeLocalSession: vi.fn(),
}));
vi.mock("./defaultCaptureSubmission", () => ({
  getDefaultCaptureSubmissionRepository: vi.fn(async () => ({})),
}));
vi.mock("../repositories/defaultLocalCaptureInboxRepository", () => ({
  getDefaultLocalCaptureInboxRepository: vi.fn(async () => ({})),
}));
vi.mock("../api/captureCustodyTransport", () => ({
  createCaptureCustodyTransport: vi.fn(() => ({})),
}));
vi.mock("./captureCustody", () => ({ createCaptureCustodyOperation: vi.fn() }));
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
const batch = { batchId: one.batchId, jobId: one.jobId, inputs: [one, second] };
const binding = vi.fn(async (_c: unknown, _j: string, id: string) =>
    id === one.inputId ? one : second,
  ),
  put = vi.fn(async () => bytes),
  recover = vi.fn(async (): Promise<Uint8Array | null> => bytes);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireActiveUserId).mockResolvedValue(one.accountId);
  vi.mocked(createCaptureCustodyOperation).mockReturnValue({
    binding,
    put,
    recover,
  });
});
it("preflights both existing Input bindings, then uses normal put/recover and returns no payload", async () => {
  recover
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(bytes)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(bytes);
  const receipt = await runDefaultCaptureCustodyBatch(batch);
  expect(binding).toHaveBeenCalledTimes(2);
  expect(put).toHaveBeenCalledTimes(2);
  expect(recover).toHaveBeenCalledTimes(4);
  expect(binding.mock.invocationCallOrder[1]).toBeLessThan(
    put.mock.invocationCallOrder[0],
  );
  expect(receipt).toEqual({
    batchId: batch.batchId,
    jobId: batch.jobId,
    inputs: batch.inputs.map((b) => ({
      inputId: b.inputId,
      sha256: b.sha256,
      byteCount: b.byteCount,
    })),
  });
});
it("changed second original blocks all writes; foreign account never constructs executor", async () => {
  await expect(
    runDefaultCaptureCustodyBatch({
      ...batch,
      inputs: [one, { ...second, payloadId: randomUUID() }],
    }),
  ).rejects.toThrow("INPUT_STALE");
  expect(put).not.toHaveBeenCalled();
  vi.mocked(requireActiveUserId).mockResolvedValue(randomUUID());
  await expect(runDefaultCaptureCustodyBatch(batch)).rejects.toThrow(
    "SCOPE_INVALID",
  );
  expect(createCaptureCustodyOperation).toHaveBeenCalledTimes(1);
});
it("lost ACK does not invent another Input or continue a sibling", async () => {
  recover.mockResolvedValueOnce(null);
  put.mockRejectedValueOnce(Error("synthetic unknown ACK"));
  await expect(runDefaultCaptureCustodyBatch(batch)).rejects.toThrow(
    "unknown ACK",
  );
  expect(put).toHaveBeenCalledTimes(1);
  expect(recover).toHaveBeenCalledTimes(1);
});

it("cold verification uses both exact normal bindings and authorized GET only, never PUT", async () => {
  const receipt = await verifyDefaultCaptureCustodyBatch(batch);
  expect(binding).toHaveBeenCalledTimes(2);
  expect(recover).toHaveBeenCalledTimes(2);
  expect(put).not.toHaveBeenCalled();
  expect(receipt.inputs).toHaveLength(2);
});
it("host/expiry invalidation after preflight prevents every PUT; after first ACK stops siblings and readback", async () => {
  let live = true;
  const check = () => {
    if (!live) throw Error("synthetic retired host");
  };
  binding.mockImplementationOnce(async () => {
    live = false;
    return one;
  });
  await expect(runDefaultCaptureCustodyBatch(batch, check)).rejects.toThrow(
    "retired",
  );
  expect(put).not.toHaveBeenCalled();
  live = true;
  binding.mockImplementation(async (_c, _j, id) =>
    id === one.inputId ? one : second,
  );
  recover.mockResolvedValueOnce(null);
  put.mockImplementationOnce(async () => {
    live = false;
    return bytes;
  });
  await expect(runDefaultCaptureCustodyBatch(batch, check)).rejects.toThrow(
    "retired",
  );
  expect(put).toHaveBeenCalledTimes(1);
  expect(recover).toHaveBeenCalledTimes(1);
});

it("GET-only missing original reports finite404 without PUT", async () => {
  recover.mockResolvedValueOnce(null);
  const error = await verifyDefaultCaptureCustodyBatch(batch).catch((e) => e);
  expect(error).toMatchObject({ message: "CAPTURE_CUSTODY_NOT_FOUND" });
  expect(captureCustodyDevFailure(error)).toEqual({
    stage: "HTTP",
    code: "CAPTURE_CUSTODY_NOT_FOUND",
    status: 404,
  });
  expect(put).not.toHaveBeenCalled();
  expect(recover).toHaveBeenCalledTimes(1);
});

it("resumes a partially stored batch without repeating the first Input PUT", async () => {
  recover
    .mockResolvedValueOnce(bytes)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(bytes);
  const receipt = await runDefaultCaptureCustodyBatch(batch);
  expect(receipt.inputs).toHaveLength(2);
  expect(put).toHaveBeenCalledTimes(1);
  expect(put).toHaveBeenCalledWith(
    expect.anything(),
    batch.jobId,
    second.inputId,
  );
  expect(recover).toHaveBeenCalledTimes(3);
});
it("empty or wrong existing bytes do not authorize PUT or skip to a sibling", async () => {
  for (const bad of [new Uint8Array(), new Uint8Array(bytes.length)]) {
    vi.clearAllMocks();
    recover.mockResolvedValueOnce(bad);
    await expect(runDefaultCaptureCustodyBatch(batch)).rejects.toThrow(
      "CAPTURE_CUSTODY_BYTES_INVALID",
    );
    expect(put).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledTimes(1);
  }
});
it("permission or network recovery errors never authorize PUT or skip Inputs", async () => {
  for (const code of ["AUTH_REQUIRED", "NATIVE_FETCH_FAILED"]) {
    vi.clearAllMocks();
    const error = new Error(code);
    recover.mockRejectedValueOnce(error);
    await expect(runDefaultCaptureCustodyBatch(batch)).rejects.toBe(error);
    expect(put).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledTimes(1);
  }
});
