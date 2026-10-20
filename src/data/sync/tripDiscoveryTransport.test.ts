import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { captureAccountScope } from "../auth/accountRequestContext";
import {
  createTripDiscoveryTransport,
  refreshTripDiscovery,
} from "./tripDiscoveryTransport";
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));

const first = randomUUID();
const second = randomUUID();
const [lower, upper] = [first, second].sort();
const trip = (id: string) => ({
  id,
  name: id,
  destination: null,
  startDate: null,
  endDate: null,
  createdAt: null,
});

it("uses the scoped authenticated GET and parses only the bounded discovery page", async () => {
  const actor = randomUUID();
  const fetchImplementation = vi.fn(async (url: string, options: RequestInit) => {
    expect(url).toBe("https://api.example.test/v2/trips?limit=25");
    expect(options.method).toBe("GET");
    expect(options.headers).toMatchObject({ Authorization: "Bearer test-only" });
    return new Response(JSON.stringify({ trips: [trip(lower)], nextCursor: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const scope = await captureAccountScope(async () => actor);
  const transport = createTripDiscoveryTransport(
    async () => actor,
    {
      baseUrl: "https://api.example.test",
      fetchImplementation: fetchImplementation as typeof fetch,
    },
    async () => ({ token: "test-only", userId: actor }),
  );
  expect(await transport.page(scope, null)).toEqual({
    trips: [trip(lower)],
    nextCursor: null,
  });
  expect(fetchImplementation).toHaveBeenCalledTimes(1);
});

it("does not let a caller expand the per-page response bound", async () => {
  const actor = randomUUID();
  const scope = await captureAccountScope(async () => actor);
  const transport = createTripDiscoveryTransport(
    async () => actor,
    {
      baseUrl: "https://api.example.test",
      maxResponseBytes: 500_000,
      fetchImplementation: (async () =>
        new Response(
          JSON.stringify({
            trips: [{ ...trip(lower), name: "a".repeat(263_000) }],
            nextCursor: null,
          }),
          { status: 200 },
        )) as typeof fetch,
    },
    async () => ({ token: "test-only", userId: actor }),
  );
  await expect(transport.page(scope, null)).rejects.toMatchObject({
    kind: "validation",
    code: "BODY_LIMIT",
  });
});

it("applies only a complete ordered page chain and retains prior cache on failure", async () => {
  let account = randomUUID();
  const identity = async () => account;
  const saved: string[][] = [];
  const cache = {
    async replaceSnapshot(_scope: unknown, trips: { id: string }[]) {
      saved.push(trips.map((item) => item.id));
    },
  };
  const transport = {
    async page(_scope: unknown, cursor: string | null) {
      return cursor === null
        ? { trips: [trip(lower)], nextCursor: lower }
        : { trips: [trip(upper)], nextCursor: null };
    },
  };
  expect(await refreshTripDiscovery(identity, transport, cache)).toBe(2);
  expect(saved).toEqual([[lower, upper]]);
  await expect(
    refreshTripDiscovery(
      identity,
      {
        page: async (_scope, cursor) =>
          cursor === null
            ? { trips: [trip(lower)], nextCursor: lower }
            : { trips: [trip(lower)], nextCursor: null },
      },
      cache,
    ),
  ).rejects.toThrow("TRIP_DISCOVERY_PAGE_ORDER");
  expect(saved).toHaveLength(1);
  await expect(
    refreshTripDiscovery(
      identity,
      {
        page: async () => {
          account = randomUUID();
          advanceAccountGeneration();
          return { trips: [trip(lower)], nextCursor: null };
        },
      },
      cache,
    ),
  ).rejects.toThrow("Account changed");
  expect(saved).toHaveLength(1);
});
