import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { selfNicknameIntentDigest } from "@/domain/trip/tripPersonSelfNickname";
import {
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
