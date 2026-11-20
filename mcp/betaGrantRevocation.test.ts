import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createBetaGrantRevocation } from "./betaGrantRevocation";
const issuer = "https://owned.invalid/auth/v1";
function setup(userPatch: Record<string, unknown> = {}) {
  const scope = {
    accountId: randomUUID(),
    clientId: randomUUID(),
    expiresAt: Date.now() + 60000,
  };
  const audit = vi.fn();
  const provider = vi.fn<typeof fetch>(async (_url, init) =>
    init?.method === "GET"
      ? Response.json({ id: scope.accountId, is_anonymous: false, ...userPatch })
      : new Response(null, { status: 204 }),
  );
  const handler = createBetaGrantRevocation({
    issuer,
    publishableKey: "public-only",
    scope,
    request: provider,
    audit,
  });
  const request = (
    query = "client_id=" + scope.clientId,
    body?: string,
    authorization: string | null = "Bearer normal-session",
  ) =>
    new Request(issuer + "/user/oauth/grants?" + query, {
      method: "DELETE",
      headers: authorization ? { Authorization: authorization } : {},
      ...(body ? { body } : {}),
    });
  return { scope, audit, provider, handler, request };
}
it("delegates only exact normal-user self-revocation to formal Auth, with no actor/body/service credential overrides", async () => {
  const s = setup();
  const result = await s.handler(s.request());
  expect(result?.status).toBe(204);
  expect(result?.headers.get("Cache-Control")).toBe("private, no-store");
  expect(s.provider.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual(
    [
      [issuer + "/user", "GET"],
      [issuer + "/user/oauth/grants?client_id=" + s.scope.clientId, "DELETE"],
    ],
  );
  expect(s.provider.mock.calls.every(([, init]) => init?.redirect === "error")).toBe(
    true,
  );
  expect(s.provider.mock.calls[1][1]?.body).toBeUndefined();
  expect(s.provider.mock.calls[1][1]?.headers).toEqual({
    Authorization: "Bearer normal-session",
    apikey: "public-only",
  });
  expect(s.audit.mock.calls.map(([e]) => e.event)).toEqual([
    "FORMAL_SELF_GRANT_REVOCATION_REQUESTED",
    "FORMAL_SELF_GRANT_REVOCATION_RESPONSE",
  ]);
  expect(JSON.stringify(s.audit.mock.calls)).not.toContain("normal-session");
});
it("rejects missing Bearer, changed/duplicate client, actor override and body before any provider mutation", async () => {
  const s = setup();
  for (const req of [
    s.request("client_id=" + s.scope.clientId, undefined, null),
    s.request("client_id=" + randomUUID()),
    s.request("client_id=" + s.scope.clientId + "&client_id=" + s.scope.clientId),
    s.request("client_id=" + s.scope.clientId + "&accountId=" + s.scope.accountId),
    s.request("client_id=" + s.scope.clientId, "{}"),
  ]) {
    expect((await s.handler(req))!.status).toBeGreaterThanOrEqual(400);
  }
  expect(s.provider).not.toHaveBeenCalled();
  expect(await s.handler(new Request(issuer + "/user/oauth/grants"))).toBeNull();
});
it.each([
  { is_anonymous: true },
  { id: randomUUID() },
  { deleted_at: "2026-11-17T00:00:00Z" },
  { banned_until: "2099-01-01T00:00:00Z" },
])("rejects unqualified formal user %j without calling DELETE", async (patch) => {
  const s = setup(patch);
  expect((await s.handler(s.request()))!.status).toBe(403);
  expect(s.provider.mock.calls).toHaveLength(1);
  expect(s.audit).not.toHaveBeenCalled();
});
it("keeps provider rejection, missing audit and expiry fail-closed; no automatic retry", async () => {
  const s = setup();
  s.provider.mockResolvedValueOnce(new Response(null, { status: 401 }));
  expect((await s.handler(s.request()))!.status).toBe(401);
  s.provider.mockClear();
  s.audit.mockImplementation(() => {
    throw Error("AUDIT_IO");
  });
  expect((await s.handler(s.request()))!.status).toBe(503);
  expect(s.provider.mock.calls).toHaveLength(1);
  s.provider.mockClear();
  vi.spyOn(Date, "now").mockReturnValue(s.scope.expiresAt + 1);
  try {
    expect((await s.handler(s.request()))!.status).toBe(503);
    expect(s.provider).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
  }
});
it("returns formal Auth denial unchanged and does not fabricate successful revocation", async () => {
  const s = setup();
  s.provider.mockImplementation(async (_url, init) =>
    init?.method === "GET"
      ? Response.json({ id: s.scope.accountId, is_anonymous: false })
      : Response.json({ code: "not_allowed" }, { status: 403 }),
  );
  expect((await s.handler(s.request()))!.status).toBe(403);
  expect(s.provider.mock.calls).toHaveLength(2);
  expect(s.audit.mock.calls[1][0].status).toBe(403);
});
