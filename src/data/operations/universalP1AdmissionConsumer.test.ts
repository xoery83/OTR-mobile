import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  readUniversalP1ReviewOriginal,
  createUniversalP1AdmissionConsumer,
} from "./universalP1AdmissionConsumer";
import { universalP1SourceFixture } from "../../../backend/src/__fixtures__/universalP1Source";
import { validateCoreCommand } from "../../domain/trip/tripCoreV2Commands";
import type { CaptureJobReadModel } from "../../domain/capture/captureSubmission";
import type { UniversalImportResult } from "../api/universalImportContracts";
async function fixture(family: "P1" | "P3" = "P1") {
  const f = await universalP1SourceFixture(undefined, undefined, "2026-11-03", family),
    p = await f.run(),
    plan = p.body.plan,
    slot = plan.slots[0],
    result = f.input.result as UniversalImportResult;
  const command = validateCoreCommand({
    contractVersion: 2,
    intentVersion: 2,
    operationId: slot.operationId,
    tripId: result.tripId,
    command: slot.command,
    target: slot.target,
    baseVector: slot.baseVector,
    admission: {
      mode: "REVIEWED_SOURCE",
      sourceIntentId: slot.slotId,
      policyVersion: null,
    },
    payload: slot.payload,
  });
  const model = {
    allInputsAccepted: true,
    batch: {
      accountId: result.accountId,
      batchId: result.batchId,
      context: { tripPrior: { id: result.tripId } },
    },
    inputs: result.sourceBindings.map((b) => ({
      id: b.inputId,
      state: "ACCEPTED",
      contentSha256: b.originalSha256,
    })),
  } as unknown as CaptureJobReadModel;
  const core = {
    enqueue: vi.fn(async () => ({})),
    resume: vi.fn(async () => {}),
    applyReceipt: vi.fn(),
    refresh: vi.fn(),
  };
  const transport = {
    publishUniversalP1: vi.fn(async () => ({
      captureVersion: 2,
      status: "CANDIDATE_SEALED",
      proposedPlan: plan,
      candidateSha256: p.candidateSha256,
      grantsAdmission: false,
    })),
    prepareSourcePlan: vi.fn(async () => ({
      readyCommands: [command],
      plan: { slots: [] },
      reviewSlots: [],
    })),
    receipt: vi.fn(),
    finalizeSourceSlot: vi.fn(async () => ({ state: "COMPLETE" })),
  };
  let current = true;
  const consumer = createUniversalP1AdmissionConsumer({
    getAccountId: async () => result.accountId,
    isCurrent: () => current,
    core: core as never,
    transport: transport as never,
  });
  return {
    f,
    result,
    model,
    core,
    transport,
    consumer,
    command,
    slot,
    close: () => {
      current = false;
    },
  };
}
it("enqueues only the confirmed P1 via Source Prepare, never Manual or automatic save", async () => {
  const f = await fixture();
  expect(f.core.enqueue).not.toHaveBeenCalled();
  const r = await f.consumer.confirm(f.model, f.result, "walk");
  expect(r.status).toBe("SYNC_PENDING");
  expect(f.core.enqueue).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId: f.result.accountId }),
    f.command,
  );
  expect(f.transport.receipt).not.toHaveBeenCalled();
  expect(f.core.applyReceipt).not.toHaveBeenCalled();
});
it.each(["manual", "target", "extra"])("rejects changed %s preparation", async (kind) => {
  const f = await fixture(),
    command = structuredClone(f.command);
  if (kind === "manual")
    command.admission = { mode: "MANUAL", sourceIntentId: null, policyVersion: null };
  if (kind === "target") command.target.id = randomUUID();
  f.transport.prepareSourcePlan.mockResolvedValue({
    readyCommands: kind === "extra" ? [command, command] : [command],
    plan: { slots: [] },
    reviewSlots: [],
  });
  await expect(f.consumer.confirm(f.model, f.result, "walk")).rejects.toThrow();
  expect(f.core.enqueue).not.toHaveBeenCalled();
});
it("withholds unconfirmed tokens and requires current view scope", async () => {
  const f = await fixture();
  await expect(f.consumer.confirm(f.model, f.result, "unknown")).rejects.toThrow();
  expect(f.transport.publishUniversalP1).not.toHaveBeenCalled();
  const publish = f.transport.publishUniversalP1.getMockImplementation()!;
  f.transport.publishUniversalP1.mockImplementation(async () => {
    const p = await publish();
    f.close();
    return p;
  });
  await expect(f.consumer.confirm(f.model, f.result, "walk")).rejects.toThrow(
    "UNIVERSAL_CAPTURE_STALE",
  );
  expect(f.core.enqueue).not.toHaveBeenCalled();
});
it("does not claim success while owning preparation or finalization is incomplete", async () => {
  const f = await fixture();
  f.transport.prepareSourcePlan.mockResolvedValue({
    readyCommands: [],
    plan: { slots: [] },
    reviewSlots: [],
  });
  expect((await f.consumer.confirm(f.model, f.result, "walk")).status).toBe(
    "OWNING_ADMISSION_PENDING",
  );
  expect(f.core.enqueue).not.toHaveBeenCalled();
});
it("restores an already accepted P1 through its same receipt and refuses incomplete Source finalization", async () => {
  const f = await fixture();
  f.transport.prepareSourcePlan.mockResolvedValue({
    readyCommands: [],
    plan: { slots: [{ slotId: f.slot.slotId, state: "COMPLETE" }] } as never,
    reviewSlots: [],
  });
  f.transport.receipt.mockResolvedValue({
    projection: "FULL",
    domainReceiptId: randomUUID(),
    receipt: {
      operationId: f.slot.operationId,
      tripId: f.result.tripId,
      actorAccountId: f.result.accountId,
      outcome: "APPLIED",
      intentSha256: "a".repeat(64),
      receiptSha256: "b".repeat(64),
      targetVector: [{ kind: "ITEM", id: f.slot.target.id, committedRevision: 1 }],
    },
  });
  expect((await f.consumer.confirm(f.model, f.result, "walk")).status).toBe(
    "SERVER_ACCEPTED",
  );
  expect(f.core.enqueue).toHaveBeenCalledExactlyOnceWith(expect.anything(), f.command);
  expect(f.core.refresh).toHaveBeenCalledOnce();
  f.transport.finalizeSourceSlot.mockResolvedValueOnce({ state: "EVIDENCE_PENDING" });
  f.core.refresh.mockClear();
  expect((await f.consumer.confirm(f.model, f.result, "walk")).status).toBe(
    "OWNING_ADMISSION_PENDING",
  );
  expect(f.core.refresh).not.toHaveBeenCalled();
});

it("does not substitute Manual Save when owning Lifecycle qualification is unavailable", async () => {
  const f = await fixture();
  f.transport.publishUniversalP1.mockRejectedValueOnce(
    Error("LIFECYCLE_QUALIFICATION_REQUIRED"),
  );
  await expect(f.consumer.confirm(f.model, f.result, "walk")).rejects.toThrow(
    "LIFECYCLE_QUALIFICATION_REQUIRED",
  );
  expect(f.transport.prepareSourcePlan).not.toHaveBeenCalled();
  expect(f.core.enqueue).not.toHaveBeenCalled();
  expect(f.core.resume).not.toHaveBeenCalled();
  expect(f.core.applyReceipt).not.toHaveBeenCalled();
});

it.each(["P2", "P3", "P4", "P5", "P6"])(
  "keeps %s pending instead of routing it through P1 Admission",
  async (kind) => {
    const f = await fixture();
    Object.assign(f.result.candidates[0], { kind });
    await expect(f.consumer.confirm(f.model, f.result, "walk")).rejects.toThrow(
      "OWNING_ADMISSION_UNAVAILABLE",
    );
    expect(f.transport.publishUniversalP1).not.toHaveBeenCalled();
    expect(f.transport.prepareSourcePlan).not.toHaveBeenCalled();
    expect(f.core.enqueue).not.toHaveBeenCalled();
    expect(f.core.resume).not.toHaveBeenCalled();
  },
);

it("reads only retained account-scoped original bytes and rejects changed pins or stale views", async () => {
  const f = await fixture(),
    material = f.f.input.snapshot.materials[0],
    input = f.model.inputs[0];
  const payloadId = randomUUID();
  Object.assign(input, {
    captureId: randomUUID(),
    payloadId,
    contentByteCount: Buffer.byteLength(material.text),
  });
  const readCapture = vi.fn(async () => ({
    capture: { accountId: f.result.accountId, payloadId },
    bytes: Buffer.from(material.text),
  }));
  const deps = {
    getAccountId: async () => f.result.accountId,
    isCurrent: () => true,
    hash: f.f.deps.hash,
    readCapture,
  };
  expect(await readUniversalP1ReviewOriginal(f.model, f.result, "walk", deps)).toBe(
    material.text,
  );
  Object.assign(input, { contentSha256: "0".repeat(64) });
  await expect(
    readUniversalP1ReviewOriginal(f.model, f.result, "walk", deps),
  ).rejects.toThrow();
  readCapture.mockClear();
  await expect(
    readUniversalP1ReviewOriginal(f.model, f.result, "walk", {
      ...deps,
      isCurrent: () => false,
    }),
  ).rejects.toThrow("UNIVERSAL_CAPTURE_STALE");
  expect(readCapture).not.toHaveBeenCalled();
});

it("queues only the selected P3 using its exact owning published Plan and operation", async () => {
  const f = await fixture("P3");
  const result = await f.consumer.confirm(f.model, f.result, "walk");
  expect(result.status).toBe("SYNC_PENDING");
  expect(f.transport.publishUniversalP1).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ family: "P3" }),
  );
  expect(f.core.enqueue).toHaveBeenCalledExactlyOnceWith(expect.anything(), f.command);
  expect(f.command.payload).toMatchObject({ family: "P3" });
});
