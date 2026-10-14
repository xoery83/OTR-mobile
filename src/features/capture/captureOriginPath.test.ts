import { expect, it } from "vitest";
import { captureOriginPath } from "./captureOriginPath";
it("returns a current Updates invocation to its existing mounted route", () => {
  expect(captureOriginPath("UPDATES", "5", 5)).toBe("/updates");
});
it("stale generations, arbitrary destinations and absent legacy origins never change the existing return", () => {
  for (const origin of [undefined, "/updates", "/private", ["UPDATES"]])
    expect(captureOriginPath(origin, "5", 5)).toBeNull();
  expect(captureOriginPath("UPDATES", "5", 7)).toBeNull();
  expect(captureOriginPath("UPDATES", ["5"], 5)).toBeNull();
});
