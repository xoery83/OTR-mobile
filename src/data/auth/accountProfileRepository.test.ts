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

async function privateFixture() {
  const f = await fixture();
  const mutation = {
    operationId: randomUUID(),
    expectedRevision: 0,
    changes: {
      displayName: "",
      travelDocumentName: { mode: "UNSPLIT" as const, fullName: "林 e\u0301" },
    },
  };
  const receipt = {
    schemaId: "otr.auth.private-profile-receipt/1",
    accountId: f.original,
    operationId: mutation.operationId,
    revision: 1,
    recordedAt: "2026-10-31T00:00:00Z",
  };
  const snapshot = {
    schemaId: "otr.auth.private-profile/1",
    accountId: f.original,
    revision: 1,
    fields: mutation.changes,
  };
  f.wire.mockImplementation(async (_target, init) => {
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer fixture-session" });
    return Response.json(init?.method === "POST" ? receipt : snapshot);
  });
  return { ...f, mutation, receipt, snapshot };
}

it("reads optional private values through the existing Account repository without public bootstrap or registration", async () => {
  const f = await privateFixture();
  expect(await f.repository.readPrivate(f.scope)).toEqual(f.snapshot);
  expect(f.wire).toHaveBeenCalledOnce();
  expect(String(f.wire.mock.calls[0][0])).toBe(
    "https://api.example.test/v1/account/private-profile",
  );
});

it("reads two near-limit name patches merged into one bounded profile snapshot", async () => {
  const f = await privateFixture();
  const display = { displayName: "" };
  const document = { travelDocumentName: { mode: "UNSPLIT", fullName: "" } };
  display.displayName = "a".repeat(16376 - JSON.stringify(display).length);
  document.travelDocumentName.fullName = "b".repeat(
    16376 - JSON.stringify(document).length,
  );
  expect(Buffer.byteLength(JSON.stringify(display))).toBeLessThan(16384);
  expect(Buffer.byteLength(JSON.stringify(document))).toBeLessThan(16384);
  const snapshot = { ...f.snapshot, fields: { ...display, ...document } };
  expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeGreaterThan(32768);
  f.wire.mockResolvedValueOnce(Response.json(snapshot));
  expect(await f.repository.readPrivate(f.scope)).toEqual(snapshot);
});

it("rejects a truly oversized private snapshot without returning any profile", async () => {
  const f = await privateFixture();
  f.wire.mockResolvedValueOnce(
    Response.json({ ...f.snapshot, fields: { displayName: "a".repeat(65536) } }),
  );
  await expect(f.repository.readPrivate(f.scope)).rejects.toMatchObject({
    kind: "validation",
  });
  expect(f.wire).toHaveBeenCalledOnce();
});

it("freezes the private write before token resolution and uses its stable operation and expected revision", async () => {
  const f = await privateFixture();
  f.token.mockImplementationOnce(async () => {
    f.mutation.changes.travelDocumentName.fullName = "changed after dispatch";
    return { userId: f.original, token: "fixture-session" };
  });
  expect(await f.repository.savePrivate(f.scope, f.mutation)).toEqual(f.receipt);
  const init = f.wire.mock.calls[0][1]!;
  expect(init.headers).toMatchObject({ "Idempotency-Key": f.mutation.operationId });
  expect(JSON.parse(String(init.body)).changes.travelDocumentName.fullName).toBe(
    "林 e\u0301",
  );
  expect(JSON.parse(String(init.body)).expectedRevision).toBe(0);
});

it("reads the exact private operation receipt without resubmitting a write", async () => {
  const f = await privateFixture();
  f.wire.mockResolvedValueOnce(Response.json(f.receipt));
  expect(await f.repository.privateReceipt(f.scope, f.mutation.operationId)).toEqual(
    f.receipt,
  );
  expect(
    String(f.wire.mock.calls[0][0]).endsWith("/operations/" + f.mutation.operationId),
  ).toBe(true);
  expect(f.wire.mock.calls[0][1]?.method).toBe("GET");
});

it("rejects malformed fields or receipt operation before token and wire work", async () => {
  const f = await privateFixture();
  await expect(
    f.repository.savePrivate(f.scope, {
      ...f.mutation,
      changes: { accountId: randomUUID() },
    } as any),
  ).rejects.toThrow();
  await expect(
    f.repository.privateReceipt(f.scope, "not-an-operation"),
  ).rejects.toThrow();
  expect(f.token).not.toHaveBeenCalled();
  expect(f.wire).not.toHaveBeenCalled();
});

it("rejects stale Account requests and an Account switch during private response read", async () => {
  const f = await privateFixture();
  f.wire.mockImplementationOnce(async () => {
    f.switch();
    return Response.json(f.snapshot);
  });
  await expect(f.repository.readPrivate(f.scope)).rejects.toThrow();
  f.wire.mockClear();
  f.token.mockClear();
  await expect(f.repository.savePrivate(f.scope, f.mutation)).rejects.toThrow();
  await expect(
    f.repository.privateReceipt(f.scope, f.mutation.operationId),
  ).rejects.toThrow();
  expect(f.token).not.toHaveBeenCalled();
  expect(f.wire).not.toHaveBeenCalled();
});

it("rejects foreign snapshots and mismatched operation/revision receipts", async () => {
  const f = await privateFixture();
  f.wire.mockResolvedValueOnce(Response.json({ ...f.snapshot, accountId: randomUUID() }));
  await expect(f.repository.readPrivate(f.scope)).rejects.toThrow(
    "ACCOUNT_PROFILE_IDENTITY_REQUIRED",
  );
  f.wire.mockResolvedValueOnce(Response.json({ ...f.receipt, revision: 2 }));
  await expect(f.repository.savePrivate(f.scope, f.mutation)).rejects.toThrow(
    "ACCOUNT_PROFILE_RECEIPT_REQUIRED",
  );
  f.wire.mockResolvedValueOnce(
    Response.json({ ...f.receipt, operationId: randomUUID() }),
  );
  await expect(
    f.repository.privateReceipt(f.scope, f.mutation.operationId),
  ).rejects.toThrow("ACCOUNT_PROFILE_RECEIPT_REQUIRED");
});

it("preserves missing/closed/conflict responses as failures without fallback, resend or private activation", async () => {
  const f = await privateFixture();
  for (const status of [404, 503, 409]) {
    f.wire.mockResolvedValueOnce(
      Response.json({ error: { code: "PROFILE_CLOSED" } }, { status }),
    );
    await expect(
      f.repository.privateReceipt(f.scope, f.mutation.operationId),
    ).rejects.toMatchObject({ status });
  }
  expect(f.wire).toHaveBeenCalledTimes(3);
  expect(f.wire.mock.calls.every((call) => call[1]?.method === "GET")).toBe(true);
});
