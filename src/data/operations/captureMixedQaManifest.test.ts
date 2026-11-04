import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  canPrepareMixedQaSourceProposals,
  exportMixedQaManifest,
  prepareMixedQaSourceProposals,
  projectMixedQaManifest,
} from "./captureMixedQaManifest";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
const disk = vi.hoisted(() => ({ construct: vi.fn(), create: vi.fn(), write: vi.fn() }));
const local = vi.hoisted(() => ({ prepare: vi.fn(), account: vi.fn() }));
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: local.account }));
vi.mock("./defaultUniversalOriginalSource", () => ({
  prepareDefaultUniversalLocalSourceProposals: local.prepare,
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: "file:///qa-cache/" },
  File: function (...args: unknown[]) {
    disk.construct(...args);
    return { create: disk.create, write: disk.write };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  local.prepare.mockReset();
  local.account.mockReset().mockResolvedValue(ACTUAL.accountId);
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

// Isolated synthetic C3 identities, never a device/runtime tuple.
const txtFixture = () =>
  ({
    batch: {
      accountId: ACTUAL.accountId,
      batchId: "11111111-1111-4111-8111-111111111111",
      jobId: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-11-05T00:00:00.000Z",
      context: { tripPrior: { id: ACTUAL.tripId } },
    },
    allInputsAccepted: true,
    inputs: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        kind: "FILE",
        acquisitionSource: "files",
        originalFilename: "lantern-qa-garden-walk.txt",
        declaredContentType: "text/plain",
        contentSha256: "54ad166d421325cb12dad3fee8ebfe2d64a81e2980eef2e9115abde87254d647",
        contentByteCount: 77,
        state: "ACCEPTED",
        revision: 3,
        captureId: "44444444-4444-4444-8444-444444444444",
        payloadId: "55555555-5555-4555-8555-555555555555",
        captureRevision: 1,
      },
    ],
  }) as unknown as CaptureJobReadModel;
function txtPins() {
  const model = txtFixture(),
    i = model.inputs[0];
  return {
    ...pinFixture(),
    batchId: model.batch.batchId,
    jobId: model.batch.jobId,
    createdAt: model.batch.createdAt,
    inputs: [
      {
        ...pinFixture().inputs[0],
        inputId: i.id,
        kind: i.kind,
        sha256: i.contentSha256,
        byteCount: i.contentByteCount,
        inputRevision: i.revision,
        captureId: i.captureId,
        payloadId: i.payloadId,
        captureRevision: i.captureRevision,
        currentCaptureRevision: i.captureRevision,
        intakeCaptureRevision: i.captureRevision,
      },
    ],
  } as ReturnType<typeof pinFixture>;
}
it("reuses the explicit local QA action for exactly one independent TXT and exports a separate cache", async () => {
  const model = txtFixture(),
    pins = txtPins(),
    prepare = vi.fn(async () => {});
  expect(projectMixedQaManifest(model)).toBeNull();
  expect(canPrepareMixedQaSourceProposals(model)).toBe(true);
  await exportMixedQaManifest(
    model,
    () => true,
    async () => pins,
  );
  expect(prepare).not.toHaveBeenCalled();
  expect(disk.construct).toHaveBeenCalledExactlyOnceWith(
    "file:///qa-cache/",
    "otr-txt-qa-manifest.json",
  );
  const exported = JSON.parse(disk.write.mock.calls[0][0]);
  expect(exported.inputs).toHaveLength(1);
  expect(exported.batchId).toBe(model.batch.batchId);
  expect(exported.sourcePins.inputs[0].sourceCommand).toBeNull();
  await prepareMixedQaSourceProposals(
    model,
    () => true,
    prepare,
    async () => pins,
  );
  expect(prepare).toHaveBeenCalledExactlyOnceWith(model, expect.any(Function));
});
it.each([
  "account",
  "trip",
  "prior",
  "hash",
  "name",
  "mime",
  "kind",
  "acquisition",
  "bytes",
  "count",
  "state",
  "accepted",
  "batch",
  "job",
  "capture",
  "payload",
  "revision",
  "captureRevision",
])(
  "TXT QA action refuses changed %s before local preparation or cache export",
  async (field) => {
    const model = txtFixture(),
      i = model.inputs[0],
      prepare = vi.fn();
    if (field === "account") model.batch.accountId = "foreign";
    if (field === "trip") model.assignedTripId = "foreign";
    if (field === "prior")
      model.batch.context.tripPrior = {
        id: "foreign",
        origin: "PRIOR",
        observedAt: model.batch.createdAt,
      };
    if (field === "hash") i.contentSha256 = "0".repeat(64);
    if (field === "name") i.originalFilename = "renamed.txt";
    if (field === "mime") i.declaredContentType = "application/pdf";
    if (field === "kind") i.kind = "TEXT";
    if (field === "acquisition") i.acquisitionSource = "magic_input";
    if (field === "bytes") i.contentByteCount = 78;
    if (field === "count") model.inputs = [...model.inputs, { ...i }];
    if (field === "state") i.state = "FAILED";
    if (field === "accepted") model.allInputsAccepted = false;
    if (field === "batch") model.batch.batchId = ACTUAL.batchId;
    if (field === "job") model.batch.jobId = ACTUAL.jobId;
    if (field === "capture") i.captureId = null;
    if (field === "payload") i.payloadId = null;
    if (field === "revision") i.revision = 0;
    if (field === "captureRevision") i.captureRevision = 0;
    expect(canPrepareMixedQaSourceProposals(model)).toBe(false);
    await exportMixedQaManifest(
      model,
      () => true,
      async () => txtPins(),
    );
    await expect(
      prepareMixedQaSourceProposals(
        model,
        () => true,
        prepare,
        async () => txtPins(),
      ),
    ).rejects.toThrow("QA_SOURCE_PREPARE_SCOPE");
    expect(prepare).not.toHaveBeenCalled();
    expect(disk.write).not.toHaveBeenCalled();
  },
);
it("TXT action preserves stale, owning-CAS and UNKNOWN fences and reuses prepared command IDs", async () => {
  const model = txtFixture(),
    prepare = vi.fn(async () => {});
  const pins = txtPins();
  pins.inputs[0].sourceState = "OUTCOME_UNKNOWN";
  await expect(
    prepareMixedQaSourceProposals(
      model,
      () => true,
      prepare,
      async () => pins,
    ),
  ).rejects.toThrow("QA_SOURCE_PREPARE_UNCERTAIN");
  pins.inputs[0].sourceState = "PREPARED";
  await prepareMixedQaSourceProposals(
    model,
    () => true,
    prepare,
    async () => pins,
  );
  expect(prepare).not.toHaveBeenCalled();
  pins.inputs[0].inputRevision++;
  await expect(
    prepareMixedQaSourceProposals(
      model,
      () => true,
      prepare,
      async () => pins,
    ),
  ).rejects.toThrow("QA_SOURCE_PREPARE_SCOPE");
  pins.inputs[0].inputRevision--;
  let current = true;
  await expect(
    prepareMixedQaSourceProposals(
      model,
      () => current,
      prepare,
      async () => {
        current = false;
        return pins;
      },
    ),
  ).rejects.toThrow("QA_SOURCE_PREPARE_SCOPE");
  expect(prepare).not.toHaveBeenCalled();
});
it("TXT cache export cannot run outside its QA bundle or bypass a failed owning bytes reader", async () => {
  const read = vi.fn(async () => txtPins());
  vi.stubEnv("EXPO_PUBLIC_OTR_FORM_SCAN_FIXTURE_BUNDLE", "ordinary");
  expect(canPrepareMixedQaSourceProposals(txtFixture())).toBe(false);
  await exportMixedQaManifest(txtFixture(), () => true, read);
  expect(read).not.toHaveBeenCalled();
  vi.stubEnv("EXPO_PUBLIC_OTR_FORM_SCAN_FIXTURE_BUNDLE", "com.xoery.otrmobile.ipadqa");
  await expect(
    exportMixedQaManifest(
      txtFixture(),
      () => true,
      async () => {
        throw Error("UNIVERSAL_CAPTURE_INPUT_CHANGED");
      },
    ),
  ).rejects.toThrow("UNIVERSAL_CAPTURE_INPUT_CHANGED");
  expect(disk.write).not.toHaveBeenCalled();
});

it("the default TXT button calls only the existing pure-local owner and propagates missing Actor", async () => {
  await prepareMixedQaSourceProposals(
    txtFixture(),
    () => true,
    undefined,
    async () => txtPins(),
  );
  expect(local.prepare).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId: ACTUAL.accountId, tripId: ACTUAL.tripId }),
    expect.objectContaining({
      batch: expect.objectContaining({ batchId: txtFixture().batch.batchId }),
    }),
    expect.objectContaining({
      getAccountId: local.account,
      assertCurrent: expect.any(Function),
    }),
  );
  local.prepare.mockRejectedValue(Error("CAPTURE_SOURCE_TRIP_ACCESS"));
  await expect(
    prepareMixedQaSourceProposals(
      txtFixture(),
      () => true,
      undefined,
      async () => txtPins(),
    ),
  ).rejects.toThrow("CAPTURE_SOURCE_TRIP_ACCESS");
  local.prepare.mockClear();
  local.account.mockResolvedValue("00000000-0000-4000-8000-000000000099");
  await expect(
    prepareMixedQaSourceProposals(
      txtFixture(),
      () => true,
      undefined,
      async () => txtPins(),
    ),
  ).rejects.toThrow("QA_SOURCE_PREPARE_SCOPE");
  expect(local.prepare).not.toHaveBeenCalled();
});

it("real local TXT proposal/cache survives disk reopen with the same command and no Run/Task proof", async () => {
  const {
    fixture: captureFixture,
    sha256,
    now,
  } = await import("../repositories/__fixtures__/captureBatchAssessment");
  const { createCaptureSourceAdmissionRepository } =
    await import("../repositories/captureSourceAdmissionRepository");
  const { UTF8_TEXT_FILE_PROFILE } = await import("@/domain/capture/utf8TextFile");
  const {
    prepareUniversalOriginalBatch,
    recoverUniversalOriginalPlans,
    readUniversalOriginalPins,
  } = await import("./universalOriginalBatch");
  const f = captureFixture(true, 76);
  await f.switchTo(ACTUAL.accountId);
  const request = f.request();
  request.context.tripPrior = {
    id: ACTUAL.tripId,
    origin: "PRIOR",
    observedAt: request.createdAt,
  };
  Object.assign(request.inputs[0], {
    kind: "FILE",
    acquisitionSource: "files",
    originalFilename: "lantern-qa-garden-walk.txt",
    declaredContentType: "text/plain",
  });
  // Exact approved77B specimen, self-contained: integration needs no docs fixture leaf.
  const bytes = new TextEncoder().encode(
    "Synthetic QA only\nActivity: Lantern QA Garden Walk\nActivity date: 2026-11-06\n",
  );
  const model = await f.submissions.submit(
    request,
    new Map([[request.inputs[0].id, async () => ({ bytes })]]),
  );
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(ACTUAL.accountId, ACTUAL.tripId, now());
  const sources = createCaptureSourceAdmissionRepository(f.db, f.getAccount, {
    sha256,
    now,
    newId: randomUUID,
    handoff: f.captures.getForSourceHandoff,
    readSelectedMaterial: async () => null,
    utf8FileProfile: UTF8_TEXT_FILE_PROFILE,
  });
  const context = await sources.captureContext(ACTUAL.tripId);
  const deps = {
    getAccountId: f.getAccount,
    hash: sha256,
    submissions: f.submissions,
    captures: f.captures,
    sources,
    newId: randomUUID,
  };
  const readPins = async () =>
    readUniversalOriginalPins(context, request.jobId, {
      ...deps,
      includeSourceCommands: true,
    });
  const prepare = vi.fn(async () => {
    await prepareUniversalOriginalBatch(
      context,
      request.jobId,
      await recoverUniversalOriginalPlans(context, request.jobId, deps),
      deps,
    );
  });
  expect(canPrepareMixedQaSourceProposals(model)).toBe(true);
  await prepareMixedQaSourceProposals(model, () => true, prepare, readPins);
  await exportMixedQaManifest(model, () => true, readPins);
  const first = disk.write.mock.calls.at(-1)![0];
  const parsed = JSON.parse(first);
  expect(parsed.sourcePins.qualification).toBe(
    "LOCAL_C3_AND_EXISTING_COMMANDS_ONLY_NOT_SOURCE_PROOF",
  );
  expect(parsed.sourcePins.inputs[0]).toMatchObject({
    sourceState: "PREPARED",
    intakeCaptureRevision: 1,
    currentCaptureRevision: 2,
    sha256: txtFixture().inputs[0].contentSha256,
  });
  const command = parsed.sourcePins.inputs[0].sourceCommand;
  expect(command.payload.source_input).toMatchObject({
    source_kind: "FILE",
    acquisition_channel: "FILES",
  });
  expect(command.payload.original).toMatchObject({
    byte_count: 77,
    text_content: new TextDecoder().decode(bytes),
  });
  f.reopen();
  await prepareMixedQaSourceProposals(model, () => true, prepare, readPins);
  await exportMixedQaManifest(model, () => true, readPins);
  expect(disk.write.mock.calls.at(-1)![0]).toEqual(first);
  expect(prepare).toHaveBeenCalledOnce();
  expect(
    f.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE operation_type='C_ADMIT_CAPTURE_SOURCE'",
      )
      .get()!.n,
  ).toBe(1);
  expect(f.sql.prepare("SELECT count(*) AS n FROM trip_source_runs").get()!.n).toBe(0);
  const bindingId = parsed.sourcePins.inputs[0].bindingId;
  await sources.markUnknown(context, bindingId, 1);
  await expect(
    prepareMixedQaSourceProposals(model, () => true, prepare, readPins),
  ).rejects.toThrow();
  expect(prepare).toHaveBeenCalledOnce();
  await f.switchTo(randomUUID());
  await expect(exportMixedQaManifest(model, () => true, readPins)).rejects.toThrow();
});
