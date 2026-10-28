import { describe, expect, it, vi } from "vitest";
import { createAccountSwitchCoordinator } from "./accountSwitchCoordinator";
import { withAccountApplyGate } from "./accountRequestContext";
import { advanceAccountGeneration } from "./accountGeneration";

const session = {
  accessToken: "a-token",
  refreshToken: "a-refresh",
  expiresAt: null,
  identity: { userId: "A", displayName: "QA", email: null },
};
function harness() {
  let active = session;
  const clearSession = vi.fn();
  const restartSync = vi.fn();
  const revokeSession = vi.fn(async () => {});
  const coordinator = createAccountSwitchCoordinator({
    pauseSync: vi.fn(),
    assertLogoutAllowed: vi.fn(),
    restartSync,
    readSession: async () => active,
    writeSession: vi.fn(),
    clearSession,
    selectAccount: vi.fn(),
    adoptLocalState: vi.fn(),
    clearInMemoryState: vi.fn(),
    bootstrapAccount: vi.fn(),
    revokeSession,
  });
  return {
    coordinator,
    clearSession,
    restartSync,
    revokeSession,
    switchAccount() {
      active = { ...session, identity: { ...session.identity, userId: "B" } };
      advanceAccountGeneration();
    },
  };
}

describe("online logout server ownership", () => {
  it("revokes the captured session outside the Account gate before local removal", async () => {
    const value = harness();
    value.revokeSession.mockImplementationOnce(async () => {
      await withAccountApplyGate(async () => {});
      expect(value.clearSession).not.toHaveBeenCalled();
    });
    await value.coordinator.logout();
    expect(value.revokeSession).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ accountId: "A" }),
    );
    expect(value.clearSession).toHaveBeenCalledOnce();
    expect(value.restartSync).not.toHaveBeenCalled();
  });
  it("retains credentials and resumes retained Account on uncertain server outcome", async () => {
    const value = harness();
    value.revokeSession.mockRejectedValueOnce(new Error("network outcome unknown"));
    await expect(value.coordinator.logout()).rejects.toThrow("network outcome unknown");
    expect(value.clearSession).not.toHaveBeenCalled();
    expect(value.revokeSession).toHaveBeenCalledOnce();
    expect(value.restartSync).toHaveBeenCalledOnce();
  });
  it("cannot clear B after A's remote revocation completes late", async () => {
    const value = harness();
    value.revokeSession.mockImplementationOnce(async () => value.switchAccount());
    await expect(value.coordinator.logout()).rejects.toThrow("AUTH_CONTEXT_CHANGED");
    expect(value.revokeSession).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ accountId: "A" }),
    );
    expect(value.clearSession).not.toHaveBeenCalled();
  });
});
