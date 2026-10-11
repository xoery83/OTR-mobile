import { describe, it, expect } from "vitest";
import {
  coreBoundarySchema,
  coreDateBoundary,
  normalizeCoreClock,
} from "./tripCoreV2Temporal";
describe("Core v2 temporal precision", () => {
  it("retains minute precision for the P4 11:00 fixture and pads storage only", () => {
    expect(normalizeCoreClock("11:00", -1)).toBe("11:00:00");
    expect(normalizeCoreClock("11:00:00", -1)).toBe("11:00:00");
    expect(() => normalizeCoreClock("11:00:01", -1)).toThrow("INVALID_CLOCK_PRECISION");
    expect(() => normalizeCoreClock("11:00:00.000", -1)).toThrow(
      "INVALID_CLOCK_PRECISION",
    );
    expect(() => normalizeCoreClock("11:00", 0)).toThrow("INVALID_CLOCK_PRECISION");
    expect(normalizeCoreClock("11:00:00.123456", 6)).toBe("11:00:00.123456");
  });
  it("date-only never invents an instant and invalid date fails", () => {
    expect(coreDateBoundary("2026-12-14").instant).toBeNull();
    expect(() => coreDateBoundary("2026-02-29")).toThrow();
  });
  it("unknown zone preserves authored clock but prevents qualification", () => {
    const t = {
      ...coreDateBoundary("2026-12-14"),
      local_time: "11:00:00",
      clock_precision: -1,
      quality: "ESTIMATED",
    };
    expect(coreBoundarySchema.parse(t).instant).toBeNull();
    expect(
      coreBoundarySchema.safeParse({ ...t, instant: "2026-12-13T22:00:00Z" }).success,
    ).toBe(false);
  });
  it("civil offset arithmetic alone is not source-instant evidence", () => {
    const t = {
      ...coreDateBoundary("2026-12-14"),
      instant: "2026-12-13T22:00:00Z",
      source_instant: "2026-12-13T22:00:00Z",
      source_instant_precision: -1,
      quality: "EXACT",
      basis: "SOURCE_INSTANT",
    };
    expect(coreBoundarySchema.parse(t).source_instant_precision).toBe(-1);
    expect(
      coreBoundarySchema.safeParse({
        ...t,
        source_instant: null,
        source_instant_precision: null,
      }).success,
    ).toBe(false);
  });
});
