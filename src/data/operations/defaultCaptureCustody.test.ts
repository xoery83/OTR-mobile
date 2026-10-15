import { createHash, randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { runDefaultCaptureCustodyBatch } from "./defaultCaptureCustody";
import { createCaptureCustodyOperation } from "./captureCustody";
import { requireActiveUserId } from "../auth/authRepository";
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
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
  recover = vi.fn(async () => bytes);
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
  const receipt = await runDefaultCaptureCustodyBatch(batch);
  expect(binding).toHaveBeenCalledTimes(2);
  expect(put).toHaveBeenCalledTimes(2);
  expect(recover).toHaveBeenCalledTimes(2);
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
  put.mockRejectedValueOnce(Error("synthetic unknown ACK"));
  await expect(runDefaultCaptureCustodyBatch(batch)).rejects.toThrow(
    "unknown ACK",
  );
  expect(put).toHaveBeenCalledTimes(1);
  expect(recover).not.toHaveBeenCalled();
});
