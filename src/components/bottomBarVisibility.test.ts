import { expect, it } from "vitest";
import { shellShowsUpdates } from "./bottomBarVisibility";
it("Updates is redundant only when the visible navigation Island actually includes it", () => {
  for (const path of ["/", "/expenses", "/updates", "/trip"])
    expect(shellShowsUpdates(path, { tripId: "a", view: "home" }, true)).toBe(true);
  expect(shellShowsUpdates("/trip", { tripId: "a", view: "trips" }, true)).toBe(false);
  expect(shellShowsUpdates("/trip", { tripId: "a", view: "create" }, true)).toBe(false);
  expect(shellShowsUpdates("/account", {}, true)).toBe(false);
  expect(shellShowsUpdates("/", {}, false)).toBe(false);
});
