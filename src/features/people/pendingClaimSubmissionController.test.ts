import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { createMemberClaimAttemptRepository } from "@/data/repositories/memberClaimAttemptRepository";
import { resolutionIntentDigest } from "@/data/repositories/claimResolutionRepository";
import type { ClaimResolutionCommand } from "@/data/api/claimResolutionContracts";
import { createPendingClaimSubmissionController } from "./pendingClaimSubmissionController";

async function fixture() {
  let accountId = randomUUID();
  const account = async () => accountId, context = await captureAccountRequestContext(randomUUID(), account);
  const inviteId = randomUUID(), personId = randomUUID();
  const invitation = vi.fn(async () => ({ version: 1 as const, accountId: context.accountId,
    invitation: { inviteId, tripId: context.tripId, personId, personName: "Traveler 李", tripName: "Trip QA",
      status: "PENDING" as const, expiresAt: "2026-11-22T00:00:00Z" } }));
  const preview = vi.fn(async (_context: typeof context, input: { requestId: string; inviteId: string; requestedPersonId: string }) => ({
    ...input, tripId: context.tripId, claimantAccountId: context.accountId, proposedAccess: "READ" as const,
    previewDigest: "a".repeat(64), expiresAt: "2026-11-22T00:00:00Z",
  }));
  const rows = new Map<string, string>();
  const storage = { getItem: async (key: string) => rows.get(key) ?? null,
    setItem: async (key: string, value: string) => { rows.set(key, value); }, deleteItem: async (key: string) => { rows.delete(key); } };
  const execute = vi.fn(async (_context: typeof context, command: ClaimResolutionCommand) => ({ status: "RECORDED" as const,
    snapshot: null, receipt: { receiptVersion: 2 as const, operationId: command.operationId, requestId: command.requestId,
      actorAccountId: context.accountId, tripId: context.tripId, commandKind: command.kind,
      intentDigest: resolutionIntentDigest(context, command), beforeRevision: null, afterRevision: 1,
      outcome: "PENDING_REVIEW" as const, acceptedAt: "2026-11-16T00:00:00Z",
      effects: { linkedPersonId: null, personCreateReceipt: null, provisionalRevocation: null } } }));
  const recover = vi.fn(async () => ({ status: "ABSENT_UNCONFIRMED" as const }));
  const attempts = createMemberClaimAttemptRepository(storage, account, undefined, { execute, recover });
  const ports = { account, invitations: { invitation }, reader: { preview }, attempts };
  return { context, inviteId, personId, invitation, preview, execute, recover, rows, attempts, ports,
    open: () => createPendingClaimSubmissionController(context, inviteId, ports),
    switch() { accountId = randomUUID(); advanceAccountGeneration(); } };
}
it("requires actual recipient detail and server preview without writing an attempt on open/cancel", async () => {
  const f = await fixture(), c = f.open();
  await c.submit(); expect(f.execute).not.toHaveBeenCalled();
  await c.load();
  expect(c.getSnapshot()).toMatchObject({ phase: "READY", invitation: { personName: "Traveler 李", personId: f.personId } });
  expect(f.preview.mock.calls[0][1]).toEqual({ inviteId: f.inviteId, requestedPersonId: f.personId, requestId: c.getSnapshot().requestId });
  expect(f.rows.size).toBe(0); c.dispose();
  await c.submit(); expect(f.execute).not.toHaveBeenCalled();
});
it("submits once using original preview and records only Pending Review, never Connected", async () => {
  const f = await fixture(), c = f.open(); await c.load();
  const requestId = c.getSnapshot().requestId;
  await Promise.all([c.submit(), c.submit()]);
  expect(f.execute).toHaveBeenCalledOnce();
  expect(f.execute.mock.calls[0][1]).toMatchObject({ kind: "SUBMIT_PENDING_CLAIM", requestId, inviteId: f.inviteId,
    requestedPersonId: f.personId, expectedPreviewDigest: "a".repeat(64), explicitConsent: true, expectedRevision: null });
  expect(c.getSnapshot().phase).toBe("RECORDED"); expect(c.getSnapshot()).not.toHaveProperty("connected");
  await c.submit(); expect(f.execute).toHaveBeenCalledOnce();
});
it("cold recovery retains original identifiers and ABSENT never resends or creates another preview", async () => {
  const f = await fixture(), c = f.open(); await c.load();
  f.execute.mockRejectedValueOnce(Error("response lost")); await c.submit();
  const saved = await f.attempts.readResolution(f.context);
  expect(c.getSnapshot().phase).toBe("UNKNOWN"); c.dispose();
  const reopened = f.open(); await reopened.load(); await reopened.checkOriginal(); await reopened.submit();
  expect(reopened.getSnapshot()).toMatchObject({ phase: "UNKNOWN", requestId: saved!.original.requestId,
    operationId: saved!.original.operationId, preview: null, invitation: null });
  expect(f.preview).toHaveBeenCalledOnce(); expect(f.execute).toHaveBeenCalledOnce(); expect(f.recover).toHaveBeenCalledOnce();
});
it("reads an already recorded original without requesting a new preview or executing again", async () => {
  const f = await fixture(), c = f.open(); await c.load(); await c.submit();
  const reopened = f.open(); await reopened.load(); await reopened.checkOriginal();
  expect(reopened.getSnapshot().phase).toBe("RECORDED");
  expect(f.execute).toHaveBeenCalledOnce(); expect(f.recover).not.toHaveBeenCalled(); expect(f.preview).toHaveBeenCalledOnce();
});
it("denies foreign or expired invitation before preview and rejects preview identity drift", async () => {
  for (const kind of ["foreign", "expired", "preview"] as const) {
    const f = await fixture(), c = f.open();
    if (kind === "foreign") f.invitation.mockResolvedValueOnce({ ...await f.invitation(), accountId: randomUUID() });
    if (kind === "expired") f.invitation.mockResolvedValueOnce({ ...await f.invitation(), invitation: { ...(await f.invitation()).invitation, status: "EXPIRED" as "PENDING" } });
    if (kind === "preview") f.preview.mockImplementationOnce(async (_context, input) => ({ ...input, tripId: f.context.tripId,
      claimantAccountId: randomUUID(), proposedAccess: "READ", previewDigest: "a".repeat(64), expiresAt: "2026-11-22T00:00:00Z" }));
    await c.load(); await c.submit(); expect(c.getSnapshot().phase).toBe(kind === "expired" ? "NOT_VISIBLE" : "UNAVAILABLE");
    expect(f.execute).not.toHaveBeenCalled(); if (kind !== "preview") expect(f.preview).not.toHaveBeenCalled();
  }
});
it("does not replace an unresolved original belonging to another invitation", async () => {
  const f = await fixture(), c = f.open(); await c.load(); f.execute.mockRejectedValueOnce(Error("lost")); await c.submit();
  const before = [...f.rows];
  const other = createPendingClaimSubmissionController(f.context, randomUUID(), f.ports); await other.load(); await other.submit();
  expect(other.getSnapshot().phase).toBe("UNAVAILABLE"); expect([...f.rows]).toEqual(before); expect(f.execute).toHaveBeenCalledOnce();
});
it("suppresses late preview after Account/generation switch and cannot submit old context", async () => {
  const f = await fixture(), c = f.open();
  const original = f.preview.getMockImplementation()!;
  f.preview.mockImplementationOnce(async (...args) => { f.switch(); return original(...args); });
  await c.load(); await c.submit(); expect(c.getSnapshot().phase).not.toBe("READY"); expect(f.execute).not.toHaveBeenCalled();
});

it("restores a historical unproven rejection through the same original receipt without resubmitting", async () => {
  const f = await fixture(), c = f.open(); await c.load();
  f.execute.mockRejectedValueOnce(Error("lost response"));
  await c.submit(); c.dispose();
  const original = (await f.attempts.readResolution(f.context))!.original;
  const [key, raw] = [...f.rows][0];
  const legacy = JSON.stringify({ ...JSON.parse(raw), rejection: { kind: "CONFLICT_WITHOUT_MUTATION", currentRevision: null } });
  f.rows.set(key, legacy);
  const reopened = f.open(); await reopened.load();
  expect(reopened.getSnapshot()).toMatchObject({ phase: "UNKNOWN", operationId: original.operationId });
  f.recover.mockResolvedValueOnce({ status: "CONFLICT" } as never);
  await reopened.checkOriginal();
  expect(reopened.getSnapshot().phase).toBe("UNKNOWN");
  expect(f.rows.get(key)).toBe(legacy);
  const recorded = await f.execute.getMockImplementation()!(f.context, original);
  f.recover.mockResolvedValueOnce({ status: "FOUND", receipt: recorded.receipt } as never);
  await reopened.checkOriginal();
  expect(reopened.getSnapshot().phase).toBe("RECORDED");
  await reopened.submit();
  expect(f.execute).toHaveBeenCalledOnce();
  expect(f.recover).toHaveBeenCalledTimes(2);
});
