import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { claimResolutionRequestViewSchema, type ClaimResolutionCommand } from "@/data/api/claimResolutionContracts";
import { createMemberClaimAttemptRepository } from "@/data/repositories/memberClaimAttemptRepository";
import { resolutionIntentDigest } from "@/data/repositories/claimResolutionRepository";
import { createClaimResolutionController, type ClaimResolutionControllerPorts } from "./claimResolutionController";

async function fixture() {
  let accountId = randomUUID();
  const account = async () => accountId;
  const context = await captureAccountRequestContext(randomUUID(), account);
  const requestId = randomUUID(), personId = randomUUID(), otherPersonId = randomUUID();
  let view = claimResolutionRequestViewSchema.parse({ accountId, tripId: context.tripId, requestId,
    eligibleActions: ["CONFIRM", "CHOOSE_ANOTHER", "CREATE_NEW", "REJECT"], canConsent: false,
    snapshot: { requestId, tripId: context.tripId, claimantAccountId: randomUUID(), originalPersonId: personId,
      revision: 1, state: "PENDING_REVIEW", proposal: { kind: "EXISTING_PERSON", personId },
      proposalRevision: 1, proposalOperationId: randomUUID(), proposedByAccountId: accountId,
      proposalDigest: "a".repeat(64), proposedAccess: "READ", consent: { state: "RECORDED", proposalDigest: "a".repeat(64), operationId: randomUUID() },
      provisionalGrant: null, expiresAt: "2026-11-22T00:00:00Z" } });
  const rows = new Map<string, string>();
  const storage = { getItem: async (key: string) => rows.get(key) ?? null,
    setItem: async (key: string, value: string) => { rows.set(key, value); }, deleteItem: async (key: string) => { rows.delete(key); } };
  const execute = vi.fn(async (_context: typeof context, command: ClaimResolutionCommand) => {
    const after = command.expectedRevision === null ? 1 : command.expectedRevision + 1;
    const corrected = command.kind === "RESOLVE_CLAIM_REQUEST" && ["CHOOSE_ANOTHER", "CREATE_NEW"].includes(command.decision.kind);
    const outcome = corrected ? "AWAITING_CONSENT" as const
      : command.kind === "CONSENT_TO_RESOLUTION" || (command.kind === "RESOLVE_CLAIM_REQUEST" && command.decision.kind === "CONFIRM")
        ? "LINKED" as const : "REJECTED" as const;
    const receipt = { receiptVersion: 2 as const, operationId: command.operationId, requestId,
      actorAccountId: context.accountId, tripId: context.tripId, commandKind: command.kind,
      intentDigest: resolutionIntentDigest(context, command), beforeRevision: command.expectedRevision,
      afterRevision: after, outcome, acceptedAt: "2026-11-15T00:00:00Z",
      effects: { linkedPersonId: outcome === "LINKED" ? personId : null, personCreateReceipt: null, provisionalRevocation: null } };
    view = { ...view, eligibleActions: [], canConsent: false, snapshot: { ...view.snapshot, revision: after, state: outcome,
      consent: command.kind === "CONSENT_TO_RESOLUTION"
        ? { state: "RECORDED", proposalDigest: view.snapshot.proposalDigest, operationId: command.operationId }
        : view.snapshot.consent } };
    return { status: "RECORDED" as const, receipt, snapshot: null };
  });
  const recover = vi.fn(async () => ({ status: "ABSENT_UNCONFIRMED" as const }));
  const attempts = createMemberClaimAttemptRepository(storage, account, undefined, { execute, recover });
  const reader = { readView: vi.fn(async () => view) };
  const readPeople = vi.fn<ClaimResolutionControllerPorts["readPeople"]>(async () => ({
    status: "EXECUTED", context, refreshGeneration: 1,
    accepted: { certificate: { epoch: "e", revision: "1", access_revision: 1, applied_generation: 1,
      actor_person_binding_hash: "a", roster_hash: "a", manifest_sha256: "a", ordinary_order_version: 1 },
      people: [{ personId, connected: false, isCurrentActor: false }, { personId: otherPersonId, connected: false, isCurrentActor: false }] },
    labels: [{ personId, displayName: "Trip person" }, { personId: otherPersonId, displayName: "Another person" }],
  }));
  const prepareNewPerson = vi.fn<NonNullable<ClaimResolutionControllerPorts["prepareNewPerson"]>>(async (_context, displayName) => ({
    version: 1, tripId: context.tripId, operationId: randomUUID(), personId: randomUUID(), tripCreateOperationId: randomUUID(),
    displayName, dataOwnership: "CLOUD_SHARED_AUTHORED",
  }));
  const ports = { account, reader, readPeople, attempts, prepareNewPerson };
  const open = () => createClaimResolutionController(context, requestId, ports);
  return { context, requestId, personId, otherPersonId, ports, open, execute, recover, rows,
    setView(value: typeof view) { view = value; }, view: () => view,
    switch() { accountId = randomUUID(); advanceAccountGeneration(); } };
}

it("requires actual scoped People read and formal action eligibility", async () => {
  const f = await fixture(), c = f.open();
  f.ports.readPeople.mockResolvedValueOnce({ status: "SKIPPED", context: f.context, labels: [] });
  await c.load();
  expect(c.getSnapshot().phase).toBe("UNAVAILABLE");
  expect(c.getSnapshot().eligibleActions).toEqual([]);
  c.choose("CONFIRM"); await c.submit();
  expect(f.execute).not.toHaveBeenCalled();
});
it("sends one original CAS command for confirm, with no Connected or optimistic member state", async () => {
  const f = await fixture(), c = f.open();
  await c.load(); c.choose("CONFIRM");
  await Promise.all([c.submit(), c.submit()]);
  expect(f.execute).toHaveBeenCalledOnce();
  expect(f.execute.mock.calls[0][1]).toMatchObject({ kind: "RESOLVE_CLAIM_REQUEST", requestId: f.requestId,
    expectedRevision: 1, decision: { kind: "CONFIRM" } });
  expect(c.getSnapshot()).not.toHaveProperty("connected");
  expect(c.getSnapshot().eligibleActions).toEqual([]);
});
it("choose-another uses only a current unconnected Person and preserves the original request", async () => {
  const f = await fixture(), c = f.open();
  await c.load(); c.choose("CHOOSE_ANOTHER"); c.selectPerson(f.otherPersonId); await c.submit();
  expect(f.execute.mock.calls[0][1]).toMatchObject({ requestId: f.requestId, expectedRevision: 1,
    decision: { kind: "CHOOSE_ANOTHER", personId: f.otherPersonId } });
  expect(c.getSnapshot().view?.snapshot.state).toBe("AWAITING_CONSENT");
});
it("create-new prepares the consented intent without enqueueing or creating a Person", async () => {
  const f = await fixture(), c = f.open();
  await c.load(); c.choose("CREATE_NEW"); c.changeName("  Traveler Unicode 李  "); await c.submit();
  expect(f.ports.prepareNewPerson).toHaveBeenCalledWith(f.context, "Traveler Unicode 李", f.requestId, 1);
  expect(f.execute.mock.calls[0][1]).toMatchObject({ decision: { kind: "CREATE_NEW", create: { displayName: "Traveler Unicode 李", tripId: f.context.tripId } } });
  expect(c.getSnapshot().view?.snapshot.state).toBe("AWAITING_CONSENT");
});
it("reject keeps the same request and does not invoke member removal or Person creation", async () => {
  const f = await fixture(), c = f.open();
  await c.load(); c.choose("REJECT"); await c.submit();
  expect(f.execute.mock.calls[0][1]).toMatchObject({ requestId: f.requestId, decision: { kind: "REJECT" } });
  expect(f.ports.prepareNewPerson).not.toHaveBeenCalled();
  expect(c.getSnapshot().view?.snapshot.state).toBe("REJECTED");
});
it("cold UNKNOWN restores the exact original and checks its receipt without re-execution", async () => {
  const f = await fixture(), c = f.open();
  await c.load(); c.choose("CONFIRM");
  f.execute.mockRejectedValueOnce(Error("response lost"));
  await c.submit();
  const originalId = c.getSnapshot().operationId;
  expect(c.getSnapshot().phase).toBe("UNKNOWN");
  const reopened = f.open(); await reopened.load();
  expect(reopened.getSnapshot()).toMatchObject({ phase: "UNKNOWN", operationId: originalId });
  await reopened.checkOriginal();
  expect(reopened.getSnapshot().phase).toBe("UNKNOWN");
  expect(f.recover).toHaveBeenCalledOnce();
  expect(f.execute).toHaveBeenCalledOnce();
});
it("does not enable fresh actions from a stale post-receipt read", async () => {
  const f = await fixture(), c = f.open();
  const old = f.view();
  await c.load(); c.choose("REJECT");
  f.ports.reader.readView.mockResolvedValueOnce(old);
  await c.submit();
  expect(c.getSnapshot().phase).toBe("UNAVAILABLE");
  expect(c.getSnapshot().eligibleActions).toEqual([]);
  expect(f.rows.size).toBe(1);
});
it("never publishes an old response after account switch or disposal", async () => {
  for (const transition of ["switch", "dispose"]) {
    const f = await fixture(), c = f.open();
    f.ports.reader.readView.mockImplementationOnce(async () => {
      if (transition === "switch") f.switch(); else c.dispose();
      return f.view();
    });
    await c.load();
    expect(c.getSnapshot().phase).not.toBe("READY");
    expect(f.ports.readPeople).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  }
});
it("consent is gated by a formal claimant-specific view, not the organizer's old preview", async () => {
  const f = await fixture(), c = f.open();
  await c.load(); await c.consent();
  expect(f.execute).not.toHaveBeenCalled();
  const old = f.view();
  f.setView({ ...old, eligibleActions: [], canConsent: true, snapshot: { ...old.snapshot,
    state: "AWAITING_CONSENT", claimantAccountId: f.context.accountId,
    consent: { state: "REQUIRED", proposalDigest: old.snapshot.proposalDigest, operationId: null } } });
  await c.load(); await c.consent();
  expect(f.execute.mock.calls[0][1]).toMatchObject({ kind: "CONSENT_TO_RESOLUTION", requestId: f.requestId,
    expectedRevision: 1, explicitConsent: true, proposalDigest: old.snapshot.proposalDigest });
});
it("refreshes after typed CAS rejection and requires a fresh explicit decision instead of trapping UNKNOWN", async () => {
  const f = await fixture(), c = f.open();
  await c.load(); c.choose("REJECT");
  f.execute.mockImplementationOnce(async () => {
    const old = f.view();
    f.setView({ ...old, snapshot: { ...old.snapshot, revision: 3 } });
    return { status: "CONFLICT", currentRevision: 3 } as never;
  });
  await c.submit();
  expect(c.getSnapshot()).toMatchObject({ phase: "READY", choice: null, operationId: null });
  expect(c.getSnapshot().view?.snapshot.revision).toBe(3);
  await c.submit();
  expect(f.execute).toHaveBeenCalledOnce();
  const rejectedId = f.execute.mock.calls[0][1].operationId;
  c.choose("REJECT"); await c.submit();
  expect(f.execute).toHaveBeenCalledTimes(2);
  expect(f.execute.mock.calls[1][1]).toMatchObject({ expectedRevision: 3 });
  expect(f.execute.mock.calls[1][1].operationId).not.toBe(rejectedId);
  expect(f.recover).not.toHaveBeenCalled();
});
it("retains the original UNKNOWN operation after a recovery conflict without a receipt", async () => {
  const f = await fixture(), c = f.open();
  await c.load(); c.choose("REJECT");
  f.execute.mockRejectedValueOnce(Error("lost response"));
  await c.submit();
  expect(c.getSnapshot().phase).toBe("UNKNOWN");
  f.recover.mockResolvedValueOnce({ status: "CONFLICT" } as never);
  await c.checkOriginal();
  const originalId = f.execute.mock.calls[0][1].operationId;
  expect(c.getSnapshot()).toMatchObject({ phase: "UNKNOWN", choice: "REJECT", operationId: originalId });
  c.choose("REJECT");
  await c.submit();
  expect(f.execute).toHaveBeenCalledOnce();
  expect(f.recover).toHaveBeenCalledOnce();
  expect((await f.ports.attempts.readResolution(f.context))?.original.operationId).toBe(originalId);
});
it("retains a known LINKED receipt until actual current-member readback and never resends it", async () => {
  const f = await fixture(), old = f.view();
  f.setView({ ...old, eligibleActions: [], canConsent: true, snapshot: { ...old.snapshot,
    state: "AWAITING_CONSENT", claimantAccountId: f.context.accountId,
    consent: { state: "REQUIRED", proposalDigest: old.snapshot.proposalDigest, operationId: null } } });
  const c = f.open();
  await c.load();
  f.ports.readPeople.mockResolvedValue({ status: "SKIPPED", context: f.context, labels: [] });
  await c.consent();
  expect(c.getSnapshot()).toMatchObject({ memberReadbackVerified: false, needsMemberReadback: true });
  expect((await f.ports.attempts.readResolution(f.context))?.receipt?.outcome).toBe("LINKED");
  f.ports.readPeople.mockResolvedValue({ status: "EXECUTED", context: f.context, refreshGeneration: 2,
    accepted: { certificate: { epoch: "e", revision: "2", access_revision: 2, applied_generation: 2,
      actor_person_binding_hash: "a", roster_hash: "a", manifest_sha256: "a", ordinary_order_version: 1 },
      people: [{ personId: f.personId, connected: true, isCurrentActor: true }] }, labels: [] });
  await c.checkOriginal();
  expect(c.getSnapshot()).toMatchObject({ memberReadbackVerified: true, needsMemberReadback: false });
  expect(await f.ports.attempts.readResolution(f.context)).toBeNull();
  expect(f.execute).toHaveBeenCalledOnce();
  expect(f.recover).not.toHaveBeenCalled();
});
it("rejects a preview for another Person before presenting a resolution decision", async () => {
  const f = await fixture(), c = f.open();
  f.setView({ ...f.view(), proposalPreview: { personId: f.otherPersonId, displayName: "Wrong target label" } });
  await c.load();
  expect(c.getSnapshot().phase).toBe("UNAVAILABLE");
  expect(c.getSnapshot().eligibleActions).toEqual([]);
  expect(f.execute).not.toHaveBeenCalled();
});
it.each(["not-visible", "failure"])("invalidates an old Verified result on the next %s read", async kind => {
  const f = await fixture(), old = f.view();
  f.setView({ ...old, eligibleActions: [], canConsent: true, snapshot: { ...old.snapshot,
    state: "AWAITING_CONSENT", claimantAccountId: f.context.accountId,
    consent: { state: "REQUIRED", proposalDigest: old.snapshot.proposalDigest, operationId: null } } });
  const read = await f.ports.readPeople(f.context);
  if (read.status !== "EXECUTED" || !read.accepted) throw Error("FIXTURE_READ_REQUIRED");
  f.ports.readPeople.mockResolvedValue({ ...read, accepted: { ...read.accepted,
    people: [{ personId: f.personId, connected: true, isCurrentActor: true }] } });
  const c = f.open(); await c.load(); await c.consent();
  expect(c.getSnapshot().memberReadbackVerified).toBe(true);
  if (kind === "not-visible") f.ports.reader.readView.mockResolvedValueOnce(null as never);
  else f.ports.reader.readView.mockRejectedValueOnce(Error("unavailable"));
  await c.load();
  expect(c.getSnapshot()).toMatchObject({ memberReadbackVerified: false, needsMemberReadback: false });
  expect(c.getSnapshot().phase).toBe(kind === "not-visible" ? "NOT_VISIBLE" : "UNAVAILABLE");
  expect(f.execute).toHaveBeenCalledOnce();
  expect(f.recover).not.toHaveBeenCalled();
});

it("restores a historical unproven rejection through the same original receipt without resubmitting", async () => {
  const f = await fixture(), c = f.open(); await c.load(); c.choose("REJECT");
  f.execute.mockRejectedValueOnce(Error("lost response"));
  await c.submit(); c.dispose();
  const original = (await f.ports.attempts.readResolution(f.context))!.original;
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
  expect(reopened.getSnapshot().phase).toBe("READY");
  await reopened.submit();
  expect(f.execute).toHaveBeenCalledOnce();
  expect(f.recover).toHaveBeenCalledTimes(2);
});
