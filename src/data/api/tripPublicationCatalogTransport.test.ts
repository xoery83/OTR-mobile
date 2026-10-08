import { afterEach, describe, expect, it, vi } from "vitest";
import { createTripPublicationCatalogTransport } from "./tripPublicationCatalogTransport";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { createClosedPublicationMembershipReader } from "@/data/repositories/tripPublicationMembershipRepository";
import { createHash } from "node:crypto";
import fixture from "@/data/repositories/__fixtures__/tripImportCatalogs.json";
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const actor = fixture.actor_account_id,
  trip = fixture.trip_id;
const token = vi.fn(
  async (_request?: {
    expectedUserId?: string;
    forceRefresh?: boolean;
    rejectedToken?: string;
  }) => ({ userId: actor, token: "private-token" }),
);
const hash = async (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
function catalog() {
  return {
    version: 1,
    actor_account_id: actor,
    trip_id: trip,
    ...Object.fromEntries(
      Object.entries(fixture)
        .filter(([, v]) => Array.isArray(v))
        .map(([k]) => [k, []]),
    ),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  token.mockClear();
});
describe("CLOSED Account-bound Publication GET", () => {
  it("uses exact original context/route/header and supplies an admitted empty-complete handle", async () => {
    const send = vi.fn(async () => Response.json(catalog()));
    const t = createTripPublicationCatalogTransport(
      async () => actor,
      { baseUrl: "https://api.test", fetchImplementation: send },
      token,
    );
    const context = await t.captureContext(trip);
    const reader = createClosedPublicationMembershipReader({
      mode: "CLOSED",
      getAccountId: async () => actor,
      sha256: hash,
      rpc: async (routine, parameters) => {
        expect(routine).toBe("trip_source_read_import_catalogs");
        expect(parameters).toEqual({ actor, trip });
        return t.read(context);
      },
    });
    const handle = await reader.read(context);
    expect(handle.memberships).toEqual([]);
    expect(Object.isFrozen(handle)).toBe(true);
    expect(send).toHaveBeenCalledWith(
      `https://api.test/v2/trips/${trip}/source-import-catalogs`,
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer private-token",
          "X-OTR-Publication-Catalog-Version": "1",
        },
      }),
    );
    expect(token.mock.calls[0][0]).toMatchObject({ expectedUserId: actor });
  });
  it("fails before token/network without an installed streaming adapter", async () => {
    const t = createTripPublicationCatalogTransport(
      async () => actor,
      { baseUrl: "https://api.test" },
      token,
    );
    await expect(t.read(await t.captureContext(trip))).rejects.toMatchObject({
      code: "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
    });
    expect(token).not.toHaveBeenCalled();
  });
  it("does not send credentials over HTTP or a credential-bearing base URL", async () => {
    for (const baseUrl of [
      "http://api.test",
      "https://user:password@api.test",
      "https://api.test?secret=x",
    ]) {
      const send = vi.fn();
      const t = createTripPublicationCatalogTransport(
        async () => actor,
        { baseUrl, fetchImplementation: send },
        token,
      );
      await expect(t.read(await t.captureContext(trip))).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    }
  });
  it.each(["token", "HTTP", "body"] as const)(
    "A→B→A during %s cannot return a handoff",
    async (phase) => {
      const change = () => {
        advanceAccountGeneration();
        advanceAccountGeneration();
      };
      const provider = async () => {
        if (phase === "token") change();
        return { userId: actor, token: "token" };
      };
      const send = vi.fn(async () => {
        if (phase === "HTTP") change();
        return new Response(
          new ReadableStream({
            pull(c) {
              if (phase === "body") change();
              c.enqueue(new TextEncoder().encode(JSON.stringify(catalog())));
              c.close();
            },
          }),
        );
      });
      const t = createTripPublicationCatalogTransport(
        async () => actor,
        { baseUrl: "https://api.test", fetchImplementation: send },
        provider,
      );
      await expect(t.read(await t.captureContext(trip))).rejects.toThrow();
      if (phase === "token") expect(send).not.toHaveBeenCalled();
    },
  );
  it("rejects foreign scope and malformed schema rather than empty-complete", async () => {
    for (const body of [
      { ...catalog(), actor_account_id: trip },
      { ...catalog(), trip_source_inputs: undefined },
      { ...catalog(), complete: true },
    ]) {
      const t = createTripPublicationCatalogTransport(
        async () => actor,
        {
          baseUrl: "https://api.test",
          fetchImplementation: async () => Response.json(body),
        },
        token,
      );
      await expect(t.read(await t.captureContext(trip))).rejects.toThrow();
    }
  });
  it("deadline includes slow local Account checks as well as token/body", async () => {
    vi.useFakeTimers();
    let reads = 0;
    const t = createTripPublicationCatalogTransport(
      async () => (++reads > 2 ? new Promise<string>(() => undefined) : actor),
      {
        baseUrl: "https://api.test",
        timeoutMs: 10,
        fetchImplementation: async () => Response.json(catalog()),
      },
      token,
    );
    const context = await t.captureContext(trip);
    const assertion = expect(t.read(context)).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
  });
});

it("the installed native nonstreaming Response shape fails before token/network", async () => {
  const send = vi.fn(),
    provider = vi.fn();
  const t = createTripPublicationCatalogTransport(
    async () => actor,
    { baseUrl: "https://api.test", fetchImplementation: send },
    provider,
  );
  const context = await t.captureContext(trip);
  vi.stubGlobal("Response", class NativeBufferedResponse {});
  await expect(t.read(context)).rejects.toMatchObject({
    code: "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE",
  });
  expect(send).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
});

describe("F1 original Publication text admission", () => {
  const raw = () => canonicalEventJson(catalog() as Json);
  it.each([
    ["duplicate actor", () => '{"actor_account_id":"' + trip + '",' + raw().slice(1)],
    [
      "duplicate family conceals65 rows",
      () =>
        '{"trip_source_candidates":' +
        JSON.stringify(Array(65).fill(fixture.trip_source_candidates[0])) +
        "," +
        raw().slice(1),
    ],
    [
      "rounded version",
      () => raw().replace('"version":1', '"version":1.0000000000000001'),
    ],
    [
      "nested duplicate",
      () =>
        canonicalEventJson(fixture as Json).replace(
          '"row_revision":1',
          '"row_revision":2,"row_revision":1',
        ),
    ],
    ["unsafe integer", () => raw().replace('"version":1', '"version":9007199254740993')],
    ["exponent", () => raw().replace('"version":1', '"version":1e0')],
  ] as const)("rejects %s before CLOSED handle", async (_label, body) => {
    const t = createTripPublicationCatalogTransport(
      async () => actor,
      {
        baseUrl: "https://api.test",
        fetchImplementation: async () => new Response(body()),
      },
      token,
    );
    const context = await t.captureContext(trip);
    const reader = createClosedPublicationMembershipReader({
      mode: "CLOSED",
      getAccountId: async () => actor,
      sha256: hash,
      rpc: () => t.read(context),
    });
    await expect(reader.read(context)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("accepts exact canonical original bytes", async () => {
    const t = createTripPublicationCatalogTransport(
      async () => actor,
      {
        baseUrl: "https://api.test",
        fetchImplementation: async () => new Response(raw()),
      },
      token,
    );
    await expect(t.read(await t.captureContext(trip))).resolves.toBe(raw());
  });
});

it("A→B→A during strict original-text parsing cannot return a CLOSED handle", async () => {
  const original = JSON.parse;
  let exercised = false;
  const spy = vi.spyOn(JSON, "parse").mockImplementation((...args) => {
    const value = original(...args);
    if (!exercised && value === actor) {
      exercised = true;
      advanceAccountGeneration();
      advanceAccountGeneration();
    }
    return value;
  });
  try {
    const t = createTripPublicationCatalogTransport(
      async () => actor,
      {
        baseUrl: "https://api.test",
        fetchImplementation: async () =>
          new Response(canonicalEventJson(catalog() as Json)),
      },
      token,
    );
    const context = await t.captureContext(trip);
    const reader = createClosedPublicationMembershipReader({
      mode: "CLOSED",
      getAccountId: async () => actor,
      sha256: hash,
      rpc: () => t.read(context),
    });
    await expect(reader.read(context)).rejects.toThrow();
    expect(exercised).toBe(true);
  } finally {
    spy.mockRestore();
  }
});
