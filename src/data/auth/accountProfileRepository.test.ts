import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountScope } from "./accountRequestContext";
import { advanceAccountGeneration } from "./accountGeneration";
import { createAccountProfileRepository } from "./accountProfileRepository";
vi.mock("./sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));

async function fixture() {
  let accountId = randomUUID();
  const original = accountId;
  const scope = await captureAccountScope(async () => accountId);
  const result = {
    schemaId: "otr.auth.account-profile-bootstrap/1",
    accountId,
    ready: true,
  };
  const token = vi.fn(async () => ({ userId: accountId, token: "fixture-session" }));
  const wire = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe("https://api.example.test/v1/account/profile/bootstrap");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer fixture-session" });
    expect(init?.body).toBe("{}");
    return Response.json(result);
  });
  const repository = createAccountProfileRepository(
    async () => accountId,
    { baseUrl: "https://api.example.test", fetchImplementation: wire },
    token,
  );
  return {
    original,
    scope,
    result,
    wire,
    token,
    repository,
    switch() {
      accountId = randomUUID();
      advanceAccountGeneration();
    },
  };
}
it("uses the existing authenticated client and normal scoped token with no profile fields in request", async () => {
  const f = await fixture();
  expect(await f.repository.ensure(f.scope)).toEqual(f.result);
  expect(f.token).toHaveBeenCalledWith(
    expect.objectContaining({ expectedUserId: f.original }),
  );
  expect(f.wire).toHaveBeenCalledOnce();
});
it("rejects an old account before token or HTTP work", async () => {
  const f = await fixture();
  f.switch();
  await expect(f.repository.ensure(f.scope)).rejects.toThrow();
  expect(f.token).not.toHaveBeenCalled();
  expect(f.wire).not.toHaveBeenCalled();
});
it("rejects a switch while resolving token without dispatching the old operation", async () => {
  const f = await fixture();
  f.token.mockImplementationOnce(async () => {
    f.switch();
    return { userId: f.original, token: "fixture-session" };
  });
  await expect(f.repository.ensure(f.scope)).rejects.toThrow();
  expect(f.wire).not.toHaveBeenCalled();
});
it("refuses a successful old response after account switch", async () => {
  const f = await fixture();
  f.wire.mockImplementationOnce(async () => {
    f.switch();
    return Response.json(f.result);
  });
  await expect(f.repository.ensure(f.scope)).rejects.toThrow();
});
it("refuses another account's response and propagates failure without local activation", async () => {
  const f = await fixture();
  f.result.accountId = randomUUID();
  await expect(f.repository.ensure(f.scope)).rejects.toThrow(
    "ACCOUNT_PROFILE_IDENTITY_REQUIRED",
  );
  f.wire.mockImplementationOnce(async () =>
    Response.json({ error: { code: "ACCOUNT_PROFILE_UNAVAILABLE" } }, { status: 503 }),
  );
  await expect(f.repository.ensure(f.scope)).rejects.toMatchObject({
    status: 503,
    kind: "http",
  });
});
