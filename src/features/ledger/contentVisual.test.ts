import { describe, expect, it } from "vitest";
import { heroAmountSizes, nextHeroAmountStep } from "./contentVisual";

describe("Hero amount sizing", () => {
  it("uses a bounded ladder and preserves a readable final size", () => {
    expect(heroAmountSizes).toEqual([44, 40, 36, 32]);
    expect(nextHeroAmountStep(0, 1)).toBe(0);
    expect(nextHeroAmountStep(0, 2)).toBe(1);
    expect(nextHeroAmountStep(3, 2)).toBe(3);
  });
});
