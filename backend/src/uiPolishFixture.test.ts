import { describe, expect, it } from "vitest";

import { syntheticDescription, syntheticTitle } from "./uiPolishFixture";

describe("UI Polish fixture copy", () => {
  it("keeps the requested deterministic text mix synthetic and valid", () => {
    const titles = Array.from({ length: 126 }, (_, index) => syntheticTitle(index));
    const descriptions = Array.from({ length: 126 }, (_, index) =>
      syntheticDescription(index),
    );

    expect(new Set(titles.map((item) => item.title))).toHaveLength(126);
    expect(titles.every((item) => item.title.length <= 200)).toBe(true);
    expect(titles.some((item) => item.title.startsWith("Imported "))).toBe(false);
    expect(
      Object.fromEntries(
        ["SHORT", "NORMAL", "LONG", "EXTREME"].map((kind) => [
          kind,
          titles.filter((item) => item.lengthClass === kind).length,
        ]),
      ),
    ).toEqual({ SHORT: 32, NORMAL: 57, LONG: 25, EXTREME: 12 });
    expect(descriptions.filter((item) => item.description === null)).toHaveLength(65);
    expect(descriptions.some((item) => item.description?.includes("\n"))).toBe(true);
  });
});
