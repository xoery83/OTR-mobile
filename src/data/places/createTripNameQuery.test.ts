import { expect, it } from "vitest";
import { createTripNameQuery, nameHints } from "./createTripNameQuery";
it("reuses the frozen finite aliases for one real provider query without producing identity", () => {
  expect(createTripNameQuery("Nelson Hiking Trip")).toBe("Nelson");
  expect(createTripNameQuery("日本春季旅行")).toBe("Japan");
  expect(nameHints("New Zealand South Island Trip")).toEqual([
    "South Island",
    "New Zealand",
  ]);
});
it("keeps unknown authored names as normalized queries and does not infer places", () => {
  expect(createTripNameQuery("  Unlisted   town ")).toBe("Unlisted town");
  expect(createTripNameQuery(" ")).toBe("");
  expect(nameHints("Tokyoite")).toEqual([]);
});
