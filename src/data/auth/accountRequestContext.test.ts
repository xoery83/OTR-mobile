import { describe, expect, it } from "vitest";
import { getAccountGeneration } from "./accountGeneration";
import {
  assertAccountRequestGeneration,
  beginAccountTransition,
  captureAccountRequestContext,
  endAccountTransition,
  withAccountApplyGate,
} from "./accountRequestContext";
describe("canonical owned transition fence", () => {
  it("holds the same apply gate through local installation and advances generation", async () => {
    const context = await captureAccountRequestContext("trip", async () => "account");
    const lease = await beginAccountTransition();
    let applied = false;
    const apply = withAccountApplyGate(async () => {
      applied = true;
    });
    try {
      await Promise.resolve();
      expect(applied).toBe(false);
      expect(getAccountGeneration()).toBeGreaterThan(context.generation);
      expect(() => assertAccountRequestGeneration(context)).toThrow("Account changed");
    } finally {
      endAccountTransition(lease);
    }
    await apply;
    expect(applied).toBe(true);
  });
  it("failed local recovery installation releases the gate without reusing generation", async () => {
    const context = await captureAccountRequestContext("trip", async () => "account");
    const install = async () => {
      const lease = await beginAccountTransition();
      try {
        throw new Error("restore failed");
      } finally {
        endAccountTransition(lease);
      }
    };
    await expect(install()).rejects.toThrow("restore failed");
    expect(getAccountGeneration()).toBeGreaterThan(context.generation);
    expect(() => assertAccountRequestGeneration(context)).toThrow("Account changed");
    await withAccountApplyGate(async () => {});
    expect(
      (await captureAccountRequestContext("trip", async () => "account")).generation,
    ).toBe(getAccountGeneration());
  });
  it("stale and forged leases cannot end a different active transition", async () => {
    const old = await beginAccountTransition();
    endAccountTransition(old);
    const current = await beginAccountTransition();
    const generation = getAccountGeneration();
    let applied = false;
    const apply = withAccountApplyGate(async () => {
      applied = true;
    });
    try {
      expect(() => endAccountTransition(old)).toThrow("lease is not active");
      expect(() => endAccountTransition({ ...current })).toThrow("lease is not active");
      await Promise.resolve();
      expect(applied).toBe(false);
      expect(getAccountGeneration()).toBe(generation);
      expect(() =>
        assertAccountRequestGeneration({
          accountId: "account",
          tripId: "trip",
          generation,
        }),
      ).toThrow("Account changed");
    } finally {
      endAccountTransition(current);
    }
    await apply;
    expect(applied).toBe(true);
  });
  it("conditional recovery waits for the owner, then rejects superseded Account/generation without mutation", async () => {
    let account = "B";
    const failedGeneration = getAccountGeneration();
    const owner = await beginAccountTransition();
    account = "C";
    let inspected = false;
    const recovery = beginAccountTransition({
      accountId: "B",
      generation: failedGeneration,
      getAccountId: async () => {
        inspected = true;
        return account;
      },
    });
    const currentGeneration = getAccountGeneration();
    await Promise.resolve();
    expect(inspected).toBe(false);
    endAccountTransition(owner);
    expect(await recovery).toBeNull();
    expect(account).toBe("C");
    expect(getAccountGeneration()).toBe(currentGeneration);
    await withAccountApplyGate(async () => {});
  });
  it("checks Account identity as well as generation at the serialization point", async () => {
    const generation = getAccountGeneration();
    let inspected = false;
    expect(
      await beginAccountTransition({
        accountId: "B",
        generation,
        getAccountId: async () => {
          inspected = true;
          return "C";
        },
      }),
    ).toBeNull();
    expect(inspected).toBe(true);
    expect(getAccountGeneration()).toBe(generation);
  });
});
