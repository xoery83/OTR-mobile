import { describe, expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "./accountGeneration";
import { createProvisionalSignIn, type SignInAdapter } from "./provisionalSignIn";

const session = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: null,
  identity: { userId: "account", displayName: "Person", email: null },
};
const adapter = (
  verify: SignInAdapter["verify"] = vi.fn(async () => session),
): SignInAdapter => ({
  capability: async () => ({ available: true }),
  verify,
});

describe("provisional sign-in without account installation", () => {
  it("keeps a verified result provisional and supports every approved provider", async () => {
    const verify = vi.fn(async () => session);
    const flow = createProvisionalSignIn({
      apple: adapter(verify),
      google: adapter(verify),
      email_otp: adapter(verify),
    });
    for (const provider of ["apple", "google"] as const)
      expect(await flow.verify({ provider })).toMatchObject({
        status: "VERIFIED",
        provider,
        session,
      });
    expect(
      await flow.verify({
        provider: "email_otp",
        email: "a@example.test",
        code: "123456",
      }),
    ).toMatchObject({ status: "VERIFIED" });
    expect(verify).toHaveBeenCalledTimes(3);
  });
  it("does not invoke an unconfigured or unavailable provider", async () => {
    expect(await createProvisionalSignIn({}).verify({ provider: "apple" })).toEqual({
      status: "UNAVAILABLE",
      reason: "CONFIGURATION_UNVERIFIED",
    });
    const verify = vi.fn();
    const flow = createProvisionalSignIn({
      apple: {
        capability: async () => ({ available: false, reason: "NATIVE_MODULE_MISSING" }),
        verify,
      },
    });
    expect(await flow.verify({ provider: "apple" })).toMatchObject({
      status: "UNAVAILABLE",
      reason: "NATIVE_MODULE_MISSING",
    });
    expect(verify).not.toHaveBeenCalled();
  });
  it.each(["cancel", "generation", "replace"])(
    "isolates late success after %s",
    async (action) => {
      let finish!: (value: typeof session) => void;
      const verify = vi.fn<SignInAdapter["verify"]>(
        () =>
          new Promise<typeof session>((resolve) => {
            finish = resolve;
          }),
      );
      const flow = createProvisionalSignIn({ apple: adapter(verify) });
      const result = flow.verify({ provider: "apple" });
      await vi.waitFor(() => expect(verify).toHaveBeenCalledOnce());
      const signal = verify.mock.calls[0]?.[1] as AbortSignal | undefined;
      if (action === "generation") advanceAccountGeneration();
      else if (action === "replace") await flow.verify({ provider: "google" });
      else flow.cancel();
      expect(await result).toEqual({ status: "CANCELLED" });
      finish(session);
      if (action !== "generation") expect(signal?.aborted).toBe(true);
    },
  );
  it("rejects incomplete credentials and preserves genuine provider failures", async () => {
    const invalid = createProvisionalSignIn({
      apple: adapter(vi.fn(async () => ({ ...session, identity: undefined }))),
    });
    await expect(invalid.verify({ provider: "apple" })).rejects.toThrow(
      "PROVIDER_SESSION_INVALID",
    );
    const failed = createProvisionalSignIn({
      apple: adapter(
        vi.fn(async () => {
          throw new Error("provider refused");
        }),
      ),
    });
    await expect(failed.verify({ provider: "apple" })).rejects.toThrow(
      "provider refused",
    );
  });
});
