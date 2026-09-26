import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRateDemandScanner, type RateDemandScanResult } from "./rateDemandScanner";

const empty: RateDemandScanResult = {
  claimedRateDemands: 0,
  personalPaymentFxWork: 0,
  autoReferenceDemands: 0,
  autoReferenceWork: 0,
};

describe("rate demand scanner", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("scans immediately and backs off after consecutive empty scans", async () => {
    const scan = vi.fn(async () => empty);
    const log = vi.fn();
    const scanner = createRateDemandScanner(scan, log);
    scanner.start();
    expect(scan).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    for (const [delay, sequence] of [
      [30_000, 2],
      [60_000, 3],
      [120_000, 4],
      [300_000, 5],
      [300_000, 6],
    ]) {
      await vi.advanceTimersByTimeAsync(delay);
      expect(scan).toHaveBeenCalledTimes(sequence);
    }
    expect(log.mock.calls.map(([event]) => event.nextIntervalMs)).toEqual([
      30_000, 60_000, 120_000, 300_000, 300_000, 300_000,
    ]);
    expect(log.mock.calls.map(([event]) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    scanner.stop();
  });

  it("resets to 30 seconds when any work is found", async () => {
    const scan = vi
      .fn()
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce({ ...empty, personalPaymentFxWork: 2 })
      .mockResolvedValue(empty);
    const log = vi.fn();
    const scanner = createRateDemandScanner(scan, log);
    scanner.start();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(scan).toHaveBeenCalledTimes(3);
    expect(log.mock.lastCall?.[0]).toMatchObject({
      usefulWork: true,
      nextIntervalMs: 30_000,
      personalPaymentFxWork: 2,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(scan).toHaveBeenCalledTimes(4);
    scanner.stop();
  });

  it("backs failures off from 60 seconds and does not bypass failure delay for an active wakeup", async () => {
    let rejectFirst!: (error: Error) => void;
    const first = new Promise<RateDemandScanResult>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const scan = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockRejectedValue(new TypeError("offline"));
    const log = vi.fn();
    const scanner = createRateDemandScanner(scan, log);
    scanner.start();
    scanner.wake();
    rejectFirst(new TypeError("offline"));
    await vi.advanceTimersByTimeAsync(0);
    expect(log.mock.lastCall?.[0]).toMatchObject({
      failureClass: "TypeError",
      failureCount: 1,
      nextIntervalMs: 60_000,
    });
    scanner.wake();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(scan).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(scan).toHaveBeenCalledTimes(2);
    for (const [delay, next] of [
      [120_000, 300_000],
      [300_000, 300_000],
    ]) {
      await vi.advanceTimersByTimeAsync(delay);
      expect(log.mock.lastCall?.[0].nextIntervalMs).toBe(next);
    }
    scanner.stop();
  });

  it("never overlaps, coalesces wakeups, and clears its timer on stop", async () => {
    let resolve!: (value: RateDemandScanResult) => void;
    const blocked = new Promise<RateDemandScanResult>((done) => {
      resolve = done;
    });
    const scan = vi.fn().mockReturnValueOnce(blocked).mockResolvedValue(empty);
    const log = vi.fn();
    const scanner = createRateDemandScanner(scan, log);
    scanner.start();
    scanner.wake();
    scanner.wake();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(scan).toHaveBeenCalledTimes(1);
    resolve(empty);
    await vi.advanceTimersByTimeAsync(0);
    expect(scan).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0][0]).toMatchObject({
      wakeups: 2,
      coalescedWakeups: 1,
      nextIntervalMs: 0,
    });
    scanner.wake();
    scanner.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(scan).toHaveBeenCalledTimes(3);
    expect(log.mock.lastCall?.[0]).toMatchObject({ wakeups: 4, coalescedWakeups: 2 });
    scanner.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(scan).toHaveBeenCalledTimes(3);
  });

  it("unrefs scheduled timers", async () => {
    const realSetTimeout = globalThis.setTimeout;
    const unref = vi.fn();
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: () => void,
      delay: number,
    ) => {
      const timer = realSetTimeout(callback, delay);
      timer.unref = unref;
      return timer;
    }) as typeof setTimeout);
    const scanner = createRateDemandScanner(async () => empty, vi.fn());
    scanner.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(unref).toHaveBeenCalledOnce();
    scanner.stop();
    spy.mockRestore();
  });
});
