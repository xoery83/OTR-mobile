import { describe, expect, it, vi } from "vitest";

import { bootstrapApplication } from "./bootstrapApplication";

describe("foundation bootstrap", () => {
  it("initializes SQLite before entering an offline local session", async () => {
    const openDatabase = vi.fn().mockResolvedValue(undefined);
    const readLocalSession = vi.fn().mockResolvedValue({
      accessToken: "expired-access-token",
      refreshToken: "refresh-token",
      expiresAt: "2026-09-09T00:00:00.000Z",
    });

    await expect(
      bootstrapApplication({ openDatabase, readLocalSession }),
    ).resolves.toEqual({
      authState: "AUTHENTICATED_OFFLINE",
      syncStatus: "paused_auth",
    });
    expect(openDatabase).toHaveBeenCalledBefore(readLocalSession);
  });

  it("starts signed-out only when no local session exists", async () => {
    await expect(
      bootstrapApplication({
        openDatabase: vi.fn().mockResolvedValue(undefined),
        readLocalSession: vi.fn().mockResolvedValue(null),
      }),
    ).resolves.toMatchObject({
      authState: "SIGNED_OUT",
      syncStatus: "paused_auth",
    });
  });

  it("replays durable sync on restart without blocking cached access on failure", async () => {
    const resumeSync = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(
      bootstrapApplication({
        openDatabase: vi.fn().mockResolvedValue(undefined),
        readLocalSession: vi.fn().mockResolvedValue({
          accessToken: "valid-access-token",
          refreshToken: "refresh-token",
          expiresAt: "2099-09-09T00:00:00.000Z",
        }),
        resumeSync,
      }),
    ).resolves.toMatchObject({ authState: "AUTHENTICATED_OFFLINE" });
    expect(resumeSync).toHaveBeenCalledOnce();
  });

  it("schedules cold-start health without blocking App launch", async () => {
    let finish!: () => void;
    const scheduleHealth = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );

    await expect(
      bootstrapApplication({
        openDatabase: vi.fn().mockResolvedValue(undefined),
        readLocalSession: vi.fn().mockResolvedValue(null),
        scheduleHealth,
      }),
    ).resolves.toMatchObject({ authState: "SIGNED_OUT" });
    expect(scheduleHealth).toHaveBeenCalledOnce();
    finish();
  });
});

it("opens only the Guest workspace and never Account SQLite, legacy adoption, sync or health", async () => {
  const principal = {
    kind: "GUEST" as const,
    localId: "00000000-0000-4000-8000-000000000001",
  };
  const openDatabase = vi.fn(),
    readLocalSession = vi.fn(),
    adoptLegacyState = vi.fn(),
    resumeSync = vi.fn(),
    scheduleHealth = vi.fn();
  const openGuestWorkspace = vi.fn(async () => {});
  const pauseSync = vi.fn(async () => {});
  const result = await bootstrapApplication({
    readAuthSnapshot: async () => ({ session: null, principal }),
    openGuestWorkspace,
    pauseSync,
    openDatabase,
    readLocalSession,
    adoptLegacyState,
    resumeSync,
    scheduleHealth,
  });
  expect(result).toEqual({
    authState: "SIGNED_OUT",
    syncStatus: "paused_auth",
    principal,
  });
  expect(openGuestWorkspace).toHaveBeenCalledOnce();
  expect(pauseSync).toHaveBeenCalledBefore(openGuestWorkspace);
  for (const forbidden of [
    openDatabase,
    readLocalSession,
    adoptLegacyState,
    resumeSync,
    scheduleHealth,
  ])
    expect(forbidden).not.toHaveBeenCalled();
});

it("does not choose a new Guest or open an Account vault for a previously signed-out installation", async () => {
  const openDatabase = vi.fn(),
    readLocalSession = vi.fn(),
    openGuestWorkspace = vi.fn(),
    resumeSync = vi.fn(),
    scheduleHealth = vi.fn();
  const result = await bootstrapApplication({
    readAuthSnapshot: async () => ({ session: null, principal: { kind: "SIGNED_OUT" } }),
    openDatabase,
    readLocalSession,
    openGuestWorkspace,
    resumeSync,
    scheduleHealth,
  });
  expect(result.principal).toEqual({ kind: "SIGNED_OUT" });
  for (const forbidden of [
    openDatabase,
    readLocalSession,
    openGuestWorkspace,
    resumeSync,
    scheduleHealth,
  ])
    expect(forbidden).not.toHaveBeenCalled();
});

it("keeps Guest initialization failure closed without opening another principal's database", async () => {
  const openDatabase = vi.fn(),
    resumeSync = vi.fn(),
    scheduleHealth = vi.fn();
  await expect(
    bootstrapApplication({
      readAuthSnapshot: async () => ({
        session: null,
        principal: { kind: "GUEST", localId: "guest" },
      }),
      openDatabase,
      readLocalSession: vi.fn(),
      resumeSync,
      scheduleHealth,
      openGuestWorkspace: async () => {
        throw Error("DISK_UNAVAILABLE");
      },
    }),
  ).rejects.toThrow("DISK_UNAVAILABLE");
  for (const forbidden of [openDatabase, resumeSync, scheduleHealth])
    expect(forbidden).not.toHaveBeenCalled();
});
