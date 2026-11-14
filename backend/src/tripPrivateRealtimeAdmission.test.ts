import { Buffer } from "node:buffer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createTripPrivateRealtimeAdmission,
  type TripPrivateRealtimeAdmissionPort,
} from "./tripPrivateRealtimeAdmission";
const accountId = "11111111-1111-4111-8111-111111111111";
const tripId = "22222222-2222-4222-8222-222222222222";
const personId = "33333333-3333-4333-8333-333333333333";
const leaseId = "44444444-4444-4444-8444-444444444444";
const input = { tripId, localGeneration: 7 };
const lease = () => ({
  accountId,
  tripId,
  actorPersonId: personId,
  leaseId,
  channel: "server-qualified-opaque-channel",
  authorizationRevision: 19,
  expiresAt: Date.now() + 1000,
});
const request = (signal?: AbortSignal, token = "normal-unit-bearer") =>
  new Request("https://unit.invalid", {
    headers: { Authorization: "Bearer " + token },
    signal,
  });
const close = vi.fn();
const gateway = {
  validateAccessToken: vi.fn(async (_token: string) => ({
    id: accountId,
    accountClass: "NORMAL_ACCOUNT" as const,
  })),
};
const join = vi.fn<TripPrivateRealtimeAdmissionPort["authorizeAndJoin"]>(async () => ({
  lease: lease(),
  close,
}));
const fixture = () =>
  createTripPrivateRealtimeAdmission({ gateway, port: { authorizeAndJoin: join } });
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
});
afterEach(() => vi.useRealTimers());
it("keeps an absent atomic owning port closed with zero auth or join IO", async () => {
  const admit = createTripPrivateRealtimeAdmission({ gateway });
  await expect(admit(request(), input)).rejects.toThrow("CLOSED");
  expect(gateway.validateAccessToken).not.toHaveBeenCalled();
  expect(join).not.toHaveBeenCalled();
});
it("binds Account only from trusted getUser; close is idempotent at actual expiry", async () => {
  const admitted = await fixture()(request(), input);
  expect(join).toHaveBeenCalledWith(
    { accountId, accessToken: "normal-unit-bearer", ...input },
    expect.any(AbortSignal),
  );
  expect(admitted.lease).toEqual(lease());
  expect(admitted.localGeneration).toBe(7);
  expect(admitted).not.toHaveProperty("accessToken");
  expect(admitted.lease).not.toHaveProperty("accessToken");
  await vi.advanceTimersByTimeAsync(1000);
  admitted.close();
  admitted.close();
  expect(close).toHaveBeenCalledTimes(1);
});
it.each([
  "accountId",
  "actorPersonId",
  "leaseId",
  "authorizationRevision",
  "accessToken",
  "expiresAt",
  "ttl",
])("rejects caller-supplied authority field %s before authentication", async (field) => {
  await expect(fixture()(request(), { ...input, [field]: accountId })).rejects.toThrow();
  expect(gateway.validateAccessToken).not.toHaveBeenCalled();
  expect(join).not.toHaveBeenCalled();
});
it.each(["ANONYMOUS", "UNKNOWN", undefined])(
  "rejects non-normal Account classification %s",
  async (kind) => {
    gateway.validateAccessToken.mockResolvedValueOnce({
      id: accountId,
      accountClass: kind,
    } as never);
    await expect(fixture()(request(), input)).rejects.toThrow("NORMAL_ACCOUNT_REQUIRED");
    expect(join).not.toHaveBeenCalled();
  },
);
it.each([
  { client_id: leaseId },
  { otr_scopes: ["otr.trips.read"] },
  { aud: "https://api-dev.xoery.art/mcp" },
])(
  "rejects a resource marker before auth IO (unit fixture, not a signed identity): %j",
  async (claims) => {
    const token =
      "unit." + Buffer.from(JSON.stringify(claims)).toString("base64url") + ".unit";
    await expect(fixture()(request(undefined, token), input)).rejects.toThrow(
      "NORMAL_ACCOUNT_REQUIRED",
    );
    expect(gateway.validateAccessToken).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
  },
);
it.each(["accountId", "tripId", "actorPersonId", "leaseId", "expiresAt", "boolean"])(
  "rejects an unqualified %s join and closes any returned transport",
  async (field) => {
    const bad =
      field === "boolean"
        ? true
        : {
            ...lease(),
            [field]:
              field === "expiresAt"
                ? Date.now()
                : field === "actorPersonId" || field === "leaseId"
                  ? "00000000-0000-0000-0000-000000000000"
                  : leaseId,
          };
    join.mockResolvedValueOnce({ lease: bad, close } as never);
    await expect(fixture()(request(), input)).rejects.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  },
);
it("does not join if cancelled during trusted getUser", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof gateway.validateAccessToken>>) => void;
  gateway.validateAccessToken.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const controller = new AbortController();
  const pending = fixture()(request(controller.signal), input);
  controller.abort();
  resolve({ id: accountId, accountClass: "NORMAL_ACCOUNT" });
  await expect(pending).rejects.toThrow();
  expect(join).not.toHaveBeenCalled();
});
it("aborts a pending private join and closes its late successful transport exactly once", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof join>>) => void;
  let joinedSignal!: AbortSignal;
  join.mockImplementationOnce((_scope, signal) => {
    joinedSignal = signal;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const controller = new AbortController();
  const pending = fixture()(request(controller.signal), input);
  await Promise.resolve();
  await Promise.resolve();
  controller.abort();
  expect(joinedSignal.aborted).toBe(true);
  resolve({ lease: lease(), close });
  await expect(pending).rejects.toThrow("REJECTED");
  expect(close).toHaveBeenCalledTimes(1);
});

it("rejects a missing or invalid normal Session without private join", async () => {
  await expect(fixture()(new Request("https://unit.invalid"), input)).rejects.toThrow(
    "NORMAL_ACCOUNT_REQUIRED",
  );
  expect(gateway.validateAccessToken).not.toHaveBeenCalled();
  gateway.validateAccessToken.mockResolvedValueOnce(null as never);
  await expect(fixture()(request(), input)).rejects.toThrow("NORMAL_ACCOUNT_REQUIRED");
  expect(join).not.toHaveBeenCalled();
});

it("never promotes the Core actor observation into a private join lease", async () => {
  const observation = {
    qualification: "NOT_A_PRIVATE_JOIN_LEASE",
    actorAccountId: accountId,
    tripId,
    actorPersonId: personId,
    coreEpoch: leaseId,
    coreAccessRevision: 19,
  };
  join.mockResolvedValueOnce({ lease: observation, close } as never);
  await expect(fixture()(request(), input)).rejects.toThrow();
  expect(close).toHaveBeenCalledTimes(1);
});
