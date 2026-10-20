import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createCoreV2Transport } from "./tripCoreV2Transport";
import { captureFlightFixture } from "../interpretation/__fixtures__/captureFlightCoreV2";
import { buildCaptureFlightSourcePlanV2 } from "../interpretation/captureFlightCoreV2";
import { publicationTestHash as hash } from "../../../backend/src/__fixtures__/tripCoreV2CandidatePublication";
import { advanceAccountGeneration } from "../auth/accountGeneration";
vi.mock("../auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
async function fixture() {
  const f = await captureFlightFixture();
  const ids = f.built.publication.candidates.map((c) => ({
    candidateId: c.candidateId,
    itemId: randomUUID(),
    createSlotId: randomUUID(),
    createOperationId: randomUUID(),
    qualifySlotId: randomUUID(),
    qualifyOperationId: randomUUID(),
  }));
  const request = buildCaptureFlightSourcePlanV2(f.built.publication, randomUUID(), ids);
  const result = {
    captureVersion: 2,
    plan: {
      proposalVersion: 2,
      intentVersion: 2,
      planId: request.planId,
      accountId: f.context.accountId,
      tripId: f.context.tripId,
      sourceId: request.sourceId,
      sourceRevision: request.sourceRevision,
      candidateIds: request.candidateIds,
      mode: request.mode,
      policyVersion: null,
      slots: [],
    },
    readyCommands: [],
    reviewSlots: request.slots.map((s) => ({
      slotId: s.slotId,
      errorCode: "UNRESOLVED_IDENTITY",
    })),
  };
  const transport = (body: unknown, switchAccount = false) =>
    createCoreV2Transport(
      f.getAccountId,
      hash,
      {
        baseUrl: "http://core.synthetic",
        fetchImplementation: async () => {
          if (switchAccount) advanceAccountGeneration();
          return new Response(JSON.stringify(body), {
            headers: { "Content-Type": "application/json" },
          });
        },
      },
      async () => ({ token: "synthetic", userId: f.context.accountId }),
    );
  return { ...f, request, result, transport };
}
it("accepts a scoped REVIEW without turning it into dispatchable commands", async () => {
  const f = await fixture();
  expect(await f.transport(f.result).prepareSourcePlan(f.context, f.request)).toEqual(
    f.result,
  );
});
it.each(["accountId", "tripId", "planId", "sourceId"] as const)(
  "rejects foreign %s in Source preparation",
  async (key) => {
    const f = await fixture();
    await expect(
      f
        .transport({ ...f.result, plan: { ...f.result.plan, [key]: randomUUID() } })
        .prepareSourcePlan(f.context, f.request),
    ).rejects.toThrow("CORE_SOURCE_PLAN_SCOPE_MISMATCH");
  },
);
it("rejects substituted candidates and foreign review slot IDs", async () => {
  const f = await fixture();
  await expect(
    f
      .transport({
        ...f.result,
        plan: { ...f.result.plan, candidateIds: [randomUUID()] },
      })
      .prepareSourcePlan(f.context, f.request),
  ).rejects.toThrow("CORE_SOURCE_PLAN_SCOPE_MISMATCH");
  await expect(
    f
      .transport({
        ...f.result,
        reviewSlots: [{ slotId: randomUUID(), errorCode: "REVIEW" }],
      })
      .prepareSourcePlan(f.context, f.request),
  ).rejects.toThrow("CORE_SOURCE_PLAN_SCOPE_MISMATCH");
});
it("fences an account generation change during preparation", async () => {
  const f = await fixture();
  await expect(
    f.transport(f.result, true).prepareSourcePlan(f.context, f.request),
  ).rejects.toThrow();
});
it("never accepts another slot's finalization acknowledgement", async () => {
  const f = await fixture(),
    input = {
      captureVersion: 2 as const,
      slotId: randomUUID(),
      operationId: randomUUID(),
      intentSha256: "a".repeat(64),
      domainReceiptId: randomUUID(),
      receiptSha256: "b".repeat(64),
    };
  await expect(
    f
      .transport({
        captureVersion: 2,
        slotId: randomUUID(),
        state: "COMPLETE",
        errorCode: null,
      })
      .finalizeSourceSlot(f.context, f.request.planId, input),
  ).rejects.toThrow("CORE_SOURCE_PLAN_SCOPE_MISMATCH");
});
