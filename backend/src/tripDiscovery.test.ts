import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import { createSupabaseDevGateway } from "./supabaseGateway";

const actor = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const ids = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
  "20000000-0000-4000-8000-000000000004",
];
const summary = (id: string) => ({
  id,
  name: `Trip ${id.at(-1)}`,
  destination: null,
  startDate: null,
  endDate: null,
  createdAt: "2026-10-13T00:00:00Z",
});

it("authenticates before listing, validates a bounded cursor and keeps a missing port closed", async () => {
  const gateway = {
    validateAccessToken: vi.fn(async (token: string) =>
      token === "valid" ? { id: actor } : null,
    ),
    discoverTrips: vi.fn(async () => ({ trips: [summary(ids[0])], nextCursor: null })),
  } as unknown as DevBackendGateway;
  const handle = createDevBackendHandler({ gateway });
  const request = (path: string, token = "valid") =>
    new Request(`http://local${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  expect((await handle(request("/v2/trips", "invalid"))).status).toBe(401);
  expect(gateway.discoverTrips).not.toHaveBeenCalled();
  expect((await handle(request("/v2/trips?limit=26"))).status).toBe(400);
  expect((await handle(request("/v2/trips?cursor=foreign"))).status).toBe(400);
  const response = await handle(request("/v2/trips?limit=2"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ trips: [summary(ids[0])], nextCursor: null });
  expect(gateway.discoverTrips).toHaveBeenCalledWith(actor, null, 2);
  gateway.discoverTrips = vi.fn(async () => {
    throw new Error("private database detail");
  });
  const unavailable = await handle(request("/v2/trips"));
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toEqual({
    error: { code: "TRIP_DISCOVERY_UNAVAILABLE" },
  });
  const closed = createDevBackendHandler({
    gateway: { validateAccessToken: gateway.validateAccessToken } as DevBackendGateway,
  });
  expect((await closed(request("/v2/trips"))).status).toBe(503);
});

it("enumerates only actor candidate sources, deduplicates and rechecks live admission", async () => {
  const seen: URL[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(input);
    seen.push(url);
    const table = url.pathname.split("/").at(-1);
    const exact =
      url.searchParams.get("id")?.slice(3) ?? url.searchParams.get("trip_id")?.slice(3);
    const after = url.searchParams.get("id")?.startsWith("gt.")
      ? url.searchParams.get("id")!.slice(3)
      : url.searchParams.get("trip_id")?.startsWith("gt.")
        ? url.searchParams.get("trip_id")!.slice(3)
        : null;
    if (
      table === "trips" &&
      url.searchParams.has("id") &&
      url.searchParams.get("id")!.startsWith("in.")
    ) {
      const selected = url.searchParams
        .get("id")!
        .slice(3)
        .replace(/[()]/g, "")
        .split(",");
      return Response.json(
        selected.map((id) => ({
          id,
          name: `Trip ${id.at(-1)}`,
          destination: null,
          start_date: null,
          end_date: null,
          created_at: "2026-10-13T00:00:00Z",
        })),
      );
    }
    if (exact && !after) {
      const admitted =
        (table === "trips" && exact === ids[0]) ||
        (table === "trip_members" && exact === ids[1]) ||
        (table === "journey_members" && exact === ids[2]);
      return Response.json(admitted ? [{ id: exact }] : []);
    }
    if (table === "trips")
      return Response.json(
        [ids[0]].filter((id) => !after || id > after).map((id) => ({ id })),
      );
    if (table === "trip_members")
      return Response.json(
        [ids[0], ids[1], ids[3]]
          .filter((id) => !after || id > after)
          .map((trip_id) => ({ trip_id })),
      );
    if (table === "journey_members")
      return Response.json(
        [ids[2]].filter((id) => !after || id > after).map((trip_id) => ({ trip_id })),
      );
    throw new Error(`Unexpected table: ${table}`);
  });
  try {
    const gateway = createSupabaseDevGateway({
      url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      publishableKey: "synthetic-public",
      secretKey: "synthetic-secret",
    });
    const first = await gateway.discoverTrips!(actor, null, 2);
    expect(first.trips.map((trip) => trip.id)).toEqual(ids.slice(0, 2));
    expect(first.nextCursor).toBe(ids[1]);
    const second = await gateway.discoverTrips!(actor, first.nextCursor, 2);
    expect(second.trips.map((trip) => trip.id)).toEqual([ids[2]]);
    expect(second.nextCursor).toBeNull();
    expect(
      seen
        .filter((url) => url.searchParams.get("id")?.startsWith("in."))
        .every((url) => !url.searchParams.get("id")!.includes(ids[3])),
    ).toBe(true);
    expect(
      seen
        .filter((url) => url.searchParams.get("trip_id")?.startsWith("gt."))
        .every((url) => url.searchParams.get("trip_id") === `gt.${ids[1]}`),
    ).toBe(true);
    expect(
      seen
        .filter(
          (url) =>
            url.pathname.endsWith("/trips") &&
            !url.searchParams.has("id") &&
            url.searchParams.has("created_by"),
        )
        .every((url) => url.searchParams.get("created_by") === `eq.${actor}`),
    ).toBe(true);
    expect(
      seen
        .filter((url) => url.pathname.endsWith("/trip_members"))
        .every((url) => url.searchParams.get("user_id") === `eq.${actor}`),
    ).toBe(true);
    expect(
      seen
        .filter((url) => url.pathname.endsWith("/journey_members"))
        .every(
          (url) =>
            url.searchParams.get("user_id") === `eq.${actor}` &&
            url.searchParams.get("status") === "eq.linked",
        ),
    ).toBe(true);
    expect(
      seen.some(
        (url) =>
          url.searchParams.has("other") ||
          url.searchParams.get("user_id") === `eq.${other}`,
      ),
    ).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
