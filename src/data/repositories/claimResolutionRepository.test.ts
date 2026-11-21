import { ordinaryFixture } from "@/domain/trip/__fixtures__/coreOrdinaryOrder";
import { projectClaimProvisionalShared } from "../../../backend/src/tripClaimProvisionalRead";
import { randomUUID, createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import type { ClaimResolutionCommand } from "@/data/api/claimResolutionContracts";
import { claimResolutionIntentDigest } from "../../../backend/src/tripClaimResolutionAdapter";
import { createClaimResolutionRepository, resolutionIntentDigest } from "./claimResolutionRepository";
import { createMemberClaimAttemptRepository } from "./memberClaimAttemptRepository";

async function fixture() {
  let currentAccount = randomUUID();
  const account = async () => currentAccount;
  const context = await captureAccountRequestContext(randomUUID(), account);
  const original: ClaimResolutionCommand = { kind: "RESOLVE_CLAIM_REQUEST", operationId: randomUUID(),
    requestId: randomUUID(), expectedRevision: 1, decision: { kind: "REJECT" } };
  const receipt = { receiptVersion: 2, operationId: original.operationId, requestId: original.requestId,
    actorAccountId: context.accountId, tripId: context.tripId, commandKind: original.kind,
    intentDigest: resolutionIntentDigest(context, original), beforeRevision: 1, afterRevision: 2,
    outcome: "REJECTED", acceptedAt: "2026-11-15T00:00:00Z",
    effects: { linkedPersonId: null, personCreateReceipt: null, provisionalRevocation: null } };
  const result = { status: "RECORDED", receipt, snapshot: null };
  const wire = vi.fn<typeof fetch>(async () => Response.json(result));
  const authority = createClaimResolutionRepository(account, { baseUrl: "https://api.example.test", fetchImplementation: wire },
    async () => ({ userId: currentAccount, token: "synthetic-only" }));
  const rows = new Map<string, string>();
  const storage = { getItem: vi.fn(async (key: string) => rows.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { rows.set(key, value); }),
    deleteItem: vi.fn(async (key: string) => { rows.delete(key); }) };
  const reopen = () => createMemberClaimAttemptRepository(storage, account, undefined, authority);
  return { account, context, original, receipt, result, wire, authority, rows, storage, reopen,
    switch() { currentAccount = randomUUID(); advanceAccountGeneration(); } };
}

it("uses exactly the frozen backend intent serialization and digest", async () => {
  const f = await fixture();
  expect(resolutionIntentDigest(f.context, f.original)).toBe(claimResolutionIntentDigest({
    actorAccountId: f.context.accountId, tripId: f.context.tripId,
  }, f.original));
  const frozen = "otr-claim-resolution-v1\n" + JSON.stringify({
    scope: { actorAccountId: f.context.accountId, tripId: f.context.tripId },
    command: { operationId: f.original.operationId, requestId: f.original.requestId,
      kind: "RESOLVE_CLAIM_REQUEST", expectedRevision: 1, decision: { kind: "REJECT" } },
  });
  expect(resolutionIntentDigest(f.context, f.original)).toBe(createHash("sha256").update(frozen).digest("hex"));
});
it("sends the original normal command with an idempotency header, without body account injection", async () => {
  const f = await fixture();
  await expect(f.authority.execute(f.context, f.original)).resolves.toEqual(f.result);
  expect(String(f.wire.mock.calls[0][0])).toBe(`https://api.example.test/v2/trips/${f.context.tripId}/claim-request-operations`);
  expect(JSON.parse(String(f.wire.mock.calls[0][1]?.body))).toEqual(f.original);
  expect(new Headers(f.wire.mock.calls[0][1]?.headers).get("Idempotency-Key")).toBe(f.original.operationId);
  expect(f.wire.mock.calls[0][1]?.redirect).toBe("error");
});
it("rejects a receipt for another actor or operation instead of accepting a Connected result", async () => {
  for (const changed of [{ actorAccountId: randomUUID() }, { operationId: randomUUID() }]) {
    const f = await fixture();
    f.wire.mockResolvedValueOnce(Response.json({ ...f.result, receipt: { ...f.receipt, ...changed } }));
    await expect(f.authority.execute(f.context, f.original)).rejects.toThrow("RECEIPT_SCOPE");
  }
});
it("keeps typed conflict distinct from an unknown network failure", async () => {
  const f = await fixture();
  f.wire.mockResolvedValueOnce(Response.json({ status: "CONFLICT", currentRevision: 3 }, { status: 409 }));
  await expect(f.authority.execute(f.context, f.original)).resolves.toEqual({ status: "CONFLICT", currentRevision: 3 });
  f.wire.mockRejectedValueOnce(Error("lost"));
  await expect(f.authority.execute(f.context, f.original)).rejects.toMatchObject({ kind: "network" });
});
it("recognizes only the owning reader's explicit 404; unavailable is not absence", async () => {
  const f = await fixture();
  f.wire.mockResolvedValueOnce(Response.json({ error: { code: "CLAIM_REQUEST_NOT_VISIBLE" } }, { status: 404 }));
  await expect(f.authority.read(f.context, f.original.requestId)).resolves.toBeNull();
  f.wire.mockResolvedValueOnce(Response.json({ error: { code: "OTHER_FAILURE" } }, { status: 404 }));
  await expect(f.authority.read(f.context, f.original.requestId)).rejects.toThrow();
  f.wire.mockResolvedValueOnce(Response.json({ status: "UNAVAILABLE" }, { status: 503 }));
  await expect(f.authority.read(f.context, f.original.requestId)).rejects.toThrow();
});
it("rejects an account change while the response is in flight", async () => {
  const f = await fixture();
  f.wire.mockImplementationOnce(async () => { f.switch(); return Response.json(f.result); });
  await expect(f.authority.execute(f.context, f.original)).rejects.toThrow();
});
it("persists v2 in the same original-attempt key before sending, then blocks duplicate dispatch", async () => {
  const f = await fixture();
  f.wire.mockImplementationOnce(async () => {
    expect((await f.reopen().readResolution(f.context))?.original).toEqual(f.original);
    return Response.json(f.result);
  });
  await f.reopen().executeResolutionOnce(f.context, f.original);
  expect([...f.rows.keys()]).toEqual([`otr.member-claim-attempt.v1.${f.context.accountId}.${f.context.tripId}`]);
  await expect(f.reopen().executeResolutionOnce(f.context, f.original)).rejects.toThrow("RECOVER_ORIGINAL");
  expect(f.wire).toHaveBeenCalledOnce();
});
it("cold recovery only queries the original operation; absent never permits another POST", async () => {
  const f = await fixture();
  f.wire.mockRejectedValueOnce(Error("response lost"));
  await expect(f.reopen().executeResolutionOnce(f.context, f.original)).rejects.toThrow();
  f.wire.mockResolvedValueOnce(Response.json({ status: "ABSENT_UNCONFIRMED" }, { status: 202 }));
  await expect(f.reopen().recoverResolution(f.context)).resolves.toEqual({ status: "ABSENT_UNCONFIRMED" });
  const recovery = f.wire.mock.calls[1];
  expect(String(recovery[0])).toMatch(/claim-request-operations\/recovery$/);
  expect(JSON.parse(String(recovery[1]?.body))).toEqual({ operationId: f.original.operationId,
    requestId: f.original.requestId, intentDigest: resolutionIntentDigest(f.context, f.original) });
  await expect(f.reopen().clearResolvedResolution(f.context, f.original.operationId)).rejects.toThrow("UNRESOLVED");
  await expect(f.reopen().executeResolutionOnce(f.context, { ...f.original, operationId: randomUUID() })).rejects.toThrow("RECOVER_ORIGINAL");
  expect(f.wire).toHaveBeenCalledTimes(2);
});
it("archives only a bound formal receipt and never reuses an archived operation", async () => {
  const f = await fixture();
  await f.reopen().executeResolutionOnce(f.context, f.original);
  await f.reopen().clearResolvedResolution(f.context, f.original.operationId);
  expect(await f.reopen().readResolution(f.context)).toBeNull();
  await expect(f.reopen().executeResolutionOnce(f.context, f.original)).rejects.toThrow("ALREADY_RESOLVED");
  expect(f.rows.size).toBe(1);
  expect(f.wire).toHaveBeenCalledOnce();
});
it("serializes simultaneous clicks across repository instances before network dispatch", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.reopen().executeResolutionOnce(f.context, f.original), f.reopen().executeResolutionOnce(f.context, f.original)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(f.wire).toHaveBeenCalledOnce();
});
it("keeps v1 recovery available and blocks v1/v2 from overwriting each other's active checkpoint", async () => {
  const f = await fixture();
  const v1 = { kind: "CLAIM_PERSON", operationId: randomUUID(), tripId: f.context.tripId,
    personId: randomUUID(), inviteId: randomUUID(), explicitConsent: true } as const;
  const key = `otr.member-claim-attempt.v1.${f.context.accountId}.${f.context.tripId}`;
  f.rows.set(key, JSON.stringify({ version: 1, accountId: f.context.accountId, tripId: f.context.tripId, original: v1, outcome: null }));
  expect((await f.reopen().read(f.context))?.original).toEqual(v1);
  await expect(f.reopen().executeResolutionOnce(f.context, f.original)).rejects.toThrow("RECOVER_ORIGINAL");
  f.rows.clear();
  await f.reopen().executeResolutionOnce(f.context, f.original);
  await expect(f.reopen().executeOnce(f.context, v1)).rejects.toThrow("RESOLUTION_RECOVER_ORIGINAL");
  expect(f.wire).toHaveBeenCalledOnce();
});
it("isolates durable checkpoints on account switch and refuses corrupt intent digests", async () => {
  const f = await fixture();
  await f.reopen().executeResolutionOnce(f.context, f.original);
  const [key, raw] = [...f.rows.entries()][0];
  f.rows.set(key, JSON.stringify({ ...JSON.parse(raw), intentDigest: "b".repeat(64) }));
  await expect(f.reopen().readResolution(f.context)).rejects.toThrow("DIGEST_MISMATCH");
  f.switch();
  await expect(f.reopen().recoverResolution(f.context)).rejects.toThrow();
  const next = await captureAccountRequestContext(f.context.tripId, f.account);
  expect(await f.reopen().readResolution(next)).toBeNull();
  expect(f.rows.size).toBe(1);
});
it("never dispatches if checkpoint persistence fails", async () => {
  const f = await fixture();
  f.storage.setItem.mockRejectedValueOnce(Error("storage unavailable"));
  await expect(f.reopen().executeResolutionOnce(f.context, f.original)).rejects.toThrow("storage unavailable");
  expect(f.wire).not.toHaveBeenCalled();
});
it("archives a formal no-mutation conflict, never reuses its ID, and permits a new explicit intent", async () => {
  const f = await fixture();
  f.wire.mockResolvedValueOnce(Response.json({ status: "CONFLICT", currentRevision: 3 }, { status: 409 }));
  await f.reopen().executeResolutionOnce(f.context, f.original);
  expect((await f.reopen().readResolution(f.context))?.rejection).toEqual({ kind: "CONFLICT_WITHOUT_MUTATION", currentRevision: 3 });
  await expect(f.reopen().recoverResolution(f.context)).resolves.toEqual({ status: "CONFLICT" });
  expect(f.wire).toHaveBeenCalledOnce();
  await f.reopen().clearResolvedResolution(f.context, f.original.operationId);
  await expect(f.reopen().executeResolutionOnce(f.context, f.original)).rejects.toThrow("ALREADY_RESOLVED");
  f.wire.mockResolvedValueOnce(Response.json({ status: "CONFLICT", currentRevision: 4 }, { status: 409 }));
  await expect(f.reopen().executeResolutionOnce(f.context, { ...f.original, operationId: randomUUID(), expectedRevision: 3 })).resolves.toEqual({ status: "CONFLICT", currentRevision: 4 });
  expect(f.wire).toHaveBeenCalledTimes(2);
});
it("an untyped HTTP conflict is not no-commit proof and cannot clear the original", async () => {
  const f = await fixture();
  f.wire.mockResolvedValueOnce(Response.json({ error: { code: "UNKNOWN_CONFLICT" } }, { status: 409 }));
  await expect(f.reopen().executeResolutionOnce(f.context, f.original)).rejects.toThrow();
  expect((await f.reopen().readResolution(f.context))?.rejection).toBeNull();
  await expect(f.reopen().clearResolvedResolution(f.context, f.original.operationId)).rejects.toThrow("UNRESOLVED");
});
it("uses the normal authenticated pending index with a validated cursor and current scope", async () => {
  const f = await fixture(), cursor = randomUUID();
  const value = { accountId: f.context.accountId, tripId: f.context.tripId, entries: [], nextRequestId: null };
  f.wire.mockResolvedValueOnce(Response.json(value));
  await expect(f.authority.pending(f.context, cursor)).resolves.toEqual(value);
  expect(String(f.wire.mock.calls[0][0])).toBe(`https://api.example.test/v2/trips/${f.context.tripId}/claim-requests?after=${cursor}`);
  await expect(f.authority.pending(f.context, "bad")).rejects.toThrow();
  expect(f.wire).toHaveBeenCalledOnce();
});
it("rejects a foreign pending index and preserves unavailable instead of reporting no requests", async () => {
  const f = await fixture();
  f.wire.mockResolvedValueOnce(Response.json({ accountId: randomUUID(), tripId: f.context.tripId, entries: [], nextRequestId: null }));
  await expect(f.authority.pending(f.context)).rejects.toThrow("INDEX_SCOPE");
  f.wire.mockResolvedValueOnce(Response.json({ error: { code: "CLAIM_RESOLUTION_CLOSED" } }, { status: 503 }));
  await expect(f.authority.pending(f.context)).rejects.toThrow();
});
it("verifies a presented origin through normal Auth without putting its bearer in any attempt", async () => {
  const f = await fixture();
  const input = { requestId: f.original.requestId, inviteId: randomUUID(), purpose: "PERSON_CLAIM" as const, token: "opaque synthetic origin" };
  const value = { accountId: f.context.accountId, tripId: f.context.tripId, requestId: input.requestId,
    inviteId: input.inviteId, purpose: input.purpose, expiresAt: "2026-11-22T00:00:00Z", verified: true };
  f.wire.mockResolvedValueOnce(Response.json(value));
  await expect(f.authority.verifyOrigin(f.context, input)).resolves.toEqual(value);
  expect(String(f.wire.mock.calls[0][0])).toMatch(/claim-origins\/verify$/);
  expect(JSON.parse(String(f.wire.mock.calls[0][1]?.body))).toEqual(input);
  expect(f.rows.size).toBe(0);
});
it("does not accept a foreign or unverified origin as a membership or source grant", async () => {
  const f = await fixture();
  const input = { requestId: f.original.requestId, inviteId: randomUUID(), purpose: "PERSON_CLAIM" as const, token: "opaque synthetic origin" };
  f.wire.mockResolvedValueOnce(Response.json({ accountId: randomUUID(), tripId: f.context.tripId,
    requestId: input.requestId, inviteId: input.inviteId, purpose: input.purpose, expiresAt: "2026-11-22T00:00:00Z", verified: true }));
  await expect(f.authority.verifyOrigin(f.context, input)).rejects.toThrow("ORIGIN_SCOPE");
  f.wire.mockResolvedValueOnce(Response.json({ error: { code: "CLAIM_ORIGIN_NOT_VERIFIED" } }, { status: 403 }));
  await expect(f.authority.verifyOrigin(f.context, input)).rejects.toThrow();
  expect(f.rows.size).toBe(0);
});
it("archives an owning recovery conflict after a lost response without ever resending the command", async () => {
  const f = await fixture();
  f.wire.mockRejectedValueOnce(Error("lost"));
  await expect(f.reopen().executeResolutionOnce(f.context, f.original)).rejects.toThrow();
  f.wire.mockResolvedValueOnce(Response.json({ status: "CONFLICT" }, { status: 409 }));
  await expect(f.reopen().recoverResolution(f.context)).resolves.toEqual({ status: "CONFLICT" });
  expect((await f.reopen().readResolution(f.context))?.rejection).toBeNull();
  await expect(f.reopen().clearResolvedResolution(f.context, f.original.operationId)).rejects.toThrow("UNRESOLVED");
  await expect(f.reopen().executeResolutionOnce(f.context, { ...f.original, operationId: randomUUID() })).rejects.toThrow("RECOVER_ORIGINAL_REQUIRED");
  expect(f.wire.mock.calls.map(([url]) => String(url))).toEqual([
    `https://api.example.test/v2/trips/${f.context.tripId}/claim-request-operations`,
    `https://api.example.test/v2/trips/${f.context.tripId}/claim-request-operations/recovery`,
  ]);
});
it("archives a fresh owning rejection but never treats denied recovery as proof of no original commit", async () => {
  const fresh = await fixture();
  fresh.wire.mockResolvedValueOnce(Response.json({ status: "DENIED" }, { status: 403 }));
  await fresh.reopen().executeResolutionOnce(fresh.context, fresh.original);
  expect((await fresh.reopen().readResolution(fresh.context))?.rejection?.kind).toBe("DENIED_WITHOUT_MUTATION");
  await fresh.reopen().clearResolvedResolution(fresh.context, fresh.original.operationId);
  await expect(fresh.reopen().executeResolutionOnce(fresh.context, fresh.original)).rejects.toThrow("ALREADY_RESOLVED");
  const unknown = await fixture();
  unknown.wire.mockRejectedValueOnce(Error("lost"));
  await expect(unknown.reopen().executeResolutionOnce(unknown.context, unknown.original)).rejects.toThrow();
  unknown.wire.mockResolvedValueOnce(Response.json({ status: "DENIED" }, { status: 403 }));
  await expect(unknown.reopen().recoverResolution(unknown.context)).resolves.toEqual({ status: "DENIED" });
  expect((await unknown.reopen().readResolution(unknown.context))?.rejection).toBeNull();
  await expect(unknown.reopen().clearResolvedResolution(unknown.context, unknown.original.operationId)).rejects.toThrow("UNRESOLVED");
});
it("projects only its own saved original for cold UI recovery without inventing a server request", async () => {
  const f = await fixture();
  f.wire.mockRejectedValueOnce(Error("lost"));
  await expect(f.reopen().executeResolutionOnce(f.context, f.original)).rejects.toThrow();
  await expect(f.reopen().readResolutionRecoveryTarget(f.context)).resolves.toEqual({ requestId: f.original.requestId, operationId: f.original.operationId });
  f.switch();
  await expect(f.reopen().readResolutionRecoveryTarget(f.context)).rejects.toThrow();
  const next = await captureAccountRequestContext(f.context.tripId, f.account);
  await expect(f.reopen().readResolutionRecoveryTarget(next)).resolves.toBeNull();
  expect(f.wire).toHaveBeenCalledOnce();
});
it("reads the same verified General request and never maps generic absence to an authorized empty Person list", async () => {
  const f = await fixture(), requestId = randomUUID(), inviteId = randomUUID();
  const value = { version: 1, accountId: f.context.accountId, tripId: f.context.tripId, requestId, inviteId,
    expiresAt: "2026-11-23T00:00:00Z", tripName: "Synthetic Trip", persons: [], nextPersonId: null };
  f.wire.mockResolvedValueOnce(Response.json(value));
  await expect(f.authority.initialPersons(f.context, { requestId, inviteId, afterPersonId: null })).resolves.toEqual(value);
  expect(String(f.wire.mock.calls[0][0])).toBe(`https://api.example.test/v2/trips/${f.context.tripId}/claim-origins/${inviteId}/requests/${requestId}/people`);
  f.wire.mockResolvedValueOnce(Response.json({ error: { code: "CLAIM_ORIGIN_NOT_VISIBLE" } }, { status: 404 }));
  await expect(f.authority.initialPersons(f.context, { requestId, inviteId, afterPersonId: null })).resolves.toBeNull();
  f.wire.mockResolvedValueOnce(Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 }));
  await expect(f.authority.initialPersons(f.context, { requestId, inviteId, afterPersonId: null })).rejects.toThrow();
});
it("refuses a foreign General Person projection or late Account switch", async () => {
  const f = await fixture(), requestId = randomUUID(), inviteId = randomUUID(), input = { requestId, inviteId, afterPersonId: null };
  const value = { version: 1, accountId: f.context.accountId, tripId: f.context.tripId, requestId, inviteId,
    expiresAt: "2026-11-23T00:00:00Z", tripName: "Synthetic Trip", persons: [], nextPersonId: null };
  f.wire.mockResolvedValueOnce(Response.json({ ...value, requestId: randomUUID() }));
  await expect(f.authority.initialPersons(f.context, input)).rejects.toThrow("SCOPE_MISMATCH");
  f.wire.mockImplementationOnce(async () => { f.switch(); return Response.json(value); });
  await expect(f.authority.initialPersons(f.context, input)).rejects.toThrow();
});
it.each(["李".repeat(256), "\u0001".repeat(255) + "李"])("accepts a full50-person Unicode/escaped-name page within the bounded reader budget", async displayName => {
  const f = await fixture(), requestId = randomUUID(), inviteId = randomUUID();
  const persons = Array.from({ length: 50 }, () => ({ personId: randomUUID(), displayName })).sort((a, b) => a.personId.localeCompare(b.personId));
  const value = { version: 1, accountId: f.context.accountId, tripId: f.context.tripId, requestId, inviteId,
    expiresAt: "2026-11-23T00:00:00Z", tripName: "Synthetic Trip", persons, nextPersonId: persons.at(-1)!.personId };
  f.wire.mockResolvedValueOnce(Response.json(value));
  await expect(f.authority.initialPersons(f.context, { requestId, inviteId, afterPersonId: null })).resolves.toEqual(value);
});
it("uses the current resolver/request creator-context reader and rejects Owner-identity substitution", async () => {
  const f = await fixture(), requestId = randomUUID(), value = { version: 1, actorAccountId: f.context.accountId, tripId: f.context.tripId,
    requestId, requestRevision: 4, tripCreateOperationId: randomUUID() };
  f.wire.mockResolvedValueOnce(Response.json(value));
  await expect(f.authority.createPersonContext(f.context, requestId)).resolves.toEqual(value);
  expect(String(f.wire.mock.calls[0][0])).toContain(`/claim-requests/${requestId}/create-person-context`);
  f.wire.mockResolvedValueOnce(Response.json({ ...value, actorAccountId: randomUUID() }));
  await expect(f.authority.createPersonContext(f.context, requestId)).rejects.toThrow("SCOPE_MISMATCH");
});
it("keeps provisional denial distinct from scope absence and network failure", async () => {
  const f = await fixture(), requestId = randomUUID(), value = { version: 1, cacheScope: "CLAIM_PROVISIONAL", accountId: f.context.accountId,
    tripId: f.context.tripId, requestId, requestRevision: 2, observedAt: "2026-11-16T00:00:00Z", cacheGrant: null, access: "DENIED", grant: null, records: [] };
  f.wire.mockResolvedValueOnce(Response.json(value));
  await expect(f.authority.provisional(f.context, requestId)).resolves.toEqual(value);
  f.wire.mockResolvedValueOnce(Response.json({ error: { code: "CLAIM_REQUEST_NOT_VISIBLE" } }, { status: 404 }));
  await expect(f.authority.provisional(f.context, requestId)).resolves.toBeNull();
  f.wire.mockRejectedValueOnce(Error("offline")); await expect(f.authority.provisional(f.context, requestId)).rejects.toThrow();
  expect(f.rows.size).toBe(0);
});
it("uses existing Core1MiB bounded codec for a valid provisional graph above the Person-page budget", async () => {
  const f = await fixture(), requestId = randomUUID(), grant = { grantId: randomUUID(), requestId, tripId: f.context.tripId,
    claimantAccountId: f.context.accountId, revision: 1, access: "SHARED_READ_ONLY" as const, state: "ACTIVE" as const, expiresAt: "2026-11-23T00:00:00Z" };
  const records = Array.from({ length: 3 }, () => {
    const core = ordinaryFixture({ accountId: f.context.accountId, tripId: f.context.tripId });
    core.graph.itinerary_events = core.graph.itinerary_events.map(row => ({ ...row, visibility: "GROUP", description: "李".repeat(5000) }));
    return projectClaimProvisionalShared(core.graph, grant);
  }).flat();
  const value = { version: 1, cacheScope: "CLAIM_PROVISIONAL", accountId: f.context.accountId, tripId: f.context.tripId, requestId,
    requestRevision: 1, observedAt: "2026-11-16T00:00:00Z", cacheGrant: { grantId: grant.grantId, revision: 1 }, access: "GRANTED", grant, records };
  expect(new TextEncoder().encode(JSON.stringify(value)).byteLength).toBeGreaterThan(131072);
  f.wire.mockResolvedValueOnce(Response.json(value));
  await expect(f.authority.provisional(f.context, requestId)).resolves.toEqual(value);
  expect(f.rows.size).toBe(0);
});

it.each([403, 503])("current HTTP%s refusal on original recovery never frees UNKNOWN", async (status) => {
  const f = await fixture();
  f.wire.mockRejectedValueOnce(Error("lost"));
  await expect(f.reopen().executeResolutionOnce(f.context, f.original)).rejects.toThrow();
  const bytes = [...f.rows.values()][0];
  f.wire.mockResolvedValueOnce(Response.json({ status: status === 403 ? "DENIED" : "CLOSED" }, { status }));
  await f.reopen().recoverResolution(f.context);
  expect([...f.rows.values()][0]).toBe(bytes);
  await expect(f.reopen().clearResolvedResolution(f.context, f.original.operationId)).rejects.toThrow("UNRESOLVED");
  await expect(f.reopen().executeResolutionOnce(f.context, { ...f.original, operationId: randomUUID() })).rejects.toThrow("RECOVER_ORIGINAL_REQUIRED");
});
it("retains an old unproven rejection byte-for-byte and restores only its original operation", async () => {
  const f = await fixture();
  f.wire.mockResolvedValueOnce(Response.json({ status: "DENIED" }, { status: 403 }));
  await f.reopen().executeResolutionOnce(f.context, f.original);
  const [key, raw] = [...f.rows.entries()][0];
  const prior = JSON.parse(raw); delete prior.rejectionSource;
  const bytes = JSON.stringify(prior); f.rows.set(key, bytes);
  f.wire.mockResolvedValueOnce(Response.json({ status: "CONFLICT" }, { status: 409 }));
  await f.reopen().recoverResolution(f.context);
  expect([...f.rows.values()][0]).toBe(bytes);
  await expect(f.reopen().clearResolvedResolution(f.context, f.original.operationId)).rejects.toThrow("UNRESOLVED");
  f.wire.mockResolvedValueOnce(Response.json({ status: "FOUND", receipt: f.receipt }));
  await f.reopen().recoverResolution(f.context);
  expect((await f.reopen().readResolution(f.context))?.receipt).toEqual(f.receipt);
  expect((await f.reopen().readResolution(f.context))?.original).toEqual(f.original);
  await f.reopen().clearResolvedResolution(f.context, f.original.operationId);
});
it("normalizes an already bounded error body without platform Response.json/stream constructors", async () => {
  const f = await fixture();
  const response = Response.json({ status: "DENIED" }, { status: 403 });
  f.wire.mockResolvedValueOnce(response);
  vi.stubGlobal("Response", undefined); vi.stubGlobal("ReadableStream", undefined);
  try {
    await expect(f.reopen().executeResolutionOnce(f.context, f.original)).resolves.toEqual({ status: "DENIED" });
    expect((await f.reopen().readResolution(f.context))?.rejectionSource).toBe("INITIAL_EXECUTION");
  } finally { vi.unstubAllGlobals(); }
});
