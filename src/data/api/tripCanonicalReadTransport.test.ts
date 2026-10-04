import { expect, it, vi } from "vitest";
import { createTripCanonicalReadTransport } from "./tripCanonicalReadTransport";
import {
  beginAccountTransition,
  endAccountTransition,
  withAccountApplyGate,
} from "@/data/auth/accountRequestContext";
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const trip = "10000000-0000-4000-8000-000000000001";
const otherTrip = "10000000-0000-4000-8000-000000000002";
const actor = "20000000-0000-4000-8000-000000000001";
const event = "30000000-0000-4000-8000-000000000001";
const withheld = {
  readVersion: 1,
  disposition: "WITHHELD",
  reason: "UNSUPPORTED_CONTRACT",
};
const token = async () => ({ userId: actor, token: "test-token" });
it("preserves explicit withholding and captures the Trip before credential resolution", async () => {
  const send = vi.fn(async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    expect(url).toBe(`http://local/v2/trips/${trip}/canonical-events/${event}`);
    expect(init?.headers).toMatchObject({
      "X-OTR-Canonical-Event-Read-Version": "1",
      Authorization: "Bearer test-token",
    });
    return Response.json(withheld);
  });
  const transport = createTripCanonicalReadTransport(
    async () => actor,
    { baseUrl: "http://local", fetchImplementation: send },
    token,
  );
  expect(await transport.event(trip, event)).toMatchObject({
    context: { accountId: actor, tripId: trip },
    data: withheld,
  });
});
it("A→B→A cannot return a stale response; the account apply gate stays free during network I/O", async () => {
  let release!: (response: Response) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  let account = actor;
  const transport = createTripCanonicalReadTransport(
    async () => account,
    {
      baseUrl: "http://local",
      fetchImplementation: async () => {
        entered();
        return pending;
      },
    },
    token,
  );
  const response = transport.event(trip, event);
  await started;
  await withAccountApplyGate(async () => {});
  let lease = await beginAccountTransition();
  account = "B";
  endAccountTransition(lease);
  lease = await beginAccountTransition();
  account = actor;
  endAccountTransition(lease);
  release(Response.json(withheld));
  await expect(response).rejects.toThrow("Account changed");
});
it("rejects a foreign Trip/Actor receipt and creates no persistent apply", async () => {
  const operation = "40000000-0000-4000-8000-000000000001";
  const receipt = {
    projection: "STATUS_ONLY",
    trip_id: otherTrip,
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
    committed_at: "2026-12-17T06:00:00.123456Z",
  };
  const transport = createTripCanonicalReadTransport(
    async () => actor,
    {
      baseUrl: "http://local",
      fetchImplementation: async (url) => {
        expect(url).toBe(
          `http://local/v2/trips/${trip}/canonical-event-operations/${operation}`,
        );
        return Response.json(receipt);
      },
    },
    token,
  );
  await expect(transport.receipt(trip, operation)).rejects.toThrow("scope mismatch");
  receipt.trip_id = trip;
  receipt.actor_account_id = event;
  await expect(transport.receipt(trip, operation)).rejects.toThrow("scope mismatch");
});

it("Mobile Event transport retains all source microseconds and rejects a foreign Event scope", async () => {
  const { canonicalEventFactsSchema } = await import("./tripCanonicalReadContracts");
  const facts = {
    ...Object.fromEntries(
      Object.keys(canonicalEventFactsSchema.shape).map((key) => [key, null]),
    ),
    id: event,
    trip_id: trip,
    temporal_contract_version: 1,
    temporal_shape: "POINT",
    semantic_revision: 5,
    title: "Source instant",
    event_type: "activity",
    status: "planned",
    participant_scope: "UNASSIGNED",
    is_estimated_time: false,
    planned_start: "2026-12-17T06:00:00.123456Z",
    start_source_instant: "2026-12-17T06:00:00.123456Z",
    start_source_instant_precision: 6,
    start_quality: "EXACT",
    start_basis: "SOURCE_INSTANT",
    start_provenance_refs: { source_instant: "otr-event/confirmation/instant" },
    location_input_revision: 1,
    itinerary_transport_endpoints: [],
  };
  const data = {
    readVersion: 1,
    disposition: "READ_ONLY",
    legacyCompatible: false,
    event: facts,
  };
  const transport = createTripCanonicalReadTransport(
    async () => actor,
    { baseUrl: "http://local", fetchImplementation: async () => Response.json(data) },
    token,
  );
  expect((await transport.event(trip, event)).data).toEqual(data);
  facts.trip_id = otherTrip;
  await expect(transport.event(trip, event)).rejects.toThrow("scope mismatch");
});
