import { expect, it } from "vitest";
import { selectTodaysJourney } from "./todaysJourney";
import type { CoreDayRow } from "./tripCoreV2Day";
import type { CoreFlightDayProjection } from "./tripCoreV2DayFeed";

const clock = { now: "2026-10-16T01:00:00Z", zone: "Pacific/Auckland" };
const row = (id: string, instant?: string, family = "P1"): CoreDayRow => ({
  itemRef: id,
  rowKey: { itemId: id, projectionRole: "START", localDate: "2026-10-16" },
  itemRevision: 1,
  projectionVersion: 2,
  certificateGeneration: 0,
  family,
  title: id,
  status: "planned",
  position: instant ? "TIMELINE" : "TNS",
  ...(instant ? { displayTime: { instant, comparable: true, quality: "EXACT" } } : {}),
  capabilities: {
    canEdit: false,
    canManageParticipation: false,
    canManageVisibility: false,
    canCancel: false,
    canHide: false,
    canRestore: false,
    canLinkBooking: false,
    canLinkEntitlement: false,
    canAttachDocument: false,
  },
});
const projection = (
  rows: CoreDayRow[],
  stays: { id: string; start: string; end: string }[] = [],
) =>
  ({
    query: (date: string, zone: string) => ({
      date,
      zone,
      timed: [],
      nonComparable: [],
      unresolved: [],
      coreRows: rows,
    }),
    events: stays.map((stay) => ({
      id: stay.id,
      boundaries: [
        { role: "START", local_date: stay.start },
        { role: "END", local_date: stay.end },
      ],
    })),
  }) as unknown as CoreFlightDayProjection;
it("queries Trip-local today, selects exact next and caps distinct later in owning order", () => {
  const rows = [
    row("old", "2026-10-16T00:00:00Z"),
    row("next", "2026-10-16T02:00:00Z"),
    row("next", "2026-10-16T03:00:00Z"),
    ...["b", "c", "d", "e"].map((id) => row(id)),
  ];
  const result = selectTodaysJourney(projection(rows), clock)!;
  expect(result.date).toBe("2026-10-16");
  expect(result.primary?.itemRef).toBe("next");
  expect(result.primaryKind).toBe("UPCOMING");
  expect(result.later.map((r) => r.itemRef)).toEqual(["b", "c", "d"]);
});
it("never ranks estimated or non-comparable timing as upcoming", () => {
  const estimated = row("estimate", "2026-10-16T02:00:00Z");
  estimated.displayTime!.quality = "ESTIMATED";
  const result = selectTodaysJourney(projection([estimated, row("flexible")]), clock)!;
  expect(result.primaryKind).toBe("PLANS");
  expect(result.primary?.itemRef).toBe("estimate");
});
it("preserves free-day baseline and rejects missing/invalid zone without guessing device time", () => {
  expect(selectTodaysJourney(projection([]), clock)?.primaryKind).toBe("FREE");
  expect(selectTodaysJourney(projection([]), { ...clock, zone: null })).toBeNull();
  expect(selectTodaysJourney(projection([]), { ...clock, zone: "+12:00" })).toBeNull();
  expect(() =>
    selectTodaysJourney(projection([]), { ...clock, zone: "not/a/zone" }),
  ).toThrow();
});
it("only keeps the covered night, excludes checkout and does not guess among multiple stays", () => {
  const rows = [row("stay", undefined, "P3"), row("checkout", undefined, "P3")];
  const stays = [
    { id: "stay", start: "2026-10-16", end: "2026-10-18" },
    { id: "checkout", start: "2026-10-15", end: "2026-10-16" },
  ];
  expect(selectTodaysJourney(projection(rows, stays), clock)?.tonight?.itemRef).toBe(
    "stay",
  );
  stays[1].end = "2026-10-17";
  const result = selectTodaysJourney(projection(rows, stays), clock)!;
  expect(result.tonight).toBeNull();
  expect(result.multipleStays).toBe(true);
  expect(result.primary).toBeNull();
});
it("does not expose cancelled/skipped entries", () => {
  const hidden = row("cancelled");
  hidden.status = "cancelled";
  expect(selectTodaysJourney(projection([hidden]), clock)?.primary).toBeNull();
});
it("retains the next boundary of a multi-row item in original Day order", () => {
  const rows = [
    row("flight", "2026-10-16T00:00:00Z"),
    row("meal", "2026-10-16T02:00:00Z"),
    row("flight", "2026-10-16T03:00:00Z"),
  ];
  const result = selectTodaysJourney(projection(rows), clock)!;
  expect(result.primary?.itemRef).toBe("meal");
  expect(result.later.map((r) => r.itemRef)).toEqual(["flight"]);
});
it("Trip date is not the device/UTC calendar date", () => {
  const result = selectTodaysJourney(projection([]), {
    now: "2026-10-15T14:00:00Z",
    zone: "Pacific/Auckland",
  });
  expect(result?.date).toBe("2026-10-16");
});

it("unknown travel zone uses only an explicit planning day and preserves owning order without upcoming", () => {
  const floating = row("coffee");
  floating.displayTime = {
    localDate: "2026-10-16",
    localTime: "09:00:00",
    comparable: false,
  };
  const exact = row("flight", "2026-10-16T02:00:00Z");
  const result = selectTodaysJourney(projection([floating, exact]), {
    now: "2026-10-15T23:00:00Z",
    zone: null,
    planningDate: "2026-10-16",
  })!;
  expect(result).toMatchObject({ date: "2026-10-16", zone: null, primaryKind: "PLANS" });
  expect(result.primary).toBe(floating);
  expect(result.primary?.displayTime?.localTime).toBe("09:00:00");
  expect(result.later).toEqual([exact]);
  expect(() =>
    selectTodaysJourney(projection([]), {
      ...clock,
      zone: null,
      planningDate: "2026-02-30",
    }),
  ).toThrow();
});
it.each(["2026-04-05", "2026-09-27"])(
  "planning date %s survives DST boundaries without manufacturing an instant",
  (planningDate) => {
    const floating = row("floating");
    floating.displayTime = {
      localDate: planningDate,
      localTime: "02:30:00",
      comparable: false,
    };
    const result = selectTodaysJourney(projection([floating]), {
      ...clock,
      zone: null,
      planningDate,
    });
    expect(result?.primaryKind).toBe("PLANS");
    expect(result?.primary?.displayTime).toEqual(floating.displayTime);
    expect(result?.date).toBe(planningDate);
  },
);
it("a cancelled Stay cannot be the date-coverage summary", () => {
  const stay = row("stay", undefined, "P3");
  stay.status = "cancelled";
  expect(
    selectTodaysJourney(
      projection([stay], [{ id: "stay", start: "2026-10-16", end: "2026-10-18" }]),
      { ...clock, zone: null, planningDate: "2026-10-16" },
    )?.tonight,
  ).toBeNull();
});

it("keeps a real checkout event on its day without retaining the checked-out stay", () => {
  const checkout = row("hotel", undefined, "P3");
  checkout.rowKey = {
    itemId: "hotel",
    projectionRole: "CHECKOUT",
    localDate: "2026-10-17",
  };
  const stays = [{ id: "hotel", start: "2026-10-16", end: "2026-10-17" }];
  const selected = selectTodaysJourney(projection([checkout], stays), {
    ...clock,
    zone: null,
    planningDate: "2026-10-17",
  })!;
  expect(selected.primary).toBe(checkout);
  expect(selected.primaryKind).toBe("PLANS");
  expect(selected.tonight).toBeNull();
  const afterCheckout = selectTodaysJourney(projection([checkout], stays), {
    ...clock,
    zone: null,
    planningDate: "2026-10-18",
  })!;
  expect(afterCheckout.primary).toBeNull();
  expect(afterCheckout.tonight).toBeNull();
});
it("unknown-zone plan selection keeps its explicit date instead of claiming clock-today", () => {
  const checkin = row("hotel", undefined, "P3");
  checkin.rowKey.projectionRole = "CHECKIN";
  const selected = selectTodaysJourney(
    projection([checkin], [{ id: "hotel", start: "2026-10-16", end: "2026-10-17" }]),
    { now: "2026-10-18T01:00:00Z", zone: null, planningDate: "2026-10-16" },
  )!;
  expect(selected.date).toBe("2026-10-16");
  expect(selected.primary).toBeNull();
  expect(selected.tonight).toBe(checkin);
  expect(selected.primaryKind).toBe("FREE");
});
