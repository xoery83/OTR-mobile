import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { createGeneralInviteRepository } from "./generalInviteRepository";
import { createMemberClaimAttemptRepository } from "./memberClaimAttemptRepository";
import { tripGeneralInviteBoundary } from "../../../backend/src/tripGeneralInviteHttp";
import type { GeneralInviteAuthority, GeneralInviteIssue } from "@/data/api/generalInviteContracts";

async function fixture() {
  let accountId = randomUUID(); const account = async () => accountId;
  const context = await captureAccountRequestContext(randomUUID(), account);
  const original = { operationId: randomUUID(), expiresAt: null, maxUses: 1 };
  const receipt = { receiptVersion: 3 as const, operationId: original.operationId, actorAccountId: context.accountId,
    tripId: context.tripId, inviteId: randomUUID(), intentDigest: "a".repeat(64), sourceFingerprint: "b".repeat(64),
    purpose: "PERSON_CLAIM" as const, outcome: "GENERAL_INVITE_ISSUED" as const, expiresAt: "2026-11-23T00:00:00Z",
    maxUses: original.maxUses, acceptedAt: "2026-11-16T00:00:00Z" };
  const issue = vi.fn<GeneralInviteAuthority["issue"]>(async () => ({ status: "RECORDED", receipt }));
  const recover = vi.fn<GeneralInviteAuthority["recover"]>(async () => ({ status: "ABSENT_UNCONFIRMED" }));
  const token = "synthetic share-only bearer";
  const delivery = vi.fn<GeneralInviteAuthority["delivery"]>(async () => ({ accountId: context.accountId, tripId: context.tripId,
    operationId: original.operationId, inviteId: receipt.inviteId, token, expiresAt: receipt.expiresAt }));
  const port = { issue, recover, delivery };
  const wire = vi.fn<typeof fetch>(async (url, init) => tripGeneralInviteBoundary(new Request(url, init), { id: context.accountId, accountClass: "NORMAL_ACCOUNT" }, port));
  const authority = createGeneralInviteRepository(account, { baseUrl: "https://api.example.test", fetchImplementation: wire },
    async () => ({ userId: accountId, token: "synthetic-unit-normal" }));
  const rows = new Map<string, string>();
  const storage = { getItem: vi.fn(async (key: string) => rows.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { rows.set(key, value); }), deleteItem: vi.fn(async (key: string) => { rows.delete(key); }) };
  const open = () => createMemberClaimAttemptRepository(storage, account, undefined, undefined, authority);
  return { account, context, original, receipt, token, port, wire, authority, rows, storage, open,
    switch() { accountId = randomUUID(); advanceAccountGeneration(); } };
}
it("uses normal HTTP and a single existing private slot; accepted archive survives cold reopen without blocking resolution", async () => {
  const f = await fixture(), a = f.open();
  await a.issueGeneralInviteOnce(f.context, f.original);
  expect(f.port.issue).toHaveBeenCalledExactlyOnceWith({ actorAccountId: f.context.accountId, tripId: f.context.tripId }, f.original);
  expect((await a.readGeneralInvite(f.context))?.receipt).toEqual(f.receipt);
  await expect(a.issueGeneralInviteOnce(f.context, { ...f.original, operationId: randomUUID() })).rejects.toThrow("RECOVER_ORIGINAL");
  await a.clearResolvedGeneralInvite(f.context, f.original.operationId);
  expect((await f.open().readGeneralInvite(f.context))?.receipt).toEqual(f.receipt);
  expect(await f.open().readResolution(f.context)).toBeNull();
  await f.open().clearResolvedGeneralInvite(f.context, f.original.operationId);
  await expect(a.issueGeneralInviteOnce(f.context, f.original)).rejects.toThrow("ALREADY_RESOLVED");
  expect(f.port.issue).toHaveBeenCalledOnce();
});
it("cold UNKNOWN reads the original operation only; missing recovery never frees a new dispatch", async () => {
  const f = await fixture(), a = f.open(); f.wire.mockRejectedValueOnce(Error("response lost"));
  await expect(a.issueGeneralInviteOnce(f.context, f.original)).rejects.toThrow();
  expect((await f.open().readGeneralInvite(f.context))?.original).toEqual(f.original);
  await expect(f.open().recoverGeneralInvite(f.context)).resolves.toEqual({ status: "ABSENT_UNCONFIRMED" });
  expect(f.port.recover).toHaveBeenCalledExactlyOnceWith({ actorAccountId: f.context.accountId, tripId: f.context.tripId }, f.original.operationId);
  await expect(f.open().clearResolvedGeneralInvite(f.context, f.original.operationId)).rejects.toThrow("UNRESOLVED");
  await expect(f.open().issueGeneralInviteOnce(f.context, { ...f.original, operationId: randomUUID() })).rejects.toThrow("RECOVER_ORIGINAL");
  expect(f.wire).toHaveBeenCalledTimes(2); expect(f.port.issue).not.toHaveBeenCalled();
});
it("retains recovered receipt and cannot reinterpret foreign variant or changed intent as accepted", async () => {
  const f = await fixture(), a = f.open(); f.wire.mockRejectedValueOnce(Error("lost"));
  await expect(a.issueGeneralInviteOnce(f.context, f.original)).rejects.toThrow();
  f.port.recover.mockResolvedValueOnce({ status: "FOUND", receipt: f.receipt });
  await expect(a.recoverGeneralInvite(f.context)).resolves.toEqual({ status: "FOUND", receipt: f.receipt });
  await expect(f.authority.delivery(f.context, { ...f.original, maxUses: 2 }, f.receipt)).rejects.toThrow("BINDING");
  expect(f.port.delivery).not.toHaveBeenCalled();
  f.port.issue.mockResolvedValueOnce({ status: "RECORDED", receipt: { ...f.receipt, actorAccountId: randomUUID() } });
  await expect(f.authority.issue(f.context, f.original)).resolves.toEqual({ status: "UNAVAILABLE" });
});
it("exposes bearer only through explicit fresh delivery, never original receipt or private checkpoint", async () => {
  const f = await fixture(), a = f.open(); await a.issueGeneralInviteOnce(f.context, f.original);
  await a.clearResolvedGeneralInvite(f.context, f.original.operationId);
  expect(f.port.delivery).not.toHaveBeenCalled();
  const value = await f.authority.delivery(f.context, f.original, f.receipt);
  expect(value.token).toBe(f.token); expect(f.port.delivery).toHaveBeenCalledOnce();
  expect(JSON.stringify([...f.rows])).not.toContain(f.token);
  expect(JSON.stringify(f.receipt)).not.toContain(f.token);
  f.port.delivery.mockResolvedValueOnce(null);
  await expect(f.authority.delivery(f.context, f.original, f.receipt)).rejects.toThrow();
  f.port.delivery.mockRejectedValueOnce(Error(f.token));
  await expect(f.authority.delivery(f.context, f.original, f.receipt)).rejects.not.toThrow(f.token);
});
it.each(["CONFLICT", "DENIED", "CLOSED"] as const)("archives only fresh typed %s no-mutation and never reuses that operation", async status => {
  const f = await fixture(), a = f.open(); f.port.issue.mockResolvedValueOnce({ status });
  await a.issueGeneralInviteOnce(f.context, f.original);
  expect((await a.readGeneralInvite(f.context))?.rejection).not.toBeNull();
  await a.clearResolvedGeneralInvite(f.context, f.original.operationId);
  await expect(a.issueGeneralInviteOnce(f.context, f.original)).rejects.toThrow("ALREADY_RESOLVED");
});
it("generic HTTP409 and recovery closure/conflict preserve the original UNKNOWN", async () => {
  const f = await fixture(), a = f.open(); f.wire.mockResolvedValueOnce(Response.json({ error: { code: "UNKNOWN" } }, { status: 409 }));
  await expect(a.issueGeneralInviteOnce(f.context, f.original)).rejects.toThrow();
  f.port.recover.mockResolvedValueOnce({ status: "CLOSED" });
  await a.recoverGeneralInvite(f.context); expect((await a.readGeneralInvite(f.context))?.rejection).toBeNull();
  f.port.recover.mockResolvedValueOnce({ status: "CONFLICT" }); await a.recoverGeneralInvite(f.context);
  expect((await a.readGeneralInvite(f.context))?.rejection).toBeNull();
  await expect(a.clearResolvedGeneralInvite(f.context, f.original.operationId)).rejects.toThrow("UNRESOLVED");
  await expect(a.issueGeneralInviteOnce(f.context, { ...f.original, operationId: randomUUID() })).rejects.toThrow("RECOVER_ORIGINAL_REQUIRED");
});
it("checks valid input/storage before POST and never overwrites v1/v2 originals", async () => {
  const f = await fixture(), a = f.open();
  await expect(a.issueGeneralInviteOnce(f.context, { operationId: randomUUID(), expiresAt: null } as GeneralInviteIssue)).rejects.toThrow();
  expect(f.wire).not.toHaveBeenCalled();
  f.storage.setItem.mockRejectedValueOnce(Error("unavailable"));
  await expect(a.issueGeneralInviteOnce(f.context, f.original)).rejects.toThrow(); expect(f.wire).not.toHaveBeenCalled();
  const key = `otr.member-claim-attempt.v1.${f.context.accountId}.${f.context.tripId}`;
  f.rows.set(key, JSON.stringify({ version: 1, accountId: f.context.accountId, tripId: f.context.tripId,
    original: { kind: "CLAIM_PERSON", tripId: f.context.tripId, operationId: randomUUID(), personId: randomUUID(), inviteId: randomUUID(), explicitConsent: true }, outcome: null, rejection: null }));
  const before = [...f.rows]; await expect(a.issueGeneralInviteOnce(f.context, f.original)).rejects.toThrow("RECOVER_ORIGINAL");
  expect([...f.rows]).toEqual(before); expect(f.wire).not.toHaveBeenCalled();
});
it("fences a late delivery after account switch", async () => {
  const f = await fixture(); f.port.delivery.mockImplementationOnce(async () => { f.switch(); return { accountId: f.context.accountId,
    tripId: f.context.tripId, operationId: f.original.operationId, inviteId: f.receipt.inviteId, token: f.token, expiresAt: f.receipt.expiresAt }; });
  await expect(f.authority.delivery(f.context, f.original, f.receipt)).rejects.toThrow();
});

it.each([403, 503])("keeps a lost original after HTTP%s recovery refusal", async (status) => {
  const f = await fixture(), a = f.open();
  f.wire.mockRejectedValueOnce(Error("lost"));
  await expect(a.issueGeneralInviteOnce(f.context, f.original)).rejects.toThrow();
  const bytes = [...f.rows.values()][0];
  f.wire.mockResolvedValueOnce(Response.json(status === 403 ? { error: { code: "DENIED" } } : { status: "CLOSED" }, { status }));
  await a.recoverGeneralInvite(f.context).catch(() => undefined);
  expect([...f.rows.values()][0]).toBe(bytes);
  await expect(a.clearResolvedGeneralInvite(f.context, f.original.operationId)).rejects.toThrow("UNRESOLVED");
});
it("does not clear a historical rejection whose initial-execution provenance is absent", async () => {
  const f = await fixture(), a = f.open();
  f.port.issue.mockResolvedValueOnce({ status: "DENIED" });
  await a.issueGeneralInviteOnce(f.context, f.original);
  const [key, raw] = [...f.rows.entries()][0]; const prior = JSON.parse(raw); delete prior.rejectionSource;
  const bytes = JSON.stringify(prior); f.rows.set(key, bytes);
  f.port.recover.mockResolvedValueOnce({ status: "CONFLICT" });
  await f.open().recoverGeneralInvite(f.context);
  expect(f.rows.get(key)).toBe(bytes);
  await expect(f.open().clearResolvedGeneralInvite(f.context, f.original.operationId)).rejects.toThrow("UNRESOLVED");
  f.port.recover.mockResolvedValueOnce({ status: "FOUND", receipt: f.receipt });
  await f.open().recoverGeneralInvite(f.context);
  expect((await f.open().readGeneralInvite(f.context))?.receipt).toEqual(f.receipt);
  await f.open().clearResolvedGeneralInvite(f.context, f.original.operationId);
});
