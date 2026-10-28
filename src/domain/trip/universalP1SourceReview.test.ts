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

it.each([
  ["January", "01"],
  ["February", "02"],
  ["March", "03"],
  ["April", "04"],
  ["May", "05"],
  ["June", "06"],
  ["July", "07"],
  ["August", "08"],
  ["September", "09"],
  ["October", "10"],
  ["November", "11"],
  ["December", "12"],
])(
  "preserves explicit full English month %s without a timezone or guessed year",
  (month, number) => {
    expect(sourceReviewCivilDate(`${month} 2, 2026`)).toBe(`2026-${number}-02`);
  },
);
it.each([
  "February 29, 2026",
  "November 31, 2026",
  "November 2",
  "November 2, 2026 10:00",
  "November 2, 2026R",
  "Novem 2, 2026",
])("rejects incomplete, impossible or trailing date content %s", (raw) =>
  expect(() => sourceReviewCivilDate(raw)).toThrow(),
);
