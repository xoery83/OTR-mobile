import { expect, it } from "vitest";
import { bottomShellInset } from "./bottomShellInset";
it("reserves the translucent shell and home indicator before layout and follows actual growth", () => {
  const minimum = bottomShellInset(0, 34, 1);
  expect(minimum).toBe(112);
  expect(bottomShellInset(238, 34, 1)).toBe(238);
  expect(bottomShellInset(undefined, 34, 2)).toBeGreaterThan(minimum);
  expect(bottomShellInset(0, 0, 1)).toBe(78);
});
