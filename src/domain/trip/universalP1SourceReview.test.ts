import { expect, it } from "vitest";
import { sourceReviewCivilDate } from "./universalP1SourceReview";
it.each([
  ["Nov 1, 2026", "2026-11-01"],
  ["Feb 29, 2028", "2028-02-29"],
  ["2026-11-01", "2026-11-01"],
])("preserves civil date %s", (raw, date) =>
  expect(sourceReviewCivilDate(raw)).toBe(date),
);
it.each(["Feb 29, 2026", "Nov 31, 2026", "11/01/26", "Nov 1, 2026 10:00", "2026-02-30"])(
  "rejects invalid or unsupported date %s",
  (raw) => expect(() => sourceReviewCivilDate(raw)).toThrow(),
);
