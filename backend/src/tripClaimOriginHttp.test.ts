import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { tripClaimOriginBoundary } from "./tripClaimOriginHttp";
import type { ClaimOriginAuthority } from "../../src/data/api/claimOriginContracts";

function fixture() {
  const user = { id: randomUUID(), accountClass: "NORMAL_ACCOUNT" as const }, tripId = randomUUID();
  const input = { requestId: randomUUID(), inviteId: randomUUID(), purpose: "PERSON_CLAIM" as const,
    token: " synthetic bearer for isolated HTTP test " };
  const value = { accountId: user.id, tripId, requestId: input.requestId, inviteId: input.inviteId,
    purpose: "PERSON_CLAIM" as const, expiresAt: "2026-11-22T00:00:00Z", verified: true as const };
  const verify = vi.fn<ClaimOriginAuthority["verify"]>(async () => value);
  const post = (body: unknown = input) => new Request(`https://api.example.test/v2/trips/${tripId}/claim-origins/verify`, {
    method: "POST", body: JSON.stringify(body),
  });
  return { user, tripId, input, value, verify, post };
}
it("is closed without the qualified owning verifier and does not treat UUID possession as proof", async () => {
  const f = fixture();
  const r = await tripClaimOriginBoundary(f.post(), f.user);
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ error: { code: "CLAIM_ORIGIN_CLOSED" } });
});
it("uses normal Auth identity and forwards the opaque bearer only to the owning verifier", async () => {
  const f = fixture();
  const r = await tripClaimOriginBoundary(f.post(), f.user, { verify: f.verify });
  expect(r.status).toBe(200);
  expect(f.verify).toHaveBeenCalledExactlyOnceWith({ actorAccountId: f.user.id, tripId: f.tripId }, f.input);
  expect(await r.json()).toEqual(f.value);
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
});
it("rejects anonymous users, forged Actor, other purposes and missing bearer before owning IO", async () => {
  const f = fixture();
  expect((await tripClaimOriginBoundary(f.post(), { id: f.user.id, accountClass: "ANONYMOUS" }, { verify: f.verify })).status).toBe(403);
  for (const input of [{ ...f.input, actorAccountId: randomUUID() }, { ...f.input, purpose: "VIEWER" },
    { ...f.input, token: "" }, { requestId: f.input.requestId, inviteId: f.input.inviteId, purpose: "PERSON_CLAIM" }])
    expect((await tripClaimOriginBoundary(f.post(input), f.user, { verify: f.verify })).status).toBe(400);
  expect(f.verify).not.toHaveBeenCalled();
});
it("fails closed for unverified or foreign output and never echoes a bearer even in an exception", async () => {
  const f = fixture();
  f.verify.mockResolvedValueOnce(null);
  expect((await tripClaimOriginBoundary(f.post(), f.user, { verify: f.verify })).status).toBe(403);
  f.verify.mockResolvedValueOnce({ ...f.value, accountId: randomUUID() });
  expect((await tripClaimOriginBoundary(f.post(), f.user, { verify: f.verify })).status).toBe(503);
  f.verify.mockRejectedValueOnce(Error(f.input.token));
  const error = await tripClaimOriginBoundary(f.post(), f.user, { verify: f.verify });
  expect(error.status).toBe(503);
  expect(await error.text()).not.toContain(f.input.token);
  f.verify.mockResolvedValueOnce({ ...f.value, token: f.input.token } as never);
  expect((await tripClaimOriginBoundary(f.post(), f.user, { verify: f.verify })).status).toBe(503);
});
it("bounds sensitive body parsing without claiming a token-format or product length policy", async () => {
  const f = fixture();
  const r = await tripClaimOriginBoundary(f.post({ ...f.input, token: "x".repeat(9000) }), f.user, { verify: f.verify });
  expect(r.status).toBe(400);
  expect(f.verify).not.toHaveBeenCalled();
});
it("reads only the current verified request's safe Person projection and distinguishes empty from denied", async () => {
  const f = fixture(), base = `https://api.example.test/v2/trips/${f.tripId}/claim-origins/${f.input.inviteId}/requests/${f.input.requestId}/people`;
  const value = { version: 1 as const, accountId: f.user.id, tripId: f.tripId, requestId: f.input.requestId, inviteId: f.input.inviteId,
    expiresAt: f.value.expiresAt, tripName: "Synthetic Trip", persons: [], nextPersonId: null };
  const initialPersons = vi.fn(async () => value as typeof value | null);
  const port = { verify: f.verify, initialPersons };
  expect((await tripClaimOriginBoundary(new Request(base), f.user, { verify: f.verify })).status).toBe(503);
  const result = await tripClaimOriginBoundary(new Request(base), f.user, port);
  expect(result.status).toBe(200); expect(await result.json()).toEqual(value);
  expect(initialPersons).toHaveBeenCalledExactlyOnceWith({ actorAccountId: f.user.id, tripId: f.tripId }, { requestId: f.input.requestId, inviteId: f.input.inviteId, afterPersonId: null });
  initialPersons.mockResolvedValueOnce(null); expect((await tripClaimOriginBoundary(new Request(base), f.user, port)).status).toBe(404);
  expect(f.verify).not.toHaveBeenCalled();
});
it("rejects foreign/prohibited fields and invalid cursor without leaking an authoritative roster", async () => {
  const f = fixture(), base = `https://api.example.test/v2/trips/${f.tripId}/claim-origins/${f.input.inviteId}/requests/${f.input.requestId}/people`;
  const value = { version: 1 as const, accountId: randomUUID(), tripId: f.tripId, requestId: f.input.requestId, inviteId: f.input.inviteId,
    expiresAt: f.value.expiresAt, tripName: "Synthetic Trip", persons: [], nextPersonId: null };
  const initialPersons = vi.fn(async () => value), port = { verify: f.verify, initialPersons };
  expect((await tripClaimOriginBoundary(new Request(base), f.user, port)).status).toBe(503);
  const count = initialPersons.mock.calls.length;
  for (const query of ["?after=bad", `?after=${randomUUID()}&after=${randomUUID()}`, `?accountId=${f.user.id}`])
    expect((await tripClaimOriginBoundary(new Request(base + query), f.user, port)).status).toBe(400);
  expect(initialPersons).toHaveBeenCalledTimes(count);
});
