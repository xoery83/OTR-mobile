import { describe, expect, it, vi } from "vitest";
import { createDevProvisionalSignIn } from "./devProvisionalSignIn";
import { verifySupabaseDevEmailOtp } from "./devSupabaseAuth";

vi.mock("./devSupabaseAuth", () => ({ verifySupabaseDevEmailOtp: vi.fn() }));

describe("DEV provisional provider composition", () => {
  it("forwards email, code and cancellation signal without installing a session", async () => {
    const session = {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: null,
      identity: { userId: "account", displayName: "", email: null },
    };
    vi.mocked(verifySupabaseDevEmailOtp).mockResolvedValueOnce(session);
    await expect(
      createDevProvisionalSignIn().verify({
        provider: "email_otp",
        email: "qa@example.test",
        code: "123456",
      }),
    ).resolves.toMatchObject({ status: "VERIFIED", session });
    expect(verifySupabaseDevEmailOtp).toHaveBeenCalledWith("qa@example.test", "123456", {
      signal: expect.any(AbortSignal),
    });
  });
  it.each(["apple", "google"] as const)(
    "keeps unconfigured %s unavailable",
    async (provider) => {
      vi.mocked(verifySupabaseDevEmailOtp).mockClear();
      await expect(
        createDevProvisionalSignIn().verify({ provider }),
      ).resolves.toMatchObject({
        status: "UNAVAILABLE",
        reason: "CONFIGURATION_UNVERIFIED",
      });
      expect(verifySupabaseDevEmailOtp).not.toHaveBeenCalled();
    },
  );
});
