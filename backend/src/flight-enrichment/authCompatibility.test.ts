import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "../app";
import type { AuthAccountClass } from "../authAccountQualification";

const accountId = "ef610000-0000-4000-8000-000000000001";
const tripId = "ef610000-0000-4000-8000-000000000002";
const path = `https://backend.invalid/v1/trips/${tripId}/flight-enrichment`;
function fixture(accountClass?: AuthAccountClass) {
  const authenticate = vi.fn(async () => ({ id: accountId, accountClass }));
  const canReadTrip = vi.fn(async () => true);
  const enrich = vi.fn(async () => ({ marker: "TEST_ONLY" }));
  const handler = createDevBackendHandler({
    gateway: {
      validateAccessToken: authenticate,
      canReadTrip,
    } as unknown as DevBackendGateway,
    flightEnrichmentEnabled: true,
    flightEnrichmentService: { enrich } as never,
  });
  return { handler, authenticate, canReadTrip, enrich };
}
const headers = { Authorization: "Bearer local-synthetic-fixture" };
const input = {
  version: "otr-flight-enrichment/1",
  requestId: "request-1",
  idempotencyKey: "request-1",
  mode: "CREATE",
  draft: { id: "draft-1", revision: 1 },
  flightNumber: "NZ501",
  departureLocalDate: "2026-12-14",
  knownFields: {},
};
it.each(["ANONYMOUS", "UNKNOWN", undefined] as const)(
  "non-normal %s identity cannot reach an enabled Enrichment service despite Trip read access",
  async (classification) => {
    const f = fixture(classification);
    expect(
      (await f.handler(new Request(path + "/capabilities", { headers }))).status,
    ).toBe(401);
    expect(
      (
        await f.handler(
          new Request(path, { method: "POST", headers, body: JSON.stringify(input) }),
        )
      ).status,
    ).toBe(401);
    expect(f.enrich).not.toHaveBeenCalled();
  },
);
it("normal Account retains ordinary Trip-scoped capability forwarding", async () => {
  const f = fixture("NORMAL_ACCOUNT");
  const response = await f.handler(new Request(path + "/capabilities", { headers }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    version: "otr-flight-enrichment/1",
    enabled: true,
  });
  expect(f.canReadTrip).toHaveBeenCalledWith(accountId, tripId);
  expect(f.enrich).not.toHaveBeenCalled();
});
it("classification changing after resolution prevents provider work without replacing the identity", async () => {
  const f = fixture("NORMAL_ACCOUNT");
  f.authenticate.mockResolvedValueOnce({ id: accountId, accountClass: "NORMAL_ACCOUNT" });
  f.authenticate.mockResolvedValue({ id: accountId, accountClass: "ANONYMOUS" });
  expect(
    (
      await f.handler(
        new Request(path, { method: "POST", headers, body: JSON.stringify(input) }),
      )
    ).status,
  ).toBe(401);
  expect(f.enrich).not.toHaveBeenCalled();
});
