import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { createMemberClaimRepository } from "./memberClaimRepository";
import type { MemberClaimCommand } from "@/data/api/memberClaimContracts";

async function fixture() {
  let accountId: string = randomUUID();
  const account = async () => accountId;
  const context = await captureAccountRequestContext(randomUUID(), account);
  const command: MemberClaimCommand = {
    kind: "CLAIM_PERSON",
    operationId: randomUUID(),
    tripId: context.tripId,
    personId: randomUUID(),
    inviteId: randomUUID(),
    explicitConsent: true,
  };
  const result = {
    status: "LINKED",
    personId: command.personId,
    inviteId: command.inviteId,
    currentAccess: "READ",
  };
  const token = vi.fn(async () => ({ userId: accountId, token: "fixture-only" }));
  const wire = vi.fn<typeof fetch>(async () => Response.json(result));
  const repo = createMemberClaimRepository(
    account,
    { baseUrl: "https://api.example.test", fetchImplementation: wire },
    token,
  );
  return {
    context,
    command,
    result,
    token,
    wire,
    repo,
    switch() {
      accountId = randomUUID();
      advanceAccountGeneration();
    },
  };
}

it("uses the existing normal token, exact Trip command and operation header with no actor body", async () => {
  const f = await fixture();
  expect(await f.repo.execute(f.context, f.command)).toEqual(f.result);
  expect(f.token).toHaveBeenCalledWith(
    expect.objectContaining({ expectedUserId: f.context.accountId }),
  );
  expect(f.wire).toHaveBeenCalledExactlyOnceWith(
    `https://api.example.test/v2/trips/${f.context.tripId}/member-claim-operations`,
    expect.objectContaining({
      method: "POST",
      redirect: "error",
      body: JSON.stringify(f.command),
      headers: expect.objectContaining({
        Authorization: "Bearer fixture-only",
        "Idempotency-Key": f.command.operationId,
      }),
    }),
  );
});

it("copies the original command before awaiting token resolution", async () => {
  const f = await fixture(),
    original = { ...f.command };
  f.token.mockImplementationOnce(async () => {
    f.command.operationId = randomUUID();
    return { userId: f.context.accountId, token: "fixture-only" };
  });
  await f.repo.execute(f.context, f.command);
  expect(f.wire.mock.calls[0][1]?.body).toBe(JSON.stringify(original));
});

it("rejects wrong Trip and caller identity fields before any network work", async () => {
  const f = await fixture();
  await expect(
    f.repo.execute(f.context, { ...f.command, tripId: randomUUID() }),
  ).rejects.toThrow();
  await expect(
    f.repo.execute(f.context, {
      ...f.command,
      actorAccountId: f.context.accountId,
    } as MemberClaimCommand),
  ).rejects.toThrow();
  expect(f.token).not.toHaveBeenCalled();
  expect(f.wire).not.toHaveBeenCalled();
});

it.each(["before", "token", "response"] as const)(
  "fences Account switch at %s",
  async (stage) => {
    const f = await fixture();
    if (stage === "before") f.switch();
    if (stage === "token")
      f.token.mockImplementationOnce(async () => {
        f.switch();
        return { userId: f.context.accountId, token: "fixture-only" };
      });
    if (stage === "response")
      f.wire.mockImplementationOnce(async () => {
        f.switch();
        return Response.json(f.result);
      });
    await expect(f.repo.execute(f.context, f.command)).rejects.toThrow();
    expect(f.wire).toHaveBeenCalledTimes(stage === "response" ? 1 : 0);
  },
);

it.each(["personId", "inviteId", "status"])(
  "rejects mismatched %s in an otherwise successful response",
  async (field) => {
    const f = await fixture();
    f.wire.mockResolvedValueOnce(
      Response.json({
        ...f.result,
        [field]: field === "status" ? "ISSUED" : randomUUID(),
      }),
    );
    await expect(f.repo.execute(f.context, f.command)).rejects.toThrow(
      "MEMBER_CLAIM_RESULT_MISMATCH",
    );
  },
);

it("recovers only the original command; absence and historical success never regrant", async () => {
  const f = await fixture();
  f.wire.mockResolvedValueOnce(
    Response.json({ status: "ABSENT_UNCONFIRMED" }, { status: 202 }),
  );
  expect(await f.repo.recover(f.context, f.command)).toEqual({
    status: "ABSENT_UNCONFIRMED",
  });
  f.wire.mockResolvedValueOnce(Response.json({ ...f.result, currentAccess: "NONE" }));
  expect(await f.repo.recover(f.context, f.command)).toEqual({
    ...f.result,
    currentAccess: "NONE",
  });
  expect(
    f.wire.mock.calls.every(
      ([url, init]) =>
        String(url).endsWith("/recovery") && init?.body === JSON.stringify(f.command),
    ),
  ).toBe(true);
});

it.each([403, 409, 503])(
  "propagates HTTP %s without blind retry or success",
  async (status) => {
    const f = await fixture();
    f.wire.mockResolvedValueOnce(
      Response.json({ error: { code: "MEMBER_CLAIM_CLOSED" } }, { status }),
    );
    await expect(f.repo.execute(f.context, f.command)).rejects.toMatchObject({
      kind: "http",
      status,
    });
    expect(f.wire).toHaveBeenCalledOnce();
  },
);

it("keeps a lost response uncertain and does not automatically replay", async () => {
  const f = await fixture();
  f.wire.mockRejectedValueOnce(Error("fixture reply lost"));
  await expect(f.repo.execute(f.context, f.command)).rejects.toMatchObject({
    kind: "network",
  });
  expect(f.wire).toHaveBeenCalledOnce();
});

it("retains the identical command and operation through the existing single 401 token refresh", async () => {
  const f = await fixture();
  f.wire.mockResolvedValueOnce(
    Response.json({ error: { code: "AUTH_REQUIRED" } }, { status: 401 }),
  );
  await expect(f.repo.execute(f.context, f.command)).resolves.toEqual(f.result);
  expect(f.token).toHaveBeenCalledTimes(2);
  expect(f.token.mock.calls[1]).toEqual([
    {
      expectedUserId: f.context.accountId,
      forceRefresh: true,
      rejectedToken: "fixture-only",
    },
  ]);
  expect(f.wire.mock.calls.map(([, init]) => init?.body)).toEqual([
    JSON.stringify(f.command),
    JSON.stringify(f.command),
  ]);
});
