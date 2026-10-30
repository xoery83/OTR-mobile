import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  beginAccountTransition,
  captureAccountRequestContext,
  endAccountTransition,
} from "../auth/accountRequestContext";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { LocalCapture } from "@/domain/capture/localCapture";
import { screenUniversalPhotoInput } from "./universalPhotoRelevance";

async function fixture() {
  const accountId = randomUUID();
  let active = accountId;
  const getAccountId = async () => active;
  const context = await captureAccountRequestContext("", getAccountId);
  const bytes = Uint8Array.of(255, 216, 255, 1, 2);
  const hash = async (value: Uint8Array) =>
    createHash("sha256").update(value).digest("hex");
  const sha256 = await hash(bytes);
  const input = {
    id: randomUUID(),
    ordinal: 1,
    kind: "IMAGE",
    state: "ACCEPTED",
    captureId: randomUUID(),
    payloadId: randomUUID(),
    contentSha256: sha256,
    contentByteCount: bytes.length,
    declaredContentType: "image/jpeg",
  };
  const capture = {
    id: input.captureId,
    accountId,
    payloadId: input.payloadId,
    kind: "IMAGE",
    declaredContentType: "image/jpeg",
    sha256,
    byteCount: bytes.length,
    revision: 1,
  } as LocalCapture;
  const job = {
    batch: { accountId, batchId: randomUUID(), jobId: randomUUID() },
    inputs: [{ id: randomUUID(), kind: "TEXT", state: "ACCEPTED", ordinal: 0 }, input],
    allInputsAccepted: false,
  } as unknown as CaptureJobReadModel;
  const reopen = vi.fn(async () => job);
  const getForSourceHandoff = vi.fn(async () => ({ capture, bytes }));
  const extraction = {
    engine: "apple-vision" as const,
    text: "Hotel reservation",
    originalSha256: sha256,
    originalByteCount: bytes.length,
    observations: [
      {
        text: "Hotel reservation",
        confidence: 0.95,
        boundingBox: { x: 0, y: 0, width: 1, height: 0.1 },
      },
    ],
  };
  const extract = vi.fn(async (_bytes: Uint8Array, _mime: string) => extraction);
  const deps = {
    getAccountId,
    submissions: { reopen },
    captures: { getForSourceHandoff },
    hash,
    extract,
  };
  return {
    context,
    job,
    input,
    capture,
    bytes,
    deps,
    extraction,
    switchAccount: () => {
      active = randomUUID();
    },
  };
}
it("reads one accepted image without blocking on other mixed-Batch inputs or mutating the Batch", async () => {
  const f = await fixture();
  const before = JSON.stringify(f.job);
  const result = await screenUniversalPhotoInput(
    f.context,
    f.job.batch.jobId,
    f.input.id,
    f.deps,
  );
  expect(result.pin).toMatchObject({
    accountId: f.context.accountId,
    batchId: f.job.batch.batchId,
    inputId: f.input.id,
    ordinal: 1,
    payloadId: f.input.payloadId,
  });
  expect(result.relevance.status).toBe("RELEVANT");
  expect(JSON.stringify(f.job)).toBe(before);
  expect(f.deps.submissions.reopen).toHaveBeenCalledTimes(2);
  expect(f.deps.captures.getForSourceHandoff).toHaveBeenCalledTimes(2);
  expect(f.deps.extract).toHaveBeenCalledOnce();
});
it("rejects another Account before reading Capture bytes", async () => {
  const f = await fixture();
  f.switchAccount();
  await expect(
    screenUniversalPhotoInput(f.context, f.job.batch.jobId, f.input.id, f.deps),
  ).rejects.toThrow("Account changed");
  expect(f.deps.submissions.reopen).not.toHaveBeenCalled();
});
it("rejects stale Account results after OCR and performs no further Capture read", async () => {
  const f = await fixture();
  f.deps.extract.mockImplementationOnce(async () => {
    f.switchAccount();
    return f.extraction;
  });
  await expect(
    screenUniversalPhotoInput(f.context, f.job.batch.jobId, f.input.id, f.deps),
  ).rejects.toThrow("Account changed");
  expect(f.deps.captures.getForSourceHandoff).toHaveBeenCalledOnce();
});
it("withholds a late decision if the original or input ordinal changes", async () => {
  for (const key of ["payloadId", "ordinal"] as const) {
    const f = await fixture();
    f.deps.extract.mockImplementationOnce(async () => {
      if (key === "payloadId") f.capture.payloadId = randomUUID();
      else f.input.ordinal = 3;
      return f.extraction;
    });
    await expect(
      screenUniversalPhotoInput(f.context, f.job.batch.jobId, f.input.id, f.deps),
    ).rejects.toThrow("PHOTO_IMPORT_ORIGINAL_CHANGED");
  }
});
it("rejects non-image or non-accepted input without OCR and never changes other Source kinds", async () => {
  const f = await fixture();
  await expect(
    screenUniversalPhotoInput(f.context, f.job.batch.jobId, f.job.inputs[0].id, f.deps),
  ).rejects.toThrow("PHOTO_IMPORT_INPUT_UNAVAILABLE");
  f.input.state = "PENDING";
  await expect(
    screenUniversalPhotoInput(f.context, f.job.batch.jobId, f.input.id, f.deps),
  ).rejects.toThrow("PHOTO_IMPORT_INPUT_UNAVAILABLE");
  expect(f.deps.extract).not.toHaveBeenCalled();
});
it("does not allow a mismatched retained Account/payload/hash through to native extraction", async () => {
  for (const key of ["accountId", "payloadId", "sha256"] as const) {
    const f = await fixture();
    f.capture[key] = "changed";
    await expect(
      screenUniversalPhotoInput(f.context, f.job.batch.jobId, f.input.id, f.deps),
    ).rejects.toThrow("PHOTO_IMPORT_ORIGINAL_CHANGED");
    expect(f.deps.extract).not.toHaveBeenCalled();
  }
});

it("withholds results across a real same-Account generation transition", async () => {
  const f = await fixture();
  f.deps.extract.mockImplementationOnce(async () => {
    const lease = await beginAccountTransition();
    endAccountTransition(lease);
    return f.extraction;
  });
  await expect(
    screenUniversalPhotoInput(f.context, f.job.batch.jobId, f.input.id, f.deps),
  ).rejects.toThrow("Account changed");
});
