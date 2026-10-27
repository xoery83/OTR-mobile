import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import { expect, it, vi } from "vitest";
import { universalP1SourceFixture } from "./__fixtures__/universalP1Source";
import { coreHttpBoundary, type CoreHttpConnection } from "./tripCoreV2Http";
async function fixture(family: "P1" | "P3" = "P1") {
  const f = await universalP1SourceFixture(undefined, undefined, "2026-11-03", family);
  const sourceReview =
    family === "P3"
      ? {
          version: "otr.universal.p3-source-review/1",
          decision: "NEW",
          sourceRevision: 1,
          title: "海滨住宿",
          localDate: "2026-11-03",
          endLocalDate: "2026-11-05",
          originalReviewed: true,
          tripReviewed: true,
        }
      : undefined;
  if (sourceReview) Object.assign(f.input.selection, { sourceReview });
  const p = await f.run(),
    actor = f.input.context.accountId,
    trip = f.input.context.tripId;
  const input = {
    captureVersion: 2,
    ...(family === "P3" ? { family, sourceReview } : {}),
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

it("returns the already sealed P3 publication through the same HTTP boundary", async () => {
  const f = await fixture("P3");
  const response = await coreHttpBoundary(
    f.request(),
    f.actor,
    async () => true,
    f.connection,
  );
  expect(f.publish).toHaveBeenCalledExactlyOnceWith(f.actor, f.trip, f.input);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(f.publication);
});
it.each(["P1", "P3"] as const)(
  "rejects a different family's publication for %s",
  async (family) => {
    const f = await fixture(family),
      other = await fixture(family === "P1" ? "P3" : "P1");
    (f.publication.proposedPlan.slots[0] as any).payload =
      other.publication.proposedPlan.slots[0].payload;
    expect(
      (await coreHttpBoundary(f.request(), f.actor, async () => true, f.connection))
        .status,
    ).toBe(503);
  },
);

it("forwards an explicit P2 review only as a single Sparse Source proposal", async () => {
  const f = await fixture();
  const input = {
    ...f.input,
    family: "P2",
    sourceReview: {
      version: "otr.universal.p2-source-review/1",
      decision: "NEW",
      sourceRevision: 1,
      flightNumberLiteral: "NZ501",
      departureDate: "2026-11-02",
      originalReviewed: true,
      tripReviewed: true,
    },
  };
  // HTTP envelope fixture only; the owning publisher independently checks actual P2 evidence.
  const response = structuredClone(f.publication);
  Object.assign(response.proposedPlan.slots[0], {
    command: "CREATE_SPARSE_FLIGHT",
    payload: {
      flightNumberLiteral: "NZ501",
      departureDate: "2026-11-02",
      ...coreDefaults("member"),
    },
  });
  f.publish.mockResolvedValueOnce(response);
  const result = await coreHttpBoundary(
    f.request(input),
    f.actor,
    async () => true,
    f.connection,
  );
  expect(result.status).toBe(200);
  expect(f.publish).toHaveBeenCalledExactlyOnceWith(f.actor, f.trip, input);
  expect(
    (
      await coreHttpBoundary(
        f.request({ ...input, sourceReview: undefined }),
        f.actor,
        async () => true,
        f.connection,
      )
    ).status,
  ).toBe(400);
  for (const kind of ["command", "literal", "date", "revision"]) {
    const wrong = structuredClone(response);
    if (kind === "command") wrong.proposedPlan.slots[0].command = "QUALIFY_FLIGHT";
    if (kind === "literal")
      (
        wrong.proposedPlan.slots[0].payload as Record<string, unknown>
      ).flightNumberLiteral = "NZ502";
    if (kind === "date")
      (wrong.proposedPlan.slots[0].payload as Record<string, unknown>).departureDate =
        "2026-11-03";
    if (kind === "revision") wrong.proposedPlan.sourceRevision = 2;
    f.publish.mockResolvedValueOnce(wrong);
    expect(
      (await coreHttpBoundary(f.request(input), f.actor, async () => true, f.connection))
        .status,
    ).toBe(503);
  }
});
