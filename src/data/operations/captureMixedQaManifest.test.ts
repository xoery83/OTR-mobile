import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  exportMixedQaManifest,
  prepareMixedQaSourceProposals,
  projectMixedQaManifest,
} from "./captureMixedQaManifest";
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
const ACTUAL = {
  accountId: "1f3d7935-1bdc-4952-8d7f-0f72077368c1",
  tripId: "8b5ceb55-b3c2-462a-9a15-59de91fdabe5",
  batchId: "39fe2a07-f946-47ff-b152-ebdfdaacda42",
  jobId: "8930950b-1722-4553-b937-fe3a6fd8709c",
  createdAt: "2026-11-03T21:18:03.028Z",
  inputs: [
    {
      id: "1b4ade7a-f8bb-430b-8638-68adbc79e8fd",
      kind: "FILE",
      contentSha256: "f58061aa535c7a5585c4c953890c5d387cf20656cca7129e36861beb82ee1758",
      contentByteCount: 1676,
      revision: 3,
      captureId: "ffe32198-f6e8-4019-9f67-f2dec542769e",
      payloadId: "eb3ab581-f10f-4a90-901b-cb82d29df2f4",
      captureRevision: 1,
    },
    {
      id: "19c4ddbe-e058-495c-a0d1-2b24bbae168b",
      kind: "FILE",
      contentSha256: "078de830361d65bb3890b43fb30646aa6e6ebfa7088a0f2dc4c7bd7b343fa515",
      contentByteCount: 42630,
      revision: 3,
      captureId: "dfe796f6-8559-4db1-a0a9-ca4e473e2155",
      payloadId: "ccda88fb-8fa5-4d92-b1db-e937d91ec64e",
      captureRevision: 1,
    },
    {
      id: "bcc754df-1493-4cb4-813e-379ca589402c",
      kind: "TEXT",
      contentSha256: "d261e11d15303616d8ead07eb8d9b8ff2332d5242514ab10ca5f41abfaf62cb9",
      contentByteCount: 92,
      revision: 3,
      captureId: "2b114728-f8ea-4534-aa9c-3c8cbd928fbd",
      payloadId: "1c2114d2-1066-4067-8fcb-2fdbd9c6c3f0",
      captureRevision: 1,
    },
  ],
};
const fixture = () =>
  ({
    batch: {
      accountId: ACTUAL.accountId,
      batchId: ACTUAL.batchId,
      jobId: ACTUAL.jobId,
      createdAt: ACTUAL.createdAt,
      context: { tripPrior: { id: ACTUAL.tripId } },
    },
    allInputsAccepted: true,
    inputs: ACTUAL.inputs.map((i) => ({
      ...i,
      privateBody: "must not export",
      originalFilename: "PRIVATE_FILENAME_CANARY",
    })),
  }) as unknown as CaptureJobReadModel;
const pinFixture = () =>
  ({
    accountId: ACTUAL.accountId,
    tripId: ACTUAL.tripId,
    batchId: ACTUAL.batchId,
    jobId: ACTUAL.jobId,
    createdAt: ACTUAL.createdAt,
    inputs: ACTUAL.inputs.map((i) => ({
      inputId: i.id,
      kind: i.kind,
      inputRevision: i.revision,
      captureId: i.captureId,
      payloadId: i.payloadId,
      captureRevision: i.captureRevision,
      currentCaptureRevision: i.captureRevision,
      intakeCaptureRevision: i.captureRevision,
      captureTripId: null,
      sha256: i.contentSha256,
      byteCount: i.contentByteCount,
      sourceState: "SOURCE_OPERATION_NOT_PREPARED",
      sourceCommandPin: null,
      sourceCommand: null,
    })),
  }) as unknown as Awaited<
    ReturnType<NonNullable<Parameters<typeof exportMixedQaManifest>[2]>>
  >;
it("projects only the approved exact batch metadata, never arbitrary fields", () => {
  const q = fixture();
  const result = projectMixedQaManifest(q);
  expect(result?.inputs).toHaveLength(3);
  expect(result?.batchId).toBe(ACTUAL.batchId);
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
  await exportMixedQaManifest(
    fixture(),
    () => ++checks === 1,
    async () => pinFixture(),
  );
  expect(checks).toBe(2);
  expect(disk.construct).not.toHaveBeenCalled();
  expect(disk.write).not.toHaveBeenCalled();
});
it("matching QA writes only the expected cache metadata once", async () => {
  const model = fixture();
  await exportMixedQaManifest(
    model,
    () => true,
    async () => pinFixture(),
  );
  expect(disk.construct).toHaveBeenCalledExactlyOnceWith(
    "file:///qa-cache/",
    "otr-mixed-qa-manifest.json",
  );
  expect(disk.create).toHaveBeenCalledExactlyOnceWith({ overwrite: true });
  expect(disk.write).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({ ...projectMixedQaManifest(model), sourcePins: pinFixture() }),
  );
});

it("never exports pins from another batch, changed input or late account", async () => {
  for (const mutate of [
    (p: ReturnType<typeof pinFixture>) => {
      p.batchId = "other";
    },
    (p: ReturnType<typeof pinFixture>) => {
      p.inputs[0].sha256 = "0".repeat(64);
    },
    (p: ReturnType<typeof pinFixture>) => {
      p.inputs[1].inputId = p.inputs[0].inputId;
    },
  ]) {
    const pins = pinFixture();
    mutate(pins);
    await exportMixedQaManifest(
      fixture(),
      () => true,
      async () => pins,
    );
  }
  let current = true;
  await exportMixedQaManifest(
    fixture(),
    () => current,
    async () => {
      current = false;
      return pinFixture();
    },
  );
  expect(disk.write).not.toHaveBeenCalled();
});
it("does not substitute generated IDs when the owning reader fails", async () => {
  await expect(
    exportMixedQaManifest(
      fixture(),
      () => true,
      async () => {
        throw Error("SOURCE_OPERATION_NOT_PREPARED");
      },
    ),
  ).rejects.toThrow("SOURCE_OPERATION_NOT_PREPARED");
  expect(disk.write).not.toHaveBeenCalled();
});
it("exports only owning prepared proposals and keeps missing commands explicit", async () => {
  const pins = pinFixture();
  Object.assign(pins.inputs[2], {
    sourceState: "PREPARED",
    sourceCommandPin: { operationId: "retained-only" },
    sourceCommand: {
      operation_id: "retained-only",
      payload: { text: "approved synthetic92bytes" },
    },
  });
  await exportMixedQaManifest(
    fixture(),
    () => true,
    async () => pins,
  );
  const saved = JSON.parse(disk.write.mock.calls[0][0]);
  expect(saved.sourcePins.inputs[0].sourceState).toBe("SOURCE_OPERATION_NOT_PREPARED");
  expect(saved.sourcePins.inputs[2].sourceCommand.operation_id).toBe("retained-only");
  expect(JSON.stringify(saved)).not.toContain("PRIVATE_FILENAME_CANARY");
});

it.each(["inputRevision", "captureId", "payloadId", "captureRevision", "kind"])(
  "rejects same-byte owning %s drift before export",
  async (field) => {
    const pins = pinFixture();
    Object.assign(pins.inputs[0], {
      [field]: field.includes("Revision") ? 99 : "different",
    });
    await exportMixedQaManifest(
      fixture(),
      () => true,
      async () => pins,
    );
    expect(disk.write).not.toHaveBeenCalled();
  },
);
it("rejects kind or Input CAS drift already present in the original model", () => {
  for (const field of ["kind", "revision", "captureId", "payloadId", "captureRevision"]) {
    const model = fixture();
    Object.assign(model.inputs[0], {
      [field]: field.toLowerCase().includes("revision") ? 99 : "different",
    });
    expect(projectMixedQaManifest(model)).toBeNull();
  }
});

const assignedPins = () => {
  const pins = pinFixture();
  Object.assign(pins.inputs[0], {
    captureRevision: 2,
    currentCaptureRevision: 2,
    intakeCaptureRevision: 1,
    captureTripId: ACTUAL.tripId,
    sourceState: "PREPARED",
    bindingId: "retained-binding",
    queueOperationId: "retained-queue",
    sourceCommandPin: { operationId: "retained-op" },
    sourceCommand: { operation_id: "retained-op" },
    bindingCas: { captureRevision: 2 },
  });
  return pins;
};
it("retains intake revision1 while exporting an owning prepared assignment at revision2", async () => {
  const pins = assignedPins();
  await exportMixedQaManifest(
    fixture(),
    () => true,
    async () => pins,
  );
  const saved = JSON.parse(disk.write.mock.calls[0][0]);
  expect(saved.inputs[0].captureRevision).toBe(1);
  expect(saved.sourcePins.inputs[0]).toMatchObject({
    intakeCaptureRevision: 1,
    currentCaptureRevision: 2,
    captureRevision: 2,
  });
});
it.each([
  { captureRevision: 3, currentCaptureRevision: 3 },
  { intakeCaptureRevision: 2 },
  { captureTripId: "foreign" },
  { sourceState: "OUTCOME_UNKNOWN" },
  { bindingId: null },
  { queueOperationId: null },
  { sourceCommand: null },
  { bindingCas: { captureRevision: 1 } },
])("refuses unproven same-byte assignment (%#)", async (change) => {
  const pins = assignedPins();
  Object.assign(pins.inputs[0], change);
  await exportMixedQaManifest(
    fixture(),
    () => true,
    async () => pins,
  );
  expect(disk.write).not.toHaveBeenCalled();
});

it("rejects foreign current capture Trip even before assignment at revision1", async () => {
  const pins = pinFixture();
  Object.assign(pins.inputs[0], { captureTripId: "foreign" });
  await exportMixedQaManifest(
    fixture(),
    () => true,
    async () => pins,
  );
  expect(disk.write).not.toHaveBeenCalled();
});

it("prepares only after an explicit exact QA request, never during export", async () => {
  const prepare = vi.fn(async () => {});
  await prepareMixedQaSourceProposals(
    fixture(),
    () => true,
    prepare,
    async () => pinFixture(),
  );
  expect(prepare).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    expect.any(Function),
  );
  const bad = fixture();
  bad.batch.jobId = "foreign";
  await expect(
    prepareMixedQaSourceProposals(
      bad,
      () => true,
      prepare,
      async () => pinFixture(),
    ),
  ).rejects.toThrow("QA_SOURCE_PREPARE_SCOPE");
  await expect(
    prepareMixedQaSourceProposals(
      fixture(),
      () => false,
      prepare,
      async () => pinFixture(),
    ),
  ).rejects.toThrow("QA_SOURCE_PREPARE_SCOPE");
  vi.stubEnv("EXPO_PUBLIC_OTR_FORM_SCAN_FIXTURE_BUNDLE", "ordinary");
  await expect(
    prepareMixedQaSourceProposals(
      fixture(),
      () => true,
      prepare,
      async () => pinFixture(),
    ),
  ).rejects.toThrow("QA_SOURCE_PREPARE_SCOPE");
  expect(prepare).toHaveBeenCalledTimes(1);
});
it("drops stale preparation completion and preserves the owning failure", async () => {
  let current = true;
  await expect(
    prepareMixedQaSourceProposals(
      fixture(),
      () => current,
      async () => {
        current = false;
      },
      async () => pinFixture(),
    ),
  ).rejects.toThrow("UNIVERSAL_CAPTURE_STALE");
  await expect(
    prepareMixedQaSourceProposals(
      fixture(),
      () => true,
      async () => {
        throw Error("LOCAL_ONLY_FAILURE");
      },
      async () => pinFixture(),
    ),
  ).rejects.toThrow("LOCAL_ONLY_FAILURE");
  expect(disk.write).not.toHaveBeenCalled();
});

it("never prepares retained UNKNOWN or repeats already prepared proposals", async () => {
  const prepare = vi.fn(async () => {});
  const pins = pinFixture();
  Object.assign(pins.inputs[0], { sourceState: "OUTCOME_UNKNOWN" });
  await expect(
    prepareMixedQaSourceProposals(
      fixture(),
      () => true,
      prepare,
      async () => pins,
    ),
  ).rejects.toThrow("QA_SOURCE_PREPARE_UNCERTAIN");
  for (const i of pins.inputs) Object.assign(i, { sourceState: "PREPARED" });
  await prepareMixedQaSourceProposals(
    fixture(),
    () => true,
    prepare,
    async () => pins,
  );
  expect(prepare).not.toHaveBeenCalled();
});
