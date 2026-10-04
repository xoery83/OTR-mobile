import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import { createSupabaseDevGateway } from "./supabaseGateway";
import {
  canonicalCapabilities,
  projectCanonicalEvent,
  projectEventReceipt,
} from "./tripCanonicalRead";
import {
  canonicalEventFactsSchema,
  canonicalEndpointSchema,
  canonicalEventColumns,
  canonicalCapabilitiesSchema,
} from "../../src/data/api/tripCanonicalReadContracts";

const trip = "10000000-0000-4000-8000-000000000001";
const actor = "20000000-0000-4000-8000-000000000001";
const event = "30000000-0000-4000-8000-000000000001";
const operation = "40000000-0000-4000-8000-000000000001";
function facts(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...Object.fromEntries(
      Object.keys(canonicalEventFactsSchema.shape).map((key) => [key, null]),
    ),
    id: event,
    trip_id: trip,
    temporal_contract_version: 1,
    temporal_shape: "POINT",
    semantic_revision: 1,
    title: "Untimed",
    event_type: "activity",
    status: "planned",
    participant_scope: "UNASSIGNED",
    is_estimated_time: false,
    start_quality: "UNKNOWN",
    start_basis: "DERIVED_CIVIL",
    start_civil_resolution: "PENDING",
    start_provenance_refs: {},
    location_input_revision: 1,
    itinerary_transport_endpoints: [],
    ...patch,
  };
}
function historic() {
  return {
    trip_id: trip,
    actor_account_id: actor,
    operation_key: operation,
    receipt_version: 1,
    command_version: 1,
    intent_version: 1,
    command: "UPDATE_STATUS",
    intent_sha256: "a".repeat(64),
    receipt_sha256: "b".repeat(64),
    target_event_id: event,
    base_semantic_revision: 1,
    outcome: "APPLIED",
    result_event_id: event,
    committed_semantic_revision: 2,
    observed_semantic_revision: null,
    error_code: null,
    submitted_http_status: 200,
    committed_at: "2026-11-01T09:00:00.123456Z",
    result_fields: { status: "completed" },
    intended_payload: "private Source proof",
    confirmations: { private: "financial canary" },
  };
}
const connection = () => ({
  sessionUser: async () => "otr_trip_event_command_gateway",
  readInstalledState: async () => ({ commandVersion: 1 as const, gateClosed: true }),
  lookupExactReceipt: vi.fn(async () => historic()),
});
function handler(overrides: Partial<DevBackendGateway> = {}) {
  return createDevBackendHandler({
    gateway: {
      validateAccessToken: async (token: string) =>
        token === "valid" ? { id: actor } : null,
      canReadTrip: async () => true,
      readCanonicalCapabilities: async () => canonicalCapabilities(true),
      readCanonicalEvent: async () => projectCanonicalEvent(facts(), "1"),
      readEventOperationReceipt: async (a, t, o) =>
        projectEventReceipt(historic(), a, t, o),
      ...overrides,
    } as DevBackendGateway,
  });
}
function request(path: string, method = "GET", version: string | null = "1") {
  return new Request(`http://local/v2/trips/${trip}/${path}`, {
    method,
    headers: {
      Authorization: "Bearer valid",
      ...(version ? { "X-OTR-Canonical-Event-Read-Version": version } : {}),
    },
  });
}

describe("lossless canonical read boundary", () => {
  it("POINT unknown has no synthetic date/clock/instant", () => {
    const result = projectCanonicalEvent(facts(), "1");
    expect(result).toEqual({
      readVersion: 1,
      disposition: "READ_ONLY",
      legacyCompatible: false,
      event: facts(),
    });
    expect(JSON.stringify(result)).not.toContain("scheduledDate");
  });
  it.each(["CALENDAR", "ALL_DAY"])(
    "preserves %s date-only without an appointment",
    (shape) => {
      const row = facts({
        temporal_shape: shape,
        start_local_date: "2026-12-17",
        start_quality: null,
        start_provenance_refs: { local_date: "otr-event/confirmation/date" },
      });
      expect(projectCanonicalEvent(row, "1")).toHaveProperty("event", row);
    },
  );
  it("preserves source microseconds and unzoned civil fragments independently", () => {
    const source = facts({
      start_quality: "EXACT",
      start_basis: "SOURCE_INSTANT",
      start_civil_resolution: null,
      start_source_instant: "2026-12-17T06:00:00.123456+00:00",
      start_source_instant_precision: 6,
      planned_start: "2026-12-17T06:00:00.123456+00:00",
      start_provenance_refs: { source_instant: "otr-event/confirmation/instant" },
    });
    expect(projectCanonicalEvent(source, "1")).toHaveProperty("event", source);
    const civil = facts({
      start_local_time: "08:35:00",
      start_clock_precision: -1,
      start_quality: "ESTIMATED",
      is_estimated_time: true,
      start_provenance_refs: {
        local_time: "otr-event/confirmation/clock",
        quality: "otr-event/confirmation/estimate",
      },
    });
    expect(projectCanonicalEvent(civil, "1")).toHaveProperty("event", civil);
  });
  it("preserves authored/accepted spatial fields, accepted Place and opaque references", () => {
    const row = facts({
      authored_label: "駅",
      authored_text: " original wording ",
      authored_address_line2: "南口",
      accepted_address: "confirmed",
      accepted_address_country: "Japan",
      accepted_latitude: 35.123456789,
      accepted_longitude: 139.987654321,
      accepted_place_id: event,
      spatial_provenance_refs: {
        authored_label: "otr-event/confirmation/label",
        accepted_address: "otr-event/confirmation/address",
      },
    });
    expect(projectCanonicalEvent(row, "1")).toHaveProperty("event", row);
  });
  it.each(["SPAN", "STAY", "WINDOW", "TRANSPORT"])(
    "rich %s remains versioned and read-only",
    (shape) => {
      const row = facts({ temporal_shape: shape });
      if (shape === "TRANSPORT")
        row.itinerary_transport_endpoints = ["ORIGIN", "DESTINATION"].map((role) => ({
          ...Object.fromEntries(
            Object.keys(canonicalEndpointSchema.shape).map((key) => [key, null]),
          ),
          event_id: event,
          role,
          quality: "UNKNOWN",
          basis: "DERIVED_CIVIL",
          civil_resolution: "PENDING",
          provenance_refs: {},
        }));
      const result = projectCanonicalEvent(row, "1");
      expect(result).toHaveProperty("event", row);
      expect(result.disposition).toBe("READ_ONLY");
      expect(projectCanonicalEvent(row, null).disposition).toBe("WITHHELD");
    },
  );
  it("selects every B-T3A authored/accepted temporal/spatial addition and no candidate/source bodies", () => {
    const migration = readFileSync(
      "supabase/migrations/20261004000100_trip_temporal_protected_foundation.sql",
      "utf8",
    );
    const columns = [...migration.matchAll(/add column ([a-z0-9_]+)/g)].map(
      (match) => match[1],
    );
    for (const column of columns.filter((key) => !key.startsWith("candidate_")))
      expect(canonicalEventColumns).toContain(column);
    expect(canonicalEventColumns).not.toMatch(
      /candidate_|source_text|confidence|booking_reference/,
    );
  });
  it.each([null, "0", "2"])("withholds old/unknown clients (%s)", async (version) => {
    const read = vi.fn();
    const response = await handler({ readCanonicalEvent: read })(
      request(`canonical-events/${event}`, "GET", version),
    );
    expect(await response.json()).toEqual({
      readVersion: 1,
      disposition: "WITHHELD",
      reason: "UNSUPPORTED_CLIENT",
    });
    expect(read).not.toHaveBeenCalled();
  });
  it("legacy/future versions never fallback through the old DTO", () => {
    expect(
      projectCanonicalEvent(facts({ temporal_contract_version: null }), "1"),
    ).toHaveProperty("reason", "LEGACY_EVENT");
    expect(
      projectCanonicalEvent(facts({ temporal_contract_version: 2 }), "1"),
    ).toHaveProperty("reason", "UNSUPPORTED_CONTRACT");
  });
  it("receipt returns exact immutable Actor/Trip/key correlation after later edits without private output", async () => {
    const read = vi.fn(async (a, t, o) => projectEventReceipt(historic(), a, t, o));
    const handle = handler({ readEventOperationReceipt: read });
    const before = await (
      await handle(request(`canonical-event-operations/${operation}`))
    ).text();
    projectCanonicalEvent(facts({ semantic_revision: 9, status: "skipped" }), "1");
    const after = await (
      await handle(request(`canonical-event-operations/${operation}`))
    ).text();
    expect(before).toBe(after);
    expect(read).toHaveBeenCalledWith(actor, trip, operation);
    expect(before).toContain(".123456Z");
    expect(before).not.toMatch(
      /private|financial|intended_payload|result_fields|confirmations/,
    );
  });
  it("foreign Actor/Trip and unknown operation have the same unavailable response", async () => {
    const denied = await handler({ canReadTrip: async () => false })(
      request(`canonical-event-operations/${operation}`),
    );
    const missing = await handler({ readEventOperationReceipt: async () => null })(
      request(`canonical-event-operations/${operation}`),
    );
    const foreign = await handler({
      readEventOperationReceipt: async () => ({
        ...projectEventReceipt(historic(), actor, trip, operation),
        actor_account_id: event,
      }),
    })(request(`canonical-event-operations/${operation}`));
    for (const response of [denied, missing, foreign]) {
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("READ_UNAVAILABLE");
      expect(body.error.requestId).toBe(response.headers.get("X-Request-Id"));
    }
    expect(() => projectEventReceipt(historic(), event, trip, operation)).toThrow(
      "scope mismatch",
    );
  });
  it("requires auth and refuses receipt enumeration/query filters", async () => {
    const noAuth = new Request(
      `http://local/v2/trips/${trip}/canonical-event-operations/${operation}`,
    );
    expect((await handler()(noAuth)).status).toBe(401);
    expect((await handler()(request("canonical-event-operations"))).status).toBe(404);
    expect(
      (await handler()(request(`canonical-event-operations/${operation}?actor=${actor}`)))
        .status,
    ).toBe(400);
  });
  it.each(
    ["POST", "PUT", "PATCH", "DELETE"].flatMap((method) =>
      [`canonical-events/${event}`, `canonical-event-operations/${operation}`].map(
        (path) => [method, path],
      ),
    ),
  )("%s %s cannot mutate or enable the gate", async (method, path) => {
    const read = vi.fn();
    const response = await handler({
      readCanonicalEvent: read,
      readEventOperationReceipt: read,
    })(request(path, method));
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty(
      "error.code",
      "CANONICAL_WRITES_DISABLED",
    );
    expect(read).not.toHaveBeenCalled();
  });
  it("removes the unintended receipt route without an alias", async () => {
    const read = vi.fn();
    const response = await handler({ readEventOperationReceipt: read })(
      request(`event-operations/${operation}`),
    );
    expect(response.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });
  it("accepted receipt route preserves REPLAY_UNAVAILABLE when recovery is unconfigured", async () => {
    const response = await handler({ readEventOperationReceipt: undefined })(
      request(`canonical-event-operations/${operation}`),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty("error.code", "REPLAY_UNAVAILABLE");
  });
  it("capabilities fail closed for installed/missing state and even a hypothetical open DB gate", async () => {
    for (const value of [
      await canonicalCapabilities(false),
      await canonicalCapabilities(true),
      await canonicalCapabilities(true, { connection: connection() }),
      await canonicalCapabilities(true, {
        connection: {
          ...connection(),
          readInstalledState: async () => ({ commandVersion: 1, gateClosed: false }),
        },
      }),
    ]) {
      expect(canonicalCapabilitiesSchema.parse(value).enabledCommands).toEqual([]);
      expect(value.enabledScopes).toEqual([]);
      expect(value.enabledShapes).toEqual([]);
      expect(value.activationState).toBe("DISABLED");
    }
    expect(await canonicalCapabilities(false)).toMatchObject({
      canonicalEventReadVersion: null,
      maximumPrecision: null,
      gatewayAvailable: false,
    });
  });
  it("service_role cannot substitute for the reserved connection", async () => {
    const fake = { ...connection(), sessionUser: async () => "service_role" };
    expect(await canonicalCapabilities(true, { connection: fake })).toMatchObject({
      gatewayAvailable: false,
      eventCommandsVersion: null,
    });
    expect(fake.lookupExactReceipt).not.toHaveBeenCalled();
  });
});

it("real Supabase gateway reads only installed Event schema and leaves receipt runtime pending", async () => {
  const requests: { url: URL; method: string }[] = [];
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    requests.push({ url, method: init?.method ?? "GET" });
    if (url.pathname.endsWith("/itinerary_events"))
      return Response.json(url.searchParams.get("limit") === "0" ? [] : facts());
    return Response.json([{ id: trip }]);
  });
  try {
    const gateway = createSupabaseDevGateway({
      url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      secretKey: "test-only",
      publishableKey: "test-only",
    });
    expect(await gateway.readCanonicalCapabilities!(actor, trip)).toMatchObject({
      canonicalEventReadVersion: 1,
      enabledCommands: [],
      databaseGate: "UNKNOWN",
    });
    expect(await gateway.readCanonicalEvent!(actor, trip, event, "1")).toHaveProperty(
      "event",
      facts(),
    );
    await expect(
      gateway.readEventOperationReceipt!(actor, trip, operation),
    ).rejects.toMatchObject({ code: "REPLAY_UNAVAILABLE" });
    expect(requests.every(({ method }) => method === "GET")).toBe(true);
    expect(
      requests.some(({ url }) => /receipt|command_gate|ledger|source/.test(url.pathname)),
    ).toBe(false);
    const read = requests.find(
      ({ url }) =>
        url.pathname.endsWith("/itinerary_events") && url.searchParams.has("id"),
    )!.url;
    expect(read.searchParams.get("id")).toBe(`eq.${event}`);
    expect(read.searchParams.get("trip_id")).toBe(`eq.${trip}`);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("Supabase exact recovery uses only a dedicated connection; service identity never calls lookup", async () => {
  vi.stubGlobal("fetch", async () => Response.json([{ id: trip }]));
  const readConnection = connection();
  const config = {
    url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    secretKey: "test-only",
    publishableKey: "test-only",
  };
  try {
    const gateway = createSupabaseDevGateway({
      ...config,
      canonicalReadGateway: { connection: readConnection },
    });
    expect(
      await gateway.readEventOperationReceipt!(actor, trip, operation),
    ).toMatchObject({ projection: "STATUS_ONLY", committed_semantic_revision: 2 });
    expect(readConnection.lookupExactReceipt).toHaveBeenCalledWith(
      actor,
      trip,
      operation,
    );
    readConnection.lookupExactReceipt.mockClear();
    readConnection.sessionUser = async () => "service_role";
    await expect(
      gateway.readEventOperationReceipt!(actor, trip, operation),
    ).rejects.toMatchObject({ code: "REPLAY_UNAVAILABLE" });
    expect(readConnection.lookupExactReceipt).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
it("missing installed columns disable read capabilities and canonical targets cannot replay as v1 creates", async () => {
  let missing = true;
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/itinerary_events"))
      return missing
        ? Response.json({ code: "42703", message: "missing column" }, { status: 400 })
        : Response.json({
            id: event,
            trip_id: trip,
            created_by: actor,
            updated_at: "2026-10-04T00:00:00Z",
            temporal_contract_version: 1,
          });
    return Response.json([{ id: trip }]);
  });
  try {
    const gateway = createSupabaseDevGateway({
      url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      secretKey: "test-only",
      publishableKey: "test-only",
    });
    expect(await gateway.readCanonicalCapabilities!(actor, trip)).toMatchObject({
      canonicalEventReadVersion: null,
      readableShapes: [],
      enabledCommands: [],
    });
    missing = false;
    await expect(gateway.findItineraryItem(event)).rejects.toMatchObject({
      code: "CANONICAL_TARGET_REQUIRED",
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
