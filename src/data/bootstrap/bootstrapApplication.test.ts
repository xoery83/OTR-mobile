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
});
