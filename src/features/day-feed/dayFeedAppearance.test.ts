import { expect, it } from "vitest";
import { dayFeedAppearanceDate, dayFeedPhaseColor } from "./dayFeedAppearance";
import { lightPalette, darkPalette } from "@/ui/palette";
it.each([lightPalette, darkPalette])(
  "shares three distinct palette roles between real and fixture Day headers",
  (colors) => {
    expect(dayFeedPhaseColor("2026-10-25", "2026-10-26", colors)).toBe(colors.dayPast);
    expect(dayFeedPhaseColor("2026-10-26", "2026-10-26", colors)).toBe(colors.surface);
    expect(dayFeedPhaseColor("2026-10-27", "2026-10-26", colors)).toBe(colors.dayFuture);
  },
);
it("uses a device civil date for decoration only when the view has no zone", () => {
  expect(dayFeedAppearanceDate("2026-10-25T20:00:00Z", null, "Pacific/Auckland")).toBe(
    "2026-10-26",
  );
  expect(
    dayFeedAppearanceDate(
      "2026-10-25T20:00:00Z",
      "America/Los_Angeles",
      "Pacific/Auckland",
    ),
  ).toBe("2026-10-25");
  expect(dayFeedAppearanceDate("invalid", null, "Unknown/Zone")).toBeNull();
});
