import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { createGeneralClaimIntake } from "./generalClaimIntake";

async function fixture() {
  let accountId = randomUUID();
  const account = async () => accountId, context = await captureAccountRequestContext(randomUUID(), account);
  const rows = new Map<string, string>();
  const storage = { getItem: vi.fn(async (key: string) => rows.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { rows.set(key, value); }), deleteItem: vi.fn(async (key: string) => { rows.delete(key); }) };
  const verify = vi.fn(async (scope: typeof context, input: { requestId: string; inviteId: string; purpose: "PERSON_CLAIM"; token: string }) => ({
    accountId: scope.accountId, tripId: scope.tripId, requestId: input.requestId, inviteId: input.inviteId,
    purpose: input.purpose, verified: true as const, expiresAt: "2026-11-23T00:00:00Z",
  }));
  const input = { tripId: context.tripId, inviteId: randomUUID(), purpose: "PERSON_CLAIM" as const, token: "synthetic opaque bearer" };
  const open = () => createGeneralClaimIntake(storage, account, verify);
  return { context, rows, storage, verify, input, open, account,
    switch() { accountId = randomUUID(); advanceAccountGeneration(); } };
}
it("captures before login without authority and returns only references with a stable request ID across cold reopen", async () => {
  const f = await fixture(), c = f.open();
  const ref = await c.capture(f.input);
  expect(ref).toEqual({ tripId: f.input.tripId, inviteId: f.input.inviteId, requestId: expect.any(String) });
  expect(JSON.stringify(ref)).not.toContain(f.input.token);
  expect(await f.open().capture(f.input)).toEqual(ref);
  expect(f.verify).not.toHaveBeenCalled();
  await expect(c.reference(f.context)).rejects.toThrow("EXPLICIT_ACCOUNT_REQUIRED");
  await expect(c.verify(f.context)).rejects.toThrow("EXPLICIT_ACCOUNT_REQUIRED");
});
it("requires explicit account confirmation and preserves exactly one request through actual verifier input", async () => {
  const f = await fixture(), c = f.open(), ref = await c.capture(f.input);
  await expect(c.confirmAccount(f.context, randomUUID())).rejects.toThrow("TARGET_CHANGED");
  await c.confirmAccount(f.context, ref.requestId);
  expect(await f.open().reference(f.context)).toEqual(ref);
  const result = await f.open().verify(f.context);
  expect(f.verify).toHaveBeenCalledExactlyOnceWith(f.context, { requestId: ref.requestId, inviteId: f.input.inviteId, purpose: f.input.purpose, token: f.input.token });
  expect(result).not.toHaveProperty("token"); expect(result).not.toHaveProperty("membership");
  expect(f.rows.size).toBe(1); expect([...f.rows.keys()][0]).not.toContain("member-claim-attempt");
});
it("does not overwrite a pending source or discard one already bound to an account", async () => {
  const f = await fixture(), c = f.open(), ref = await c.capture(f.input);
  const before = [...f.rows];
  await expect(c.capture({ ...f.input, inviteId: randomUUID() })).rejects.toThrow("PENDING");
  expect([...f.rows]).toEqual(before);
  await c.confirmAccount(f.context, ref.requestId);
  await expect(c.discardBeforeLogin(ref.requestId)).rejects.toThrow("TARGET_CHANGED");
  await expect(c.capture(f.input)).rejects.toThrow("PENDING");
});
it("another normal account cannot read, rebind, verify or cancel retained private intent", async () => {
  const f = await fixture(), c = f.open(), ref = await c.capture(f.input);
  await c.confirmAccount(f.context, ref.requestId); const before = [...f.rows];
  f.switch(); const other = await captureAccountRequestContext(f.context.tripId, f.account);
  await expect(c.reference(other)).rejects.toThrow("EXPLICIT_ACCOUNT_REQUIRED");
  await expect(c.confirmAccount(other, ref.requestId)).rejects.toThrow("TARGET_CHANGED");
  await expect(c.verify(other)).rejects.toThrow(); await expect(c.cancel(other, ref.requestId)).rejects.toThrow();
  expect(f.verify).not.toHaveBeenCalled(); expect([...f.rows]).toEqual(before);
});
it("rejects late verification after generation switch, cancellation, or mismatched server binding", async () => {
  for (const scenario of ["switch", "cancel", "server"] as const) {
    const f = await fixture(), c = f.open(), ref = await c.capture(f.input);
    await c.confirmAccount(f.context, ref.requestId);
    const original = f.verify.getMockImplementation()!;
    f.verify.mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      if (scenario === "switch") f.switch();
      if (scenario === "cancel") await c.cancel(f.context, ref.requestId);
      return scenario === "server" ? { ...result, requestId: randomUUID() } : result;
    });
    await expect(c.verify(f.context)).rejects.toThrow(); expect(f.verify).toHaveBeenCalledOnce();
  }
});
it("redacts provider and corrupted storage failures and retains UNKNOWN intent without retries", async () => {
  const f = await fixture(), c = f.open(), ref = await c.capture(f.input);
  await c.confirmAccount(f.context, ref.requestId); const before = [...f.rows];
  f.verify.mockRejectedValueOnce(Error(f.input.token));
  await expect(c.verify(f.context)).rejects.toThrow("GENERAL_INTAKE_VERIFICATION_UNAVAILABLE");
  expect(f.verify).toHaveBeenCalledOnce(); expect([...f.rows]).toEqual(before);
  f.storage.getItem.mockResolvedValueOnce(f.input.token);
  await expect(c.reference(f.context)).rejects.toThrow("GENERAL_INTAKE_UNAVAILABLE");
});
it("bounds UTF8 verifier body bytes before persisting and supports explicit prelogin cancellation", async () => {
  const f = await fixture(), c = f.open();
  await expect(c.capture({ ...f.input, token: "李".repeat(3000) })).rejects.toThrow("INVALID");
  expect(f.rows.size).toBe(0);
  const ref = await c.capture(f.input); await c.discardBeforeLogin(ref.requestId);
  expect(f.rows.size).toBe(0);
});
it("sanitizes secure persistence errors without falling back to ordinary storage", async () => {
  const f = await fixture(); f.storage.setItem.mockRejectedValueOnce(Error(f.input.token));
  await expect(f.open().capture(f.input)).rejects.toThrow("GENERAL_INTAKE_UNAVAILABLE");
  expect(f.rows.size).toBe(0); expect(f.verify).not.toHaveBeenCalled();
});
it("does not bind an account that switched while reading its prelogin intent", async () => {
  const f = await fixture(), c = f.open(), ref = await c.capture(f.input), before = [...f.rows];
  f.storage.getItem.mockImplementationOnce(async key => { f.switch(); return f.rows.get(key) ?? null; });
  await expect(c.confirmAccount(f.context, ref.requestId)).rejects.toThrow();
  expect([...f.rows]).toEqual(before); expect(f.storage.setItem).toHaveBeenCalledOnce();
});
it.each(["bound", "unbound"] as const)("redacts failed %s cancellation and retains the original secure intent", async state => {
  const f = await fixture(), c = f.open(), ref = await c.capture(f.input);
  if (state === "bound") await c.confirmAccount(f.context, ref.requestId);
  const before = [...f.rows]; f.storage.deleteItem.mockRejectedValueOnce(Error(f.input.token));
  const action = state === "bound" ? c.cancel(f.context, ref.requestId) : c.discardBeforeLogin(ref.requestId);
  await expect(action).rejects.toThrow("GENERAL_INTAKE_UNAVAILABLE");
  expect([...f.rows]).toEqual(before); expect(f.verify).not.toHaveBeenCalled();
});
it("resumes prelogin and same-account cold navigation using references only and explicit confirmation flag", async () => {
  const f = await fixture(), c = f.open(); expect(await c.continuationReference()).toBeNull();
  const ref = await c.capture(f.input);
  expect(await f.open().continuationReference()).toEqual({ reference: ref, requiresAccountConfirmation: true });
  await c.confirmAccount(f.context, ref.requestId);
  expect(await f.open().continuationReference()).toEqual({ reference: ref, requiresAccountConfirmation: false });
  expect(JSON.stringify(await c.continuationReference())).not.toContain(f.input.token);
  f.switch(); expect(await c.continuationReference()).toBeNull();
});
