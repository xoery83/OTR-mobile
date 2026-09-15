import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readLocalSession: vi.fn(),
  refreshSession: vi.fn(),
  runSync: vi.fn(),
}));

vi.mock("@/data/auth/authRepository", () => ({
  readLocalSession: mocks.readLocalSession,
}));
vi.mock("@/data/auth/devSupabaseAuth", () => ({
  revalidateStoredSupabaseDevSession: mocks.refreshSession,
}));
vi.mock("@/data/db/database", () => ({ openDatabase: vi.fn() }));
vi.mock("@/data/sync/ledgerOperationalSync", () => ({
  runLedgerOperationalSync: mocks.runSync,
}));
vi.mock("@/data/sync/transportSelection", () => ({
  getSyncTransportMode: () => "dev",
}));
vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn() },
}));

describe("default bootstrap sync", () => {
  it("refreshes an expired Dev session before operational sync", async () => {
    const { defaultBootstrapDependencies } =
      await import("./defaultBootstrapDependencies");
    mocks.readLocalSession.mockResolvedValue({
      accessToken: "expired",
      refreshToken: "refresh-token",
      expiresAt: "2000-01-01T00:00:00.000Z",
    });

    await defaultBootstrapDependencies.resumeSync?.();

    expect(mocks.refreshSession).toHaveBeenCalledOnce();
    expect(mocks.refreshSession).toHaveBeenCalledBefore(mocks.runSync);
  });
});
