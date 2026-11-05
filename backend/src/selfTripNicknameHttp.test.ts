import type { DevBackendGateway } from "./app";
import { SelfNicknamePgError } from "./tripPersonSelfNicknamePg";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { selfNicknameIntentDigest } from "@/domain/trip/tripPersonSelfNickname";
import {
  createSelfTripNicknameHttpHandler,
  decodeSelfTripNicknameRequest,
  encodeSelfTripNicknameResponse,
  isSelfTripNicknamePath,
} from "./selfTripNicknameHttp";
const user = { id: randomUUID(), accountClass: "NORMAL_ACCOUNT" as const };
const tripId = randomUUID(),
  personId = randomUUID(),
  operationId = randomUUID();
const path = `/v1/trips/${tripId}/persons/${personId}/self-nickname`;
const intent = {
  contractVersion: 1 as const,
  command: "SET_SELF_TRIP_NICKNAME" as const,
  operationId,
  tripId,
  personId,
  expectedNicknameRevision: 7,
  nickname: "旅人 Jo",
};
const command = { ...intent, intentDigest: selfNicknameIntentDigest(intent, user.id) };
const receipt = {
  receiptVersion: 1,
  receiptId: randomUUID(),
  actorAccountId: user.id,
  tripId,
  personId,
  operationId,
  intentDigest: command.intentDigest,
  expectedNicknameRevision: 7,
  desiredNickname: intent.nickname,
  outcome: "APPLIED",
  prior: { nickname: "Before", nicknameRevision: 7 },
  resulting: { nickname: intent.nickname, nicknameRevision: 8 },
  acceptedAt: "2026-11-05T00:00:00Z",
};
function request(suffix = "", body?: unknown, headers: Record<string, string> = {}) {
  return new Request("https://api.example.test" + path + suffix, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer unit-normal-token",
      "Idempotency-Key": operationId,
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
it("decodes only exact3routes and binds trusted normaluser rather than actor headers", async () => {
  expect(isSelfTripNicknamePath(path)).toBe(true);
  expect(isSelfTripNicknamePath(path + "/commands")).toBe(true);
  expect(isSelfTripNicknamePath(path + `/operations/${operationId}/recover`)).toBe(true);
  const input = await decodeSelfTripNicknameRequest(
    request("/commands", command, { "X-Account-ID": randomUUID() }),
    user,
  );
  expect(input.kind).toBe("EXECUTE");
  expect(input.context).toEqual({ accountId: user.id, tripId, personId });
  const response = encodeSelfTripNicknameResponse(input, {
    receipt,
    idempotentReplay: false,
  });
  expect(await response.json()).toEqual({ receipt, idempotentReplay: false });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Authorization");
});
it("parses ownread context/observation and does not inferrevision0", async () => {
  const input = await decodeSelfTripNicknameRequest(request(), user);
  const observation = {
    contractVersion: 1,
    accountId: user.id,
    tripId,
    personId,
    nickname: null,
    nicknameRevision: 7,
    observedAt: "2026-11-05T00:00:00Z",
  };
  expect(await encodeSelfTripNicknameResponse(input, observation).json()).toEqual(
    observation,
  );
  expect(() =>
    encodeSelfTripNicknameResponse(input, { ...observation, personId: randomUUID() }),
  ).toThrow();
  const { nicknameRevision: _, ...missing } = observation;
  expect(() => encodeSelfTripNicknameResponse(input, missing)).toThrow();
});
it("recovers only exact originaldigest/operation historicalreceipt and keeps absenceunconfirmed", async () => {
  const input = await decodeSelfTripNicknameRequest(
    request(`/operations/${operationId}/recover`, { intentDigest: command.intentDigest }),
    user,
  );
  expect(input.kind).toBe("RECOVER");
  expect(
    await encodeSelfTripNicknameResponse(input, {
      kind: "EXACT_RECEIPT",
      receipt,
    }).json(),
  ).toEqual({ kind: "EXACT_RECEIPT", receipt });
  expect(
    await encodeSelfTripNicknameResponse(input, { kind: "ABSENT_UNCONFIRMED" }).json(),
  ).toEqual({ kind: "ABSENT_UNCONFIRMED" });
  for (const raw of [
    null,
    { kind: "EXACT_RECEIPT", receipt: null },
    { kind: "ABSENT_UNCONFIRMED", idempotentReplay: false },
  ])
    expect(() => encodeSelfTripNicknameResponse(input, raw)).toThrow();
  expect(() =>
    encodeSelfTripNicknameResponse(input, {
      kind: "EXACT_RECEIPT",
      receipt: { ...receipt, actorAccountId: randomUUID() },
    }),
  ).toThrow();
  expect(() =>
    encodeSelfTripNicknameResponse(input, {
      kind: "EXACT_RECEIPT",
      receipt: { ...receipt, expectedNicknameRevision: 6 },
    }),
  ).toThrow();
});
it.each(["ANONYMOUS", "UNKNOWN", undefined] as const)(
  "rejects nonnormalAccount%s before parsing a command",
  async (accountClass) => {
    await expect(
      decodeSelfTripNicknameRequest(request("/commands", command), {
        id: user.id,
        accountClass,
      }),
    ).rejects.toMatchObject({ status: 403 });
  },
);
it("requires trustednormalBearer and rejects wrongmethod/query/malformedUUID/sibling suffix", async () => {
  await expect(
    decodeSelfTripNicknameRequest(
      request("/commands", command, { Authorization: "" }),
      user,
    ),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    decodeSelfTripNicknameRequest(request("/commands"), user),
  ).rejects.toMatchObject({ status: 405 });
  await expect(
    decodeSelfTripNicknameRequest(request("?accountId=" + randomUUID()), user),
  ).rejects.toMatchObject({ status: 400 });
  for (const tail of [
    "/commands/extra",
    `/operations/not-uuid/recover`,
    "/recovery",
    "/",
  ]) {
    expect(isSelfTripNicknamePath(path + tail)).toBe(false);
    await expect(
      decodeSelfTripNicknameRequest(request(tail), user),
    ).rejects.toMatchObject({ status: 404 });
  }
});
it.each([
  "tripId",
  "personId",
  "operationId",
  "expectedNicknameRevision",
  "intentDigest",
  "accountId",
])("rejects command binding/authority change %s", async (field) => {
  const changed = {
    ...command,
    [field]:
      field === "expectedNicknameRevision"
        ? 0
        : field === "intentDigest"
          ? "b".repeat(64)
          : randomUUID(),
  };
  await expect(
    decodeSelfTripNicknameRequest(request("/commands", changed), user),
  ).rejects.toMatchObject({ status: 400 });
});
it("requires exact Idempotency-Key and strict recoverybody with no newmutation/calleraccount", async () => {
  await expect(
    decodeSelfTripNicknameRequest(
      request("/commands", command, { "Idempotency-Key": randomUUID() }),
      user,
    ),
  ).rejects.toMatchObject({ status: 400 });
  for (const body of [
    {},
    command,
    { intentDigest: command.intentDigest, accountId: user.id },
    { intentDigest: command.intentDigest, nickname: null },
  ])
    await expect(
      decodeSelfTripNicknameRequest(
        request(`/operations/${operationId}/recover`, body),
        user,
      ),
    ).rejects.toMatchObject({ status: 400 });
});
it.each([
  "operationId",
  "intentDigest",
  "actorAccountId",
  "personId",
  "tripId",
  "expectedNicknameRevision",
  "desiredNickname",
])("rejects mismatched execute/recover receipt%s", async (field) => {
  const input = await decodeSelfTripNicknameRequest(request("/commands", command), user);
  const recover = await decodeSelfTripNicknameRequest(
    request(`/operations/${operationId}/recover`, { intentDigest: command.intentDigest }),
    user,
  );
  const bad = {
    ...receipt,
    [field]:
      field === "expectedNicknameRevision"
        ? 0
        : field === "intentDigest"
          ? "b".repeat(64)
          : randomUUID(),
  };
  expect(() =>
    encodeSelfTripNicknameResponse(input, { receipt: bad, idempotentReplay: true }),
  ).toThrow();
  expect(() =>
    encodeSelfTripNicknameResponse(recover, { kind: "EXACT_RECEIPT", receipt: bad }),
  ).toThrow();
});
it("bounds request size and preserves cancellation rather than producing an empty successful operation", async () => {
  await expect(
    decodeSelfTripNicknameRequest(
      request("/commands", { ...command, nickname: "X".repeat(20000) }),
      user,
    ),
  ).rejects.toMatchObject({ status: 413 });
  const abort = new AbortController();
  abort.abort();
  const cancelled = new Request(request("/commands", command), { signal: abort.signal });
  await expect(decodeSelfTripNicknameRequest(cancelled, user)).rejects.toMatchObject({
    status: 503,
  });
});

function handlerFixture() {
  const validateAccessToken = vi.fn(async (token: string) =>
    token === "bad" || token === "revoked"
      ? null
      : token === "guest"
        ? { id: user.id, accountClass: "ANONYMOUS" as const }
        : token === "unknown"
          ? { id: user.id, accountClass: "UNKNOWN" as const }
          : user,
  );
  const gateway = { validateAccessToken } as unknown as DevBackendGateway;
  const port = {
    read: vi
      .fn()
      .mockResolvedValue({
        contractVersion: 1,
        accountId: user.id,
        tripId,
        personId,
        nickname: null,
        nicknameRevision: 7,
        observedAt: "2026-11-05T00:00:00Z",
      }),
    execute: vi.fn().mockResolvedValue({ receipt, idempotentReplay: false }),
    recover: vi.fn().mockResolvedValue({ kind: "EXACT_RECEIPT", receipt }),
  };
  return {
    gateway,
    validateAccessToken,
    port,
    handle: createSelfTripNicknameHttpHandler(gateway, port),
  };
}
it("handler actually validates normalBearer then dispatches precisely read/execute/recover to Coretypedport", async () => {
  const f = handlerFixture();
  expect((await f.handle(request()))?.status).toBe(200);
  expect((await f.handle(request("/commands", command)))?.status).toBe(200);
  const recovery = await f.handle(
    request(`/operations/${operationId}/recover`, { intentDigest: command.intentDigest }),
  );
  expect(await recovery!.json()).toEqual({ kind: "EXACT_RECEIPT", receipt });
  expect(f.validateAccessToken).toHaveBeenCalledTimes(3);
  expect(f.validateAccessToken).toHaveBeenNthCalledWith(1, "unit-normal-token");
  const context = { accountId: user.id, tripId, personId };
  expect(f.port.read).toHaveBeenCalledExactlyOnceWith(context);
  expect(f.port.execute).toHaveBeenCalledExactlyOnceWith(context, command);
  expect(f.port.recover).toHaveBeenCalledExactlyOnceWith(context, operationId, {
    intentDigest: command.intentDigest,
  });
});
it.each([
  ["bad", 401],
  ["revoked", 401],
  ["guest", 403],
  ["unknown", 403],
] as const)("handler rejects %s Auth before Coreauthority", async (token, status) => {
  const f = handlerFixture();
  const result = await f.handle(
    request("/commands", command, { Authorization: `Bearer ${token}` }),
  );
  expect(result?.status).toBe(status);
  expect(f.validateAccessToken).toHaveBeenCalledExactlyOnceWith(token);
  expect(f.port.execute).not.toHaveBeenCalled();
  expect(f.port.read).not.toHaveBeenCalled();
});
it("requires actualBearer validation, remains defaultclosed and returns null for unrelatedpaths", async () => {
  const f = handlerFixture();
  expect(
    (await f.handle(request("/commands", command, { Authorization: "" })))?.status,
  ).toBe(401);
  expect(f.validateAccessToken).not.toHaveBeenCalled();
  expect((await createSelfTripNicknameHttpHandler(f.gateway)(request()))?.status).toBe(
    503,
  );
  expect(f.port.read).not.toHaveBeenCalled();
  expect(await f.handle(new Request("https://api.example.test/v1/unrelated"))).toBeNull();
});
it("never derives actor from headers/body and leaves current linkedself decisions to Core", async () => {
  const f = handlerFixture();
  await f.handle(request("", undefined, { "X-Account-ID": randomUUID() }));
  expect(f.port.read).toHaveBeenCalledWith({ accountId: user.id, tripId, personId });
  expect(
    (await f.handle(request("/commands", { ...command, actorAccountId: randomUUID() })))
      ?.status,
  ).toBe(400);
  expect(f.port.execute).not.toHaveBeenCalled();
  f.port.read.mockRejectedValueOnce(
    new SelfNicknamePgError(403, "SELF_NICKNAME_FORBIDDEN"),
  );
  const denied = await f.handle(request());
  expect(denied?.status).toBe(403);
});
it.each([
  [400, "SELF_NICKNAME_INVALID"],
  [403, "SELF_NICKNAME_FORBIDDEN"],
  [409, "SELF_NICKNAME_OPERATION_REUSED"],
  [503, "SELF_NICKNAME_RESULT_INVALID"],
  [503, "SELF_NICKNAME_UNAVAILABLE"],
] as const)("maps typedCore %s/%s without SQLdetails", async (status, code) => {
  const f = handlerFixture();
  f.port.execute.mockRejectedValueOnce(new SelfNicknamePgError(status, code));
  const response = await f.handle(request("/commands", command));
  expect(response?.status).toBe(status);
  expect(await response!.json()).toEqual({ error: { code, message: code } });
});
it("treats invalid produceroutput as serverunavailable, not badclient or missingreceipt", async () => {
  const f = handlerFixture();
  f.port.read.mockResolvedValueOnce(null);
  expect((await f.handle(request()))?.status).toBe(503);
  f.port.execute.mockResolvedValueOnce({
    receipt: { ...receipt, actorAccountId: randomUUID() },
    idempotentReplay: false,
  });
  const bad = await f.handle(request("/commands", command));
  expect(bad?.status).toBe(503);
  expect(await bad!.json()).toMatchObject({
    error: { code: "SELF_NICKNAME_RESULT_INVALID" },
  });
  f.port.recover.mockResolvedValueOnce(null);
  expect(
    (
      await f.handle(
        request(`/operations/${operationId}/recover`, {
          intentDigest: command.intentDigest,
        }),
      )
    )?.status,
  ).toBe(503);
});
it("unknowncommit failure never triggers a replacementwrite/read and recovery absence staysunconfirmed", async () => {
  const f = handlerFixture();
  f.port.execute.mockRejectedValueOnce(
    new SelfNicknamePgError(503, "SELF_NICKNAME_UNAVAILABLE"),
  );
  expect((await f.handle(request("/commands", command)))?.status).toBe(503);
  expect(f.port.execute).toHaveBeenCalledOnce();
  expect(f.port.read).not.toHaveBeenCalled();
  expect(f.port.recover).not.toHaveBeenCalled();
  f.port.recover.mockResolvedValueOnce({ kind: "ABSENT_UNCONFIRMED" });
  const result = await f.handle(
    request(`/operations/${operationId}/recover`, { intentDigest: command.intentDigest }),
  );
  expect(await result!.json()).toEqual({ kind: "ABSENT_UNCONFIRMED" });
  expect(f.port.execute).toHaveBeenCalledOnce();
});
it("cancellation after dispatch is unavailable/UNKNOWN and never invokes a fallbackoperation", async () => {
  const f = handlerFixture(),
    abort = new AbortController();
  f.port.execute.mockImplementationOnce(async () => {
    abort.abort();
    return { receipt, idempotentReplay: false };
  });
  const response = await f.handle(
    new Request(request("/commands", command), { signal: abort.signal }),
  );
  expect(response?.status).toBe(503);
  expect(f.port.execute).toHaveBeenCalledOnce();
  expect(f.port.recover).not.toHaveBeenCalled();
  expect(f.port.read).not.toHaveBeenCalled();
});
it("does not leak unknownSQL/auth infrastructure errors or trust forged typedstatus", async () => {
  const f = handlerFixture();
  for (const error of [
    Object.assign(Error("privateSQLsecret"), { code: "42501", status: 403 }),
    new SelfNicknamePgError(400, "INTERNAL_SQL_DETAIL"),
  ]) {
    f.port.execute.mockRejectedValueOnce(error);
    const result = await f.handle(request("/commands", command));
    expect(result?.status).toBe(503);
    expect(await result!.text()).not.toMatch(
      /privateSQLsecret|42501|INTERNAL_SQL_DETAIL/,
    );
  }
  f.validateAccessToken.mockRejectedValueOnce(Error("privateAuthdetail"));
  const result = await f.handle(request());
  expect(result?.status).toBe(503);
  expect(await result!.text()).not.toContain("privateAuthdetail");
});
