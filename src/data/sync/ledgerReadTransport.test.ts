import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/data/api/client";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import type { LocalSession } from "@/domain/auth/localSession";
import { createLedgerReadTransport } from "./ledgerReadTransport";
vi.mock("@/data/auth/authRepository", () => ({ readLocalSession: vi.fn() }));
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const account = "30000000-0000-4000-8000-000000000001";
const trip = "10000000-0000-4000-8000-000000000001";
describe("shared transport response fence", () => {
  it.each([false, true])(
    "rejects a parsed delayed response after Account change, return to A=%s",
    async (returnToA) => {
      let active = account;
      const readSession = async (): Promise<LocalSession> => ({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: "2099-01-01T00:00:00Z",
        identity: { userId: active, displayName: "A", email: "a@example.test" },
      });
      const context = await captureAccountRequestContext(trip, async () => active);
      const send = vi.fn(async () => {
        advanceAccountGeneration();
        active = "other";
        if (returnToA) {
          advanceAccountGeneration();
          active = account;
        }
        return Response.json({
          changes: [],
          cursor: "legacy",
          hasMore: false,
          serverTime: "2026-10-04T00:00:00Z",
          reviewProtocol: 2,
          reviewFindings: [],
          reviewActions: [],
        });
      });
      const transport = createLedgerReadTransport({
        readSession,
        createClient: (token) =>
          createApiClient({
            baseUrl: "https://example.test",
            accessToken: token,
            fetchImplementation: send,
          }),
      });
      await expect(transport.pull(trip, "legacy", context)).rejects.toThrow(
        "Account changed",
      );
      expect(send).toHaveBeenCalledOnce();
    },
  );
  it("fences a delayed My Ledger ALL response after A→B→A", async () => {
    let active = account;
    const readSession = async () => ({
      accessToken: "token",
      refreshToken: "refresh",
      expiresAt: "2099-01-01T00:00:00Z",
      identity: { userId: active, displayName: "A", email: null },
    });
    const send = vi.fn(async () => {
      active = "B";
      advanceAccountGeneration();
      active = account;
      advanceAccountGeneration();
      return Response.json({
        period: "ALL",
        from: null,
        to: null,
        journeys: [],
        serverTime: "2026-10-09T00:00:00Z",
      });
    });
    const transport = createLedgerReadTransport({
      readSession,
      createClient: (token) =>
        createApiClient({
          baseUrl: "https://example.test",
          accessToken: token,
          fetchImplementation: send,
        }),
    });
    await expect(transport.myLedger("ALL", { from: null, to: null })).rejects.toThrow(
      "Account changed",
    );
    expect(send).toHaveBeenCalledOnce();
  });
});
