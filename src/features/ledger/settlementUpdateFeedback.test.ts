import { describe, expect, it, vi } from "vitest";

import { submitSettlementUpdate } from "./settlementUpdateFeedback";

describe("Settlement update feedback", () => {
  it("shows progress immediately during a slow request and submits only once", async () => {
    vi.useFakeTimers();
    try {
      const inFlight = { current: false };
      const setConfirming = vi.fn();
      const confirm = vi.fn(
        () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 9_000)),
      );
      const onConfirmed = vi.fn();
      const first = submitSettlementUpdate(
        inFlight,
        "  V2  ",
        setConfirming,
        confirm,
        onConfirmed,
      );
      const duplicate = submitSettlementUpdate(
        inFlight,
        "  V2  ",
        setConfirming,
        confirm,
        onConfirmed,
      );
      expect(inFlight.current).toBe(true);
      expect(setConfirming).toHaveBeenCalledWith(true);
      expect(confirm).toHaveBeenCalledExactlyOnceWith("V2");
      expect(onConfirmed).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(8_500);
      expect(onConfirmed).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(500);
      expect(await first).toBe(true);
      expect(await duplicate).toBe(false);
      expect(onConfirmed).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores interaction after failure without losing the reason", async () => {
    const inFlight = { current: false };
    const states: boolean[] = [];
    const reason = "V2 correction";
    const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onConfirmed = vi.fn();
    expect(
      await submitSettlementUpdate(
        inFlight,
        reason,
        (value) => states.push(value),
        confirm,
        onConfirmed,
      ),
    ).toBe(false);
    expect(states).toEqual([true, false]);
    expect(inFlight.current).toBe(false);
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(
      await submitSettlementUpdate(
        inFlight,
        reason,
        (value) => states.push(value),
        confirm,
        onConfirmed,
      ),
    ).toBe(true);
    expect(confirm).toHaveBeenNthCalledWith(2, reason);
    expect(onConfirmed).toHaveBeenCalledOnce();
  });
});
