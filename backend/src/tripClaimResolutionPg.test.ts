import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createClaimResolutionPgStorage, composeClaimResolutionPg, composeClaimOriginPg, composeGeneralInvitePg } from "./tripClaimResolutionPg";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import { readClaimResolutionDirectedOriginOnTransaction, type ClaimResolutionTransaction } from "./tripClaimResolutionCore";

function fixture(result: unknown = true) {
  const scope = { actorAccountId: randomUUID(), tripId: randomUUID() };
  const lease: CorePgLease = {
    retire: vi.fn(),
    query: vi.fn(async (sql) => ({ rows: sql.includes("trip_claim_resolution_state") ? [{ result }] : [] })),
  };
  const connection = { withLease: async <T>(work: (l: CorePgLease) => Promise<T>) => work(lease) };
  const storage = createClaimResolutionPgStorage(connection);
  const statements = () => vi.mocked(lease.query).mock.calls.map(([sql]) => sql);
  return { scope, lease, connection, storage, statements };
}

it("keeps origin verification off unless explicitly composed and binds the actual normal scope on one lease", async () => {
  const f = fixture(), input = { requestId: randomUUID(), inviteId: randomUUID(), purpose: "PERSON_CLAIM" as const, token: "synthetic opaque bearer" };
  expect(composeClaimOriginPg(f.connection)).toBeUndefined();
  expect(f.lease.query).not.toHaveBeenCalled();
  const value = { accountId: f.scope.actorAccountId, tripId: f.scope.tripId, requestId: input.requestId,
    inviteId: input.inviteId, purpose: input.purpose, verified: true, expiresAt: "2026-11-22T00:00:00Z" };
  vi.mocked(f.lease.query).mockImplementation(async sql => ({ rows: sql.includes("trip_claim_origin_verify") ? [{ result: value }] : [] }));
  await expect(composeClaimOriginPg(f.connection, true)!.verify(f.scope, input)).resolves.toEqual(value);
  expect(vi.mocked(f.lease.query).mock.calls.find(([sql]) => sql.includes("trip_claim_origin_verify"))?.[1])
    .toEqual([f.scope.actorAccountId, f.scope.tripId, input.requestId, input.inviteId, input.token]);
  expect(f.statements().at(-1)).toBe("COMMIT");
});
it("rolls back mismatched origin proof and preserves unknown COMMIT without replay", async () => {
  const f = fixture(), input = { requestId: randomUUID(), inviteId: randomUUID(), purpose: "PERSON_CLAIM" as const, token: "synthetic opaque bearer" };
  const value = { accountId: f.scope.actorAccountId, tripId: f.scope.tripId, requestId: input.requestId,
    inviteId: input.inviteId, purpose: input.purpose, verified: true, expiresAt: "2026-11-22T00:00:00Z" };
  vi.mocked(f.lease.query).mockImplementation(async sql => ({ rows: sql.includes("trip_claim_origin_verify") ? [{ result: { ...value, accountId: randomUUID() } }] : [] }));
  await expect(composeClaimOriginPg(f.connection, true)!.verify(f.scope, input)).rejects.toThrow("BINDING");
  expect(f.statements().at(-1)).toBe("ROLLBACK");
  vi.mocked(f.lease.query).mockClear().mockImplementation(async sql => {
    if (sql === "COMMIT") throw Error("lost commit");
    return { rows: sql.includes("trip_claim_origin_verify") ? [{ result: value }] : [] };
  });
  await expect(composeClaimOriginPg(f.connection, true)!.verify(f.scope, input)).rejects.toThrow("lost commit");
  expect(f.lease.retire).toHaveBeenCalledOnce();
  expect(f.statements().filter(sql => sql.includes("trip_claim_origin_verify"))).toHaveLength(1);
  expect(f.statements()).not.toContain("ROLLBACK");
});

it("stays closed without enablement and qualified effects", () => {
  const f = fixture();
  expect(composeClaimResolutionPg(f.connection)).toBeUndefined();
  expect(composeClaimResolutionPg(f.connection, undefined, true)).toBeUndefined();
  expect(f.lease.query).not.toHaveBeenCalled();
});
it("uses exact trusted scope on one lease and commits only awaited work", async () => {
  const f = fixture();
  await expect(f.storage.atomic(f.scope, tx => tx.resolver())).resolves.toBe(true);
  expect(vi.mocked(f.lease.query).mock.calls.find(([sql]) => sql.includes("trip_claim_resolution_state"))?.[1])
    .toEqual(["resolver", f.scope.actorAccountId, f.scope.tripId, "{}"]);
  expect(f.statements().at(-1)).toBe("COMMIT");
});
it("rejects invalid scope before acquiring SQL", async () => {
  const f = fixture();
  await expect(f.storage.atomic({ ...f.scope, actorAccountId: "bad" }, tx => tx.resolver())).rejects.toThrow();
  expect(f.lease.query).not.toHaveBeenCalled();
});
it("does not turn malformed data or a missing result into authoritative absence", async () => {
  for (const result of [null, {}, "true"]) {
    const f = fixture(result);
    await expect(f.storage.atomic(f.scope, tx => tx.resolver())).rejects.toThrow();
    expect(f.statements()).not.toContain("COMMIT");
    expect(f.statements().at(-1)).toBe("ROLLBACK");
  }
});
it("rejects transaction methods after release without further SQL", async () => {
  const f = fixture();
  let escaped!: ClaimResolutionTransaction;
  await f.storage.atomic(f.scope, async tx => { escaped = tx; await tx.resolver(); });
  const count = f.statements().length;
  await expect(escaped.resolver()).rejects.toThrow("RELEASED");
  expect(f.statements()).toHaveLength(count);
});
it("never commits a caught method validation failure", async () => {
  const f = fixture("not boolean");
  await expect(f.storage.atomic(f.scope, async tx => { await tx.resolver().catch(() => {}); })).rejects.toThrow("UNFINISHED");
  expect(f.statements()).not.toContain("COMMIT");
});
it("retires unfinished work without issuing rollback alongside in-flight SQL", async () => {
  const f = fixture();
  let complete!: (v: { rows: { result: boolean }[] }) => void;
  vi.mocked(f.lease.query).mockImplementation(async sql => sql.includes("trip_claim_resolution_state")
    ? new Promise(resolve => { complete = resolve; }) : { rows: [] });
  let unfinished!: Promise<boolean>;
  await expect(f.storage.atomic(f.scope, async tx => { unfinished = tx.resolver(); void unfinished.catch(() => {}); })).rejects.toThrow("UNFINISHED");
  expect(f.lease.retire).toHaveBeenCalledOnce();
  expect(f.statements()).not.toContain("COMMIT");
  expect(f.statements()).not.toContain("ROLLBACK");
  complete({ rows: [{ result: true }] });
  await expect(unfinished).rejects.toThrow();
});
it("preserves unknown COMMIT failures without rollback or re-execution", async () => {
  const f = fixture();
  const failure = Object.assign(Error("commit lost"), { code: "23505" });
  vi.mocked(f.lease.query).mockImplementation(async sql => {
    if (sql === "COMMIT") throw failure;
    return { rows: sql.includes("trip_claim_resolution_state") ? [{ result: true }] : [] };
  });
  await expect(f.storage.atomic(f.scope, tx => tx.resolver())).rejects.toBe(failure);
  expect(f.lease.retire).toHaveBeenCalledOnce();
  expect(f.statements().filter(sql => sql.includes("trip_claim_resolution_state"))).toHaveLength(1);
  expect(f.statements()).not.toContain("ROLLBACK");
});
it.each(["before", "during"] as const)("runtime closure %s COMMIT never releases a current result", async when => {
  const f = fixture();
  let closed = false;
  const storage = createClaimResolutionPgStorage(f.connection, () => { if (closed) throw Error("RUNTIME_CLOSED"); });
  vi.mocked(f.lease.query).mockImplementation(async sql => {
    if (sql === "COMMIT") closed = true;
    return { rows: sql.includes("trip_claim_resolution_state") ? [{ result: true }] : [] };
  });
  await expect(storage.atomic(f.scope, async tx => {
    const result = await tx.resolver();
    if (when === "before") closed = true;
    return result;
  })).rejects.toThrow("RUNTIME_CLOSED");
  if (when === "before") {
    expect(f.statements()).not.toContain("COMMIT"); expect(f.statements().at(-1)).toBe("ROLLBACK");
  } else {
    expect(f.lease.retire).toHaveBeenCalledOnce(); expect(f.statements()).not.toContain("ROLLBACK");
  }
});
it("retains foreign receipt collision metadata but rejects any foreign body", async () => {
  const operationId = randomUUID();
  const row = { version: 1, actor: randomUUID(), trip: randomUUID(), request: null, digest: "a".repeat(64), body: null };
  const f = fixture(row);
  await expect(f.storage.atomic(f.scope, tx => tx.receipt(operationId))).resolves.toEqual(row);
  const bad = fixture({ ...row, body: { secret: true } });
  await expect(bad.storage.atomic(bad.scope, tx => tx.receipt(operationId))).rejects.toThrow("FOREIGN_RECEIPT");
});
it("maps a proven pre-commit collision to typed CONFLICT through the authority", async () => {
  const f = fixture();
  vi.mocked(f.lease.query).mockImplementation(async sql => {
    if (sql.includes("trip_claim_resolution_state")) throw Object.assign(Error("collision"), { code: "23505" });
    return { rows: [] };
  });
  const authority = composeClaimResolutionPg(f.connection, { source: vi.fn(), finalize: vi.fn() }, true)!;
  await expect(authority.resolveClaimRequest(f.scope, {
    kind: "RESOLVE_CLAIM_REQUEST", operationId: randomUUID(), requestId: randomUUID(),
    expectedRevision: 1, decision: { kind: "REJECT" },
  })).resolves.toEqual({ status: "CONFLICT", currentRevision: null });
  expect(f.statements().at(-1)).toBe("ROLLBACK");
});
it("fences owning-effects SQL after transaction release", async () => {
  const f = fixture();
  let escaped!: CorePgLease;
  await f.storage.atomic(f.scope, async tx => { escaped = tx.lease; await tx.resolver(); });
  const count = f.statements().length;
  await expect(escaped.query("SELECT 1")).rejects.toThrow("UNAVAILABLE");
  expect(f.statements()).toHaveLength(count);
});
it("rejects parallel owning-effects SQL and never commits a poisoned transaction", async () => {
  const f = fixture();
  await expect(f.storage.atomic(f.scope, async tx => {
    await Promise.allSettled([tx.lease.query("SELECT 1"), tx.lease.query("SELECT 2")]);
  })).rejects.toThrow("UNFINISHED");
  expect(f.statements()).not.toContain("COMMIT");
});
it("recovers only the original receipt; absence is unconfirmed and SQL errors stay failures", async () => {
  const f = fixture(null);
  const authority = composeClaimResolutionPg(f.connection, { source: vi.fn(), finalize: vi.fn() }, true)!;
  const original = { operationId: randomUUID(), requestId: randomUUID(), intentDigest: "a".repeat(64) };
  await expect(authority.recoverOperation(f.scope, original)).resolves.toEqual({ status: "ABSENT_UNCONFIRMED" });
  expect(vi.mocked(f.lease.query).mock.calls.filter(([, args]) => args?.[0] === "receipt").map(([, args]) => args))
    .toEqual([["receipt", f.scope.actorAccountId, f.scope.tripId, JSON.stringify({ operationId: original.operationId })]]);
  vi.mocked(f.lease.query).mockRejectedValueOnce(Error("database unavailable"));
  await expect(authority.recoverOperation(f.scope, original)).rejects.toThrow();
});
it("runs the fixed directed-origin verifier on the caller's bounded transaction", async () => {
  const fact = { fingerprint: "b".repeat(64), access: "READ", expiresAt: "2026-11-16T00:00:00Z" };
  const f = fixture(fact);
  const input = { requestId: randomUUID(), inviteId: randomUUID(), requestedPersonId: randomUUID() };
  await expect(f.storage.atomic(f.scope, tx => readClaimResolutionDirectedOriginOnTransaction(tx, f.scope, input))).resolves.toEqual(fact);
  expect(f.statements().filter(sql => sql === "BEGIN")).toHaveLength(1);
  expect(f.statements().at(-1)).toBe("COMMIT");
  expect(vi.mocked(f.lease.query).mock.calls.find(([sql]) => sql.includes("'directedOrigin'"))?.[1])
    .toEqual([f.scope.actorAccountId, f.scope.tripId, JSON.stringify(input)]);
});
it("rejects missing RPC rows instead of returning not-found", async () => {
  const f = fixture();
  vi.mocked(f.lease.query).mockResolvedValue({ rows: [] });
  await expect(f.storage.atomic(f.scope, tx => tx.request(randomUUID()))).rejects.toThrow("RESULT_MISSING");
  expect(f.statements()).not.toContain("COMMIT");
});
it.each([
  { resolver: true, policy: true, actions: 4 },
  { resolver: false, policy: true, actions: 0 },
  { resolver: true, policy: false, actions: 0 },
])("maps atomic request eligibility without inferring resolver rights: %j", async ({ resolver, policy, actions }) => {
  const f = fixture(), requestId = randomUUID(), personId = randomUUID();
  const row = { inviteId: randomUUID(), sourceFingerprint: "a".repeat(64), snapshot: {
    requestId, tripId: f.scope.tripId, claimantAccountId: f.scope.actorAccountId,
    originalPersonId: personId, revision: 1, state: "PENDING_REVIEW", proposal: { kind: "EXISTING_PERSON", personId },
    proposalRevision: 1, proposalOperationId: randomUUID(), proposedByAccountId: randomUUID(),
    proposalDigest: "b".repeat(64), proposedAccess: "READ",
    consent: { state: "RECORDED", proposalDigest: "b".repeat(64), operationId: randomUUID() },
    provisionalGrant: null, expiresAt: "2026-11-22T00:00:00Z",
  } };
  vi.mocked(f.lease.query).mockImplementation(async (sql, args) => ({ rows: [{ result:
    sql.includes("'decisionFacts'") ? { sourceCurrent: true, proposalPreview: { personId, displayName: "Trip public label" } }
      : sql.includes("'writeAllowed'") ? policy : args?.[0] === "request" ? row
      : args?.[0] === "resolver" ? resolver : args?.[0] === "clock" ? "2026-11-15T00:00:00Z" : true,
  }] }));
  const authority = composeClaimResolutionPg(f.connection, { source: vi.fn(), finalize: vi.fn() }, true)!;
  const view = await authority.readRequestView({ ...f.scope }, requestId);
  expect(view).toMatchObject({ accountId: f.scope.actorAccountId, tripId: f.scope.tripId,
    requestId, snapshot: { revision: 1 }, canConsent: false,
    proposalPreview: { personId, displayName: "Trip public label" } });
  expect(view?.eligibleActions).toHaveLength(actions);
  expect(f.statements().filter(sql => sql === "BEGIN")).toHaveLength(1);
  expect(f.statements().at(-1)).toBe("COMMIT");
});
it("treats a v3 invite receipt as an occupied operation, never absent or a Claim receipt", async () => {
  const f = fixture();
  const receipt = { version: 3, actor: f.scope.actorAccountId, trip: f.scope.tripId,
    request: null, digest: "a".repeat(64), body: null };
  vi.mocked(f.lease.query).mockImplementation(async sql => ({ rows: sql.includes("trip_claim_resolution_state") ? [{ result: receipt }] : [] }));
  const authority = composeClaimResolutionPg(f.connection, { source: vi.fn(), finalize: vi.fn() }, true)!;
  const command = { kind: "RESOLVE_CLAIM_REQUEST" as const, requestId: randomUUID(), operationId: randomUUID(),
    expectedRevision: 1, decision: { kind: "REJECT" as const } };
  await expect(authority.resolveClaimRequest(f.scope, command)).resolves.toEqual({ status: "CONFLICT", currentRevision: null });
  await expect(authority.recoverOperation(f.scope, { operationId: command.operationId, requestId: command.requestId, intentDigest: "b".repeat(64) }))
    .resolves.toEqual({ status: "CONFLICT" });
  receipt.body = {} as never;
  await expect(f.storage.atomic(f.scope, tx => tx.receipt(command.operationId))).rejects.toThrow("FOREIGN_RECEIPT_BODY");
});
it("maps pending index from the original Submit operation on one transaction", async () => {
  const f = fixture(), initialSubmitOperationId = randomUUID();
  const entry = { requestId: randomUUID(), inviteId: randomUUID(), initialSubmitOperationId,
    claimantAccountId: randomUUID(), originalPersonId: randomUUID(), revision: 3,
    state: "AWAITING_CONSENT", expiresAt: "2026-11-22T00:00:00Z" };
  vi.mocked(f.lease.query).mockImplementation(async sql => ({ rows: sql.includes("'pendingIndex'")
    ? [{ result: { requests: [entry], nextRequestId: null } }] : [] }));
  const authority = composeClaimResolutionPg(f.connection, { source: vi.fn(), finalize: vi.fn() }, true)!;
  const value = await authority.listRequests(f.scope, null);
  expect(value).toMatchObject({ accountId: f.scope.actorAccountId, tripId: f.scope.tripId,
    entries: [{ requestId: entry.requestId, initialOperationId: initialSubmitOperationId, revision: 3 }], nextRequestId: null });
  expect(value?.entries[0]).not.toHaveProperty("initialSubmitOperationId");
  expect(f.statements().filter(sql => sql === "BEGIN")).toHaveLength(1);
  expect(f.statements().at(-1)).toBe("COMMIT");
});
it("preserves unauthorized pending index as null and missing data as failure", async () => {
  const f = fixture(null);
  const authority = composeClaimResolutionPg(f.connection, { source: vi.fn(), finalize: vi.fn() }, true)!;
  await expect(authority.listRequests(f.scope, null)).resolves.toBeNull();
  vi.mocked(f.lease.query).mockImplementation(async () => ({ rows: [] }));
  await expect(authority.listRequests(f.scope, null)).rejects.toThrow("INDEX_UNAVAILABLE");
});
it("composes initial General Persons on the same bounded lease without promoting absent or foreign source", async () => {
  const f = fixture(), input = { requestId: randomUUID(), inviteId: randomUUID(), afterPersonId: null };
  const value = { version: 1, accountId: f.scope.actorAccountId, tripId: f.scope.tripId, requestId: input.requestId, inviteId: input.inviteId,
    expiresAt: "2026-11-23T00:00:00Z", tripName: "Synthetic Trip", persons: [], nextPersonId: null };
  vi.mocked(f.lease.query).mockImplementation(async sql => ({ rows: sql.includes("generalInitialPersons") ? [{ result: value }] : [] }));
  await expect(composeClaimOriginPg(f.connection, true)!.initialPersons!(f.scope, input)).resolves.toEqual(value);
  expect(f.statements().at(-1)).toBe("COMMIT");
  vi.mocked(f.lease.query).mockImplementation(async sql => ({ rows: sql.includes("generalInitialPersons") ? [{ result: { ...value, requestId: randomUUID() } }] : [] }));
  await expect(composeClaimOriginPg(f.connection, true)!.initialPersons!(f.scope, input)).rejects.toThrow("BINDING");
  expect(f.statements().at(-1)).toBe("ROLLBACK");
});
it.each(["23505", "42501"])("classifies only pre-COMMIT General issuer %s as no-mutation", async code => {
  const f = fixture(); expect(composeGeneralInvitePg(f.connection)).toBeUndefined();
  const input = { operationId: randomUUID(), expiresAt: null, maxUses: 1 };
  vi.mocked(f.lease.query).mockImplementation(async sql => {
    if (sql.includes("trip_claim_general_invite_issue")) throw Object.assign(Error("denied"), { code });
    return { rows: [] };
  });
  await expect(composeGeneralInvitePg(f.connection, true)!.issue(f.scope, input)).resolves.toEqual({ status: code === "23505" ? "CONFLICT" : "DENIED" });
  expect(f.statements().at(-1)).toBe("ROLLBACK"); expect(f.statements()).not.toContain("COMMIT");
});
it("does not reinterpret a General COMMIT permission-shaped failure as a safe denial", async () => {
  const f = fixture(), input = { operationId: randomUUID(), expiresAt: null, maxUses: 1 };
  const value = { receiptVersion: 3, operationId: input.operationId, actorAccountId: f.scope.actorAccountId, tripId: f.scope.tripId,
    inviteId: randomUUID(), intentDigest: "a".repeat(64), sourceFingerprint: "b".repeat(64), purpose: "PERSON_CLAIM", outcome: "GENERAL_INVITE_ISSUED",
    expiresAt: "2026-11-23T00:00:00Z", maxUses: 1, acceptedAt: "2026-11-16T00:00:00Z" };
  const failure = Object.assign(Error("lost COMMIT"), { code: "42501" });
  vi.mocked(f.lease.query).mockImplementation(async sql => {
    if (sql === "COMMIT") throw failure;
    return { rows: sql.includes("trip_claim_general_invite_issue") ? [{ result: value }] : [] };
  });
  await expect(composeGeneralInvitePg(f.connection, true)!.issue(f.scope, input)).rejects.toBe(failure);
  expect(f.lease.retire).toHaveBeenCalledOnce(); expect(f.statements()).not.toContain("ROLLBACK");
});
it("reads request-bound CreateNew provenance through the same lease with current Organizer identity", async () => {
  const f = fixture(), requestId = randomUUID(), value = { version: 1, actorAccountId: f.scope.actorAccountId, tripId: f.scope.tripId,
    requestId, requestRevision: 3, tripCreateOperationId: randomUUID() };
  vi.mocked(f.lease.query).mockImplementation(async sql => ({ rows: sql.includes("createPersonContext") ? [{ result: value }] : [] }));
  const authority = composeClaimResolutionPg(f.connection, { source: vi.fn(), finalize: vi.fn() }, true)!;
  await expect(authority.readCreatePersonContext(f.scope, requestId)).resolves.toEqual(value);
  expect(f.statements().at(-1)).toBe("COMMIT");
  vi.mocked(f.lease.query).mockImplementation(async sql => ({ rows: sql.includes("createPersonContext") ? [{ result: { ...value, actorAccountId: randomUUID() } }] : [] }));
  await expect(authority.readCreatePersonContext(f.scope, requestId)).rejects.toThrow();
  expect(f.statements().at(-1)).toBe("ROLLBACK");
});
