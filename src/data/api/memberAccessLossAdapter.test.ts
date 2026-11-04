import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createMemberAccessLossAdapter } from "./memberAccessLossAdapter";

async function fixture() {
  let active = randomUUID();
  const account = async () => active;
  const context = await captureAccountRequestContext(randomUUID(), account);
  const observation = {
    schemaId: "otr.trip.core-access-loss/1",
    accountId: context.accountId,
    tripId: context.tripId,
    personId: randomUUID(),
    state: "ACCESS_REVOKED",
    coreReference: { epoch: randomUUID(), revision: 17, accessRevision: 9 },
  };
  const wire = vi.fn(async () => Response.json(observation));
  const revoke = vi.fn(async () => {});
  const observe = createMemberAccessLossAdapter(
    account,
    { revoke },
    {
      baseUrl: "https://api-dev.xoery.art",
      fetchImplementation: wire,
    },
    async () => ({ userId: active, token: "synthetic-unit-session-only" }),
  );
  return {
    context,
    observation,
    wire,
    revoke,
    observe,
    switchAccount() {
      active = randomUUID();
    },
  };
}
it("uses self-authenticated GET and the actual Core accessRevision for this Account's existing cache", async () => {
  const f = await fixture();
  await expect(f.observe(f.context)).resolves.toEqual({
    status: "ACCESS_REVOKED",
    observation: f.observation,
  });
  expect(f.revoke).toHaveBeenCalledExactlyOnceWith(f.context, 9);
  const [url, init] = f.wire.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(
    `https://api-dev.xoery.art/v2/trips/${f.context.tripId}/core/access-loss`,
  );
  expect(init.method).toBe("GET");
  expect(init.body).toBeUndefined();
  expect(init.redirect).toBe("error");
  expect(new Headers(init.headers).get("X-OTR-Core-Contract-Version")).toBe("2");
});
it("keeps a generic404 unconfirmed rather than granting or revoking access", async () => {
  const f = await fixture();
  f.wire.mockImplementation(async () =>
    Response.json({ error: { code: "NOT_VISIBLE" } }, { status: 404 }),
  );
  await expect(f.observe(f.context)).resolves.toEqual({ status: "ABSENT_UNCONFIRMED" });
  expect(f.revoke).not.toHaveBeenCalled();
});
it("propagates unavailable/network failure without optimistic cache revocation", async () => {
  const f = await fixture();
  f.wire
    .mockImplementationOnce(async () => Response.json({}, { status: 503 }))
    .mockRejectedValueOnce(Error("offline"));
  await expect(f.observe(f.context)).rejects.toThrow();
  await expect(f.observe(f.context)).rejects.toThrow();
  expect(f.revoke).not.toHaveBeenCalled();
});
it("rejects foreign Account, Trip, malformed reference and an Owner receipt as a loss observation", async () => {
  const f = await fixture();
  for (const raw of [
    { ...f.observation, accountId: randomUUID() },
    { ...f.observation, tripId: randomUUID() },
    {
      ...f.observation,
      coreReference: { ...f.observation.coreReference, accessRevision: 0 },
    },
    {
      projection: "FULL",
      receipt: { accessTransition: { targetAccountId: f.context.accountId } },
    },
  ]) {
    f.wire.mockImplementationOnce(async () => Response.json(raw));
    await expect(f.observe(f.context)).rejects.toThrow();
  }
  expect(f.revoke).not.toHaveBeenCalled();
});
it("fences a retired Account before IO and late Account/generation responses before cache apply", async () => {
  const retired = await fixture();
  retired.switchAccount();
  await expect(retired.observe(retired.context)).rejects.toThrow();
  expect(retired.wire).not.toHaveBeenCalled();
  for (const change of ["account", "generation"]) {
    const f = await fixture();
    f.wire.mockImplementationOnce(async () => {
      if (change === "account") f.switchAccount();
      else advanceAccountGeneration();
      return Response.json(f.observation);
    });
    await expect(f.observe(f.context)).rejects.toThrow();
    expect(f.revoke).not.toHaveBeenCalled();
  }
});
it("does not claim local invalidation success when the owning repository fails", async () => {
  const f = await fixture();
  f.revoke.mockRejectedValueOnce(Error("local transaction failed"));
  await expect(f.observe(f.context)).rejects.toThrow("local transaction failed");
});
