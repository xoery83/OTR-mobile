import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { fixture } from "./guestAdoptionCompositePlan.fixture";
import {
  guestAdoptionHttpBoundary,
  guestAdoptionBodyLimit,
  type GuestAdoptionHttpPorts,
} from "./guestAdoptionHttp";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";
import { guestAdoptionTargetConfirmationHeader } from "../../src/data/api/guestAdoptionContracts";
async function harness() {
  const f = fixture(),
    preparation = await f.source();
  const {
    resources: _resources,
    status: _status,
    grantId: _grantId,
    policyVersion: _policy,
    expiresAt: _expires,
    ...binding
  } = f.grant;
  const staged = {
    ...binding,
    status: "STAGED",
    grantId: f.grant.grantId,
    preparationSha256: preparation.sha256,
    planSha256: "a".repeat(64),
  };
  const create = randomUUID(),
    creator = randomUUID(),
    owner = randomUUID();
  const body = {
    ...binding,
    contractVersion: 1 as const,
    schemaId: "otr.auth.guest-adoption-receipt/1",
    receiptId: randomUUID(),
    grantId: f.grant.grantId,
    policyVersion: f.grant.policyVersion,
    recordedAt: "2026-10-30T00:00:00Z",
    outcome: "PUBLISHED",
    preparationSha256: preparation.sha256,
    planSha256: staged.planSha256,
    executionSha256: "b".repeat(64),
    trips: [
      {
        tripId: randomUUID(),
        createOperationId: create,
        sourceCreatorPersonId: creator,
        ownerPersonId: owner,
        personMappings: [{ sourcePersonId: creator, targetPersonId: owner }],
        ledgerSnapshotSha256: "c".repeat(64),
        operations: [
          {
            queueId: create,
            operationId: create,
            kind: "TRIP_CREATE",
            owningReceiptSha256: "d".repeat(64),
            domainReceiptId: null,
            sourceIntentSha256: null,
            mappedIntentSha256: null,
          },
        ],
      },
    ],
  };
  const receipt = {
    ...body,
    receiptSha256: await coreHashValue(
      "otr-auth-guest-adoption-receipt-v1",
      body,
      tripCoreSha256Hex,
    ),
  };
  const stage = vi.fn(async () => staged),
    publish = vi.fn(async () => receipt),
    preflight = vi.fn(async () => f.grant);
  const ports = {
    stage,
    publish,
    preflight,
    readStatus: vi.fn(async () => ({
      ...binding,
      status: "NOT_FOUND",
      nextAction: "QUERY_SERVER_STATUS",
    })),
    readReceipt: vi.fn(async () => receipt),
    cancel: vi.fn(async () => receipt),
  } satisfies GuestAdoptionHttpPorts;
  const stageRequest = { grant: f.grant, preparation },
    publicationRequest = { ...binding, planSha256: staged.planSha256 };
  const request = (
    route: string,
    input: unknown = route === "stage" ? stageRequest : publicationRequest,
    headers: Record<string, string> = {},
  ) =>
    new Request("https://example.invalid/v1/auth/guest-adoptions/" + route, {
      method: "POST",
      headers: { "Idempotency-Key": binding.adoptionId, ...headers },
      body: JSON.stringify(input),
    });
  return {
    f,
    binding,
    staged,
    receipt,
    ports,
    stageRequest,
    publicationRequest,
    request,
  };
}
it("does not intercept unrelated routes", async () => {
  const h = await harness();
  expect(guestAdoptionBodyLimit("/v2/trips")).toBeNull();
  expect(
    await guestAdoptionHttpBoundary(
      new Request("https://example.invalid/v2/trips"),
      h.f.user,
      h.ports,
    ),
  ).toBeNull();
});
it.each(["preflight", "stage", "publish", "status", "receipt", "cancel"])(
  "keeps %s closed without host-owned ports",
  async (route) => {
    const h = await harness();
    const response = await guestAdoptionHttpBoundary(
      h.request(route, undefined, {
        [guestAdoptionTargetConfirmationHeader]: h.f.user.id,
      }),
      h.f.user,
    );
    expect(response!.status).toBe(503);
  },
);
it("requires explicit matching target confirmation before the existing preflight", async () => {
  const h = await harness();
  const {
    status: _s,
    grantId: _g,
    policyVersion: _p,
    expiresAt: _e,
    ...input
  } = h.f.grant;
  expect(
    (await guestAdoptionHttpBoundary(h.request("preflight", input), h.f.user, h.ports))!
      .status,
  ).toBe(403);
  expect(h.ports.preflight).not.toHaveBeenCalled();
  const response = await guestAdoptionHttpBoundary(
    h.request("preflight", input, {
      [guestAdoptionTargetConfirmationHeader]: h.f.user.id,
    }),
    h.f.user,
    h.ports,
  );
  expect(response!.status).toBe(200);
});
it("uses only the server-grant stage and checks every returned binding", async () => {
  const h = await harness();
  const response = await guestAdoptionHttpBoundary(h.request("stage"), h.f.user, h.ports);
  expect(response!.status).toBe(200);
  expect(await response!.json()).toEqual(h.staged);
  expect(h.ports.stage).toHaveBeenCalledWith(
    h.f.user,
    h.stageRequest,
    expect.any(AbortSignal),
  );
  expect(response!.headers.get("Cache-Control")).toBe("private, no-store");
});
it.each([
  "adoptionId",
  "sourceGuestLocalId",
  "targetAccountId",
  "inventorySha256",
  "grantId",
  "preparationSha256",
])("rejects retargeted stage %s", async (key) => {
  const h = await harness();
  Object.assign(h.staged, {
    [key]: key.endsWith("Sha256") ? "f".repeat(64) : randomUUID(),
  });
  expect(
    (await guestAdoptionHttpBoundary(h.request("stage"), h.f.user, h.ports))!.status,
  ).toBe(503);
});
it("validates the owning publication receipt and exact plan", async () => {
  const h = await harness();
  const response = await guestAdoptionHttpBoundary(
    h.request("publish"),
    h.f.user,
    h.ports,
  );
  expect(response!.status).toBe(200);
  expect(await response!.json()).toEqual(h.receipt);
  h.publicationRequest.planSha256 = "f".repeat(64);
  expect(
    (await guestAdoptionHttpBoundary(h.request("publish"), h.f.user, h.ports))!.status,
  ).toBe(503);
});
it.each(["stage", "publish"])(
  "does not %s for another Account or idempotency key",
  async (route) => {
    const h = await harness();
    const input =
      route === "stage"
        ? { ...h.stageRequest, grant: { ...h.f.grant, targetAccountId: randomUUID() } }
        : { ...h.publicationRequest, targetAccountId: randomUUID() };
    expect(
      (await guestAdoptionHttpBoundary(h.request(route, input), h.f.user, h.ports))!
        .status,
    ).toBe(403);
    expect(
      (await guestAdoptionHttpBoundary(
        h.request(route, undefined, { "Idempotency-Key": randomUUID() }),
        h.f.user,
        h.ports,
      ))!.status,
    ).toBe(400);
    expect(h.ports.stage).not.toHaveBeenCalled();
    expect(h.ports.publish).not.toHaveBeenCalled();
  },
);
it("rejects anonymous classification before any owning port", async () => {
  const h = await harness();
  expect(
    (await guestAdoptionHttpBoundary(
      h.request("stage"),
      { ...h.f.user, accountClass: "ANONYMOUS" },
      h.ports,
    ))!.status,
  ).toBe(403);
  expect(h.ports.stage).not.toHaveBeenCalled();
});
it.each(["stage", "publish"])(
  "retains %s UNKNOWN without exposing owning SQL errors",
  async (route) => {
    const h = await harness(),
      code =
        route === "stage"
          ? "GUEST_ADOPTION_STAGE_OUTCOME_UNKNOWN"
          : "GUEST_ADOPTION_PUBLICATION_OUTCOME_UNKNOWN";
    h.ports[route as "stage" | "publish"].mockRejectedValueOnce(Error(code));
    const response = await guestAdoptionHttpBoundary(h.request(route), h.f.user, h.ports);
    expect(response!.status).toBe(503);
    expect(await response!.json()).toEqual({ error: { code, message: code } });
    h.ports[route as "stage" | "publish"].mockRejectedValueOnce(
      Error("private SQL password token"),
    );
    expect(
      await (await guestAdoptionHttpBoundary(
        h.request(route),
        h.f.user,
        h.ports,
      ))!.text(),
    ).not.toContain("private SQL password token");
  },
);
it("bounds stage source bytes and rejects malformed input before the owning port", async () => {
  const h = await harness();
  expect(
    (await guestAdoptionHttpBoundary(
      h.request("stage", { ...h.stageRequest, padding: "x".repeat(1048576) }),
      h.f.user,
      h.ports,
    ))!.status,
  ).toBe(413);
  expect(
    (await guestAdoptionHttpBoundary(h.request("stage", {}), h.f.user, h.ports))!.status,
  ).toBe(400);
  expect(h.ports.stage).not.toHaveBeenCalled();
  expect(guestAdoptionBodyLimit("/v1/auth/guest-adoptions/stage")).toBe(1048576);
  expect(guestAdoptionBodyLimit("/v1/auth/guest-adoptions/publish")).toBe(8192);
});
