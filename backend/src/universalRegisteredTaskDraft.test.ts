import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  prepareUniversalDispatch,
  UNIVERSAL_IMPORT_VERSION,
  type BoundRepresentation,
} from "./universalImport";
import { buildUniversalDeepSeekRequest } from "./universalProviderRequest";
import { COMPACT_PROMPT_VERSION } from "../frozen-workbench/scripts/import-workbench/real-llm-compact";
import { universalInstruction, universalAdvisoryInstruction } from "./universalPrompt";
import { buildUniversalRegisteredTaskDraft } from "./universalRegisteredTaskDraft";
function fixture(n = 1) {
  const actorId = randomUUID(),
    tripId = randomUUID(),
    batchId = randomUUID();
  const representations = Array.from({ length: n }, (_, i) => {
    const bytes = Buffer.from(`Synthetic ${i} 中文行程`);
    return {
      accountId: actorId,
      tripId,
      batchId,
      inputId: randomUUID(),
      sourceId: randomUUID(),
      representationId: randomUUID(),
      revision: 1,
      originalSha256: createHash("sha256").update(bytes).digest("hex"),
      mime: "text/plain",
      bytes,
    };
  }).sort((a, b) => a.inputId.localeCompare(b.inputId));
  const binding = {
    actorId,
    tripId,
    batchId,
    runId: randomUUID(),
    taskId: randomUUID(),
    submissionSha256: "a".repeat(64),
    generation: 2,
    createdAt: new Date().toISOString(),
    inputs: representations.map((r) => ({
      id: r.inputId,
      source_id: r.sourceId,
      material_revision: 1,
      representation_id: r.representationId,
      payload_sha256: r.originalSha256,
      byte_count: r.bytes.length,
      observed_source_row_revision: 1,
      historical_selection: false as const,
    })),
  };
  const selection = {
    integrationId: "synthetic",
    configVersion: 2,
    configurationSha256: "c".repeat(64),
    providerConfigId: randomUUID(),
    priceScheduleId: randomUUID(),
    providerId: "DeepSeek" as const,
    modelId: "deepseek-flash" as const,
    modelVersion: "DeepSeek-V4.1-Flash" as const,
    adapterVersion: "synthetic",
    region: "synthetic",
    route: "synthetic",
    maxCostNanos: "1000000000",
    taskLifetimeMs: 600000,
  };
  return {
    binding,
    manifest: { accountId: actorId, tripId, batchId, representations },
    selection,
  };
}
it.each([1, 3, 6])(
  "constructs deterministic %s-Source normal Task using actual Run identities without finite QA assumptions",
  async (n) => {
    const f = fixture(n),
      a = await buildUniversalRegisteredTaskDraft(f.binding, f.manifest, f.selection),
      b = await buildUniversalRegisteredTaskDraft(f.binding, f.manifest, f.selection);
    expect(a).toEqual(b);
    expect(a.task.input_pins).toHaveLength(n);
    expect(a.task.run_id).toBe(f.binding.runId);
    expect(a.task.expected_run_generation).toBe(2);
    expect(a.task.sync_operation_id).toBeNull();
    expect(a.attempt.attempt_sequence).toBe(1);
    expect(a.task.policy_snapshot.deadline).toBe(
      new Date(Date.parse(f.binding.createdAt) + 600000).toISOString(),
    );
  },
);
it("rejects changed Source/representation bytes before creating Task or Provider work", async () => {
  const f = fixture();
  f.manifest.representations[0].bytes = Buffer.from("changed");
  await expect(
    buildUniversalRegisteredTaskDraft(f.binding, f.manifest, f.selection),
  ).rejects.toThrow("SOURCE_BINDING");
});
it("accepts owning PostgreSQL offset timestamps without losing fractional evidence or changing Task identity", async () => {
  const f = fixture(2);
  f.binding.createdAt = "2026-10-25T08:55:01.123456Z";
  const expected = await buildUniversalRegisteredTaskDraft(
    f.binding,
    f.manifest,
    f.selection,
  );
  for (const stamp of [
    "2026-10-25T08:55:01.123456+00:00",
    "2026-10-25T21:55:01.123456+13:00",
  ]) {
    const actual = await buildUniversalRegisteredTaskDraft(
      { ...f.binding, createdAt: stamp },
      f.manifest,
      f.selection,
    );
    expect(actual).toEqual(expected);
    expect(actual.task.created_at).toBe("2026-10-25T08:55:01.123456Z");
    expect(actual.attempt.updated_at).toBe(actual.task.created_at);
  }
});
it("keeps a qualified PDF derivative transform in the existing Task pin without replacing its original identity", async () => {
  const f = fixture();
  const { PDF_V2_OPTIONS_SHA } = await import("./sourcePdfV2Contracts");
  const pdfSource = {
    original: { representationId: randomUUID(), sha256: "d".repeat(64), byteCount: 1700 },
    sealSha256: "e".repeat(64),
    pageMapSha256: "f".repeat(64),
    transformOptionsSha256: PDF_V2_OPTIONS_SHA,
  };
  const draft = await buildUniversalRegisteredTaskDraft(
    { ...f.binding, inputs: [{ ...f.binding.inputs[0], pdfSource }] },
    { ...f.manifest, representations: [{ ...f.manifest.representations[0], pdfSource }] },
    f.selection,
  );
  expect(draft.task.input_pins[0]).toMatchObject({
    representation_id: f.binding.inputs[0].representation_id,
    payload_sha256: f.binding.inputs[0].payload_sha256,
    transform_sha256: PDF_V2_OPTIONS_SHA,
  });
});

it("rejects a normalized PDF binding whose original proof differs from the owning manifest", async () => {
  const f = fixture(),
    { PDF_V2_OPTIONS_SHA } = await import("./sourcePdfV2Contracts");
  const pdfSource = {
    original: { representationId: randomUUID(), sha256: "d".repeat(64), byteCount: 1700 },
    sealSha256: "e".repeat(64),
    pageMapSha256: "f".repeat(64),
    transformOptionsSha256: PDF_V2_OPTIONS_SHA,
  };
  const binding = { ...f.binding, inputs: [{ ...f.binding.inputs[0], pdfSource }] };
  Object.assign(f.manifest.representations[0], {
    pdfSource: { ...pdfSource, sealSha256: "a".repeat(64) },
  });
  await expect(
    buildUniversalRegisteredTaskDraft(binding, f.manifest, f.selection),
  ).rejects.toThrow("SOURCE_BINDING");
});

function imageFixture() {
  const f = fixture();
  const r = f.manifest.representations[0];
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    "base64",
  );
  r.mime = "image/png";
  r.bytes = bytes;
  r.originalSha256 = createHash("sha256").update(bytes).digest("hex");
  f.binding.inputs[0].payload_sha256 = r.originalSha256;
  f.binding.inputs[0].byte_count = bytes.length;
  return f;
}

it("pins one owning original PNG as image input without an invented extraction receipt", async () => {
  const f = imageFixture();
  const r = f.manifest.representations[0];
  const bytes = r.bytes;
  const first = await buildUniversalRegisteredTaskDraft(
    f.binding,
    f.manifest,
    f.selection,
  );
  expect(first).toEqual(
    await buildUniversalRegisteredTaskDraft(f.binding, f.manifest, f.selection),
  );
  expect(first.attempt.descriptor_snapshot.modalities).toEqual(["IMAGE"]);
  expect(first.task.input_pins[0]).toMatchObject({
    payload_sha256: r.originalSha256,
    byte_count: bytes.length,
    transform_sha256: null,
  });
  expect(JSON.parse(first.marker.toString()).sourceBindings[0]).toMatchObject({
    mime: "image/png",
    originalSha256: r.originalSha256,
    submittedSha256: r.originalSha256,
    status: "READY",
  });
});

it("transmits the original PNG inline with its exact source alias/hash and no OCR replacement", () => {
  const f = imageFixture();
  const r = f.manifest.representations[0];
  const dispatch = prepareUniversalDispatch(
    f.binding.actorId,
    f.binding.batchId,
    {
      version: UNIVERSAL_IMPORT_VERSION,
      tripId: f.binding.tripId,
      taskId: f.binding.taskId,
    },
    f.manifest,
  );
  expect(dispatch.ready[0]).toMatchObject({
    operations: [],
    bytes: r.bytes,
    submittedSha256: r.originalSha256,
  });
  const request = buildUniversalDeepSeekRequest({
    taskId: f.binding.taskId,
    actorId: f.binding.actorId,
    accountId: f.binding.actorId,
    tripId: f.binding.tripId,
    batchId: f.binding.batchId,
    promptVersion: COMPACT_PROMPT_VERSION,
    instruction: universalInstruction,
    advisoryInstruction: universalAdvisoryInstruction,
    sources: dispatch.ready.map((p, index) => ({
      index,
      sourceId: p.sourceId,
      mime: p.mime,
      modality: p.modality as "TEXT" | "IMAGE",
      sha256: p.submittedSha256,
      bytes: p.bytes,
    })),
  });
  const body = JSON.parse(request.body);
  expect(request.imageCount).toBe(1);
  expect(body.messages[1].content).toEqual([
    { type: "text", text: expect.stringContaining("pixel regions") },
    {
      type: "text",
      text: `SOURCE 0 S0 MIME image/png MODALITY IMAGE SHA256 ${r.originalSha256}\n`,
    },
    {
      type: "image_url",
      image_url: { url: `data:image/png;base64,${r.bytes.toString("base64")}` },
    },
  ]);
});

it.each([
  "mixed",
  "second-image",
  "oversize",
  "changed-bytes",
  "raw-jpeg",
  "bad-prepared",
])("rejects %s before producing a paid image Task", async (failure) => {
  const f = imageFixture();
  const r = f.manifest.representations[0];
  let error = "ORIGINAL_PREFLIGHT_NOT_READY";
  if (failure === "mixed" || failure === "second-image") {
    const other = fixture().manifest.representations[0];
    Object.assign(other, {
      accountId: r.accountId,
      tripId: r.tripId,
      batchId: r.batchId,
    });
    if (failure === "second-image")
      Object.assign(other, {
        mime: r.mime,
        bytes: r.bytes,
        originalSha256: r.originalSha256,
      });
    f.manifest.representations.push(other);
    f.binding.inputs.push({
      ...f.binding.inputs[0],
      id: other.inputId,
      source_id: other.sourceId,
      representation_id: other.representationId,
      payload_sha256: other.originalSha256,
      byte_count: other.bytes.length,
    });
    error = "UNIVERSAL_ORIGINAL_IMAGE_BOUND";
  } else if (failure === "oversize") {
    r.bytes = Buffer.alloc(4194305);
    r.originalSha256 = createHash("sha256").update(r.bytes).digest("hex");
    Object.assign(f.binding.inputs[0], {
      payload_sha256: r.originalSha256,
      byte_count: r.bytes.length,
    });
    error = "4194304";
  } else if (failure === "changed-bytes") {
    r.bytes = Buffer.from("changed");
    error = "SOURCE_BINDING";
  } else if (failure === "raw-jpeg") r.mime = "image/jpeg";
  else
    (r as BoundRepresentation).prepared = {
      bytes: r.bytes,
      mime: "image/jpeg",
      originalSha256: r.originalSha256,
      submittedSha256: "f".repeat(64),
      operations: ["UNVERIFIED"],
    };
  await expect(
    buildUniversalRegisteredTaskDraft(f.binding, f.manifest, f.selection),
  ).rejects.toThrow(error);
});
