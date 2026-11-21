import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";

function fixture() {
  const actor = randomUUID(), invite = randomUUID(), trip = randomUUID();
  const detail = { version: 1 as const, accountId: actor, invitation: {
    inviteId: invite, tripId: trip, personId: randomUUID(), tripName: "Synthetic Trip",
    personName: "Synthetic Person", status: "PENDING" as const, expiresAt: "2026-11-20T00:00:00Z",
  }};
  const validateAccessToken = vi.fn(async () => ({ id: actor, accountClass: "NORMAL_ACCOUNT" as const }));
  const canReadTrip = vi.fn(async () => false);
  const gateway = { validateAccessToken, canReadTrip } as unknown as DevBackendGateway;
  const port = { recipients: vi.fn(async () => ({ version: 1 as const, accountId: actor, tripId: trip, recipients: [] })),
    invitation: vi.fn(async () => detail) };
  const request = (path = `/v1/account/directed-invitations/${invite}`, token = "unit-normal") =>
    new Request(`https://api.example.test${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { actor, invite, trip, detail, gateway, port, request, validateAccessToken, canReadTrip };
}
it("keeps unprovided reader honestly closed", async () => {
  const f = fixture();
  const result = await createDevBackendHandler({ gateway: f.gateway })(f.request());
  expect(result.status).toBe(503);
  expect(await result.json()).toMatchObject({ error: { code: "DIRECTED_INVITE_READ_UNAVAILABLE" } });
});
it("routes normal B to exact owning preview before membership without trusting actor headers", async () => {
  const f = fixture();
  const request = f.request(); request.headers.set("X-OTR-Actor-Account-Id", randomUUID());
  const result = await createDevBackendHandler({ gateway: f.gateway, directedInviteReadPort: f.port })(request);
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(f.detail);
  expect(f.port.invitation).toHaveBeenCalledWith({ accountId: f.actor, inviteId: f.invite });
  expect(f.canReadTrip).not.toHaveBeenCalled();
});
it("routes A recipient reads with authenticated scope", async () => {
  const f = fixture();
  expect((await createDevBackendHandler({ gateway: f.gateway, directedInviteReadPort: f.port })(
    f.request(`/v2/trips/${f.trip}/directed-invite-recipients`))).status).toBe(200);
  expect(f.port.recipients).toHaveBeenCalledWith({ accountId: f.actor, tripId: f.trip });
});
it("rejects guest before the owning reader", async () => {
  const f = fixture();
  f.validateAccessToken.mockResolvedValueOnce({ id: f.actor, accountClass: "GUEST" } as never);
  expect((await createDevBackendHandler({ gateway: f.gateway, directedInviteReadPort: f.port })(f.request())).status).toBe(403);
  expect(f.port.invitation).not.toHaveBeenCalled();
});
it("rejects missing/invalid authenticated account", async () => {
  const f = fixture();f.validateAccessToken.mockResolvedValueOnce(null as never);
  expect((await createDevBackendHandler({ gateway: f.gateway, directedInviteReadPort: f.port })(f.request())).status).toBe(401);
  expect(f.port.invitation).not.toHaveBeenCalled();
});
it("fails closed for wrong-account owning output", async () => {
  const f = fixture();f.port.invitation.mockResolvedValueOnce({ ...f.detail, accountId: randomUUID() });
  expect((await createDevBackendHandler({ gateway: f.gateway, directedInviteReadPort: f.port })(f.request())).status).toBe(503);
});
it("reports missing SQL EXEC as unavailable rather than empty or not-visible", async () => {
  const f = fixture();
  f.port.invitation.mockRejectedValueOnce(Object.assign(Error("synthetic internal SQL detail"), { code: "42501" }));
  const response = await createDevBackendHandler({ gateway: f.gateway, directedInviteReadPort: f.port })(f.request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: { code: "DIRECTED_INVITE_READ_UNAVAILABLE" } });
});
it("incoming collection reaches owning Reader with only authenticated Account", async () => {
  const f = fixture();
  const value = { version: 1 as const, accountId: f.actor, invitations: [{ tripId: f.trip, inviteId: f.invite }] };
  const incoming = vi.fn(async () => value);
  const response = await createDevBackendHandler({ gateway: f.gateway, directedInviteReadPort: { ...f.port, incoming } })(
    f.request("/v1/account/directed-invitations"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(value);
  expect(incoming).toHaveBeenCalledExactlyOnceWith({ accountId: f.actor });
  expect(f.canReadTrip).not.toHaveBeenCalled();
});
it("incoming collection stays unavailable for an old provider without incoming", async () => {
  const f = fixture();
  const response = await createDevBackendHandler({ gateway: f.gateway, directedInviteReadPort: f.port })(
    f.request("/v1/account/directed-invitations"));
  expect(response.status).toBe(503);
});
