import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exportMixedQaManifest, projectMixedQaManifest } from "./captureMixedQaManifest";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
const disk = vi.hoisted(() => ({ construct: vi.fn(), create: vi.fn(), write: vi.fn() }));
vi.mock("expo-file-system", () => ({
  Paths: { cache: "file:///qa-cache/" },
  File: function (...args: unknown[]) {
    disk.construct(...args);
    return { create: disk.create, write: disk.write };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EXPO_PUBLIC_OTR_FORM_SCAN_FIXTURE_BUNDLE", "com.xoery.otrmobile.ipadqa");
});
afterEach(() => vi.unstubAllEnvs());
const fixture = () =>
  ({
    batch: {
      accountId: "1f3d7935-1bdc-4952-8d7f-0f72077368c1",
      batchId: "batch",
      jobId: "job",
      createdAt: "2026-11-03T21:18:03.123Z",
      context: { tripPrior: { id: "8b5ceb55-b3c2-462a-9a15-59de91fdabe5" } },
    },
    allInputsAccepted: true,
    inputs: [
      ["078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515", 42630],
      ["f58061aa535c7a5585c4c953890c5d387cf20656cca7129e36861beb82ee1758", 1676],
      ["d261e11d15303616d8ead07eb8d9b8ff2332d5242514ab10ca5f41abfaf62cb9", 92],
    ].map(([contentSha256, contentByteCount], n) => ({
      id: String(n),
      contentSha256,
      contentByteCount,
      privateBody: "must not export",
      originalFilename: "PRIVATE_FILENAME_CANARY",
    })),
  }) as unknown as CaptureJobReadModel;
it("projects only the approved exact batch metadata, never arbitrary fields", () => {
  const q = fixture();
  const result = projectMixedQaManifest(q);
  expect(result?.inputs).toHaveLength(3);
  expect(result?.batchId).toBe("batch");
  expect(JSON.stringify(result)).not.toContain("must not export");
  expect(JSON.stringify(result)).not.toContain("PRIVATE_FILENAME_CANARY");
  expect(q.inputs[0]).toHaveProperty("privateBody");
});
it("rejects another account, trip, timestamp, incomplete or altered roster", () => {
  for (const mutate of [
    (q: CaptureJobReadModel) => {
      q.batch.accountId = "foreign";
    },
    (q: CaptureJobReadModel) => {
      q.assignedTripId = "foreign";
    },
    (q: CaptureJobReadModel) => {
      q.batch.createdAt = "2026-11-03T22:18:03Z";
    },
    (q: CaptureJobReadModel) => {
      q.allInputsAccepted = false;
    },
    (q: CaptureJobReadModel) => {
      q.inputs = [q.inputs[0], q.inputs[0], q.inputs[2]];
    },
    (q: CaptureJobReadModel) => {
      q.inputs = [...q.inputs, { ...q.inputs[0] }];
    },
  ]) {
    const q = fixture();
    mutate(q);
    expect(projectMixedQaManifest(q)).toBeNull();
  }
});

it("ordinary hosts and stale invocations never touch disk", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_FORM_SCAN_FIXTURE_BUNDLE", "ordinary-host");
  await exportMixedQaManifest(fixture(), () => true);
  vi.stubEnv("EXPO_PUBLIC_OTR_FORM_SCAN_FIXTURE_BUNDLE", "com.xoery.otrmobile.ipadqa");
  await exportMixedQaManifest(fixture(), () => false);
  expect(disk.construct).not.toHaveBeenCalled();
});
it("invalidation while awaiting filesystem import prevents writing", async () => {
  let checks = 0;
  await exportMixedQaManifest(fixture(), () => ++checks === 1);
  expect(checks).toBe(2);
  expect(disk.construct).not.toHaveBeenCalled();
  expect(disk.write).not.toHaveBeenCalled();
});
it("matching QA writes only the expected cache metadata once", async () => {
  const model = fixture();
  await exportMixedQaManifest(model, () => true);
  expect(disk.construct).toHaveBeenCalledExactlyOnceWith(
    "file:///qa-cache/",
    "otr-mixed-qa-manifest.json",
  );
  expect(disk.create).toHaveBeenCalledExactlyOnceWith({ overwrite: true });
  expect(disk.write).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify(projectMixedQaManifest(model)),
  );
});
