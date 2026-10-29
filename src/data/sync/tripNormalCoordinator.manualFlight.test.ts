import { advanceAccountGeneration } from "../auth/accountGeneration";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { createNativeNormalTripSyncRunner } from "./tripNormalCoordinator";
const accountId = "10000000-0000-4000-8000-000000000001",
  tripId = "10000000-0000-4000-8000-000000000002",
  itemId = "10000000-0000-4000-8000-000000000003";
const f = vi.hoisted(() => ({
  pending: vi.fn(),
  getTrip: vi.fn(),
  ensure: vi.fn(),
  create: vi.fn(),
  reactivate: vi.fn(),
  runCreate: null as null | ((target: any) => Promise<unknown>),
  graph: vi.fn(),
  proven: vi.fn(),
  choose: null as
    null | ((trip: string, item: string, family: string) => Promise<boolean>),
  database: {},
}));
vi.mock("./syncOperationRepository", () => ({
  createSyncOperationRepository: () => ({ reactivateLongLivedFailures: f.reactivate }),
}));
vi.mock("../auth/accountProfileRepository", () => ({
  createAccountProfileRepository: () => ({ ensure: f.ensure }),
}));
vi.mock("./tripCreateCoordinator", () => ({
  createNativeTripCreateSyncRunner:
    (...args: unknown[]) =>
    async () =>
      f.create(...args),
}));
vi.mock("../auth/authRepository", () => ({ requireActiveUserId: async () => accountId }));
vi.mock("../db/database", () => ({ readInitializedDatabase: async () => f.database }));
vi.mock("../repositories/tripRepository", () => ({
  readLocalTripRepository: async () => ({ getTrip: f.getTrip }),
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
    f.runCreate = deps.runCreate;
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

it.each(["pending", "accepted", "failed"])(
  "normal Trip %s bootstraps only its own Profile before Create",
  async (kind) => {
    f.ensure.mockReset();
    f.create.mockReset();
    f.getTrip.mockResolvedValue({ serverId: kind === "accepted" ? tripId : null });
    if (kind === "failed")
      f.ensure.mockRejectedValue(new Error("ACCOUNT_PROFILE_UNAVAILABLE"));
    else f.ensure.mockResolvedValue({ accountId, ready: true });
    await createNativeNormalTripSyncRunner(
      { accountId, newTripsFrom: "2026-10-29T00:00:00Z" },
      () => true,
    )("AUTHENTICATED_ONLINE");
    const target = { accountId, tripId, operationId: itemId };
    if (kind === "failed") {
      await expect(f.runCreate!(target)).rejects.toThrow("ACCOUNT_PROFILE_UNAVAILABLE");
      expect(f.create).not.toHaveBeenCalled();
    } else {
      await f.runCreate!(target);
      expect(f.create).toHaveBeenCalledWith(target, expect.any(Function));
    }
    if (kind === "accepted") expect(f.ensure).not.toHaveBeenCalled();
    else expect(f.ensure).toHaveBeenCalledWith(expect.objectContaining({ accountId }));
    if (kind === "pending")
      expect(f.ensure.mock.invocationCallOrder[0]).toBeLessThan(
        f.create.mock.invocationCallOrder[0],
      );
  },
);

it.each(["generation", "closed"])(
  "does not dispatch Trip after profile preflight changes %s",
  async (kind) => {
    let enabled = true;
    f.create.mockReset();
    f.ensure.mockReset();
    f.getTrip.mockResolvedValue({ serverId: null });
    await createNativeNormalTripSyncRunner(
      { accountId, newTripsFrom: "2026-10-29T00:00:00Z" },
      () => enabled,
    )("AUTHENTICATED_ONLINE");
    f.ensure.mockImplementation(async () => {
      if (kind === "generation") advanceAccountGeneration();
      else enabled = false;
      return { accountId, ready: true };
    });
    await expect(
      f.runCreate!({ accountId, tripId, operationId: itemId }),
    ).rejects.toThrow(
      kind === "generation" ? "Account changed" : "TRIP_SYNC_PORT_CLOSED",
    );
    expect(f.create).not.toHaveBeenCalled();
  },
);

it.each([false, true])(
  "only explicit manual retry %s releases the exact selected Create backoff",
  async (retry) => {
    f.ensure.mockReset();
    f.ensure.mockResolvedValue({ accountId, ready: true });
    f.create.mockReset();
    f.reactivate.mockReset();
    f.reactivate.mockResolvedValue(undefined);
    f.getTrip.mockResolvedValue({ serverId: null });
    await createNativeNormalTripSyncRunner(
      { accountId, newTripsFrom: "2026-10-29T00:00:00Z" },
      () => true,
      retry,
    )("AUTHENTICATED_ONLINE");
    await f.runCreate!({ accountId, tripId, operationId: itemId });
    expect(f.reactivate).toHaveBeenCalledTimes(retry ? 1 : 0);
    if (retry)
      expect(f.reactivate.mock.invocationCallOrder[0]).toBeLessThan(
        f.create.mock.invocationCallOrder[0],
      );
  },
);
