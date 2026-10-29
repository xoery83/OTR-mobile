import { expect, it } from "vitest";
import type { CoreDayRow } from "@/domain/trip/tripCoreV2Day";
import { localDayDisplayOrder, mixedDayDisplayOrder } from "./localDayDisplayOrder";
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

it("weaves pending and accepted civil clocks ahead of qualified rows and Base", () => {
  const entry = (id: string, position: CoreDayRow["position"], clock?: string) => ({
    id,
    position,
    owning: {
      position,
      displayTime: clock
        ? { localTime: clock, comparable: position === "TIMELINE" }
        : undefined,
    } as CoreDayRow,
  });
  const rows = [
    entry("accepted-stay", "TNS", "17:00"),
    entry("qualified", "TIMELINE", "09:00"),
    entry("base", "BASE"),
    entry("pending", "TNS", "03:28"),
    entry("date-only", "TNS"),
  ];
  expect(
    mixedDayDisplayOrder(
      rows,
      (row) => row.position,
      (row) => row.owning,
    ).map((row) => row.id),
  ).toEqual(["date-only", "pending", "accepted-stay", "qualified", "base"]);
  expect(rows.map((row) => row.id)).toEqual([
    "accepted-stay",
    "qualified",
    "base",
    "pending",
    "date-only",
  ]);
});
