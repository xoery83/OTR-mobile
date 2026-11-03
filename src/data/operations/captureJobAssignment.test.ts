import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fixture, now } from "../repositories/__fixtures__/captureBatchAssessment";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { readCaptureJobAssignment } from "./captureJobAssignment";

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
  return {
    f,
    job,
    context: await captureAccountRequestContext(tripId, f.getAccount),
    deps: { captures: f.captures, getAccountId: f.getAccount, isCurrent: () => true },
  };
}
it("projects existing retained Capture attribution without rewriting frozen intake", async () => {
  const x = await setup(),
    before = structuredClone(x.job.batch);
  expect(await readCaptureJobAssignment(x.context, x.job, x.deps)).toBeNull();
  await x.f.captures.assign(x.job.inputs[0].captureId!, x.context.tripId, 1);
  const model = await x.f.submissions.reopen(x.job.batch.jobId, x.context);
  expect(await readCaptureJobAssignment(x.context, model, x.deps)).toBe(x.context.tripId);
  expect(model.batch).toEqual(before);
  expect(model.inputs).toEqual(x.job.inputs);
  expect(
    (await x.f.captures.getForSourceHandoff(model.inputs[0].captureId!)).capture.revision,
  ).toBe(2);
});
it("rejects changed original identity, Account or view before projecting a Trip", async () => {
  const x = await setup();
  await expect(
    readCaptureJobAssignment(
      x.context,
      {
        ...x.job,
        inputs: x.job.inputs.map((i) => ({ ...i, contentSha256: "f".repeat(64) })),
      },
      x.deps,
    ),
  ).rejects.toThrow("CAPTURE_ORIGINAL_CHANGED");
  await expect(
    readCaptureJobAssignment(x.context, x.job, {
      ...x.deps,
      getAccountId: async () => randomUUID(),
    }),
  ).rejects.toThrow("Account changed");
  await expect(
    readCaptureJobAssignment(x.context, x.job, { ...x.deps, isCurrent: () => false }),
  ).rejects.toThrow("CAPTURE_CONTEXT_STALE");
});
it("returns no attribution for retained inputs currently belonging to different Trips", async () => {
  const x = await setup();
  await x.f.captures.assign(x.job.inputs[0].captureId!, x.context.tripId, 1);
  const first = (await x.f.captures.getForSourceHandoff(x.job.inputs[0].captureId!))
    .capture;
  const otherTrip = randomUUID();
  x.f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(first.accountId, otherTrip, now());
  const second = await x.f.captures.intake(
    {
      kind: first.kind,
      originalFilename: first.originalFilename,
      declaredContentType: first.declaredContentType,
      tripId: otherTrip,
    },
    { bytes: Uint8Array.of(1, 2, 3) },
  );
  const input = {
    ...x.job.inputs[0],
    id: randomUUID(),
    ordinal: 1,
    captureId: second.id,
    payloadId: second.payloadId,
    contentSha256: second.sha256,
    contentByteCount: second.byteCount,
  };
  const model = { ...x.job, inputs: [...x.job.inputs, input] };
  expect(await readCaptureJobAssignment(x.context, model, x.deps)).toBeNull();
});
