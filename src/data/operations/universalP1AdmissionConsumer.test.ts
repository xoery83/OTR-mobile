import { sourcePlanReadFixture } from "../repositories/__fixtures__/sourcePlanRead";
import { universalP1Identity } from "@/domain/trip/universalImportIdentity";
import { universalP2SourceFixture } from "../../../backend/src/__fixtures__/universalP2Source";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  readUniversalP1ReviewOriginal,
  readUniversalAcceptedItems,
  createUniversalP1AdmissionConsumer,
} from "./universalP1AdmissionConsumer";
import { universalP1SourceFixture } from "../../../backend/src/__fixtures__/universalP1Source";
import { validateCoreCommand } from "../../domain/trip/tripCoreV2Commands";
import type { CaptureJobReadModel } from "../../domain/capture/captureSubmission";
import type { UniversalImportResult } from "../api/universalImportContracts";
async function fixture(
  family: "P1" | "P2" | "P3" | "P4" | "P5" | "P6" = "P1",
  sync?: (context: unknown, operationId: string) => Promise<unknown>,
) {
  const f =
      family === "P2"
        ? await universalP2SourceFixture()
        : await universalP1SourceFixture(undefined, undefined, "2026-11-03", family),
    review =
      family === "P6"
        ? {
            version: "otr.universal.p6-source-review/1" as const,
            decision: "NEW" as const,
            sourceRevision: 1,
            title: "Harbour QA Gallery Visit",
            localDate: "2026-11-03",
            originalReviewed: true as const,
            tripReviewed: true as const,
          }
        : family === "P5"
          ? {
              version: "otr.universal.p5-source-review/1" as const,
              decision: "NEW" as const,
              sourceRevision: 1,
              title: "Coastal QA Train",
              localDate: "2026-11-03",
              originalReviewed: true as const,
              tripReviewed: true as const,
            }
          : family === "P4"
            ? {
                version: "otr.universal.p4-source-review/1" as const,
                decision: "NEW" as const,
                sourceRevision: 1,
                title: "海滨租车",
                localDate: "2026-11-03",
                endLocalDate: "2026-11-05",
                originalReviewed: true as const,
                tripReviewed: true as const,
              }
            : undefined,
    p = await (review
      ? (Object.assign(f.input.selection, { sourceReview: review }), f.run())
      : f.run()),
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
    sync,
  });
  return {
    f,
    review,
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
  expect((await f.consumer.confirm(f.model, f.result, "walk", f.review)).status).toBe(
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
  expect((await f.consumer.confirm(f.model, f.result, "walk", f.review)).status).toBe(
    "SERVER_ACCEPTED",
  );
  expect(f.core.enqueue).toHaveBeenCalledExactlyOnceWith(expect.anything(), f.command);
  expect(f.core.refresh).toHaveBeenCalledOnce();
  f.transport.finalizeSourceSlot.mockResolvedValueOnce({ state: "EVIDENCE_PENDING" });
  f.core.refresh.mockClear();
  expect((await f.consumer.confirm(f.model, f.result, "walk", f.review)).status).toBe(
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
      kind === "P6" ? "OWNING_REVIEW_REQUIRED" : "OWNING_ADMISSION_UNAVAILABLE",
    );
    expect(f.transport.publishUniversalP1).not.toHaveBeenCalled();
    expect(f.transport.prepareSourcePlan).not.toHaveBeenCalled();
    expect(f.core.enqueue).not.toHaveBeenCalled();
    expect(f.core.resume).not.toHaveBeenCalled();
  },
);

it.each(["P1", "P2"] as const)(
  "reads only retained account-scoped %s original bytes and rejects changed pins or stale views",
  async (family) => {
    const f = await fixture(family),
      material =
        "snapshot" in f.f.input ? f.f.input.snapshot.materials[0] : f.f.input.material,
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
    expect(
      await readUniversalP1ReviewOriginal(
        f.model,
        f.result,
        f.result.candidates[0].token,
        deps,
      ),
    ).toBe(material.text);
    Object.assign(input, { contentSha256: "0".repeat(64) });
    await expect(
      readUniversalP1ReviewOriginal(
        f.model,
        f.result,
        f.result.candidates[0].token,
        deps,
      ),
    ).rejects.toThrow();
    readCapture.mockClear();
    await expect(
      readUniversalP1ReviewOriginal(f.model, f.result, f.result.candidates[0].token, {
        ...deps,
        isCurrent: () => false,
      }),
    ).rejects.toThrow("UNIVERSAL_CAPTURE_STALE");
    expect(readCapture).not.toHaveBeenCalled();
  },
);

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

it.each(["P1", "P3", "P4"] as const)(
  "wakes only the confirmed %s operation after owning preparation and waits for its real receipt",
  async (family) => {
    const sync = vi.fn(async () => {}),
      f = await fixture(family, sync);
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
    expect((await f.consumer.confirm(f.model, f.result, "walk", f.review)).status).toBe(
      "SERVER_ACCEPTED",
    );
    expect(sync).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accountId: f.result.accountId, tripId: f.result.tripId }),
      f.slot.operationId,
    );
    expect(f.core.applyReceipt).toHaveBeenCalledOnce();
    expect(f.core.refresh).toHaveBeenCalledOnce();
  },
);

it("queues the reviewed P2 only through owning Source Prepare and CREATE_SPARSE_FLIGHT", async () => {
  const f = await fixture("P2"),
    source = await universalP2SourceFixture();
  const result = await f.consumer.confirm(
    f.model,
    f.result,
    "i1",
    source.input.selection.sourceReview,
  );
  expect(result.status).toBe("SYNC_PENDING");
  expect(f.command.command).toBe("CREATE_SPARSE_FLIGHT");
  expect(f.command.admission.mode).toBe("REVIEWED_SOURCE");
  expect(f.transport.publishUniversalP1).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      family: "P2",
      sourceReview: source.input.selection.sourceReview,
    }),
  );
  expect(f.core.enqueue).toHaveBeenCalledExactlyOnceWith(expect.anything(), f.command);
  expect(f.transport.receipt).not.toHaveBeenCalled();
  expect(f.command.payload).not.toHaveProperty("origin");
});
it("requires explicit P2 review and preserves the existing Candidate minimum-facts status", async () => {
  const f = await fixture("P2"),
    before = structuredClone(f.result);
  await expect(f.consumer.confirm(f.model, f.result, "i1")).rejects.toThrow();
  expect(f.transport.publishUniversalP1).not.toHaveBeenCalled();
  expect(f.core.enqueue).not.toHaveBeenCalled();
  expect(f.result).toEqual(before);
});

it("requires explicit Rental Source Review and queues only the existing owning P4 operation", async () => {
  const f = await fixture("P4");
  await expect(f.consumer.confirm(f.model, f.result, "walk")).rejects.toThrow(
    "OWNING_REVIEW_REQUIRED",
  );
  expect(f.core.enqueue).not.toHaveBeenCalled();
  const result = await f.consumer.confirm(f.model, f.result, "walk", f.review);
  expect(result.status).toBe("SYNC_PENDING");
  expect(f.transport.publishUniversalP1).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ family: "P4", sourceReview: f.review }),
  );
  expect(f.command.payload).toMatchObject({ family: "P4" });
  expect(f.command.admission.mode).toBe("REVIEWED_SOURCE");
  expect(f.core.enqueue).toHaveBeenCalledExactlyOnceWith(expect.anything(), f.command);
});

it("uses the owning P5 plan and same durable operation only after explicit Train Review", async () => {
  const f = await fixture("P5");
  await expect(f.consumer.confirm(f.model, f.result, "walk")).rejects.toThrow(
    "OWNING_REVIEW_REQUIRED",
  );
  expect(f.core.enqueue).not.toHaveBeenCalled();
  expect((await f.consumer.confirm(f.model, f.result, "walk", f.review)).status).toBe(
    "SYNC_PENDING",
  );
  expect(f.transport.publishUniversalP1).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ family: "P5", sourceReview: f.review }),
  );
  expect(f.command.payload).toMatchObject({
    family: "P5",
    service: { transport_subtype: "TRAIN" },
  });
  expect(f.core.enqueue).toHaveBeenCalledExactlyOnceWith(expect.anything(), f.command);
});

it("uses P6 owning Review and same durable operation, never Manual Save", async () => {
  const f = await fixture("P6");
  await expect(f.consumer.confirm(f.model, f.result, "walk")).rejects.toThrow(
    "OWNING_REVIEW_REQUIRED",
  );
  expect(f.core.enqueue).not.toHaveBeenCalled();
  expect((await f.consumer.confirm(f.model, f.result, "walk", f.review)).status).toBe(
    "SYNC_PENDING",
  );
  expect(f.transport.publishUniversalP1).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ family: "P6", sourceReview: f.review }),
  );
  expect(f.command.payload).toMatchObject({
    family: "P6",
    core: { title: "Harbour QA Gallery Visit" },
  });
  expect(f.command.admission.mode).toBe("REVIEWED_SOURCE");
  expect(f.core.enqueue).toHaveBeenCalledExactlyOnceWith(expect.anything(), f.command);
});

it.each(["P1", "P2", "P3", "P4", "P5", "P6"] as const)(
  "reopens %s from its existing receipt without any write or paid send",
  async (family) => {
    const f = await fixture(family);
    f.transport.receipt.mockResolvedValue({
      projection: "FULL",
      domainReceiptId: randomUUID(),
      receipt: {
        operationId: f.slot.operationId,
        tripId: f.result.tripId,
        actorAccountId: f.result.accountId,
        command: f.command.command,
        outcome: "APPLIED",
        committedAt: "2026-10-28T00:00:00Z",
        targetVector: [{ kind: "ITEM", id: f.slot.target.id, committedRevision: 1 }],
      },
    });
    const read = () =>
      readUniversalAcceptedItems(f.model, f.result, {
        getAccountId: async () => f.result.accountId,
        isCurrent: () => true,
        transport: f.transport as never,
      });
    expect(await read()).toEqual({
      [f.result.candidates[0].token]: {
        itemId: f.slot.target.id,
        operationId: f.slot.operationId,
        committedAt: "2026-10-28T00:00:00Z",
      },
    });
    expect(f.transport.receipt).toHaveBeenCalledWith(
      expect.anything(),
      f.slot.operationId,
    );
    expect(f.transport.publishUniversalP1).not.toHaveBeenCalled();
    expect(f.transport.prepareSourcePlan).not.toHaveBeenCalled();
    expect(f.core.enqueue).not.toHaveBeenCalled();
    expect(f.transport.finalizeSourceSlot).not.toHaveBeenCalled();
    f.transport.receipt.mockResolvedValue(null);
    expect(await read()).toEqual({});
  },
);
it("withholds receipt recovery on scope mismatch and late view invalidation", async () => {
  const f = await fixture();
  const deps = {
    getAccountId: async () => f.result.accountId,
    isCurrent: () => true,
    transport: f.transport as never,
  };
  f.transport.receipt.mockResolvedValue({
    projection: "FULL",
    receipt: { operationId: randomUUID() },
  });
  await expect(readUniversalAcceptedItems(f.model, f.result, deps)).rejects.toThrow(
    "CORE_RECEIPT_SCOPE_MISMATCH",
  );
  let active = true;
  f.transport.receipt.mockImplementation(async () => {
    active = false;
    return null;
  });
  await expect(
    readUniversalAcceptedItems(f.model, f.result, { ...deps, isCurrent: () => active }),
  ).rejects.toThrow("UNIVERSAL_CAPTURE_STALE");
  expect(f.core.enqueue).not.toHaveBeenCalled();
});

it("does not call a rejected or unknown operation a saved Item", async () => {
  const f = await fixture();
  const deps = {
    getAccountId: async () => f.result.accountId,
    isCurrent: () => true,
    transport: f.transport as never,
  };
  f.transport.receipt.mockResolvedValue({
    projection: "FULL",
    domainReceiptId: randomUUID(),
    receipt: {
      operationId: f.slot.operationId,
      tripId: f.result.tripId,
      actorAccountId: f.result.accountId,
      command: f.command.command,
      outcome: "REJECTED",
      targetVector: [{ kind: "ITEM", id: f.slot.target.id, committedRevision: null }],
    },
  });
  expect(await readUniversalAcceptedItems(f.model, f.result, deps)).toEqual({});
  f.transport.receipt.mockResolvedValue({ projection: "REDACTED" });
  expect(await readUniversalAcceptedItems(f.model, f.result, deps)).toEqual({});
});

it("distinguishes a complete exact Source from Core acceptance and keeps incomplete/unavailable recovery open", async () => {
  const f = await fixture(),
    candidate = f.result.candidates[0],
    source = f.result.sourceBindings[0];
  const id = (purpose: string) =>
    universalP1Identity(f.result.taskId, candidate.token, purpose);
  const raw = sourcePlanReadFixture(f.result.accountId, f.result.tripId),
    slot = raw.plan.slots[0],
    receiptId = randomUUID();
  raw.plan.planId = id("plan");
  raw.plan.sourceId = source.sourceId;
  raw.plan.sourceRevision = source.revision;
  raw.plan.candidateIds = [id("candidate")];
  Object.assign(slot, {
    slotId: id("slot"),
    candidateId: id("candidate"),
    operationId: id("operation"),
    target: { kind: "ITEM", candidateSlotId: null, existingId: id("item") },
  });
  Object.assign(slot.outputPurpose, {
    planId: id("plan"),
    sourceId: source.sourceId,
    sourceRevision: source.revision,
    slotId: id("slot"),
    candidateId: id("candidate"),
    operationId: id("operation"),
    targetId: id("item"),
  });
  raw.status.planId = id("plan");
  Object.assign(raw.status.slots[0], {
    slotId: id("slot"),
    operationId: id("operation"),
    targetId: id("item"),
    domainReceiptId: receiptId,
  });
  const sourcePlan = vi.fn(async () => raw);
  let active = true;
  f.transport.receipt.mockResolvedValue({
    projection: "FULL",
    domainReceiptId: receiptId,
    receipt: {
      operationId: id("operation"),
      tripId: f.result.tripId,
      actorAccountId: f.result.accountId,
      command: "CREATE_ITEM",
      outcome: "APPLIED",
      committedAt: "2026-10-28T00:00:00Z",
      intentSha256: slot.intentSha256,
      targetVector: [{ kind: "ITEM", id: id("item"), committedRevision: 1 }],
    },
  });
  const read = () =>
    readUniversalAcceptedItems(f.model, f.result, {
      getAccountId: async () => f.result.accountId,
      isCurrent: () => active,
      transport: { ...f.transport, sourcePlan } as never,
    });
  expect((await read())[candidate.token]).toHaveProperty("sourceComplete", true);
  const complete = structuredClone(raw);
  for (const field of [
    "accountId",
    "sourceId",
    "sourceRevision",
    "operationId",
    "targetId",
  ] as const) {
    const altered = structuredClone(complete),
      own = altered.plan.slots[0];
    if (field === "accountId" || field === "sourceId") {
      const value = randomUUID();
      altered.plan[field] = value;
      Object.assign(own.outputPurpose, { [field]: value });
    } else if (field === "sourceRevision") {
      altered.plan.sourceRevision++;
      own.outputPurpose.sourceRevision = altered.plan.sourceRevision;
    } else if (field === "operationId") {
      const value = randomUUID();
      own.operationId = value;
      Object.assign(own.outputPurpose, { operationId: value });
      altered.status.slots[0].operationId = value;
    } else {
      const value = randomUUID();
      own.target.existingId = value;
      own.outputPurpose.targetId = value;
      altered.status.slots[0].targetId = value;
    }
    sourcePlan.mockResolvedValue(altered);
    expect((await read())[candidate.token].sourceComplete, field).not.toBe(true);
  }
  sourcePlan.mockResolvedValue(raw);

  raw.status.slots[0].domainReceiptId = randomUUID();
  expect((await read())[candidate.token].sourceComplete).not.toBe(true);
  raw.status.slots[0].domainReceiptId = receiptId;
  raw.plan.slots[0].state = "EVIDENCE_PENDING";
  raw.status.slots[0].outcome = "EVIDENCE_PENDING";
  expect((await read())[candidate.token].sourceComplete).not.toBe(true);
  sourcePlan.mockRejectedValue(Error("OFFLINE") as never);
  expect((await read())[candidate.token]).toMatchObject({
    itemId: id("item"),
    operationId: id("operation"),
  });
  expect(f.core.enqueue).not.toHaveBeenCalled();
  expect(f.transport.publishUniversalP1).not.toHaveBeenCalled();
  sourcePlan.mockImplementation(async () => {
    active = false;
    return complete;
  });
  await expect(read()).rejects.toThrow("UNIVERSAL_CAPTURE_STALE");
});

it("shows retained original when frozen text preparation changes its submitted hash", async () => {
  const f = await fixture();
  if (!("snapshot" in f.f.input)) throw Error("P1 fixture required");
  const text = f.f.input.snapshot.materials[0].text.replace(/\n/g, " \t\r\n");
  const bytes = Buffer.from(text),
    sha = await f.f.deps.hash(bytes),
    payloadId = randomUUID();
  Object.assign(f.model.inputs[0], {
    captureId: randomUUID(),
    payloadId,
    contentByteCount: bytes.length,
    contentSha256: sha,
  });
  f.result.sourceBindings[0].originalSha256 = sha;
  const deps = {
    getAccountId: async () => f.result.accountId,
    isCurrent: () => true,
    hash: f.f.deps.hash,
    readCapture: async () => ({
      capture: { accountId: f.result.accountId, payloadId },
      bytes,
    }),
  };
  expect(
    await readUniversalP1ReviewOriginal(
      f.model,
      f.result,
      f.result.candidates[0].token,
      deps,
    ),
  ).toBe(text);
  f.result.sourceBindings[0].submittedSha256 = "0".repeat(64);
  await expect(
    readUniversalP1ReviewOriginal(f.model, f.result, f.result.candidates[0].token, deps),
  ).rejects.toThrow("IMPORT_EVIDENCE_INVALID");
});
