import { beforeEach, expect, it, vi } from "vitest";
import { linkAppleToCurrentAccount } from "./linkAppleAccount";
const state = vi.hoisted(() => ({
  generation: 1,
  read: vi.fn(),
  write: vi.fn(),
  exchange: vi.fn(),
  save: vi.fn(),
  signIn: vi.fn(),
}));
vi.mock("./accountGeneration", () => ({ getAccountGeneration: () => state.generation }));
vi.mock("./accountRequestContext", () => ({
  withAccountApplyGate: (task: () => unknown) => task(),
}));
vi.mock("./authRepository", () => ({
  readLocalSession: state.read,
  writeLocalSession: state.write,
}));
vi.mock("./devSupabaseAuth", () => ({
  authenticateSupabaseDevProvider: vi.fn(),
  linkSupabaseDevAppleIdentity: state.exchange,
  saveSupabaseDevAppleName: state.save,
  SupabaseDevAuthError: class extends Error {},
}));
vi.mock("./appleSignIn", async (original) => {
  const actual = await original<typeof import("./appleSignIn")>();
  return {
    ...actual,
    createAppleSignInAdapter: (_load: unknown, exchange: any) => ({
      verify: async (_request: unknown, signal: AbortSignal) => {
        await state.signIn();
        return exchange(
          { provider: "apple", idToken: "synthetic-token", nonce: "raw" },
          { signal },
        );
      },
    }),
  };
});
const current = {
  accessToken: "a",
  refreshToken: "refresh-a",
  expiresAt: null,
  identity: { userId: "account-a", displayName: "", email: null },
};
beforeEach(() => {
  vi.clearAllMocks();
  state.generation = 1;
  state.read.mockResolvedValue(current);
  state.exchange.mockResolvedValue({ ...current, refreshToken: "linked-refresh" });
  state.signIn.mockResolvedValue(undefined);
});
it("installs the linked same-Account Session only after its Account fence passes", async () => {
  await linkAppleToCurrentAccount(new AbortController().signal);
  expect(state.exchange).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "apple" }),
    current,
    expect.anything(),
  );
  expect(state.write).toHaveBeenCalledWith(
    expect.objectContaining({ refreshToken: "linked-refresh" }),
  );
});
it("rejects an Account switch during the Apple prompt before linking", async () => {
  state.signIn.mockImplementationOnce(async () => {
    state.generation++;
  });
  await expect(linkAppleToCurrentAccount(new AbortController().signal)).rejects.toThrow(
    "APPLE_ACCOUNT_CHANGED",
  );
  expect(state.exchange).not.toHaveBeenCalled();
  expect(state.write).not.toHaveBeenCalled();
});
it("rejects a stale response after Account switching without replacing the new Session", async () => {
  state.exchange.mockImplementationOnce(async () => {
    state.generation++;
    return current;
  });
  await expect(linkAppleToCurrentAccount(new AbortController().signal)).rejects.toThrow(
    "APPLE_ACCOUNT_CHANGED",
  );
  expect(state.write).not.toHaveBeenCalled();
});
it("does not overwrite a concurrently refreshed Session", async () => {
  state.read
    .mockResolvedValueOnce(current)
    .mockResolvedValueOnce({ ...current, refreshToken: "concurrent-refresh" });
  await expect(linkAppleToCurrentAccount(new AbortController().signal)).rejects.toThrow(
    "APPLE_ACCOUNT_CHANGED",
  );
  expect(state.write).not.toHaveBeenCalled();
});
