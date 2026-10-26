import { expect, it, vi } from "vitest";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";
import { coreHttpBoundary, type CoreHttpConnection } from "./tripCoreV2Http";
async function fixture() {
  const f = await universalP1SourceFixture(),
    p = await f.run(),
    actor = f.input.context.accountId,
    trip = f.input.context.tripId;
  const input = {
    captureVersion: 2,
    sourceId: p.body.sourceId,
    batchId: p.body.batchId,
    taskId: p.body.taskId,
    token: p.body.token,
    requestSha256: f.input.result.requestSha256,
  };
  const publication = {
    captureVersion: 2,
    status: "CANDIDATE_SEALED",
    proposedPlan: p.body.plan,
    candidateSha256: p.candidateSha256,
    grantsAdmission: false,
  };
  const publish = vi.fn(async () => publication),
    connection: CoreHttpConnection = {
      hash: f.deps.hash,
      commands: { withLockedCommand: vi.fn() },
      readOperation: async () => null,
      publishUniversalP1: publish,
    };
  const request = (body: unknown = input) =>
    new Request(`https://local/v2/trips/${trip}/core/universal-p1-candidates`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  return { f, p, actor, trip, input, publication, publish, connection, request };
}
it("routes explicit P1 confirmation to its owning Source authority and rejects authority/scope forgery", async () => {
  const f = await fixture(),
    r = await coreHttpBoundary(f.request(), f.actor, async () => true, f.connection);
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual(f.publication);
  expect(f.publish).toHaveBeenCalledExactlyOnceWith(f.actor, f.trip, f.input);
  expect(
    (
      await coreHttpBoundary(
        f.request({ ...f.input, actorAccountId: f.actor, grantsAdmission: true }),
        f.actor,
        async () => true,
        f.connection,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await coreHttpBoundary(
        f.request({ ...f.input, captureVersion: 1 }),
        f.actor,
        async () => true,
        f.connection,
      )
    ).status,
  ).toBe(426);
  expect(
    (await coreHttpBoundary(f.request(), f.actor, async () => false, f.connection))
      .status,
  ).toBe(404);
  expect((await coreHttpBoundary(f.request(), f.actor, async () => true)).status).toBe(
    503,
  );
});
it("keeps missing owning Review/Relation qualification Pending, not successful Save", async () => {
  const f = await fixture();
  f.publish.mockRejectedValueOnce(Error("OWNING_REVIEW_REQUIRED"));
  const r = await coreHttpBoundary(f.request(), f.actor, async () => true, f.connection);
  expect(r.status).toBe(409);
  expect(await r.json()).toMatchObject({ error: { code: "OWNING_ADMISSION_PENDING" } });
});
