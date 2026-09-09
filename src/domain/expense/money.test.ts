import { describe, expect, it } from "vitest";

import { parseAmountToMinor } from "./money";

describe("expense money parsing", () => {
  it("converts decimal input to integer minor units without storing a float", () => {
    expect(parseAmountToMinor("12.34")).toBe(1234);
    expect(parseAmountToMinor("5")).toBe(500);
    expect(parseAmountToMinor("0.001")).toBeNull();
  });
});
