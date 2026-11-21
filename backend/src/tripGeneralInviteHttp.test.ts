import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { tripGeneralInviteBoundary } from "./tripGeneralInviteHttp";
import type { GeneralInviteAuthority } from "../../src/data/api/generalInviteContracts";

function fixture() {
  const user = { id: randomUUID(), accountClass: "NORMAL_ACCOUNT" as const }, tripId = randomUUID();
  const input = { operationId: randomUUID(), expiresAt: null, maxUses: 1 };
  const issue = vi.fn<GeneralInviteAuthority["issue"]>(async () => ({ status: "DENIED" }));
  const recover = vi.fn<GeneralInviteAuthority["recover"]>(async () => ({ status: "ABSENT_UNCONFIRMED" }));
  const delivery = vi.fn<GeneralInviteAuthority["delivery"]>(async () => null);
  const request = (suffix = "", body: unknown = input) => new Request(`https://unit.test/v2/trips/${tripId}/general-invite-operations${suffix}`, {
    method: "POST", headers: { "Idempotency-Key": input.operationId }, body: JSON.stringify(body),
  });
  return { user, tripId, input, port: { issue, recover, delivery }, request };
}
it("default closes issuer/recovery/delivery without invoking another authority", async () => {
  const f = fixture();
  for (const suffix of ["", "/recovery", "/delivery"]) expect((await tripGeneralInviteBoundary(f.request(suffix), f.user)).status).toBe(503);
  expect(f.port.issue).not.toHaveBeenCalled();
});
it("rejects missing explicit limits, role/actor injection and wrong original key before owning call", async () => {
  const f = fixture();
  for (const body of [{ operationId: f.input.operationId, expiresAt: null }, { ...f.input, actorAccountId: randomUUID() }, { ...f.input, maxUses: 0 }])
    expect((await tripGeneralInviteBoundary(f.request("", body), f.user, f.port)).status).toBe(400);
  const wrong = f.request(); wrong.headers.set("Idempotency-Key", randomUUID());
  expect((await tripGeneralInviteBoundary(wrong, f.user, f.port)).status).toBe(400); expect(f.port.issue).not.toHaveBeenCalled();
});
it("passes only normal server identity and distinguishes recovery from issuer and delivery", async () => {
  const f = fixture();
  expect((await tripGeneralInviteBoundary(f.request(), f.user, f.port)).status).toBe(403);
  expect(f.port.issue).toHaveBeenCalledExactlyOnceWith({ actorAccountId: f.user.id, tripId: f.tripId }, f.input);
  expect((await tripGeneralInviteBoundary(f.request("/recovery", { operationId: f.input.operationId }), f.user, f.port)).status).toBe(202);
  expect(f.port.recover).toHaveBeenCalledExactlyOnceWith({ actorAccountId: f.user.id, tripId: f.tripId }, f.input.operationId);
  expect((await tripGeneralInviteBoundary(f.request("/delivery", { operationId: f.input.operationId }), f.user, f.port)).status).toBe(403);
  expect(f.port.issue).toHaveBeenCalledOnce();
});
it("never echoes sensitive delivery error or accepts a foreign account delivery", async () => {
  const f = fixture(), marker = "synthetic-sensitive-marker";
  f.port.delivery.mockRejectedValueOnce(Error(marker));
  const result = await tripGeneralInviteBoundary(f.request("/delivery", { operationId: f.input.operationId }), f.user, f.port);
  expect(result.status).toBe(503); expect(await result.text()).not.toContain(marker);
  f.port.delivery.mockResolvedValueOnce({ accountId: randomUUID(), tripId: f.tripId, operationId: f.input.operationId,
    inviteId: randomUUID(), token: marker, expiresAt: "2026-11-23T00:00:00Z" });
  const foreign = await tripGeneralInviteBoundary(f.request("/delivery", { operationId: f.input.operationId }), f.user, f.port);
  expect(foreign.status).toBe(503); expect(await foreign.text()).not.toContain(marker);
});
