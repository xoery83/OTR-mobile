import { describe, expect, it, vi } from "vitest";

import {
  authenticateToSupabaseDev,
  revalidateStoredSupabaseDevSession,
  signInToSupabaseDev,
} from "./devSupabaseAuth";

vi.mock("@/data/auth/authRepository", () => ({
  clearLocalSession: vi.fn(),
  readLocalSession: vi.fn(),
  writeLocalSession: vi.fn(),
}));

describe("Supabase Dev Auth adapter", () => {
  it("exchanges credentials through the approved Dev Auth endpoint and persists tokens", async () => {
    const persistSession = vi.fn();
    const fetchImplementation = vi.fn(async () =>
      Response.json({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "dev@example.test",
          user_metadata: { display_name: "Dev User" },
        },
      }),
    );

    await signInToSupabaseDev("dev@example.test", "password", {
      url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      publishableKey: "publishable-key",
      fetchImplementation,
      persistSession,
    });

    expect(fetchImplementation).toHaveBeenCalledWith(
      expect.stringContaining("/auth/v1/token?grant_type=password"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "publishable-key" }),
      }),
    );
    expect(persistSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        identity: {
          userId: "00000000-0000-4000-8000-000000000001",
          displayName: "Dev User",
          email: "dev@example.test",
        },
      }),
    );
  });

  it("rejects every Supabase project except the approved Dev project", async () => {
    await expect(
      signInToSupabaseDev("dev@example.test", "password", {
        url: "https://bobwhxjxqpehzecwmwqe.supabase.co",
        publishableKey: "publishable-key",
        fetchImplementation: vi.fn(),
        persistSession: vi.fn(),
      }),
    ).rejects.toThrow("approved Supabase Dev project");
  });

  it("can authenticate without replacing the active session before the switch boundary", async () => {
    const persistSession = vi.fn();
    const result = await authenticateToSupabaseDev("dev@example.test", "password", {
      url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      publishableKey: "publishable-key",
      fetchImplementation: vi.fn(async () =>
        Response.json({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          user: {
            id: "00000000-0000-4000-8000-000000000001",
            email: "dev@example.test",
          },
        }),
      ),
      persistSession,
    });

    expect(result.identity?.userId).toBe("00000000-0000-4000-8000-000000000001");
    expect(persistSession).not.toHaveBeenCalled();
  });

  it("silently refreshes a stored Dev session when network is available", async () => {
    const persistSession = vi.fn();
    const fetchImplementation = vi.fn(async () =>
      Response.json({
        access_token: "renewed-access-token",
        refresh_token: "renewed-refresh-token",
        expires_in: 3600,
      }),
    );

    await expect(
      revalidateStoredSupabaseDevSession({
        url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
        publishableKey: "publishable-key",
        readSession: vi.fn().mockResolvedValue({
          accessToken: "expired",
          refreshToken: "stored-refresh-token",
          expiresAt: "2026-09-10T00:00:00.000Z",
          identity: {
            userId: "00000000-0000-4000-8000-000000000001",
            displayName: "Dev User",
            email: "dev@example.test",
          },
        }),
        fetchImplementation,
        persistSession,
      }),
    ).resolves.toBe(true);

    expect(fetchImplementation).toHaveBeenCalledWith(
      expect.stringContaining("grant_type=refresh_token"),
      expect.objectContaining({
        body: JSON.stringify({ refresh_token: "stored-refresh-token" }),
      }),
    );
    expect(persistSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "renewed-access-token",
        identity: expect.objectContaining({ displayName: "Dev User" }),
      }),
    );
  });
});
