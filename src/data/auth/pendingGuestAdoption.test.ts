import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getAccountGeneration } from "./accountGeneration";
import { readPendingGuestAdoption } from "./pendingGuestAdoption";
import { createAuthRepository } from "./authSessionRepository";
const m = vi.hoisted(() => ({ principal: vi.fn(), inspect: vi.fn(), record: vi.fn(), finish: vi.fn(), read: vi.fn(), revoke: vi.fn(), frozen: vi.fn(), status: vi.fn(), receipt: vi.fn(), cancel: vi.fn() }));
vi.mock("./authRepository", () => ({ clearLocalSession: vi.fn(), readCommittedLocalPrincipal: m.principal, guestVerificationSession: { read: m.read, revoke: m.revoke } }));
vi.mock("./guestAdoptionRecovery", () => ({ openGuestAdoptionRecovery: async () => ({ inspectPublicationRequests: m.inspect, recordServerCancellation: m.record, finishServerCancellation: m.finish }) }));
vi.mock("./guestLocalWorkspace", () => ({ hasActiveGuestInventory: m.frozen }));
vi.mock("./guestAdoptionTransport", () => ({ createGuestAdoptionTransport: () => ({ status: m.status, receipt: m.receipt, cancel: m.cancel }) }));
beforeEach(() => vi.resetAllMocks());
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function fixture() {
  const preparation = { sourceGuestLocalId: randomUUID(), targetAccountId: randomUUID(), adoptionId: randomUUID(), inventorySha256: "a".repeat(64) };
  const session = { identity: { userId: preparation.targetAccountId, displayName: "", email: null }, accessToken: "unit", refreshToken: "unit", expiresAt: "2099-01-01T00:00:00Z" };
  const prior = { preparation, preparationSha256: "b".repeat(64) };
  m.principal.mockResolvedValue({ kind: "GUEST", localId: preparation.sourceGuestLocalId });
  m.inspect.mockResolvedValue([prior]);
  m.frozen.mockReturnValue(false);
  m.read.mockResolvedValue({ status: "SESSION", session });
  m.revoke.mockResolvedValue(undefined);
  return { preparation, prior, session, signal: new AbortController().signal };
}
it("reads the original target/attempt after restart without preflight or publication", async () => {
  const f = fixture();
  const pending = (await readPendingGuestAdoption(f.signal))!;
  expect(pending.generation).toBe(getAccountGeneration());
  expect(pending.session).toBe(f.session);
  m.status.mockResolvedValue({ status: "IN_PROGRESS" });
  await expect(pending.attempt.publish()).rejects.toThrow("AUTHORITATIVE_STATUS_REQUIRED");
  expect(m.cancel).not.toHaveBeenCalled();
  expect(m.receipt).not.toHaveBeenCalled();
});
it("does not release or revoke on unresolved cancellation; records server proof before revoking", async () => {
  const f = fixture(), pending = (await readPendingGuestAdoption(f.signal))!;
  m.cancel.mockRejectedValueOnce(Error("UNRESOLVED"));
  await expect(pending.attempt.cancel()).rejects.toThrow("UNRESOLVED");
  expect(m.record).not.toHaveBeenCalled();
  expect(m.revoke).not.toHaveBeenCalled();
  const receipt = { outcome: "CANCELLED" };
  m.cancel.mockResolvedValue(receipt);
  await pending.attempt.cancel();
  expect(m.record).toHaveBeenCalledWith(f.preparation.adoptionId, f.preparation.targetAccountId, receipt);
  expect(m.record.mock.invocationCallOrder[0]).toBeLessThan(m.revoke.mock.invocationCallOrder[0]);
  expect(m.revoke.mock.invocationCallOrder[0]).toBeLessThan(m.finish.mock.invocationCallOrder[0]);
});
it("resumes recorded cancellation after revocation UNKNOWN without another server mutation", async () => {
  const f = fixture();
  m.inspect.mockResolvedValue([{ ...f.prior, cancellationReceipt: {} }]);
  m.revoke.mockRejectedValueOnce(Error("UNKNOWN"));
  await expect(readPendingGuestAdoption(f.signal)).rejects.toThrow("UNKNOWN");
  expect(m.finish).not.toHaveBeenCalled();
  expect(await readPendingGuestAdoption(f.signal)).toBeNull();
  expect(m.cancel).not.toHaveBeenCalled();
  expect(m.read).not.toHaveBeenCalled();
  expect(m.finish).toHaveBeenCalledOnce();
});
it.each(["duplicates", "live-freeze", "foreign-session", "aborted"])("retains source for %s", async (mode) => {
  const f = fixture();
  if (mode === "duplicates") m.inspect.mockResolvedValue([f.prior, f.prior]);
  if (mode === "live-freeze") m.frozen.mockReturnValue(true);
  if (mode === "foreign-session") m.read.mockResolvedValue({ status: "SESSION", session: { ...f.session, identity: { ...f.session.identity, userId: randomUUID() } } });
  const signal = mode === "aborted" ? AbortSignal.abort() : f.signal;
  await expect(readPendingGuestAdoption(signal)).rejects.toThrow();
  expect(m.record).not.toHaveBeenCalled();
  expect(m.revoke).not.toHaveBeenCalled();
});

it.each(["refresh-and-logout-unknown", "bad-jwt", "invalid-refresh", "foreign-user", "foreign-subject"])("uses the normal Provider adapter for expired cancellation: %s", async (mode) => {
  const f = fixture(), p = f.preparation;
  m.inspect.mockResolvedValue([{ ...f.prior, cancellationReceipt: {} }]);
  const entries = new Map<string, string>([["otr.mobile.launch.v1", JSON.stringify({ version: 1, kind: "GUEST", localId: p.sourceGuestLocalId })]]);
  const repository = createAuthRepository({ getItem: async (k) => entries.get(k) ?? null, setItem: async (k, v) => { entries.set(k, v); }, deleteItem: async (k) => { entries.delete(k); } });
  const binding = { adoptionId: p.adoptionId, sourceGuestLocalId: p.sourceGuestLocalId, targetAccountId: p.targetAccountId };
  const jwt = `e30.${btoa(JSON.stringify({ sub: p.targetAccountId }))}.unit`;
  await repository.guestVerification.store(binding, { ...f.session, accessToken: jwt, expiresAt: "2020-01-01T00:00:00Z" });
  m.revoke.mockImplementation(repository.guestVerification.revoke);
  vi.stubEnv("EXPO_PUBLIC_OTR_DEV_SUPABASE_URL", "https://tuqigdxrvrerfewsxqgm.supabase.co");
  vi.stubEnv("EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY", "unit-public-key");
  let refreshes = 0, logouts = 0;
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    if (String(url).includes("grant_type=refresh_token")) {
      refreshes++;
      if (mode === "bad-jwt" || mode === "invalid-refresh") return Response.json({ error_code: mode === "bad-jwt" ? "bad_jwt" : "refresh_token_not_found" }, { status: 400 });
      return Response.json({ access_token: mode === "foreign-subject" ? `e30.${btoa(JSON.stringify({ sub: randomUUID() }))}.unit` : jwt + "-new", refresh_token: "unit-rotated", expires_in: 3600, user: { id: mode === "foreign-user" ? randomUUID() : p.targetAccountId } });
    }
    expect(String(url)).toContain("/logout?scope=local");
    expect(init.headers.Authorization).toBe("Bearer " + jwt + "-new");
    return ++logouts === 1 ? Response.json({}, { status: 500 }) : new Response(null, { status: 204 });
  }));
  if (mode === "invalid-refresh") {
    expect(await readPendingGuestAdoption(f.signal)).toBeNull();
    expect((await repository.guestVerification.read(binding)).status).toBe("REVOKED");
    expect(logouts).toBe(0);
  } else {
    await expect(readPendingGuestAdoption(f.signal)).rejects.toThrow();
    expect((await repository.guestVerification.read(binding)).status).toBe("REVOCATION_PENDING");
    expect(m.finish).not.toHaveBeenCalled();
    if (mode !== "refresh-and-logout-unknown") {
      expect(logouts).toBe(0);
      expect(JSON.parse(entries.get(`otr.mobile.session.v2.${p.targetAccountId}`)!).accessToken).toBe(jwt);
    }
    if (mode === "refresh-and-logout-unknown") {
      expect(await readPendingGuestAdoption(f.signal)).toBeNull();
      expect((await repository.guestVerification.read(binding)).status).toBe("REVOKED");
      expect(refreshes).toBe(1);
      expect(logouts).toBe(2);
    }
  }
  expect(await repository.readCommittedLocalPrincipal()).toEqual({ kind: "GUEST", localId: p.sourceGuestLocalId });
});
