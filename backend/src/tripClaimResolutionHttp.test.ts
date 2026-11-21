import { expect, it, vi } from "vitest";
import { tripClaimResolutionBoundary } from "./tripClaimResolutionHttp";
import { claimResolutionIntentDigest } from "./tripClaimResolutionAdapter";
import type { ClaimResolutionAuthority } from "../../src/data/api/claimResolutionContracts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = { id: id(1), accountClass: "NORMAL_ACCOUNT" as const };
const tripId = id(2),
  requestId = id(3),
  operationId = id(4);
const command = {
  kind: "SUBMIT_PENDING_CLAIM" as const,
  operationId,
  requestId,
  expectedRevision: null,
  inviteId: id(5),
  requestedPersonId: id(6),
  expectedPreviewDigest: "a".repeat(64),
  explicitConsent: true as const,
};
const path = `https://api.example.test/v2/trips/${tripId}`;
const post = (body: unknown = command, suffix = "", key: string | null = operationId) =>
  new Request(`${path}/claim-request-operations${suffix}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: key ? { "Idempotency-Key": key } : {},
  });
function fixture() {
  const receipt = {
    receiptVersion: 2,
    operationId,
    actorAccountId: user.id,
    tripId,
    requestId,
    intentDigest: claimResolutionIntentDigest(
      { actorAccountId: user.id, tripId },
      command,
    ),
    commandKind: command.kind,
    beforeRevision: null,
    afterRevision: 1,
    outcome: "PENDING_REVIEW",
    acceptedAt: "2026-11-15T02:00:00Z",
    effects: {
      linkedPersonId: null,
      personCreateReceipt: null,
      provisionalRevocation: null,
    },
  };
  const port = {
    previewPendingClaim: vi.fn(async () => null),
    submitPendingClaim: vi.fn(async () => ({
      status: "RECORDED",
      receipt,
      snapshot: null,
    })),
    resolveClaimRequest: vi.fn(async () => ({ status: "DENIED" })),
    consentToResolution: vi.fn(async () => ({ status: "DENIED" })),
    readRequest: vi.fn(async () => null),
    recoverOperation: vi.fn(async () => ({ status: "ABSENT_UNCONFIRMED" })),
  };
  return { port: port as unknown as ClaimResolutionAuthority, spies: port };
}
it("keeps the decision-view route closed without the qualified owning reader", async () => {
  const f = fixture();
  const response = await tripClaimResolutionBoundary(new Request(`${path}/claim-requests/${requestId}/decision-view`), user, f.port);
  expect(response.status).toBe(503);
  expect(f.spies.readRequest).not.toHaveBeenCalled();
});
it("uses only the trusted account for decision-view and distinguishes absence from broken owning output", async () => {
  const f = fixture();
  const readRequestView = vi.fn<NonNullable<ClaimResolutionAuthority["readRequestView"]>>(async () => null);
  const port = { ...f.port, readRequestView };
  const request = () => new Request(`${path}/claim-requests/${requestId}/decision-view`);
  expect((await tripClaimResolutionBoundary(request(), user, port)).status).toBe(404);
  expect(readRequestView).toHaveBeenCalledExactlyOnceWith({ actorAccountId: user.id, tripId }, requestId);
  readRequestView.mockResolvedValueOnce({ accountId: user.id } as never);
  expect((await tripClaimResolutionBoundary(request(), user, port)).status).toBe(503);
});
it("keeps the normal pending index closed until its owning ACL reader exists", async () => {
  const f = fixture();
  expect((await tripClaimResolutionBoundary(new Request(`${path}/claim-requests`), user, f.port)).status).toBe(503);
});
it("indexes only through trusted Actor/Trip and validates cursor input before owning IO", async () => {
  const f = fixture();
  const listRequests = vi.fn<NonNullable<ClaimResolutionAuthority["listRequests"]>>(async () => ({ accountId: user.id, tripId, entries: [], nextRequestId: null }));
  const port = { ...f.port, listRequests };
  const response = await tripClaimResolutionBoundary(new Request(`${path}/claim-requests?after=${id(7)}`), user, port);
  expect(response.status).toBe(200);
  expect(listRequests).toHaveBeenCalledExactlyOnceWith({ actorAccountId: user.id, tripId }, id(7));
  for (const query of ["after=bad", `after=${id(7)}&after=${id(8)}`, `actor=${id(99)}`])
    expect((await tripClaimResolutionBoundary(new Request(`${path}/claim-requests?${query}`), user, port)).status).toBe(400);
  expect(listRequests).toHaveBeenCalledOnce();
});
it("does not turn denied, foreign or failed index reads into an empty inbox", async () => {
  const f = fixture();
  const listRequests = vi.fn<NonNullable<ClaimResolutionAuthority["listRequests"]>>(async () => null);
  const port = { ...f.port, listRequests }, request = () => new Request(`${path}/claim-requests`);
  expect((await tripClaimResolutionBoundary(request(), user, port)).status).toBe(403);
  listRequests.mockResolvedValueOnce({ accountId: id(99), tripId, entries: [], nextRequestId: null });
  expect((await tripClaimResolutionBoundary(request(), user, port)).status).toBe(503);
  listRequests.mockRejectedValueOnce(Error("unavailable"));
  expect((await tripClaimResolutionBoundary(request(), user, port)).status).toBe(503);
});
it("is default-closed and never reads a request body as an authority", async () => {
  const r = await tripClaimResolutionBoundary(post(), user);
  expect(r.status).toBe(503);
  expect(await r.json()).toEqual({ error: { code: "CLAIM_RESOLUTION_CLOSED" } });
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(r.headers.get("Vary")).toBe("Authorization");
});
it.each(["ANONYMOUS", "UNKNOWN", undefined] as const)(
  "refuses %s accounts before owning IO",
  async (accountClass) => {
    const f = fixture();
    expect(
      (await tripClaimResolutionBoundary(post(), { id: user.id, accountClass }, f.port))
        .status,
    ).toBe(403);
    expect(f.spies.submitPendingClaim).not.toHaveBeenCalled();
  },
);
it("takes Actor only from normal Auth and records pending without claiming membership", async () => {
  const f = fixture();
  const r = await tripClaimResolutionBoundary(post(), user, f.port);
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(body.status).toBe("RECORDED");
  expect(body.receipt.outcome).toBe("PENDING_REVIEW");
  expect(body.receipt.effects.linkedPersonId).toBeNull();
  expect(f.spies.submitPendingClaim).toHaveBeenCalledExactlyOnceWith(
    { actorAccountId: user.id, tripId },
    command,
  );
});
it.each([null, id(99)])(
  "refuses a missing or different original idempotency key",
  async (key) => {
    const f = fixture();
    expect(
      (await tripClaimResolutionBoundary(post(command, "", key), user, f.port)).status,
    ).toBe(400);
    expect(f.spies.submitPendingClaim).not.toHaveBeenCalled();
  },
);
it.each([
  { ...command, actorAccountId: id(99) },
  { ...command, role: "ORGANIZER" },
  { ...command, explicitConsent: false },
])("refuses forged authority or missing consent before dispatch", async (body) => {
  const f = fixture();
  expect((await tripClaimResolutionBoundary(post(body), user, f.port)).status).toBe(400);
  expect(f.spies.submitPendingClaim).not.toHaveBeenCalled();
});
it("bounds JSON bytes and rejects query/method/invalid Trip without IO", async () => {
  const f = fixture();
  expect(
    (await tripClaimResolutionBoundary(post({ padding: "x".repeat(9000) }), user, f.port))
      .status,
  ).toBe(400);
  expect(
    (
      await tripClaimResolutionBoundary(
        new Request(`${path}/claim-request-operations?actor=other`, { method: "POST" }),
        user,
        f.port,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await tripClaimResolutionBoundary(
        new Request(`${path}/claim-request-operations`),
        user,
        f.port,
      )
    ).status,
  ).toBe(405);
  expect(
    (
      await tripClaimResolutionBoundary(
        new Request("https://api.example.test/v2/trips/not-uuid/claim-requests/preview", {
          method: "POST",
        }),
        user,
        f.port,
      )
    ).status,
  ).toBe(400);
  expect(f.spies.submitPendingClaim).not.toHaveBeenCalled();
});
it("keeps authoritative absence404 distinct from storage/authority unavailable503", async () => {
  const f = fixture();
  const read = () => new Request(`${path}/claim-requests/${requestId}`);
  expect((await tripClaimResolutionBoundary(read(), user, f.port)).status).toBe(404);
  f.spies.readRequest.mockRejectedValueOnce(Error("PRIVATE_DIAGNOSTIC"));
  const failed = await tripClaimResolutionBoundary(read(), user, f.port);
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("PRIVATE_DIAGNOSTIC");
  expect((await tripClaimResolutionBoundary(read(), user)).status).toBe(503);
});
it("validates preview without creating a request", async () => {
  const f = fixture();
  const request = new Request(`${path}/claim-requests/preview`, {
    method: "POST",
    body: JSON.stringify({
      requestId,
      inviteId: command.inviteId,
      requestedPersonId: command.requestedPersonId,
    }),
  });
  expect((await tripClaimResolutionBoundary(request, user, f.port)).status).toBe(404);
  expect(f.spies.previewPendingClaim).toHaveBeenCalledOnce();
  expect(f.spies.submitPendingClaim).not.toHaveBeenCalled();
});
it("recovery only reads original operation; absence202 never authorizes another execute", async () => {
  const f = fixture();
  const original = { operationId, requestId, intentDigest: "b".repeat(64) };
  const result = await tripClaimResolutionBoundary(
    post(original, "/recovery"),
    user,
    f.port,
  );
  expect(result.status).toBe(202);
  expect(await result.json()).toEqual({ status: "ABSENT_UNCONFIRMED" });
  expect(f.spies.recoverOperation).toHaveBeenCalledExactlyOnceWith(
    { actorAccountId: user.id, tripId },
    original,
  );
  expect(f.spies.submitPendingClaim).not.toHaveBeenCalled();
  expect(f.spies.resolveClaimRequest).not.toHaveBeenCalled();
});
it("aborted requests fail closed before a write", async () => {
  const f = fixture();
  const control = new AbortController();
  control.abort();
  const request = new Request(`${path}/claim-request-operations`, {
    method: "POST",
    body: JSON.stringify(command),
    signal: control.signal,
  });
  expect((await tripClaimResolutionBoundary(request, user, f.port)).status).toBe(503);
  expect(f.spies.submitPendingClaim).not.toHaveBeenCalled();
});
it("returns current-resolver CreateNew provenance without substituting another Account", async () => {
  const f = fixture(), value = { version: 1 as const, actorAccountId: user.id, tripId, requestId, requestRevision: 2, tripCreateOperationId: id(19) };
  const readCreatePersonContext = vi.fn<NonNullable<ClaimResolutionAuthority["readCreatePersonContext"]>>(async () => value);
  const request = () => new Request(`${path}/claim-requests/${requestId}/create-person-context`);
  expect((await tripClaimResolutionBoundary(request(), user, f.port)).status).toBe(503);
  const result = await tripClaimResolutionBoundary(request(), user, { ...f.port, readCreatePersonContext });
  expect(result.status).toBe(200); expect(await result.json()).toEqual(value);
  expect(readCreatePersonContext).toHaveBeenCalledExactlyOnceWith({ actorAccountId: user.id, tripId }, requestId);
  readCreatePersonContext.mockResolvedValueOnce({ ...value, actorAccountId: id(20) });
  expect((await tripClaimResolutionBoundary(request(), user, { ...f.port, readCreatePersonContext })).status).toBe(503);
});
it("only explicit own provisional denial is data, not missing scope, malformed grant or IO failure", async () => {
  const f = fixture(), value = { version: 1 as const, cacheScope: "CLAIM_PROVISIONAL" as const, accountId: user.id, tripId, requestId,
    requestRevision: 2, observedAt: "2026-11-16T00:00:00Z", cacheGrant: null, access: "DENIED" as const, grant: null, records: [] };
  const readProvisionalView = vi.fn<NonNullable<ClaimResolutionAuthority["readProvisionalView"]>>(async () => value);
  const request = () => new Request(`${path}/claim-requests/${requestId}/provisional`), port = { ...f.port, readProvisionalView };
  expect((await tripClaimResolutionBoundary(request(), user, port)).status).toBe(200);
  readProvisionalView.mockResolvedValueOnce(null); expect((await tripClaimResolutionBoundary(request(), user, port)).status).toBe(404);
  readProvisionalView.mockRejectedValueOnce(Error("IO failed")); expect((await tripClaimResolutionBoundary(request(), user, port)).status).toBe(503);
  readProvisionalView.mockResolvedValueOnce({ ...value, access: "GRANTED" } as never);
  expect((await tripClaimResolutionBoundary(request(), user, port)).status).toBe(503);
});
