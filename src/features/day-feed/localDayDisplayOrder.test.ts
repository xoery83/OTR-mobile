import { expect, it } from "vitest";
import type { CoreDayRow } from "@/domain/trip/tripCoreV2Day";
import { localDayDisplayOrder } from "./localDayDisplayOrder";
it("orders authored civil clocks across families while preserving Base slots and untimed stability", () => {
  const row = (title: string, time?: string, base = false) =>
    ({
      title,
      family: title,
      position: base ? "BASE" : "TNS",
      rowKey: { projectionRole: "START" },
      displayTime: time ? { localTime: time, comparable: false } : undefined,
    }) as CoreDayRow;
  const rows = [
    row("base", undefined, true),
    row("P1", "20:30:00"),
    row("NTC"),
    row("P3", "17:19"),
    row("P2", "12:00"),
    row("return", undefined, true),
  ];
  expect(localDayDisplayOrder(rows).map((r) => r.title)).toEqual([
    "base",
    "NTC",
    "P2",
    "P3",
    "P1",
    "return",
  ]);
  expect(rows[1].title).toBe("P1");
});

it("preserves qualified instant order across zones and hides arrival-only Flight continuations", () => {
  const early = {
    title: "NY10",
    family: "P1",
    position: "TIMELINE",
    displayTime: { comparable: true, localTime: "10:00", zoneId: "America/New_York" },
    rowKey: { projectionRole: "START" },
  } as CoreDayRow;
  const late = {
    ...early,
    title: "LA09",
    displayTime: { comparable: true, localTime: "09:00", zoneId: "America/Los_Angeles" },
  };
  expect(localDayDisplayOrder([early, late])).toEqual([early, late]);
  expect(
    localDayDisplayOrder([
      {
        ...early,
        family: "P2",
        rowKey: { ...early.rowKey, projectionRole: "DESTINATION" },
      },
    ]),
  ).toEqual([]);
});
