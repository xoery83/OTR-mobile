import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { DevBackendGateway } from "./app";
import { SelfNicknamePgError } from "./tripPersonSelfNicknamePg";
import { selfNicknameIntentDigest } from "@/domain/trip/tripPersonSelfNickname";
import { selfTripNicknameMountCandidate } from "./__fixtures__/selfTripNicknameMountCandidate";
let candidate: Awaited<ReturnType<typeof selfTripNicknameMountCandidate>>;
beforeAll(async () => {
  candidate = await selfTripNicknameMountCandidate();
});
afterAll(() => candidate?.cleanup());
const accountId = randomUUID(),
  tripId = randomUUID(),
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
  nickname: "Jo",
};
const command = { ...intent, intentDigest: selfNicknameIntentDigest(intent, accountId) };
const receipt = {
  receiptVersion: 1,
  receiptId: randomUUID(),
  actorAccountId: accountId,
  tripId,
  personId,
  operationId,
  intentDigest: command.intentDigest,
  expectedNicknameRevision: 7,
  desiredNickname: "Jo",
  outcome: "APPLIED",
  prior: { nickname: null, nicknameRevision: 7 },
  resulting: { nickname: "Jo", nicknameRevision: 8 },
  acceptedAt: "2026-11-05T00:00:00Z",
};
const request = (suffix = "", body?: unknown, token = "normal") =>
  new Request("https://api.example.test" + path + suffix, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Idempotency-Key": operationId },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
function setup() {
  const validateAccessToken = vi.fn(async (token: string) =>
    token === "bad"
      ? null
      : {
          id: accountId,
          accountClass:
            token === "guest" ? ("ANONYMOUS" as const) : ("NORMAL_ACCOUNT" as const),
        },
  );
  const gateway = { validateAccessToken } as unknown as DevBackendGateway;
  const port = {
    read: vi
      .fn()
      .mockResolvedValue({
        contractVersion: 1,
        accountId,
        tripId,
        personId,
        nickname: null,
        nicknameRevision: 7,
        observedAt: "2026-11-05T00:00:00Z",
      }),
    execute: vi.fn().mockResolvedValue({ receipt, idempotentReplay: false }),
    recover: vi.fn().mockResolvedValue({ kind: "EXACT_RECEIPT", receipt }),
  };
  return { gateway, validateAccessToken, port, log: vi.fn() };
}
async function stableBody(response: Response) {
  const body = await response.json();
  expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
  const { requestId: _, ...error } = body.error;
  return { ...body, error };
}
it("applies only the pinned patch on a temporary actual-main app source", () => {
  expect(candidate.metadata.sourceMain).toBe("a857481b446fbad8ec8eff34fea174f3f966de43");
  expect(candidate.metadata.sharedFileWritten).toBe(false);
  expect(candidate.metadata.newSourceLines).toBe(9);
});
it("undefinedport leaves all3routes identical to main and never authenticates or derivesport from coreConnection", async () => {
  const f = setup(),
    baseline = candidate.baseline.createDevBackendHandler({ gateway: f.gateway });
  const coreConnection = new Proxy(
    {},
    {
      get() {
        throw Error("MUST_NOT_DERIVE_NICKNAME_PORT");
      },
    },
  );
  const patched = candidate.patched.createDevBackendHandler({
    gateway: f.gateway,
    coreConnection: coreConnection as never,
  });
  for (const [suffix, body] of [
    ["", undefined],
    ["/commands", command],
    [`/operations/${operationId}/recover`, { intentDigest: command.intentDigest }],
  ] as const) {
    const a = await baseline(request(suffix, body)),
      b = await patched(request(suffix, body));
    expect(b.status).toBe(a.status);
    expect(await stableBody(b)).toEqual(await stableBody(a));
    expect(b.status).toBe(404);
  }
  expect(f.validateAccessToken).not.toHaveBeenCalled();
  expect(f.port.read).not.toHaveBeenCalled();
});
it("explicitport reaches the existing normal verifier once perroute, exacttypedport and outerrequestId/safelog", async () => {
  const f = setup(),
    handle = candidate.patched.createDevBackendHandler({
      gateway: f.gateway,
      selfTripNicknamePort: f.port,
      log: f.log,
    });
  for (const [suffix, body] of [
    ["", undefined],
    ["/commands", command],
    [`/operations/${operationId}/recover`, { intentDigest: command.intentDigest }],
  ] as const) {
    const response = await handle(request(suffix, body));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  }
  expect(f.validateAccessToken).toHaveBeenCalledTimes(3);
  expect(f.port.read).toHaveBeenCalledExactlyOnceWith({ accountId, tripId, personId });
  expect(f.port.execute).toHaveBeenCalledExactlyOnceWith(
    { accountId, tripId, personId },
    command,
  );
  expect(f.port.recover).toHaveBeenCalledExactlyOnceWith(
    { accountId, tripId, personId },
    operationId,
    { intentDigest: command.intentDigest },
  );
  expect(f.log).toHaveBeenCalledTimes(3);
  for (const [event] of f.log.mock.calls) {
    expect(event.route).toBe(
      "/v1/trips/:tripId/persons/:personId/self-nickname/:resource",
    );
  }
  expect(JSON.stringify(f.log.mock.calls)).not.toContain(tripId);
  expect(JSON.stringify(f.log.mock.calls)).not.toContain("Bearer");
});
it.each([
  ["bad", 401],
  ["guest", 403],
] as const)("explicitport does not bypass %s authentication", async (token, status) => {
  const f = setup(),
    handle = candidate.patched.createDevBackendHandler({
      gateway: f.gateway,
      selfTripNicknamePort: f.port,
    });
  expect((await handle(request("/commands", command, token))).status).toBe(status);
  expect(f.port.execute).not.toHaveBeenCalled();
  expect(f.validateAccessToken).toHaveBeenCalledOnce();
});
it("keeps strict decoder and Coreerror semantics, without auto-recovery/write or unrelatedroute interception", async () => {
  const f = setup(),
    handle = candidate.patched.createDevBackendHandler({
      gateway: f.gateway,
      selfTripNicknamePort: f.port,
    });
  expect(
    (await handle(request("/commands", { ...command, actorAccountId: randomUUID() })))
      .status,
  ).toBe(400);
  expect(f.port.execute).not.toHaveBeenCalled();
  f.port.execute.mockRejectedValueOnce(
    new SelfNicknamePgError(503, "SELF_NICKNAME_UNAVAILABLE"),
  );
  expect((await handle(request("/commands", command))).status).toBe(503);
  expect(f.port.recover).not.toHaveBeenCalled();
  expect(f.port.execute).toHaveBeenCalledOnce();
  const baseline = candidate.baseline.createDevBackendHandler({ gateway: f.gateway });
  const url = "https://api.example.test/v1/unrelated";
  const a = await baseline(new Request(url)),
    b = await handle(new Request(url));
  expect(b.status).toBe(a.status);
  expect(await stableBody(b)).toEqual(await stableBody(a));
});
