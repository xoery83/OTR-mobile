import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fixture, now } from "../repositories/__fixtures__/captureBatchAssessment";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { assignCaptureJobTrip, readCaptureJobAssignment } from "./captureJobAssignment";

async function setup() {
  const f = fixture(true, 75),
    request = f.request(),
    tripId = randomUUID();
  request.context.tripPrior = null;
  const job = await f.submissions.submit(
    request,
    new Map([[request.inputs[0].id, async () => ({ bytes: Uint8Array.of(1, 2, 3) })]]),
  );
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(request.accountId, tripId, now());
  const context = await captureAccountRequestContext(tripId, f.getAccount);
  return {
    f,
    job,
    context,
    deps: { captures: f.captures, getAccountId: f.getAccount, isCurrent: () => true },
  };
}
it("assigns the retained Capture, preserves frozen Batch and restores the same Journey after reopen", async () => {
  const x = await setup();
  expect(await readCaptureJobAssignment(x.context, x.job, x.deps)).toBeNull();
  await assignCaptureJobTrip(x.context, x.job, x.deps);
  const reopened = await x.f.submissions.reopen(x.job.batch.jobId, x.context);
  expect(reopened.batch).toEqual(x.job.batch);
  expect(reopened.inputs).toEqual(x.job.inputs);
  expect(await readCaptureJobAssignment(x.context, reopened, x.deps)).toBe(
    x.context.tripId,
  );
  const original = await x.f.captures.getForSourceHandoff(x.job.inputs[0].captureId!);
  expect(original.capture.revision).toBe(2);
  await assignCaptureJobTrip(x.context, reopened, x.deps);
  expect(
    (await x.f.captures.getForSourceHandoff(original.capture.id)).capture.revision,
  ).toBe(2);
});
it("rejects foreign Journey and stale view without changing the Capture", async () => {
  const x = await setup();
  await expect(
    assignCaptureJobTrip({ ...x.context, tripId: randomUUID() }, x.job, x.deps),
  ).rejects.toThrow();
  await expect(
    assignCaptureJobTrip(x.context, x.job, { ...x.deps, isCurrent: () => false }),
  ).rejects.toThrow();
  expect(await readCaptureJobAssignment(x.context, x.job, x.deps)).toBeNull();
});
it("does not move an already attributed original to another Journey", async () => {
  const x = await setup();
  await assignCaptureJobTrip(x.context, x.job, x.deps);
  await expect(
    assignCaptureJobTrip({ ...x.context, tripId: randomUUID() }, x.job, x.deps),
  ).rejects.toThrow();
  expect(await readCaptureJobAssignment(x.context, x.job, x.deps)).toBe(x.context.tripId);
});

it("rejects mismatched original identity and Account changes before any assignment", async () => {
  const x = await setup();
  await expect(
    assignCaptureJobTrip(
      x.context,
      {
        ...x.job,
        inputs: x.job.inputs.map((input) => ({
          ...input,
          contentSha256: "f".repeat(64),
        })),
      },
      x.deps,
    ),
  ).rejects.toThrow("CAPTURE_ORIGINAL_CHANGED");
  await expect(
    assignCaptureJobTrip(x.context, x.job, {
      ...x.deps,
      getAccountId: async () => randomUUID(),
    }),
  ).rejects.toThrow("Account changed");
  expect(await readCaptureJobAssignment(x.context, x.job, x.deps)).toBeNull();
});
