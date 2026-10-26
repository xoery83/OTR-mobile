import { describe, expect, it } from "vitest";
import { nextCalendarDate, type DayQuery } from "@/domain/trip/dayReadModel";
import {
  captureDayAnchor,
  dayListWindow,
  indexDayRows,
  previousDayOrigin,
  resolveDayAnchor,
  summarizeDay,
  type DayWindowRow,
} from "./dayFeedWindow";

// Synthetic performance cases are layout evidence, never Native/Canonical acceptance.
function fixture(days: number): DayWindowRow<string>[] {
  let date = "2026-10-01";
  return Array.from({ length: days }, (_, day) => {
    const own = date;
    date = nextCalendarDate(date);
    return [
      { key: `header:${own}`, date: own, value: "HEADER" },
      ...Array.from({ length: day % 5 }, (_, row) => ({
        key: `${own}:item:${row}`,
        date: own,
        value: "ITEM",
      })),
    ];
  }).flat();
}

describe("Day window metadata and stable anchors", () => {
  it.each([3, 30, 90])(
    "indexes %i days including empty dates without rendering preceding rows",
    (days) => {
      const rows = fixture(days);
      const index = indexDayRows(rows);
      expect(index.dates.size).toBe(days);
      const date = [...index.dates.keys()][days - 1];
      expect(rows[index.dates.get(date)!].key).toBe(`header:${date}`);
      expect(
        resolveDayAnchor(rows, { key: `header:${date}`, date, within: 0 })?.index,
      ).toBe(index.dates.get(date));
      expect(dayListWindow.initialNumToRender).toBeLessThan(30);
      expect(dayListWindow.windowSize).toBe(5);
    },
  );
  it("keeps a mixed-height visible item and within-row offset across insertion/zone or sync revision", () => {
    const rows = fixture(30);
    const heights = rows.map((_, i) => (i % 2 ? 380 : 52));
    let y = 0;
    const layouts = new Map(
      rows.map((row, index) => {
        const entry = [row.key, { y, height: heights[index] }] as const;
        y += heights[index];
        return entry;
      }),
    );
    const target = rows[45],
      layout = layouts.get(target.key)!;
    const anchor = captureDayAnchor(rows, layouts, layout.y + 37)!;
    expect(anchor).toEqual({ key: target.key, date: target.date, within: 37 });
    const changed = [{ key: "new", date: rows[0].date, value: "ITEM" }, ...rows];
    expect(resolveDayAnchor(changed, anchor)).toEqual({ index: 46, within: 37 });
    expect(resolveDayAnchor([...changed], anchor)).toEqual({ index: 46, within: 37 });
  });
  it("falls back to the same date header when the anchored item disappears", () => {
    const rows = fixture(3),
      target = rows.find((row) => row.value === "ITEM")!;
    const remaining = rows.filter((row) => row.key !== target.key);
    const anchor = resolveDayAnchor(remaining, {
      key: target.key,
      date: target.date,
      within: 73,
    })!;
    expect(remaining[anchor.index].key).toBe(`header:${target.date}`);
    expect(anchor.within).toBe(0);
    expect(
      resolveDayAnchor([], { key: "missing", date: target.date, within: 0 }),
    ).toBeNull();
  });
  it("does not accept duplicate row identities or fabricated calendar dates", () => {
    const row = fixture(1)[0];
    expect(() => indexDayRows([row, row])).toThrow("DAY_ROW_KEY_DUPLICATE");
    expect(() => indexDayRows([{ ...row, date: "2026-02-30" }])).toThrow(
      "DAY_DATE_INVALID",
    );
  });
  it("does not manufacture an anchor from an unmeasured viewport", () => {
    expect(captureDayAnchor(fixture(90), new Map(), 1000)).toBeNull();
  });
});

describe("local-only summary consumes the owning date query", () => {
  it("deduplicates endpoint/accepted/pending items and never substitutes UTC membership", () => {
    const item = (id: string, event_type: string, temporal_shape: string) => ({
      event: { id, event_type, temporal_shape },
    });
    const query = {
      date: "2026-10-16",
      timed: [item("f", "flight", "TRANSPORT")],
      nonComparable: [
        item("h", "hotel", "STAY"),
        item("h", "hotel", "STAY"),
        item("a", "activity", "CALENDAR"),
      ],
    } as DayQuery;
    expect(
      summarizeDay(query, [
        { itemRef: "h", family: "P3" },
        { itemRef: "r", family: "P4" },
        { itemRef: "t", family: "P5" },
      ]),
    ).toEqual({
      date: query.date,
      markers: ["Plans", "Stay", "Transport"],
      itemCount: 5,
    });
  });
  it("keeps an authorized empty day selectable without querying network/detail/clock", () => {
    expect(summarizeDay({ date: "2026-12-29", timed: [], nonComparable: [] })).toEqual({
      date: "2026-12-29",
      markers: [],
      itemCount: 0,
    });
  });
});

it("keeps a date-only Flight or scheduled transport in the Transport calendar category", () => {
  const query = {
    date: "2026-10-16",
    timed: [],
    nonComparable: [
      { event: { id: "flight", event_type: "flight", temporal_shape: "CALENDAR" } },
      { event: { id: "rail", event_type: "transport", temporal_shape: "CALENDAR" } },
    ],
  } as unknown as DayQuery;
  expect(summarizeDay(query)).toEqual({
    date: query.date,
    itemCount: 2,
    markers: ["Transport"],
  });
});

it("restores one preceding date/header without inventing heights or duplicate rows", () => {
  const rows = fixture(30),
    index = indexDayRows(rows);
  const positions = [...index.dates.values()];
  const target = positions[25];
  expect(previousDayOrigin(rows, target)).toBe(positions[24]);
  const item = target + 1;
  if (rows[item]?.date === rows[target].date)
    expect(previousDayOrigin(rows, item)).toBe(target);
  expect(previousDayOrigin(rows, 0)).toBe(0);
});

it("batches sparse previous dates by rows while preserving whole dense days", () => {
  const sparse = Array.from({ length: 20 }, (_, index) => ({
    key: `day:${index}`,
    date: `2026-10-${String(index + 1).padStart(2, "0")}`,
    value: "HEADER",
  }));
  expect(previousDayOrigin(sparse, 15, 8)).toBe(7);
  expect(previousDayOrigin(sparse, 3, 8)).toBe(0);
  expect(previousDayOrigin(sparse, 0, 8)).toBe(0);
  const dense = sparse.flatMap((header) => [
    header,
    ...Array.from({ length: 12 }, (_, index) => ({
      ...header,
      key: `${header.key}:item:${index}`,
      value: "ITEM",
    })),
  ]);
  expect(previousDayOrigin(dense, 13 * 15, 8)).toBe(13 * 14);
  expect(dense.slice(previousDayOrigin(dense, 13 * 15, 8), 13 * 15)).toHaveLength(13);
});
