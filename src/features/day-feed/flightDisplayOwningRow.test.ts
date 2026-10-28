import { expect, it } from "vitest";
import type { CoreDayRow } from "@/domain/trip/tripCoreV2Day";
import { flightDisplayOwningRow } from "./flightDisplayOwningRow";
import { mixedDayDisplayOrder } from "./localDayDisplayOrder";
const row = (family = "P2", role = "ORIGIN", time = "12:00") =>
  ({
    family,
    itemRef: "flight",
    itemRevision: 2,
    rowKey: { itemId: "flight", projectionRole: role, localDate: "2026-10-29" },
    position: "TNS",
    displayTime: { localTime: time, comparable: false },
  }) as CoreDayRow;
it("RED regression: same-day authored P2 leg orders by real origin, ahead of later Stay", () => {
  const origin = row(),
    destination = row("P2", "DESTINATION", "13:00"),
    stay = { ...row("P3", "CHECKIN", "17:00"), itemRef: "stay" };
  const entries = [
    { id: "stay", position: "TNS", own: stay },
    { id: "flight", position: "TNS", own: flightDisplayOwningRow([destination, origin]) },
  ];
  expect(entries[1].own).toBe(origin);
  expect(
    mixedDayDisplayOrder(
      entries,
      (x) => x.position as "TNS",
      (x) => x.own,
    ).map((x) => x.id),
  ).toEqual(["flight", "stay"]);
});
it("retains sole rows and leaves non-P2/mixed-date/revision/identity ambiguity unchanged", () => {
  const a = row();
  expect(flightDisplayOwningRow([a])).toBe(a);
  expect(flightDisplayOwningRow([])).toBeUndefined();
  for (const d of [
    { ...row("P2", "DESTINATION"), family: "P3" },
    { ...row("P2", "DESTINATION"), itemRevision: 3 },
    { ...row("P2", "DESTINATION"), itemRef: "other" },
    {
      ...row("P2", "DESTINATION"),
      rowKey: {
        itemId: "flight",
        projectionRole: "DESTINATION",
        localDate: "2026-10-30",
      },
    },
    row("P2", "ORIGIN"),
  ])
    expect(flightDisplayOwningRow([a, d])).toBeUndefined();
});
it("Qualified instant order is unchanged, including airports in different zones", () => {
  const qualified = (id: string, time: string) => ({
    id,
    position: "TIMELINE" as const,
    own: {
      ...row("P2", "ORIGIN", time),
      position: "TIMELINE" as const,
      displayTime: { comparable: true, localTime: time },
    },
  });
  const early = qualified("qualified1", "15:00"),
    late = qualified("qualified2", "09:00");
  expect(
    mixedDayDisplayOrder(
      [early, late],
      (x) => x.position,
      (x) => x.own,
    ),
  ).toEqual([early, late]);
});
