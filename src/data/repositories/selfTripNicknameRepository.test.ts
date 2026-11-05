import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createSelfTripNicknameRepository } from "./selfTripNicknameRepository";
import { createSelfTripNicknameDraft } from "@/data/auth/selfTripNicknameDraft";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import {
  selfNicknameIntentDigest,
  type SelfNicknameCommand,
} from "@/domain/trip/tripPersonSelfNickname";
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
async function fixture() {
  let accountId = randomUUID();
  const originalAccount = accountId;
  const tripId = randomUUID(),
    personId = randomUUID(),
    account = async () => accountId;
  const scope = { ...(await captureAccountRequestContext(tripId, account)), personId };
  let observation = {
    contractVersion: 1,
    accountId,
    tripId,
    personId,
    nickname: "Before" as string | null,
    nicknameRevision: 7,
    observedAt: "2026-11-05T00:00:00Z",
  };
  const commands: SelfNicknameCommand[] = [],
    requests: { path: string; method: string; body: any }[] = [];
  let receipt: any;
  const wire = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname,
      method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ path, method, body });
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer unit-only-token",
    );
    if (method === "GET") return Response.json(observation);
    if (path.endsWith("/recover")) {
      expect(body).toEqual({ intentDigest: commands[0].intentDigest });
      return Response.json({ kind: "EXACT_RECEIPT", receipt });
    }
    expect(path.endsWith("/commands")).toBe(true);
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(body.operationId);
    commands.push(body);
    receipt = {
      receiptVersion: 1,
      receiptId: randomUUID(),
      actorAccountId: originalAccount,
      tripId,
      personId,
      operationId: body.operationId,
      intentDigest: body.intentDigest,
      expectedNicknameRevision: body.expectedNicknameRevision,
      desiredNickname: body.nickname,
      outcome: "APPLIED",
      prior: { nickname: observation.nickname, nicknameRevision: 7 },
      resulting: { nickname: body.nickname, nicknameRevision: 8 },
      acceptedAt: "2026-11-05T00:01:00Z",
    };
    observation = { ...observation, nickname: body.nickname, nicknameRevision: 8 };
    return Response.json({ receipt, idempotentReplay: false });
  });
  const token = vi.fn(async () => ({ userId: accountId, token: "unit-only-token" }));
  const repository = createSelfTripNicknameRepository(
    account,
    { baseUrl: "https://api.example.test", fetchImplementation: wire },
    token,
  );
  const loaded = await repository.read(scope);
  const draft = await createSelfTripNicknameDraft(
    account,
    scope,
    personId,
    loaded,
    repository,
  );
  return {
    scope,
    account,
    originalAccount,
    repository,
    draft,
    wire,
    token,
    commands,
    requests,
    receipt: () => receipt,
    switch(value = randomUUID()) {
      accountId = value;
      advanceAccountGeneration();
    },
  };
}
it.each(["旅人 Jo", null])(
  "uses normal scoped transport for %j then original-operation recovery without another command",
  async (nickname) => {
    const f = await fixture();
    await f.draft.edit({ nickname });
    const prepared = await f.draft.prepare(randomUUID());
    expect(prepared.kind).toBe("COMMAND");
    const result = await f.draft.submit();
    expect(result.receipt.desiredNickname).toBe(nickname);
    expect((await f.draft.read()).base.nicknameRevision).toBe(7);
    await f.draft.edit({ nickname: "Kept draft" });
    const recovery = await f.draft.recover();
    expect(recovery.kind).toBe("EXACT_RECEIPT");
    expect((await f.draft.read()).patch.nickname).toBe("Kept draft");
    await expect(f.draft.submit()).rejects.toThrow("ALREADY_ATTEMPTED");
    expect(f.commands).toHaveLength(1);
    const original = await f.draft.recoveryInput();
    const { intentDigest, ...intent } = original;
    expect(intentDigest).toBe(selfNicknameIntentDigest(intent, f.originalAccount));
    expect(f.requests[2].body).toEqual({ intentDigest: original.intentDigest });
    expect((await f.repository.read(f.scope)).nicknameRevision).toBe(8);
  },
);
it("omitted Keep has no token/wire operation and UNKNOWN never rewrites or interprets404 as absence", async () => {
  const f = await fixture();
  f.wire.mockClear();
  f.token.mockClear();
  expect(await f.draft.prepare("unused")).toEqual({ kind: "KEEP" });
  expect(f.wire).not.toHaveBeenCalled();
  expect(f.token).not.toHaveBeenCalled();
  await f.draft.edit({ nickname: null });
  await f.draft.prepare(randomUUID());
  f.wire.mockResolvedValueOnce(
    Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 }),
  );
  await expect(f.draft.submit()).rejects.toMatchObject({ status: 503 });
  await expect(f.draft.submit()).rejects.toThrow("ALREADY_ATTEMPTED");
  f.wire.mockResolvedValueOnce(Response.json({ kind: "ABSENT_UNCONFIRMED" }));
  expect(await f.draft.recover()).toEqual({ kind: "ABSENT_UNCONFIRMED" });
  f.wire.mockResolvedValueOnce(
    Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 }),
  );
  await expect(f.draft.recover()).rejects.toMatchObject({ status: 404 });
  expect(
    f.wire.mock.calls.filter(([url]) => String(url).endsWith("/commands")),
  ).toHaveLength(1);
});
it.each(["account", "trip", "person", "digest", "operation", "revision"])(
  "rejects wrong command %s before token or wire",
  async (field) => {
    const f = await fixture();
    await f.draft.edit({ nickname: "After" });
    await f.draft.prepare(randomUUID());
    const command = await f.draft.recoveryInput();
    f.wire.mockClear();
    f.token.mockClear();
    const ctx = { ...f.scope },
      changed = { ...command };
    if (field === "account") ctx.accountId = randomUUID();
    if (field === "trip") changed.tripId = randomUUID();
    if (field === "person") changed.personId = randomUUID();
    if (field === "digest") changed.intentDigest = "b".repeat(64);
    if (field === "operation") changed.operationId = randomUUID();
    if (field === "revision") changed.expectedNicknameRevision = 0;
    await expect(f.repository.execute(ctx, changed)).rejects.toThrow();
    await expect(f.repository.recover(ctx, changed)).rejects.toThrow();
    expect(f.token).not.toHaveBeenCalled();
    expect(f.wire).not.toHaveBeenCalled();
  },
);
it.each([
  "actorAccountId",
  "tripId",
  "personId",
  "operationId",
  "intentDigest",
  "expectedNicknameRevision",
  "desiredNickname",
  "resulting",
])("rejects wrong response %s in execute and recovery", async (field) => {
  const f = await fixture();
  await f.draft.edit({ nickname: "After" });
  await f.draft.prepare(randomUUID());
  const result = await f.draft.submit(),
    command = await f.draft.recoveryInput();
  const changed = {
    ...result.receipt,
    [field]:
      field === "expectedNicknameRevision"
        ? 0
        : field === "resulting"
          ? { nickname: "After", nicknameRevision: 7 }
          : randomUUID(),
  };
  f.wire.mockResolvedValueOnce(
    Response.json({ receipt: changed, idempotentReplay: true }),
  );
  await expect(f.repository.execute(f.scope, command)).rejects.toThrow();
  f.wire.mockResolvedValueOnce(
    Response.json({ kind: "EXACT_RECEIPT", receipt: changed }),
  );
  await expect(f.draft.recover()).rejects.toThrow();
});
it("rejects wrong read binding or missing actual revision rather than fabricating0", async () => {
  const f = await fixture();
  for (const body of [
    { accountId: randomUUID() },
    { personId: randomUUID() },
    { tripId: randomUUID() },
  ]) {
    f.wire.mockResolvedValueOnce(
      Response.json({
        contractVersion: 1,
        accountId: f.scope.accountId,
        tripId: f.scope.tripId,
        personId: f.scope.personId,
        nickname: null,
        nicknameRevision: 7,
        observedAt: "2026-11-05T00:00:00Z",
        ...body,
      }),
    );
    await expect(f.repository.read(f.scope)).rejects.toThrow();
  }
  f.wire.mockResolvedValueOnce(
    Response.json({
      contractVersion: 1,
      accountId: f.scope.accountId,
      tripId: f.scope.tripId,
      personId: f.scope.personId,
      nickname: null,
      observedAt: "2026-11-05T00:00:00Z",
    }),
  );
  await expect(f.repository.read(f.scope)).rejects.toThrow();
});
it("fences token-resolution switches and late recovery/read responses without touching another draft", async () => {
  const f = await fixture();
  await f.draft.edit({ nickname: "After" });
  await f.draft.prepare(randomUUID());
  await f.draft.submit();
  f.wire.mockImplementationOnce(async () => {
    f.switch();
    return Response.json({ kind: "EXACT_RECEIPT", receipt: f.receipt() });
  });
  await expect(f.draft.recover()).rejects.toThrow();
  f.wire.mockClear();
  await expect(f.draft.read()).rejects.toThrow("Account changed");
  await expect(f.repository.read(f.scope)).rejects.toThrow("Account changed");
  expect(f.wire).not.toHaveBeenCalled();
  const g = await fixture();
  await g.draft.edit({ nickname: "After" });
  await g.draft.prepare(randomUUID());
  g.wire.mockClear();
  g.token.mockImplementationOnce(async () => {
    g.switch();
    return { userId: g.originalAccount, token: "unit-only-token" };
  });
  await expect(g.draft.submit()).rejects.toThrow();
  expect(g.wire).not.toHaveBeenCalled();
});

it("copies the exact command before token resolution can mutate caller-owned input", async () => {
  const f = await fixture(); await f.draft.edit({ nickname: "After" }); await f.draft.prepare(randomUUID());
  const input = { ...await f.draft.recoveryInput() };
  f.token.mockImplementationOnce(async () => {
    input.nickname = null; input.expectedNicknameRevision = 0;
    return { userId: f.originalAccount, token: "unit-only-token" };
  });
  const result = await f.repository.execute(f.scope, input);
  expect(result.receipt.desiredNickname).toBe("After");
  expect(result.receipt.expectedNicknameRevision).toBe(7);
  expect(f.commands[0].nickname).toBe("After");
});
