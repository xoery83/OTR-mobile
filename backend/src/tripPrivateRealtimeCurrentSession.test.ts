import { Buffer } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import { preparePrivateRealtimeSession } from "./tripPrivateRealtimeCurrentSession";

const accountId = "11111111-1111-4111-8111-111111111111";
const tripId = "22222222-2222-4222-8222-222222222222";
const sessionId = "33333333-3333-4333-8333-333333333333";
const anotherId = "44444444-4444-4444-8444-444444444444";
// Synthetic JWT-shaped input: only the injected existing gateway authenticates it.
function token(extra: Record<string, unknown> = {}) {
  return [
    "unit",
    Buffer.from(
      JSON.stringify({
        sub: accountId,
        session_id: sessionId,
        exp: Math.floor(Date.now() / 1000) + 60,
        role: "authenticated",
        aud: "authenticated",
        is_anonymous: false,
        ...extra,
      }),
    ).toString("base64url"),
    "unit_signature",
  ].join(".");
}
function fixture(accessToken = token()) {
  const gateway = {
    validateAccessToken: vi.fn(async () => ({
      id: accountId,
      accountClass: "NORMAL_ACCOUNT" as const,
    })),
  };
  const held = {
    query: vi.fn(async () => ({
      rows: [{ identity: { accountId, tripId, sessionId } }],
    })),
  };
  const scope = { accountId, tripId, accessToken };
  return { gateway, held, scope };
}
afterEach(() => vi.useRealTimers());

it("authenticates once before Core and reads only the exact Session on the held lease", async () => {
  const f = fixture();
  const reader = await preparePrivateRealtimeSession(f.gateway, f.scope);
  expect(f.held.query).not.toHaveBeenCalled();
  expect(await reader.currentSession(f.held)).toEqual({ accountId, sessionId });
  await reader.currentSession(f.held);
  expect(f.gateway.validateAccessToken).toHaveBeenCalledExactlyOnceWith(
    f.scope.accessToken,
  );
  expect(f.held.query).toHaveBeenCalledWith(
    "SELECT public.otr_private_realtime_current_session($1::uuid,$2::uuid) AS identity",
    [sessionId, tripId],
  );
  expect(f.held.query.mock.calls).toHaveLength(2);
});

it("does not let decoded claims authenticate a rejected bearer", async () => {
  const f = fixture();
  await expect(
    preparePrivateRealtimeSession({ validateAccessToken: async () => null }, f.scope),
  ).rejects.toThrow();
  expect(f.held.query).not.toHaveBeenCalled();
});

it.each(["ANONYMOUS", "UNKNOWN"] as const)(
  "rejects a gateway-classified %s Account",
  async (accountClass) => {
    const f = fixture();
    await expect(
      preparePrivateRealtimeSession(
        {
          validateAccessToken: async () => ({ id: accountId, accountClass }),
        },
        f.scope,
      ),
    ).rejects.toThrow("NORMAL_SESSION_REQUIRED");
  },
);

it("rejects a verified foreign Account instead of connecting same names or fields", async () => {
  const f = fixture();
  await expect(
    preparePrivateRealtimeSession(
      {
        validateAccessToken: async () => ({
          id: anotherId,
          accountClass: "NORMAL_ACCOUNT",
        }),
      },
      f.scope,
    ),
  ).rejects.toThrow("NORMAL_SESSION_REQUIRED");
});

it.each([{ client_id: anotherId }, { aud: "https://api-dev.xoery.art/mcp" }])(
  "never admits OAuth resource credentials as a normal Session",
  async (extra) => {
    const f = fixture(token(extra));
    await expect(preparePrivateRealtimeSession(f.gateway, f.scope)).rejects.toThrow();
    expect(f.gateway.validateAccessToken).not.toHaveBeenCalled();
  },
);

it.each([
  { sub: anotherId },
  { session_id: undefined },
  { session_id: "00000000-0000-0000-0000-000000000000" },
  { role: "service_role" },
  { aud: ["foreign"] },
  { is_anonymous: true },
])("rejects claims that cannot bind the verified normal Session", async (extra) => {
  const f = fixture(token(extra));
  await expect(preparePrivateRealtimeSession(f.gateway, f.scope)).rejects.toThrow();
  expect(f.held.query).not.toHaveBeenCalled();
});

it("rejects an expired access token before any Session lookup", async () => {
  const f = fixture(token({ exp: Math.floor(Date.now() / 1000) }));
  await expect(preparePrivateRealtimeSession(f.gateway, f.scope)).rejects.toThrow(
    "ACCESS_TOKEN_EXPIRED",
  );
  expect(f.held.query).not.toHaveBeenCalled();
});

it("does not return a valid Session when the bearer expires during held IO", async () => {
  vi.useFakeTimers();
  const f = fixture(token({ exp: Math.floor(Date.now() / 1000) + 1 }));
  const reader = await preparePrivateRealtimeSession(f.gateway, f.scope);
  f.held.query.mockImplementationOnce(async () => {
    vi.setSystemTime(Date.now() + 2000);
    return { rows: [{ identity: { accountId, tripId, sessionId } }] };
  });
  await expect(reader.currentSession(f.held)).rejects.toThrow("ACCESS_TOKEN_EXPIRED");
});

it.each(["accountId", "tripId", "sessionId"])(
  "rejects a returned foreign %s",
  async (field) => {
    const f = fixture();
    const reader = await preparePrivateRealtimeSession(f.gateway, f.scope);
    f.held.query.mockResolvedValueOnce({
      rows: [{ identity: { accountId, tripId, sessionId, [field]: anotherId } }],
    });
    await expect(reader.currentSession(f.held)).rejects.toThrow("SESSION_BINDING");
  },
);

it("keeps revocation of one Session separate from another Session of the same Account", async () => {
  const f = fixture();
  const first = await preparePrivateRealtimeSession(f.gateway, f.scope);
  const second = await preparePrivateRealtimeSession(f.gateway, {
    ...f.scope,
    accessToken: token({ session_id: anotherId }),
  });
  const revoked = new Set<string>();
  const held = {
    query: vi.fn(async (_sql: string, parameters?: readonly unknown[]) => {
      const selected = parameters?.[0] as string;
      if (revoked.has(selected)) throw Error("PRIVATE_REALTIME_SESSION_NOT_CURRENT");
      return { rows: [{ identity: { accountId, tripId, sessionId: selected } }] };
    }),
  };
  await first.currentSession(held);
  revoked.add(sessionId);
  await expect(first.currentSession(held)).rejects.toThrow("NOT_CURRENT");
  expect(await second.currentSession(held)).toEqual({ accountId, sessionId: anotherId });
});
