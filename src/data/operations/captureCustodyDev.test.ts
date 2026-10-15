import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  captureCustodyDevQualified,
  createCaptureCustodyDevAction,
  captureCustodyDevFailure,
} from "./captureCustodyDev";
import {
  captureCustodyDevConfig,
  type CaptureCustodyDevConfiguration,
} from "./captureCustodyDevConfig";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { ApiClientError } from "../api/client";
import { RequestBoundaryError } from "../api/requestBoundary";
import { advanceAccountGeneration } from "../auth/accountGeneration";
const api = vi.hoisted(() => ({ run: vi.fn(), verify: vi.fn() }));
vi.mock("./defaultCaptureCustody", () => ({
  runDefaultCaptureCustodyBatch: api.run,
  verifyDefaultCaptureCustodyBatch: api.verify,
}));
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
  sha256: "a".repeat(64),
  byteCount: 42,
  mediaType: "application/pdf" as const,
};
const two = {
  ...one,
  inputId: randomUUID(),
  captureId: randomUUID(),
  payloadId: randomUUID(),
};
const batch = { batchId: one.batchId, jobId: one.jobId, inputs: [one, two] };
const job = {
  batch: { accountId: one.accountId, batchId: one.batchId, jobId: one.jobId },
  inputs: batch.inputs.map((p) => ({
    id: p.inputId,
    state: "ACCEPTED",
    revision: p.inputRevision,
    captureId: p.captureId,
    payloadId: p.payloadId,
    captureRevision: p.captureRevision,
    contentSha256: p.sha256,
    contentByteCount: p.byteCount,
  })),
} as unknown as CaptureJobReadModel;
let config: CaptureCustodyDevConfiguration;
const receipt = {
  batchId: batch.batchId,
  jobId: batch.jobId,
  inputs: batch.inputs.map((p) => ({
    inputId: p.inputId,
    sha256: p.sha256,
    byteCount: p.byteCount,
  })),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("__DEV__", true);
  config = { batch, expiresAt: new Date(Date.now() + 60000).toISOString() };
  api.run.mockResolvedValue(receipt);
  api.verify.mockResolvedValue(receipt);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("default is CLOSED; production remains CLOSED even with a typed QA config", () => {
  expect(captureCustodyDevConfig).toBeNull();
  expect(captureCustodyDevQualified(null, job)).toBe(false);
  expect(captureCustodyDevQualified(config, job)).toBe(true);
  vi.stubGlobal("__DEV__", false);
  expect(captureCustodyDevQualified(config, job)).toBe(false);
});
it("rejects expired, foreign job/account and changed accepted Input pins", () => {
  expect(
    captureCustodyDevQualified(
      { ...config, expiresAt: new Date(0).toISOString() },
      job,
    ),
  ).toBe(false);
  expect(
    captureCustodyDevQualified(config, {
      ...job,
      batch: { ...job.batch, accountId: randomUUID() },
    }),
  ).toBe(false);
  expect(
    captureCustodyDevQualified(config, {
      ...job,
      batch: { ...job.batch, jobId: randomUUID() },
    }),
  ).toBe(false);
  const changed = structuredClone(job);
  changed.inputs[1].payloadId = randomUUID();
  expect(captureCustodyDevQualified(config, changed)).toBe(false);
});
it("explicit upload and cold GET-only actions dispatch to their existing owning operations", async () => {
  const run = createCaptureCustodyDevAction(config, job, () => true);
  expect(await run("PUT_GET")).toEqual(receipt);
  expect(api.run).toHaveBeenCalledOnce();
  expect(await run("GET_ONLY")).toEqual(receipt);
  expect(api.verify).toHaveBeenCalledOnce();
  expect(api.run).toHaveBeenCalledOnce();
});
it("unmount before lazy import resolves starts no operation", async () => {
  let current = true;
  const run = createCaptureCustodyDevAction(config, job, () => current);
  const pending = run("PUT_GET");
  current = false;
  await expect(pending).rejects.toThrow("DEV_RETIRED");
  expect(api.run).not.toHaveBeenCalled();
});
it("A→B→A generation retirement rejects the old mounted caller", async () => {
  const run = createCaptureCustodyDevAction(config, job, () => true);
  advanceAccountGeneration();
  advanceAccountGeneration();
  await expect(run("GET_ONLY")).rejects.toThrow("Account changed");
  expect(api.verify).not.toHaveBeenCalled();
});
it("expiry during owning await rejects stale success and passes its live check to the runner", async () => {
  api.run.mockImplementationOnce(async (_batch, check) => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(config.expiresAt) + 1);
    check();
    return receipt;
  });
  await expect(
    createCaptureCustodyDevAction(config, job, () => true)("PUT_GET"),
  ).rejects.toThrow("DEV_EXPIRED");
});
it("finite diagnostics preserve known auth/network/identity/hash classes without raw messages", () => {
  expect(captureCustodyDevFailure(Error("synthetic private detail"))).toEqual({
    stage: "UNKNOWN",
    code: "CAPTURE_CUSTODY_UNAVAILABLE",
    status: null,
  });
  expect(
    captureCustodyDevFailure(
      new ApiClientError(
        "synthetic private detail",
        "http",
        401,
        "AUTH_REQUIRED",
      ),
    ),
  ).toEqual({ stage: "AUTH", code: "AUTH_REQUIRED", status: 401 });
  expect(
    captureCustodyDevFailure(new RequestBoundaryError("REQUEST_TIMEOUT")),
  ).toEqual({ stage: "NETWORK", code: "REQUEST_TIMEOUT", status: null });
  expect(
    captureCustodyDevFailure(Error("CAPTURE_CUSTODY_BYTES_INVALID")).stage,
  ).toBe("HASH");
  expect(
    captureCustodyDevFailure(Error("CAPTURE_CUSTODY_INPUT_STALE")).stage,
  ).toBe("IDENTITY");
});

vi.mock("../auth/authRepository", () => ({
  clearLocalSession: vi.fn(),
  readLocalSession: vi.fn(),
  writeLocalSession: vi.fn(),
}));
it("retains finite refresh causes without raw details", async () => {
  const { z } = await import("zod");
  const { SupabaseDevAuthError } = await import("../auth/devSupabaseAuth");
  const wrap = (detail: unknown) =>
    new ApiClientError(
      "private outer",
      "network",
      undefined,
      "AUTH_REFRESH_UNAVAILABLE",
      detail,
    );
  for (const kind of ["network", "temporary", "invalid_session"] as const) {
    expect(
      captureCustodyDevFailure(
        wrap(new SupabaseDevAuthError("private detail", kind, 503)),
      ),
    ).toEqual({
      stage: "AUTH",
      code: `AUTH_REFRESH_UNAVAILABLE_${kind.toUpperCase()}`,
      status: 503,
    });
  }
  for (const status of [99, 600, NaN, 401.5])
    expect(
      captureCustodyDevFailure(
        wrap(new SupabaseDevAuthError("private", "network", status)),
      ).status,
    ).toBeNull();
  const invalid = z.string().safeParse(42);
  if (invalid.success) throw Error("synthetic config must fail");
  expect(captureCustodyDevFailure(wrap(invalid.error))).toEqual({
    stage: "AUTH",
    code: "AUTH_VALIDATION_FAILED",
    status: null,
  });
  const unknown = captureCustodyDevFailure(wrap(new Error("private unknown")));
  expect(unknown).toEqual({
    stage: "AUTH",
    code: "AUTH_REFRESH_UNAVAILABLE",
    status: null,
  });
  expect(JSON.stringify(unknown)).not.toContain("private");
});

it("passes through only the allowlisted Native fetch failure code", () => {
  expect(
    captureCustodyDevFailure(
      new ApiClientError(
        "private",
        "network",
        undefined,
        "NATIVE_FETCH_FAILED",
      ),
    ),
  ).toEqual({ stage: "NETWORK", code: "NATIVE_FETCH_FAILED", status: null });
});
