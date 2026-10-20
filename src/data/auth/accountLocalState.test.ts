import { describe, expect, it, vi } from "vitest";

import { adoptLegacyAccountState } from "./accountLocalState";

describe("legacy account state adoption", () => {
  it("claims only previously unowned local state for the active account", async () => {
    const runAsync = vi.fn();
    await adoptLegacyAccountState(
      {
        getFirstAsync: async () => ({ count: 1 }),
        runAsync,
        withTransactionAsync: async (task: () => Promise<void>) => task(),
      } as never,
      "user-a",
    );

    expect(runAsync).toHaveBeenCalledTimes(8);
    expect(runAsync.mock.calls.every((call) => call[1] === "user-a")).toBe(true);
    expect(runAsync.mock.calls.map((call) => call[0]).join("\n")).toContain(
      "owner_user_id IS NULL",
    );
    expect(runAsync.mock.calls.map((call) => call[0]).join("\n")).toContain(
      "sync_status <> 'SYNCED'",
    );
  });

  it("parks ambiguous legacy state when the current user cannot be proven", async () => {
    const runAsync = vi.fn();
    await expect(
      adoptLegacyAccountState(
        {
          getFirstAsync: async () => ({ count: 0 }),
          runAsync,
          withTransactionAsync: async (task: () => Promise<void>) => task(),
        } as never,
        "user-b",
      ),
    ).resolves.toBe(false);
    expect(runAsync).not.toHaveBeenCalled();
  });
});
