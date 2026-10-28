import { beforeEach, expect, it, vi } from "vitest";
import {
  createDefaultManualPlanRepository,
  readLocalTripRepository,
  readTripDayFeed,
  kickLocalTripSync,
} from "./localTripAccess";
import type { LaunchIdentity } from "./guestPrincipalRepository";
const state = vi.hoisted(() => ({
  principal: null as LaunchIdentity | null,
  guest: vi.fn(),
  accountTrips: vi.fn(),
  accountDays: vi.fn(),
  accountPlan: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("./authRepository", () => ({
  readCommittedLocalPrincipal: async () => state.principal,
}));
vi.mock("./guestLocalWorkspace", () => ({ openGuestLocalWorkspace: state.guest }));
vi.mock("../repositories/tripRepository", () => ({
  readLocalTripRepository: state.accountTrips,
}));
vi.mock("../repositories/tripDayFeedRepository", () => ({
  readTripDayFeed: state.accountDays,
}));
vi.mock("../repositories/manualPlanRepository", () => ({
  createDefaultManualPlanRepository: state.accountPlan,
}));
vi.mock("../sync/nativeTripQaScope", () => ({ kickNativeTripQaSync: state.sync }));
beforeEach(() => {
  vi.clearAllMocks();
  state.principal = null;
});
it("selects only injected Guest local capabilities, preserving the owning P1 repository instance", async () => {
  state.principal = { kind: "GUEST", localId: "guest-local" };
  const trips = {},
    days = {},
    plan = {};
  state.guest.mockResolvedValue({ trips, days, plan });
  expect(await readLocalTripRepository()).toBe(trips);
  expect(await readTripDayFeed()).toBe(days);
  expect(await createDefaultManualPlanRepository()).toBe(plan);
  await kickLocalTripSync();
  for (const forbidden of [
    state.accountTrips,
    state.accountDays,
    state.accountPlan,
    state.sync,
  ])
    expect(forbidden).not.toHaveBeenCalled();
});
it("preserves the normal Account factories and normal sync trigger", async () => {
  state.principal = { kind: "ACCOUNT", accountId: "same-id" };
  await readLocalTripRepository();
  await readTripDayFeed();
  await createDefaultManualPlanRepository();
  await kickLocalTripSync();
  expect(state.guest).not.toHaveBeenCalled();
  for (const allowed of [
    state.accountTrips,
    state.accountDays,
    state.accountPlan,
    state.sync,
  ])
    expect(allowed).toHaveBeenCalledOnce();
});
it("does not fall back to Account access for a signed-out, unchosen or failing Guest", async () => {
  for (const principal of [null, { kind: "SIGNED_OUT" as const }]) {
    state.principal = principal;
    await expect(readLocalTripRepository()).rejects.toThrow(
      "LOCAL_TRIP_PRINCIPAL_REQUIRED",
    );
    await expect(readTripDayFeed()).rejects.toThrow();
    await expect(createDefaultManualPlanRepository()).rejects.toThrow();
  }
  state.principal = { kind: "GUEST", localId: "guest-local" };
  state.guest.mockRejectedValue(Error("GUEST_STORAGE_FAILURE"));
  await expect(readLocalTripRepository()).rejects.toThrow("GUEST_STORAGE_FAILURE");
  for (const forbidden of [state.accountTrips, state.accountDays, state.accountPlan])
    expect(forbidden).not.toHaveBeenCalled();
});
