import { describe, expect, it } from "vitest";

import { parseAmountToMinor } from "./money";

describe("expense money parsing", () => {
  it("converts decimal input to integer minor units without storing a float", () => {
    expect(parseAmountToMinor("12.34")).toBe(1234);
    expect(parseAmountToMinor("5")).toBe(500);
    expect(parseAmountToMinor("0.001")).toBeNull();
    expect(parseAmountToMinor("123", 0)).toBe(123);
    expect(parseAmountToMinor("12.345", 3)).toBe(12_345);
    expect(parseAmountToMinor("12.34", 0)).toBeNull();
    expect(parseAmountToMinor("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseAmountToMinor("90071992547409.92")).toBeNull();
  });
});
