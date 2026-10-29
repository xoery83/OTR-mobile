import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { createNativeNormalTripSyncRunner } from "./tripNormalCoordinator";
const accountId = "10000000-0000-4000-8000-000000000001",
  tripId = "10000000-0000-4000-8000-000000000002",
  itemId = "10000000-0000-4000-8000-000000000003";
const f = vi.hoisted(() => ({
  pending: vi.fn(),
  graph: vi.fn(),
  proven: vi.fn(),
  choose: null as
    null | ((trip: string, item: string, family: string) => Promise<boolean>),
  database: {},
}));
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: async () => accountId }));
vi.mock("../db/database", () => ({ readInitializedDatabase: async () => f.database }));
vi.mock("../repositories/tripRepository", () => ({
  readLocalTripRepository: async () => ({}),
}));
vi.mock("../repositories/tripCoreV2Repository", () => ({
  createTripCoreV2Repository: () => ({
    captureContext: (id: string) =>
      captureAccountRequestContext(id, async () => accountId),
    pending: f.pending,
    readGraph: f.graph,
  }),
}));
vi.mock("../repositories/acceptedManualCreate", () => ({
  hasAcceptedManualCreate: f.proven,
}));
vi.mock("./tripNormalSync", () => ({
  createNormalTripSyncWake: (deps: any) => {
    f.choose = deps.isManualItem;
    return async () => ({ status: "ready", runnerCalls: 0 });
  },
}));
it.each(["MANUAL", "REVIEWED_SOURCE"])(
  "P2 pending SparseCreate dispatch requires MANUAL, actual mode %s",
  async (mode) => {
    f.pending.mockResolvedValue([
      {
        command: {
          command: "CREATE_SPARSE_FLIGHT",
          target: { id: itemId },
          admission: { mode },
        },
      },
    ]);
    f.graph.mockResolvedValue({ itinerary_events: [], trip_flight_intents: [] });
    f.proven.mockResolvedValue(false);
    await createNativeNormalTripSyncRunner(
      { accountId, newTripsFrom: "2026-10-29T00:00:00Z" },
      () => true,
    )("AUTHENTICATED_ONLINE");
    expect(await f.choose!(tripId, itemId, "P2")).toBe(mode === "MANUAL");
  },
);
it.each(["own", "Source", "Qualified", "foreign", "Service", "ActiveBooking"])(
  "P2 accepted dispatcher requires matching Creator/SPARSE/immutable Manual proof: %s",
  async (kind) => {
    f.pending.mockResolvedValue([]);
    f.proven.mockResolvedValue(kind !== "Source");
    f.graph.mockResolvedValue({
      itinerary_events: [
        {
          id: itemId,
          experience_family: "P2",
          owner_account_id: kind === "foreign" ? tripId : accountId,
        },
      ],
      itinerary_transport_services: kind === "Service" ? [{ event_id: itemId }] : [],
      trip_booking_item_links:
        kind === "ActiveBooking" ? [{ item_id: itemId, active: true }] : [],
      trip_flight_intents: [
        {
          event_id: itemId,
          qualification: kind === "Qualified" ? "QUALIFIED" : "SPARSE",
        },
      ],
    });
    await createNativeNormalTripSyncRunner(
      { accountId, newTripsFrom: "2026-10-29T00:00:00Z" },
      () => true,
    )("AUTHENTICATED_ONLINE");
    expect(await f.choose!(tripId, itemId, "P2")).toBe(kind === "own");
  },
);
