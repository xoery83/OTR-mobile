import { beforeEach, expect, it, vi } from "vitest";
import type { createAuthRepository } from "../auth/authSessionRepository";

const state = vi.hoisted(() => ({
  repo: null as ReturnType<typeof createAuthRepository> | null,
  values: new Map<string, string>(),
  set: vi.fn(),
  del: vi.fn(),
  guest: vi.fn(),
  network: vi.fn(),
  database: vi.fn(),
}));
vi.mock("../auth/authRepository", () => ({
  readCommittedLocalPrincipal: () => state.repo!.readCommittedLocalPrincipal(),
  readCommittedLocalSession: () => state.repo!.readAdoptedLocalSession(),
  requireAdoptedUserId: async () => {
    const session = await state.repo!.readAdoptedLocalSession();
    if (!session?.identity) throw Error("ACCOUNT_REQUIRED");
    return session.identity.userId;
  },
  readLocalAuthSnapshot: () => {
    throw Error("FORBIDDEN_IDENTITY_CHOOSER");
  },
  readLocalSession: () => {
    throw Error("FORBIDDEN_SESSION_MIGRATION");
  },
}));
vi.mock("./nativeTripQaScope", () => ({ isGeneralAccountCloudSyncEnabled: () => true }));
vi.mock("react-native", () => ({ AppState: { currentState: "active" } }));
vi.mock("expo-network", () => ({ getNetworkStateAsync: state.network }));
vi.mock("../db/database", () => ({ readInitializedDatabase: state.database }));
vi.mock("./ledgerOperationalSync", () => ({ notifyLedgerReadCompletion: vi.fn() }));

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  state.values.clear();
  const { createAuthRepository } = await import("../auth/authSessionRepository");
  state.repo = createAuthRepository(
    {
      getItem: async (key) => state.values.get(key) ?? null,
      setItem: async (key, value) => {
        state.set(key, value);
        state.values.set(key, value);
      },
      deleteItem: async (key) => {
        state.del(key);
        state.values.delete(key);
      },
    },
    () => {
      state.guest();
      throw Error("GUEST_CREATION_FORBIDDEN");
    },
  );
});

it.each(["fresh", "legacy", "corrupt-index"])(
  "default Downstream wiring never selects or migrates %s identity",
  async (kind) => {
    if (kind === "legacy")
      state.values.set(
        "otr.mobile.session.v1",
        JSON.stringify({ accessToken: "synthetic-only-legacy" }),
      );
    if (kind === "corrupt-index") state.values.set("otr.mobile.accounts.v2", "{");
    const before = [...state.values];
    const { refreshAccountTripReads, refreshTripFromCloud } =
      await import("./tripDownstreamCoordinator");
    await refreshAccountTripReads();
    await refreshTripFromCloud("b61a0000-0061-4000-8000-000000000001");
    expect([...state.values]).toEqual(before);
    expect(state.set).not.toHaveBeenCalled();
    expect(state.del).not.toHaveBeenCalled();
    expect(state.guest).not.toHaveBeenCalled();
    expect(state.network).not.toHaveBeenCalled();
    expect(state.database).not.toHaveBeenCalled();
  },
);
