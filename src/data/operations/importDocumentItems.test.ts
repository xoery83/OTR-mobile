import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { sourcePlanReadFixture } from "../repositories/__fixtures__/sourcePlanRead";
import { universalP1Identity } from "@/domain/trip/universalImportIdentity";
import { coreSourcePlanReadV2Schema } from "@/domain/trip/tripCoreV2SourceContract";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { UniversalImportResult } from "../api/universalImportContracts";
import type { ImportDocument } from "../repositories/importDocumentsRepository";
import { readImportDocumentItems } from "./importDocumentItems";
async function fixture() {
  const account = randomUUID(),
    trip = randomUUID(),
    batchId = randomUUID(),
    task = randomUUID(),
    jobId = randomUUID(),
    inputId = randomUUID(),
    captureId = randomUUID(),
    payloadId = randomUUID(),
    sourceId = randomUUID();
  const context = await captureAccountRequestContext(trip, async () => account);
  const document: ImportDocument = {
    captureId,
    accountId: account,
    tripId: trip,
    kind: "TEXT",
    originalFilename: null,
    declaredContentType: "text/plain",
    recordedAt: "2026-10-28T00:00:00Z",
    payloadId,
    sha256: "a".repeat(64),
    byteCount: 42,
    jobId,
    batchId,
    inputId,
    custody: "LOCAL_RECORDED",
    cloudOriginal: "NOT_ASSERTED",
    visibility: "PRIVATE",
  };
  const model = {
    batch: { accountId: account, batchId, jobId, context: { tripPrior: { id: trip } } },
    allInputsAccepted: true,
    inputs: [
      {
        id: inputId,
        captureId,
        payloadId,
        state: "ACCEPTED",
        contentSha256: document.sha256,
        contentByteCount: 42,
      },
    ],
  } as unknown as CaptureJobReadModel;
  const result = {
    accountId: account,
    tripId: trip,
    batchId,
    taskId: task,
    sourceBindings: [
      {
        alias: "s1",
        inputId,
        sourceId,
        representationId: randomUUID(),
        revision: 1,
        originalSha256: document.sha256,
      },
    ],
    candidates: [
      { token: "i1", kind: "P1", fields: [{ sourceId: "s1", path: "title", raw: "QA" }] },
    ],
  } as unknown as UniversalImportResult;
  const raw = sourcePlanReadFixture(account, trip),
    old = raw.plan.slots[0];
  const identity = (p: string) => universalP1Identity(task, "i1", p);
  const candidateId = identity("candidate"),
    refs = Object.fromEntries(
      old.selectedFields.map((f) => [
        f,
        [`track-c/field-evidence/${candidateId}/${f}.0`],
      ]),
    );
  raw.plan.planId = identity("plan");
  raw.plan.sourceId = sourceId;
  raw.plan.candidateIds = [candidateId];
  Object.assign(old, {
    slotId: identity("slot"),
    candidateId,
    operationId: identity("operation"),
    target: { kind: "ITEM", candidateSlotId: null, existingId: identity("item") },
    evidenceRefs: refs,
  });
  Object.assign(old.outputPurpose, {
    planId: identity("plan"),
    sourceId,
    slotId: identity("slot"),
    candidateId,
    operationId: identity("operation"),
    targetId: identity("item"),
    evidenceRefs: refs,
  });
  raw.status.planId = identity("plan");
  Object.assign(raw.status.slots[0], {
    slotId: identity("slot"),
    operationId: identity("operation"),
    targetId: identity("item"),
  });
  const plan = coreSourcePlanReadV2Schema.parse(raw),
    transport = { sourcePlan: vi.fn(async () => plan) };
  const bindings = [{ sourceId, sourceRevision: 1 }],
    deps = { getAccountId: async () => account, isCurrent: () => true, transport };
  return {
    context,
    document,
    model,
    result,
    plan,
    bindings,
    deps,
    identity,
    read: () => readImportDocumentItems(context, document, bindings, model, result, deps),
  };
}
it("links only this original through a completed owning Source Slot and stable accepted Item", async () => {
  const f = await fixture();
  expect(await f.read()).toEqual([
    {
      itemId: f.identity("item"),
      operationId: f.identity("operation"),
      sourceId: f.bindings[0].sourceId,
      sourceRevision: 1,
      planId: f.identity("plan"),
    },
  ]);
  expect(f.deps.transport.sourcePlan).toHaveBeenCalledExactlyOnceWith(
    f.context,
    f.identity("plan"),
  );
});
it("does not attach other Source candidates in the same Batch", async () => {
  const f = await fixture(),
    inputId = randomUUID(),
    sourceId = randomUUID();
  f.model.inputs = [
    ...f.model.inputs,
    {
      ...f.model.inputs[0],
      id: inputId,
      captureId: randomUUID(),
      payloadId: randomUUID(),
      contentSha256: "b".repeat(64),
    },
  ];
  f.result.sourceBindings.push({
    ...f.result.sourceBindings[0],
    inputId,
    sourceId,
    alias: "s2",
    originalSha256: "b".repeat(64),
  });
  f.result.candidates.push({
    ...f.result.candidates[0],
    token: "i2",
    fields: [{ ...f.result.candidates[0].fields[0], sourceId: "s2" }],
  });
  expect(await f.read()).toHaveLength(1);
  expect(f.deps.transport.sourcePlan).toHaveBeenCalledTimes(1);
});
it("does not convert READY, Evidence Pending, foreign Source or another revision into a document relationship", async () => {
  const f = await fixture();
  f.plan.plan.slots[0].state = "READY";
  f.plan.status.slots[0].outcome = "PENDING";
  f.plan.status.slots[0].domainReceiptId = null;
  f.plan.status.slots[0].committedRevision = null;
  expect(await f.read()).toEqual([]);
  const g = await fixture();
  g.plan.plan.sourceId = randomUUID();
  g.plan.plan.slots[0].outputPurpose.sourceId = g.plan.plan.sourceId;
  expect(await g.read()).toEqual([]);
  const h = await fixture();
  h.bindings[0].sourceRevision = 2;
  await expect(h.read()).rejects.toThrow("DOCUMENTS_SOURCE_UNAVAILABLE");
  expect(h.deps.transport.sourcePlan).not.toHaveBeenCalled();
});
it("rejects replaced Capture payload, wrong Account and late invalidation without linking", async () => {
  const f = await fixture();
  f.document.payloadId = randomUUID();
  await expect(f.read()).rejects.toThrow("DOCUMENTS_SCOPE_MISMATCH");
  expect(f.deps.transport.sourcePlan).not.toHaveBeenCalled();
  const g = await fixture();
  g.plan.plan.accountId = randomUUID();
  if ("accountId" in g.plan.plan.slots[0].outputPurpose)
    g.plan.plan.slots[0].outputPurpose.accountId = g.plan.plan.accountId;
  await expect(g.read()).rejects.toThrow("DOCUMENTS_SCOPE_MISMATCH");
  const h = await fixture();
  h.deps.transport.sourcePlan.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    return h.plan;
  });
  await expect(h.read()).rejects.toThrow();
});
