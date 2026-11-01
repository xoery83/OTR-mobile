import { beforeEach, expect, it, vi } from "vitest";
import type { AccountRequestContext } from "../auth/accountRequestContext";
const f = vi.hoisted(() => ({
  enabled: false,
  active: "active",
  online: true,
  guest: false,
  mismatch: false,
  accountId: "b61a0000-0061-4000-8000-000000000001",
  subscribe: vi.fn(),
  factory: vi.fn(),
  activate: vi.fn(async (_context: AccountRequestContext) => {}),
  stop: vi.fn(),
  account: vi.fn(),
  principal: vi.fn(),
  session: vi.fn(),
  network: vi.fn(),
}));
vi.mock("./tripPrivateSubscription", () => ({
  get tripPrivateSubscription() {
    return f.enabled ? f.subscribe : undefined;
  },
}));
vi.mock("./tripRealtimeTrigger", () => ({ createTripRealtimeTrigger: f.factory }));
vi.mock("../auth/authRepository", () => ({
  requireAdoptedUserId: f.account,
  readCommittedLocalPrincipal: f.principal,
  readCommittedLocalSession: f.session,
}));
vi.mock("./nativeTripQaScope", () => ({ isGeneralAccountCloudSyncEnabled: () => true }));
vi.mock("expo-network", () => ({ getNetworkStateAsync: f.network }));
vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return f.active;
    },
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  Object.assign(f, {
    enabled: false,
    active: "active",
    online: true,
    guest: false,
    mismatch: false,
    accountId: "b61a0000-0061-4000-8000-000000000001",
  });
  f.account.mockImplementation(async () => f.accountId);
  f.principal.mockImplementation(async () =>
    f.guest ? { kind: "GUEST" } : { kind: "ACCOUNT", accountId: f.accountId },
  );
  f.session.mockImplementation(async () => ({
    identity: { userId: f.mismatch ? "other" : f.accountId },
  }));
  f.network.mockImplementation(async () => ({
    isConnected: f.online,
    isInternetReachable: f.online,
  }));
  f.factory.mockReturnValue({ activate: f.activate, stop: f.stop, dispose: vi.fn() });
});
const target = (generation = 0, tripId = "b61a0000-0061-4000-8000-000000000002") => ({
  accountId: f.accountId,
  generation,
  tripId,
});

it("default closed mount never constructs a channel or reads identity/network", async () => {
  const api = await import("./tripDownstreamCoordinator");
  api.setTripRealtimeActive(true);
  const close = api.observeForegroundTrip(target());
  await api.refreshTripRealtimeSubscription();
  close();
  expect(f.factory).not.toHaveBeenCalled();
  expect(f.account).not.toHaveBeenCalled();
  expect(f.principal).not.toHaveBeenCalled();
  expect(f.session).not.toHaveBeenCalled();
  expect(f.network).not.toHaveBeenCalled();
});

it("foreground scope mounts the fixture port and pause stops it synchronously", async () => {
  f.enabled = true;
  const api = await import("./tripDownstreamCoordinator");
  const context = target();
  api.observeForegroundTrip(context);
  expect(f.factory).not.toHaveBeenCalled();
  api.setTripRealtimeActive(true);
  await api.refreshTripRealtimeSubscription();
  expect(f.factory).toHaveBeenCalledOnce();
  expect(f.factory.mock.calls[0][0].subscribe).toBe(f.subscribe);
  expect(f.activate).toHaveBeenLastCalledWith(context);
  api.setTripRealtimeActive(false);
  expect(f.stop).toHaveBeenCalledOnce();
  const before = f.activate.mock.calls.length;
  await api.refreshTripRealtimeSubscription();
  expect(f.activate).toHaveBeenCalledTimes(before);
});

it("late Trip A setup/cleanup cannot activate or stop Trip B", async () => {
  f.enabled = true;
  const api = await import("./tripDownstreamCoordinator");
  api.setTripRealtimeActive(true);
  const a = target(),
    b = target(0, "b61a0000-0061-4000-8000-000000000003");
  const closeA = api.observeForegroundTrip(a),
    closeB = api.observeForegroundTrip(b);
  await api.refreshTripRealtimeSubscription();
  expect(f.activate.mock.calls.length).toBeGreaterThan(0);
  expect(f.activate.mock.calls.every(([context]) => context.tripId === b.tripId)).toBe(
    true,
  );
  const stopped = f.stop.mock.calls.length;
  closeA();
  expect(f.stop).toHaveBeenCalledTimes(stopped);
  closeB();
  expect(f.stop).toHaveBeenCalledTimes(stopped + 1);
});

it("Account generation synchronously stops the old channel and rejects its target", async () => {
  f.enabled = true;
  const api = await import("./tripDownstreamCoordinator");
  const { advanceAccountGeneration } = await import("../auth/accountGeneration");
  api.setTripRealtimeActive(true);
  api.observeForegroundTrip(target());
  await api.refreshTripRealtimeSubscription();
  const before = f.activate.mock.calls.length;
  advanceAccountGeneration();
  expect(f.stop).toHaveBeenCalled();
  api.observeForegroundTrip(target());
  await api.refreshTripRealtimeSubscription();
  expect(f.activate).toHaveBeenCalledTimes(before);
  f.accountId = "b61a0000-0061-4000-8000-000000000004";
  const next = target(1);
  api.observeForegroundTrip(next);
  await api.refreshTripRealtimeSubscription();
  expect(f.activate).toHaveBeenLastCalledWith(next);
});

it("availability reuses committed Account/Session/network predicates, not identity selection", async () => {
  f.enabled = true;
  const api = await import("./tripDownstreamCoordinator");
  api.setTripRealtimeActive(true);
  api.observeForegroundTrip(target());
  await api.refreshTripRealtimeSubscription();
  const available = f.factory.mock.calls[0][0].available;
  f.guest = true;
  expect(await available()).toBe(false);
  f.guest = false;
  f.mismatch = true;
  expect(await available()).toBe(false);
  expect(f.network).not.toHaveBeenCalled();
  f.mismatch = false;
  expect(await available()).toBe(true);
  f.online = false;
  expect(await available()).toBe(false);
  f.active = "background";
  expect(await available()).toBe(false);
  api.setTripRealtimeActive(false);
  expect(await available()).toBe(false);
});
