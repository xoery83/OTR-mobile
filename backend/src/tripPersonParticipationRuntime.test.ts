import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import {
  participationIntentCodec,
  participationResultCodec,
} from "./tripPersonParticipationIntent";
import { type ParticipationGateway } from "./tripPersonParticipationRuntime";
import {
  participationIntentBytes,
  participationResultBytes,
  type ParticipationCommand,
  type ParticipationResult,
} from "../../src/domain/trip/personParticipationCommand";
const actor = "10000000-0000-4000-8000-000000000001",
  trip = "20000000-0000-4000-8000-000000000001",
  person = "30000000-0000-4000-8000-000000000001",
  op = "40000000-0000-4000-8000-000000000001";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
// Serializer validates digest shape, so use a shaped placeholder before hashing.
function intent() {
  const c = {
    contractVersion: 1,
    command: "SET_PARTICIPATION",
    operationId: op,
    actorUserId: actor,
    actorMemberId: null,
    tripId: trip,
    personId: person,
    expectedParticipation: { isParticipating: true, revision: 0 },
    isParticipating: false,
    reason: "雪😀\nexact",
    intentDigest: "0".repeat(64),
  } as ParticipationCommand;
  c.intentDigest = hash(participationIntentBytes(c));
  return c;
}
function result(): ParticipationResult {
  const c = intent();
  const receipt = {
    receiptVersion: 1,
    receiptId: person,
    contractVersion: 1,
    command: "SET_PARTICIPATION",
    operationId: op,
    actorUserId: actor,
    actorMemberId: person,
    tripId: trip,
    personId: person,
    intentDigest: c.intentDigest,
    expectedParticipation: c.expectedParticipation,
    desiredParticipation: false,
    outcome: "APPLIED",
    priorParticipation: c.expectedParticipation,
    resultingParticipation: { isParticipating: false, revision: 1 },
    errorCode: null,
    observedAt: "2026-10-05T00:00:00.123456Z",
  } as ParticipationResult["receipt"];
  return {
    receipt,
    resultDigest: hash(participationResultBytes(receipt)),
    idempotentReplay: true,
  };
}
function connection(overrides: Partial<ParticipationGateway> = {}): ParticipationGateway {
  return {
    sessionUser: async () => "otr_trip_person_command_gateway",
    readInstalledState: async () => ({
      commandVersion: 1,
      receiptVersion: 1,
      gateClosed: true,
    }),
    lookupExactReceipt: vi.fn(async () => result()),
    setParticipation: vi.fn(async () => result()),
    ...overrides,
  };
}
function handler(participationGateway?: ParticipationGateway, read = true) {
  return createDevBackendHandler({
    participationGateway,
    gateway: {
      validateAccessToken: async (token: string) =>
        token === "verified" ? { id: actor } : null,
      canReadTrip: async () => read,
    } as unknown as DevBackendGateway,
  });
}
const request = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://local/v2/trips/${trip}/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer verified", "Idempotency-Key": op, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
it.each([
  undefined,
  connection({ sessionUser: async () => "service_role" }),
  connection({ sessionUser: async () => "authenticated" }),
  connection({
    sessionUser: async () => {
      throw Error("unknown");
    },
  }),
])("missing/wrong actual gateway stays disabled and cannot recover", async (gateway) => {
  const h = handler(gateway);
  expect(
    await (await h(request("person-participation-capabilities"))).json(),
  ).toMatchObject({
    activationState: "DISABLED",
    enabledCommands: [],
    enabledScopes: [],
    gatewayAvailable: false,
  });
  const response = await h(request(`person-participation-operations/${op}`));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "REPLAY_UNAVAILABLE" } });
});
it("mocked open database gate never enables HTTP POST", async () => {
  const g = connection({
      readInstalledState: async () => ({
        commandVersion: 1,
        receiptVersion: 1,
        gateClosed: false,
      }),
    }),
    h = handler(g);
  expect(
    await (await h(request("person-participation-capabilities"))).json(),
  ).toMatchObject({
    activationState: "DISABLED",
    enabledCommands: [],
    enabledScopes: [],
  });
  expect(
    (await h(request(`persons/${person}/participation-commands`, intent()))).status,
  ).toBe(503);
  expect(g.setParticipation).not.toHaveBeenCalled();
});
it("POST independently binds verified Actor/Trip/Person/key and rejects caller/JWT/GUC spoof", async () => {
  const h = handler(connection());
  const changed = { ...intent(), actorUserId: person };
  changed.intentDigest = hash(participationIntentBytes(changed));
  expect(
    (
      await h(
        request(`persons/${person}/participation-commands`, changed, {
          "X-Actor": actor,
          "request.jwt.claims": actor,
          role: "otr_trip_person_command_gateway",
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await h(
        request(`persons/${person}/participation-commands`, intent(), {
          "Idempotency-Key": person,
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await h(
        request(`persons/${person}/participation-commands`, intent(), {
          Authorization: "Bearer service_role",
        }),
      )
    ).status,
  ).toBe(401);
});
it("GET exact authorized immutable result preserves UTC micros and only permitted fields", async () => {
  const g = connection();
  const response = await handler(g)(request(`person-participation-operations/${op}`));
  expect(await response.json()).toEqual(result());
  expect(g.lookupExactReceipt).toHaveBeenCalledWith(actor, trip, op);
  expect(g.setParticipation).not.toHaveBeenCalled();
});
it.each(["", "Bearer invalid", "Bearer service_role"])(
  "GET %s authentication fails before admission or lookup",
  async (authorization) => {
    const g = connection();
    const response = await handler(g)(
      request(`person-participation-operations/${op}`, undefined, {
        Authorization: authorization,
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    expect(g.lookupExactReceipt).not.toHaveBeenCalled();
  },
);
it("GET former Organizer with Trip read access is forbidden before receipt disclosure", async () => {
  const g = connection({
    lookupExactReceipt: vi.fn(async () => {
      // Exact SQL owner admission precedes the receipt query, even for existing keys.
      throw { code: "42501", message: "PARTICIPATION_FORBIDDEN" };
    }),
  });
  const response = await handler(
    g,
    true,
  )(request(`person-participation-operations/${op}`));
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: {
      code: "PARTICIPATION_FORBIDDEN",
      message: "Organizer authority is required.",
      requestId: expect.any(String),
    },
  });
  expect(g.lookupExactReceipt).toHaveBeenCalledWith(actor, trip, op);
  expect(g.setParticipation).not.toHaveBeenCalled();
});
it("GET Trip admission denial is forbidden and never invokes exact lookup", async () => {
  const g = connection();
  const response = await handler(
    g,
    false,
  )(request(`person-participation-operations/${op}`));
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    error: { code: "PARTICIPATION_FORBIDDEN" },
  });
  expect(g.lookupExactReceipt).not.toHaveBeenCalled();
});
it.each(["absent", "foreign Actor", "foreign key"])(
  "GET %s is own-scoped OPERATION_NOT_FOUND without disclosure",
  async (scenario) => {
    const saved = result();
    if (scenario === "foreign Actor") saved.receipt.actorUserId = person;
    if (scenario === "foreign key") saved.receipt.operationId = person;
    const g = connection({
      lookupExactReceipt: vi.fn(async (a, t, k) =>
        scenario !== "absent" &&
        saved.receipt.actorUserId === a &&
        saved.receipt.tripId === t &&
        saved.receipt.operationId === k
          ? saved
          : null,
      ),
    });
    const response = await handler(g)(request(`person-participation-operations/${op}`));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "OPERATION_NOT_FOUND",
        message: "The exact operation was not found.",
        requestId: expect.any(String),
      },
    });
    expect(g.lookupExactReceipt).toHaveBeenCalledWith(actor, trip, op);
    expect(g.setParticipation).not.toHaveBeenCalled();
  },
);
it.each([
  "foreign scope",
  "corrupt digest",
  "malformed",
  "runtime failure",
  "unrelated permission error",
])("GET %s fails closed as REPLAY_UNAVAILABLE, never NOT_FOUND", async (scenario) => {
  const raw = result();
  if (scenario === "foreign scope") {
    raw.receipt.actorUserId = person;
    raw.resultDigest = hash(participationResultBytes(raw.receipt));
  }
  if (scenario === "corrupt digest") raw.resultDigest = "0".repeat(64);
  const g = connection({
    lookupExactReceipt: async () => {
      if (scenario === "runtime failure") throw Error("current owner rejected");
      if (scenario === "unrelated permission error")
        throw { code: "42501", message: "permission denied for relation" };
      return scenario === "malformed" ? {} : raw;
    },
  });
  const response = await handler(g)(request(`person-participation-operations/${op}`));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: {
      code: "REPLAY_UNAVAILABLE",
      message: "Historic participation recovery is unavailable.",
      requestId: expect.any(String),
    },
  });
  expect(g.setParticipation).not.toHaveBeenCalled();
});
it("GET has no enumeration, queries or mutation fallback", async () => {
  expect((await handler()(request("person-participation-operations"))).status).toBe(404);
  const g = connection();
  expect(
    (await handler(g)(request(`person-participation-operations/${op}?actor=${actor}`)))
      .status,
  ).toBe(400);
  expect(g.lookupExactReceipt).not.toHaveBeenCalled();
  expect(g.setParticipation).not.toHaveBeenCalled();
});
it("Backend independently matches Mobile bytes and rejects altered digest/raw duplicate/numeric input", () => {
  const c = intent(),
    r = result();
  expect(participationIntentCodec(JSON.stringify(c)).bytes).toBe(
    participationIntentBytes(c),
  );
  expect(participationResultCodec(r, actor, trip, op, c).bytes).toBe(
    participationResultBytes(r.receipt),
  );
  expect(() =>
    participationIntentCodec(JSON.stringify({ ...c, intentDigest: "0".repeat(64) })),
  ).toThrow();
  expect(() =>
    participationIntentCodec(JSON.stringify(c).replace('"revision":0', '"revision":0.0')),
  ).toThrow();
  expect(() =>
    participationIntentCodec(JSON.stringify(c).replace("{", '{"operationId":"x",')),
  ).toThrow();
  expect(() =>
    participationResultCodec({ ...r, resultDigest: "0".repeat(64) }, actor, trip, op),
  ).toThrow();
});

it.each([true, false])(
  "I2C4 DB gateClosed=%s and caller activation claims never enable HTTP",
  async (gateClosed) => {
    const g = connection({
      readInstalledState: async () => ({
        commandVersion: 1,
        receiptVersion: 1,
        gateClosed,
      }),
    });
    const h = handler(g);
    const claims = {
      "X-Participation-Capability": "ENABLED",
      "X-Deployment-Feature": "tripPersonParticipationCommandsV1=ON",
      "X-Rollout-Allowlist": `${actor}/${trip}`,
      "request.jwt.claims": '{"role":"otr_trip_person_command_gateway"}',
    };
    const capability = await h(
      request("person-participation-capabilities", undefined, claims),
    );
    expect(await capability.json()).toMatchObject({
      activationState: "DISABLED",
      enabledCommands: [],
      enabledScopes: [],
    });
    const response = await h(
      request(`persons/${person}/participation-commands`, intent(), claims),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "PARTICIPATION_COMMANDS_DISABLED" },
    });
    expect(g.setParticipation).not.toHaveBeenCalled();
    // Closed mutation must not disable current-authority historic GET recovery.
    const historic = await h(request(`person-participation-operations/${op}`));
    expect(historic.status).toBe(200);
    expect(await historic.json()).toEqual(result());
  },
);
it("I2C4 stale cached ENABLED after gateway outage cannot admit POST or manufacture replay", async () => {
  const h = handler();
  const claims = { "X-Participation-Capability": "ENABLED" };
  const response = await h(
    request(`persons/${person}/participation-commands`, intent(), claims),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    error: { code: "PARTICIPATION_COMMANDS_DISABLED" },
  });
  const recovery = await h(
    request(`person-participation-operations/${op}`, undefined, claims),
  );
  expect(recovery.status).toBe(503);
  expect(await recovery.json()).toMatchObject({ error: { code: "REPLAY_UNAVAILABLE" } });
});
