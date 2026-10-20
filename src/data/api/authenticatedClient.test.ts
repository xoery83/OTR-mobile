import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAuthenticatedApiClient } from "./authenticatedClient";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const account = "30000000-0000-4000-8000-000000000001";
const trip = "10000000-0000-4000-8000-000000000001";
const schema = z.object({ ok: z.boolean() });
describe("shared request credential binding", () => {
  it("pins the captured Account before asynchronous credential resolution", async () => {
    const ctx = await captureAccountRequestContext(trip, async () => account);
    const send = vi.fn();
    const provider = vi.fn(async (options) => {
      expect(options.expectedUserId).toBe(account);
      return { userId: "other", token: "token" };
    });
    const client = createAuthenticatedApiClient(
      { baseUrl: "https://example.test", fetchImplementation: send },
      provider,
      ctx,
    );
    await expect(client.get("/ledger", schema)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "rejects an Account transition during retry; return to A=%s",
    async (returnToA) => {
      const ctx = await captureAccountRequestContext(trip, async () => account);
      const send = vi.fn(async () => Response.json({}, { status: 401 }));
      const provider = vi.fn(async (options) => {
        expect(options.expectedUserId).toBe(account);
        if (options.forceRefresh) {
          advanceAccountGeneration();
          if (returnToA) advanceAccountGeneration();
        }
        return { userId: account, token: options.forceRefresh ? "new" : "old" };
      });
      const client = createAuthenticatedApiClient(
        { baseUrl: "https://example.test", fetchImplementation: send },
        provider,
        ctx,
      );
      await expect(client.get("/ledger", schema)).rejects.toThrow();
      expect(send).toHaveBeenCalledOnce();
      expect(provider).toHaveBeenCalledTimes(2);
    },
  );
});
