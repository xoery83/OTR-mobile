import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import { createSupabaseDevGateway } from "./supabaseGateway";
import type { ClaimResolutionAuthority } from "../../src/data/api/claimResolutionContracts";

afterEach(() => vi.restoreAllMocks());
const accountId = randomUUID(), tripId = randomUUID(), requestId = randomUUID(), inviteId = randomUUID();
const path = `/v2/trips/${tripId}`;
const selections = [
  ["GET", "/claim-requests"], ["POST", "/claim-requests/preview"],
  ["GET", `/claim-requests/${requestId}`], ["GET", `/claim-requests/${requestId}/decision-view`],
  ["POST", "/claim-request-operations"], ["POST", "/claim-request-operations/recovery"],
  ["POST", "/claim-origins/verify"],
  ["GET", `/claim-origins/${inviteId}/requests/${requestId}/people`],
  ["GET", `/claim-requests/${requestId}/create-person-context`], ["GET", `/claim-requests/${requestId}/provisional`],
  ["POST", "/general-invite-operations"], ["POST", "/general-invite-operations/recovery"], ["POST", "/general-invite-operations/delivery"],
] as const;
const request = (method: string, suffix: string, body?: unknown, token = "synthetic-normal") => new Request(`https://unit.test${path}${suffix}`, {
  method, headers: { Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}),
});
function gateway(accountClass: "NORMAL_ACCOUNT" | "ANONYMOUS_ACCOUNT" = "NORMAL_ACCOUNT") {
  return { validateAccessToken: vi.fn(async () => ({ id: accountId, accountClass })) } as unknown as DevBackendGateway;
}
it.each(selections)("mounts default-closed %s %s through normal authentication", async (method, suffix) => {
  const g = gateway(), handle = createDevBackendHandler({ gateway: g });
  const result = await handle(request(method, suffix));
  expect(result.status).toBe(503); expect(g.validateAccessToken).toHaveBeenCalledOnce();
});
it("invokes the actual scoped Reader and verifier dependencies, without granting membership", async () => {
  const listRequests = vi.fn(async () => ({ accountId, tripId, entries: [], nextRequestId: null }));
  const verify = vi.fn(async () => ({ accountId, tripId, requestId, inviteId, purpose: "PERSON_CLAIM" as const,
    verified: true as const, expiresAt: "2026-11-22T00:00:00Z" }));
  const handle = createDevBackendHandler({ gateway: gateway(), claimResolutionPort: { listRequests } as unknown as ClaimResolutionAuthority,
    claimOriginPort: { verify } });
  expect((await handle(request("GET", "/claim-requests"))).status).toBe(200);
  expect(listRequests).toHaveBeenCalledExactlyOnceWith({ actorAccountId: accountId, tripId }, null);
  const input = { requestId, inviteId, purpose: "PERSON_CLAIM", token: "synthetic-opaque" };
  const result = await handle(request("POST", "/claim-origins/verify", input));
  expect(result.status).toBe(200);
  expect(verify).toHaveBeenCalledExactlyOnceWith({ actorAccountId: accountId, tripId }, input);
  expect(await result.json()).not.toHaveProperty("token");
});
it.each(selections)("rejects anonymous sessions before invoking %s %s", async (method, suffix) => {
  const g = gateway("ANONYMOUS_ACCOUNT"), verify = vi.fn(), listRequests = vi.fn();
  const handle = createDevBackendHandler({ gateway: g, claimOriginPort: { verify }, claimResolutionPort: { listRequests } as unknown as ClaimResolutionAuthority });
  expect((await handle(request(method, suffix))).status).toBe(403);
  expect(verify).not.toHaveBeenCalled(); expect(listRequests).not.toHaveBeenCalled();
});
it.each(selections)("rejects OAuth resource tokens before trusted getUser at %s %s", async (method, suffix) => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const g = createSupabaseDevGateway({ url: "https://tuqigdxrvrerfewsxqgm.supabase.co", publishableKey: "unit", secretKey: "unit-unused" });
  const resource = `unit.${Buffer.from(JSON.stringify({ client_id: randomUUID(), aud: "authenticated" })).toString("base64url")}.unit`;
  expect((await createDevBackendHandler({ gateway: g })(request(method, suffix, undefined, resource))).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});
it("mounts preview, single submit and original recovery as distinct authority calls", async () => {
  const previewPendingClaim = vi.fn(async () => null);
  const submitPendingClaim = vi.fn(async () => ({ status: "DENIED" as const }));
  const recoverOperation = vi.fn(async () => ({ status: "ABSENT_UNCONFIRMED" as const }));
  const authority = { previewPendingClaim, submitPendingClaim, recoverOperation } as unknown as ClaimResolutionAuthority;
  const handle = createDevBackendHandler({ gateway: gateway(), claimResolutionPort: authority });
  const command = { kind: "SUBMIT_PENDING_CLAIM", operationId: randomUUID(), requestId, inviteId,
    requestedPersonId: randomUUID(), expectedRevision: null, expectedPreviewDigest: "a".repeat(64), explicitConsent: true };
  expect((await handle(request("POST", "/claim-requests/preview", { requestId, inviteId, requestedPersonId: command.requestedPersonId }))).status).toBe(404);
  expect(previewPendingClaim).toHaveBeenCalledOnce();
  const submit = request("POST", "/claim-request-operations", command);
  submit.headers.set("Idempotency-Key", command.operationId);
  expect((await handle(submit)).status).toBe(403);
  expect(submitPendingClaim).toHaveBeenCalledExactlyOnceWith({ actorAccountId: accountId, tripId }, command);
  const recovery = request("POST", "/claim-request-operations/recovery", { operationId: command.operationId, requestId, intentDigest: "b".repeat(64) });
  recovery.headers.set("Idempotency-Key", command.operationId);
  expect((await handle(recovery)).status).toBe(202);
  expect(recoverOperation).toHaveBeenCalledOnce(); expect(submitPendingClaim).toHaveBeenCalledOnce();
});
