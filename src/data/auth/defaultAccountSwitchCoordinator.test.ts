import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultAccountSwitchCoordinator } from "./defaultAccountSwitchCoordinator";
import { advanceAccountGeneration } from "./accountGeneration";
import { ApiClientError } from "@/data/api/client";

const mocks = vi.hoisted(() => ({
  network: vi.fn(),
  token: vi.fn(),
  revoke: vi.fn(),
  clear: vi.fn(),
  pause: vi.fn(),
  restart: vi.fn(),
  session: {
    accessToken: "access-a",
    refreshToken: "refresh-a",
    expiresAt: null,
    identity: { userId: "A", displayName: "QA", email: null },
  },
}));
vi.mock("expo-network", () => ({ getNetworkStateAsync: mocks.network }));
vi.mock("./sessionAccessToken", () => ({ sessionAccessToken: mocks.token }));
vi.mock("./devSupabaseAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./devSupabaseAuth")>()),
  revokeSupabaseDevSession: mocks.revoke,
}));
vi.mock("./authRepository", () => ({
  clearLocalSession: mocks.clear,
  readLocalSession: async () => mocks.session,
  selectLocalAccount: vi.fn(),
  writeLocalSession: vi.fn(),
}));
vi.mock("./accountLocalState", () => ({ adoptLegacyAccountState: vi.fn() }));
vi.mock("@/data/db/database", () => ({ openDatabase: vi.fn() }));
vi.mock("@/data/bootstrap/defaultBootstrapDependencies", () => ({
  pauseOperationalSync: mocks.pause,
  restartOperationalSync: mocks.restart,
  bootstrapActivatedAccount: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.network.mockResolvedValue({ isConnected: true, isInternetReachable: true });
  mocks.token.mockResolvedValue({ token: "fresh-own-session-token", userId: "A" });
  mocks.revoke.mockResolvedValue(undefined);
});

describe("normal Account logout composition", () => {
  it("refreshes only the captured Account and revokes remotely before removing local credentials", async () => {
    const coordinator = createDefaultAccountSwitchCoordinator({
      clearInMemoryState: vi.fn(),
    });
    await coordinator.logout();
    expect(mocks.token).toHaveBeenCalledWith({ expectedUserId: "A" });
    expect(mocks.revoke).toHaveBeenCalledWith("fresh-own-session-token");
    expect(mocks.revoke).toHaveBeenCalledBefore(mocks.clear);
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
  it("does not revoke or clear when connectivity is unknown", async () => {
    mocks.network.mockResolvedValue({ isConnected: true, isInternetReachable: null });
    await expect(
      createDefaultAccountSwitchCoordinator({ clearInMemoryState: vi.fn() }).logout(),
    ).rejects.toThrow("LOGOUT_REQUIRES_ONLINE");
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("retains local access on an uncertain remote logout", async () => {
    mocks.revoke.mockRejectedValueOnce(new Error("unknown remote outcome"));
    await expect(
      createDefaultAccountSwitchCoordinator({ clearInMemoryState: vi.fn() }).logout(),
    ).rejects.toThrow("unknown remote outcome");
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.restart).toHaveBeenCalledOnce();
  });
  it("allows explicit online logout after the server already rejected the refresh session", async () => {
    mocks.token.mockRejectedValueOnce(
      new ApiClientError("Rejected", "http", 401, "AUTH_REQUIRED"),
    );
    await createDefaultAccountSwitchCoordinator({ clearInMemoryState: vi.fn() }).logout();
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
  it("does not send a late token after another Account generation takes over", async () => {
    mocks.token.mockImplementationOnce(async () => {
      advanceAccountGeneration();
      return { token: "late-token", userId: "A" };
    });
    await expect(
      createDefaultAccountSwitchCoordinator({ clearInMemoryState: vi.fn() }).logout(),
    ).rejects.toThrow("Account changed");
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
});
