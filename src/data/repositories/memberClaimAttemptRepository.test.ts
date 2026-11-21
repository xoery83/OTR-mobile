import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import type { MemberClaimCommand } from "@/data/api/memberClaimContracts";
import { createMemberClaimRepository } from "./memberClaimRepository";
import { createMemberClaimAttemptRepository } from "./memberClaimAttemptRepository";

async function fixture() {
  let currentAccount = randomUUID();
  const account = async () => currentAccount;
  const context = await captureAccountRequestContext(randomUUID(), account);
  const original: MemberClaimCommand = {
    kind: "CLAIM_PERSON",
    operationId: randomUUID(),
    tripId: context.tripId,
    personId: randomUUID(),
    inviteId: randomUUID(),
    explicitConsent: true,
  };
  const result = {
    status: "LINKED" as const,
    personId: original.personId,
    inviteId: original.inviteId,
    currentAccess: "READ" as const,
  };
  const rows = new Map<string, string>();
  const storage = {
    getItem: vi.fn(async (key: string) => rows.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      rows.set(key, value);
    }),
    deleteItem: vi.fn(async (key: string) => {
      rows.delete(key);
    }),
  };
  const wire = vi.fn<typeof fetch>(async () => Response.json(result));
  const authority = createMemberClaimRepository(
    account,
    { baseUrl: "https://api.example.test", fetchImplementation: wire },
    async () => ({ userId: currentAccount, token: "synthetic-only" }),
  );
  const reopen = () => createMemberClaimAttemptRepository(storage, account, authority);
  return {
    account,
    context,
    original,
    result,
    rows,
    storage,
    wire,
    reopen,
    switch() {
      currentAccount = randomUUID();
      advanceAccountGeneration();
    },
  };
}

it("records before the normal POST and sends the same original only once", async () => {
  const f = await fixture(),
    repo = f.reopen();
  f.wire.mockImplementationOnce(async () => {
    expect((await repo.read(f.context))?.original).toEqual(f.original);
    return Response.json(f.result);
  });
  await expect(repo.executeOnce(f.context, f.original)).resolves.toEqual(f.result);
  await expect(repo.executeOnce(f.context, f.original)).rejects.toThrow(
    "RECOVER_ORIGINAL",
  );
  expect(f.wire).toHaveBeenCalledOnce();
});

it("reopens a lost response and performs only original recovery; absence is not permission to resubmit", async () => {
  const f = await fixture();
  f.wire.mockRejectedValueOnce(Error("lost response"));
  await expect(f.reopen().executeOnce(f.context, f.original)).rejects.toMatchObject({
    kind: "network",
  });
  const reopened = f.reopen();
  f.wire.mockResolvedValueOnce(
    Response.json({ status: "ABSENT_UNCONFIRMED" }, { status: 202 }),
  );
  expect(await reopened.recover(f.context)).toEqual({ status: "ABSENT_UNCONFIRMED" });
  await expect(reopened.clearResolved(f.context, f.original.operationId)).rejects.toThrow(
    "UNRESOLVED",
  );
  await expect(
    reopened.executeOnce(f.context, { ...f.original, operationId: randomUUID() }),
  ).rejects.toThrow("RECOVER_ORIGINAL");
  expect(f.wire.mock.calls.map(([url]) => String(url))).toEqual([
    `https://api.example.test/v2/trips/${f.context.tripId}/member-claim-operations`,
    `https://api.example.test/v2/trips/${f.context.tripId}/member-claim-operations/recovery`,
  ]);
  expect(f.wire.mock.calls[1][1]?.body).toBe(JSON.stringify(f.original));
});

it("concurrent duplicate clicks produce one POST across separate repository instances", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    f.reopen().executeOnce(f.context, f.original),
    f.reopen().executeOnce(f.context, f.original),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(f.wire).toHaveBeenCalledOnce();
});

it("storage failure before dispatch prevents a request", async () => {
  const f = await fixture();
  f.storage.setItem.mockRejectedValueOnce(Error("storage unavailable"));
  await expect(f.reopen().executeOnce(f.context, f.original)).rejects.toThrow(
    "storage unavailable",
  );
  expect(f.wire).not.toHaveBeenCalled();
});

it("account switch rejects old recovery and hides the old Account's record", async () => {
  const f = await fixture();
  await f.reopen().executeOnce(f.context, f.original);
  f.switch();
  await expect(f.reopen().recover(f.context)).rejects.toThrow();
  const next = await captureAccountRequestContext(f.context.tripId, f.account);
  expect(await f.reopen().read(next)).toBeNull();
  expect(f.rows.size).toBe(1);
  expect(f.wire).toHaveBeenCalledOnce();
});

it("account switch during the response retains the original without caching success", async () => {
  const f = await fixture();
  f.wire.mockImplementationOnce(async () => {
    f.switch();
    return Response.json(f.result);
  });
  await expect(f.reopen().executeOnce(f.context, f.original)).rejects.toThrow();
  expect(JSON.parse([...f.rows.values()][0]).outcome).toBeNull();
});

it("a resolved historic LINKED receipt with NONE access is not a regrant; only exact resolved operation can clear", async () => {
  const f = await fixture(),
    repo = f.reopen();
  await repo.executeOnce(f.context, f.original);
  f.wire.mockResolvedValueOnce(Response.json({ ...f.result, currentAccess: "NONE" }));
  expect(await repo.recover(f.context)).toMatchObject({
    status: "LINKED",
    currentAccess: "NONE",
  });
  await expect(repo.clearResolved(f.context, randomUUID())).rejects.toThrow(
    "OPERATION_MISMATCH",
  );
  await repo.clearResolved(f.context, f.original.operationId);
  expect(await repo.read(f.context)).toBeNull();
});

it("does not guess scope from a tampered retained record", async () => {
  const f = await fixture(),
    repo = f.reopen();
  await repo.executeOnce(f.context, f.original);
  const [key, value] = [...f.rows.entries()][0];
  f.rows.set(key, JSON.stringify({ ...JSON.parse(value), accountId: randomUUID() }));
  await expect(repo.recover(f.context)).rejects.toThrow("CHECKPOINT_SCOPE_MISMATCH");
  expect(f.wire).toHaveBeenCalledOnce();
});

it("wrong Trip is rejected before storage or network", async () => {
  const f = await fixture();
  await expect(
    f.reopen().executeOnce(f.context, { ...f.original, tripId: randomUUID() }),
  ).rejects.toThrow("SCOPE_MISMATCH");
  expect(f.storage.setItem).not.toHaveBeenCalled();
  expect(f.wire).not.toHaveBeenCalled();
});

it.each([403, 409, 503])(
  "retains original after HTTP %s and permits recovery only",
  async (status) => {
    const f = await fixture();
    f.wire.mockResolvedValueOnce(
      Response.json({ error: { code: "MEMBER_CLAIM_CLOSED" } }, { status }),
    );
    await expect(f.reopen().executeOnce(f.context, f.original)).rejects.toMatchObject({
      status,
    });
    await expect(f.reopen().executeOnce(f.context, f.original)).rejects.toThrow(
      "RECOVER_ORIGINAL",
    );
    expect((await f.reopen().read(f.context))?.original).toEqual(f.original);
    expect(f.wire).toHaveBeenCalledOnce();
  },
);

it("retains the captured scope when caller mutates its object during checkpoint storage", async () => {
  const f = await fixture();
  const captured = { ...f.context };
  const mutable = { ...f.context };
  f.storage.setItem.mockImplementationOnce(async (key, value) => {
    f.rows.set(key, value);
    mutable.tripId = randomUUID();
  });
  await f.reopen().executeOnce(mutable, f.original);
  expect(f.wire.mock.calls[0][0]).toBe(
    `https://api.example.test/v2/trips/${captured.tripId}/member-claim-operations`,
  );
});

it.each([
  {
    status: 503,
    body: { error: { code: "MEMBER_CLAIM_CLOSED" } },
    reason: "CLOSED_BEFORE_AUTHORITY",
  },
  { status: 403, body: { status: "DENIED" }, reason: "DENIED_WITHOUT_MUTATION" },
])(
  "releases a precisely rejected attempt while retaining its original ID ($reason)",
  async ({ status, body, reason }) => {
    const f = await fixture(),
      repo = f.reopen();
    f.wire.mockResolvedValueOnce(Response.json(body, { status }));
    await expect(repo.executeOnce(f.context, f.original)).rejects.toMatchObject({
      status,
    });
    expect((await repo.read(f.context))?.rejection).toBe(reason);
    await repo.clearResolved(f.context, f.original.operationId);
    expect(await repo.read(f.context)).toBeNull();
    await expect(f.reopen().executeOnce(f.context, f.original)).rejects.toThrow(
      "ALREADY_RESOLVED",
    );
    const next = { ...f.original, operationId: randomUUID() };
    await expect(f.reopen().executeOnce(f.context, next)).resolves.toEqual(f.result);
    expect(f.wire).toHaveBeenCalledTimes(2);
    expect(
      [...f.rows.values()].some(
        (v) => JSON.parse(v).original.operationId === f.original.operationId,
      ),
    ).toBe(true);
  },
);

it.each([
  { status: 503, body: { error: { code: "MEMBER_CLAIM_UNAVAILABLE" } } },
  { status: 403, body: { error: { code: "DENIED" } } },
  { status: 409, body: { status: "CONFLICT" } },
])(
  "generic HTTP refusal cannot release an uncertain attempt ($status)",
  async ({ status, body }) => {
    const f = await fixture(),
      repo = f.reopen();
    f.wire.mockResolvedValueOnce(Response.json(body, { status }));
    await expect(repo.executeOnce(f.context, f.original)).rejects.toThrow();
    expect((await repo.read(f.context))?.rejection).toBeNull();
    await expect(repo.clearResolved(f.context, f.original.operationId)).rejects.toThrow(
      "UNRESOLVED",
    );
  },
);

it("CLOSED on recovery never resolves an earlier lost response", async () => {
  const f = await fixture(),
    repo = f.reopen();
  f.wire.mockRejectedValueOnce(Error("response lost"));
  await expect(repo.executeOnce(f.context, f.original)).rejects.toThrow();
  f.wire.mockResolvedValueOnce(
    Response.json({ error: { code: "MEMBER_CLAIM_CLOSED" } }, { status: 503 }),
  );
  await expect(repo.recover(f.context)).rejects.toThrow();
  expect((await repo.read(f.context))?.rejection).toBeNull();
  await expect(repo.clearResolved(f.context, f.original.operationId)).rejects.toThrow(
    "UNRESOLVED",
  );
});

it("history write failure leaves the active original intact", async () => {
  const f = await fixture(),
    repo = f.reopen();
  await repo.executeOnce(f.context, f.original);
  f.storage.setItem.mockRejectedValueOnce(Error("history unavailable"));
  await expect(repo.clearResolved(f.context, f.original.operationId)).rejects.toThrow(
    "history unavailable",
  );
  expect((await repo.read(f.context))?.original).toEqual(f.original);
  expect(f.storage.deleteItem).not.toHaveBeenCalled();
});

it("recovers after archive succeeded and deletion failed without treating current access as immutable", async () => {
  const f = await fixture(),
    repo = f.reopen();
  await repo.executeOnce(f.context, f.original);
  f.storage.deleteItem.mockRejectedValueOnce(Error("delete unavailable"));
  await expect(repo.clearResolved(f.context, f.original.operationId)).rejects.toThrow(
    "delete unavailable",
  );
  expect(f.rows.size).toBe(2);
  const reopened = f.reopen();
  f.wire.mockResolvedValueOnce(Response.json({ ...f.result, currentAccess: "NONE" }));
  expect(await reopened.recover(f.context)).toMatchObject({ currentAccess: "NONE" });
  await reopened.clearResolved(f.context, f.original.operationId);
  expect(await reopened.read(f.context)).toBeNull();
  await expect(reopened.executeOnce(f.context, f.original)).rejects.toThrow(
    "ALREADY_RESOLVED",
  );
});
