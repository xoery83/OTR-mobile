import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { fixture } from "@/data/repositories/__fixtures__/captureBatchAssessment";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import type { CapturePayloadInput } from "@/data/files/capturePayloadReader";
import {
  captureProcessingSummary,
  projectCaptureActivity,
} from "./captureActivityProjection";

it("keeps an earlier failed input visible when a later input validates", async () => {
  const f = fixture();
  const request = await f.submit(2);
  const job = await f.submissions.reopen(request.jobId);
  job.processingEvents = [
    {
      inputId: job.inputs[0].id,
      sequence: 1,
      state: "FAILED",
      recordedAt: job.batch.createdAt,
      attemptCount: 1,
    },
    {
      inputId: job.inputs[1].id,
      sequence: 2,
      state: "INPUT_VALIDATED",
      recordedAt: job.batch.createdAt,
      attemptCount: 0,
    },
  ];
  expect(captureProcessingSummary(job)).toBe("VALIDATION_FAILED");
});

it("normal registered intake is not saved or processing; accepted/failed current facts retain their true times without a invented timeline", async () => {
  const f = fixture();
  const request = f.request(3);
  request.createdAt = "2026-10-14T21:35:42.000Z";
  request.context.observedAt = request.createdAt;
  request.context.tripPrior = {
    id: randomUUID(),
    origin: "PRIOR",
    observedAt: request.createdAt,
  };
  const account = await f.getAccount();
  const registered = projectCaptureActivity(
    await f.submissions.register(request),
    account,
  );
  expect(registered.recordedAt).toBe(request.createdAt);
  expect(registered.recordedClock).toBe("DEVICE_WALL");
  expect(registered.counts).toEqual({ selected: 3, accepted: 0, failed: 0, pending: 3 });
  expect(registered.recordedFacts).toHaveLength(1);
  expect(registered.localRetention).toBe("NOT_ASSERTED_BY_SELECTOR");
  const inputs = new Map<string, () => Promise<CapturePayloadInput>>([
    [request.inputs[0].id, async () => ({ text: "Retained file text" })],
    [request.inputs[1].id, async () => ({ text: "" })],
  ]);
  const model = await f.submissions.submit(request, inputs);
  const activity = projectCaptureActivity(model, account);
  expect(activity.counts).toEqual({ selected: 3, accepted: 1, failed: 1, pending: 1 });
  expect(activity.recordedFacts).toHaveLength(2);
  expect(activity.recordedFacts[0]).toMatchObject({
    kind: "INPUT_ACCEPTANCE_RECORDED",
    at: model.inputs[0].acceptedAt,
  });
  // The fixture's actual local acceptance clock predates request clock. No invented clamping.
  expect(activity.recordedFacts[1].at).toBe(request.createdAt);
  expect(activity.currentInputs[1]).toMatchObject({
    state: "FAILED",
    failureCode: "EMPTY_PAYLOAD",
    acceptanceRecordedAt: null,
  });
  expect(activity.currentInputs[2]).toMatchObject({
    state: "PENDING",
    pendingReason: "REACQUIRE",
    acceptanceRecordedAt: null,
  });
  expect(activity.processingCapability).toBe("NOT_INSTALLED");
  expect(activity.processingFinished).toBeNull();
  expect(activity.canonicalOutcomes).toBeNull();
  expect(activity.needsAttention).toBeNull();
  expect(activity.currentTripAttribution).toBeNull();
  expect(activity.ordinaryResultsAddMore).toBe(false);
});
it("current normal C2 list/reopen/cold replay gives stable separate Activities, no projection writes or mutable receipt links", async () => {
  const f = fixture(true);
  const one = await f.submit(2),
    two = await f.submit(1);
  const account = await f.getAccount();
  const before = projectCaptureActivity(await f.submissions.reopen(one.jobId), account);
  expect(before.recordedFacts[0].kind).toBe("SUBMISSION_RECORDED");
  expect(before.recordedFacts.slice(1).map((fact) => fact.id)).toEqual(
    before.recordedFacts
      .slice(1)
      .map((fact) => fact.id)
      .sort(),
  );
  f.reopen();
  const run = vi.spyOn(f.db, "runAsync");
  const page = await f.submissions.list();
  expect(page.map((job) => projectCaptureActivity(job, account).jobId).sort()).toEqual(
    [one.jobId, two.jobId].sort(),
  );
  const cold = projectCaptureActivity(await f.submissions.reopen(one.jobId), account);
  expect(cold).toEqual(before);
  expect(run).not.toHaveBeenCalled();
  expect(Object.isFrozen(cold)).toBe(true);
  expect(Object.isFrozen(cold.currentInputs[0])).toBe(true);
  expect(Object.isFrozen(cold.recordedFacts[0])).toBe(true);
  const next = f.request();
  next.inputs[0].continuesFromInputId = one.inputs[0].id;
  await f.submissions.submit(
    next,
    new Map([[next.inputs[0].id, async () => ({ text: "Explicit continuation" })]]),
    undefined,
    undefined,
    { [one.inputs[0].id]: cold.currentInputs[0].revision },
  );
  const linked = projectCaptureActivity(await f.submissions.reopen(next.jobId), account);
  expect(linked.currentInputs[0].continuesFromJobId).toBe(one.jobId);
  expect(
    projectCaptureActivity(await f.submissions.reopen(one.jobId), account)
      .currentInputs[0].continuedIn,
  ).toContainEqual({ jobId: next.jobId, inputId: next.inputs[0].id });
});
it("foreign Account and ABA cannot expose the old Activity through normal reader or expected-Account projection", async () => {
  const f = fixture();
  const request = await f.submit(),
    account = await f.getAccount();
  const model = await f.submissions.reopen(request.jobId);
  const captured = await captureAccountRequestContext("", f.getAccount);
  const foreign = randomUUID();
  expect(() => projectCaptureActivity(model, foreign)).toThrow("ACCOUNT_MISMATCH");
  await f.switchTo(foreign);
  await expect(f.submissions.reopen(request.jobId)).rejects.toThrow();
  await f.switchTo(account);
  await expect(f.submissions.reopen(request.jobId, captured)).rejects.toThrow(
    "Account changed",
  );
  expect(
    projectCaptureActivity(await f.submissions.reopen(request.jobId), account).jobId,
  ).toBe(request.jobId);
});
it("accepted timestamp metadata cannot assert current custody; corrupt retained bytes block owning reopen", async () => {
  const f = fixture();
  const request = await f.submit(),
    account = await f.getAccount();
  const old = await f.submissions.reopen(request.jobId);
  expect(projectCaptureActivity(old, account).localRetention).toBe(
    "NOT_ASSERTED_BY_SELECTOR",
  );
  const read = f.db.getFirstAsync.bind(f.db);
  vi.spyOn(f.db, "getFirstAsync").mockImplementation(
    async (query: string, ...params: unknown[]) => {
      const row = await read(query, ...(params as never[]));
      return query.includes("THEN bytes ELSE NULL") && row
        ? { ...(row as object), bytes: new Uint8Array([120, 121, 122]) }
        : row;
    },
  );
  await expect(f.submissions.reopen(request.jobId)).rejects.toThrow("INTEGRITY");
  // No SQL mutation/guard weakening; only the owned test's returned read bytes were corrupted.
});
