import { expect, it, vi } from "vitest";
import {
  p1FidelityFixture,
  p1FidelityPack,
  p1FidelityFocusKey,
} from "./p1FidelityFixture";
import { collectFixtureContributions } from "./contribution";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { composeDayStream } from "@/features/day-feed/composition";
vi.mock("@/features/day-feed/P1Row", () => ({ P1Row: () => null }));
it("adapts the frozen24Item/10day pack into the existing reader DTO without unavailable disclosure", () => {
  const f = p1FidelityFixture("today");
  expect(p1FidelityPack.items).toHaveLength(24);
  expect(f.dates).toHaveLength(10);
  expect(f.projection.events).toHaveLength(23);
  expect(f.projection.events.some((x) => x.id === "syn-p1-unavailable")).toBe(false);
  expect(() => collectFixtureContributions([f])).not.toThrow();
});
it("uses the owning query/composer to preserve START/END identity and floating TNS", () => {
  const f = p1FidelityFixture("today");
  const first = composeDayStream(
    itemsForLocalDate(f.projection, f.dates[0], f.zone),
    f.instant,
    { occurrenceFocus: true },
  );
  const second = composeDayStream(
    itemsForLocalDate(f.projection, f.dates[1], f.zone),
    f.instant,
    { occurrenceFocus: true },
  );
  expect(first.rows.find((r) => r.item.event.id === "syn-p1-floating")?.position).toBe(
    "TNS",
  );
  const start = first.rows.find((r) => r.item.event.id === "syn-p1-crossday")!,
    end = second.rows.find((r) => r.item.event.id === "syn-p1-crossday")!;
  expect(start.item.event.id).toBe(end.item.event.id);
  expect(start.key).not.toBe(end.key);
  expect(end.item.roles).toContain("END");
  expect(
    composeDayStream(itemsForLocalDate(f.projection, f.dates[2], f.zone), f.instant).rows,
  ).toHaveLength(0);
});
it("three controlled clocks retain the same Item identities and source facts", () => {
  const all = (["future", "today", "past"] as const).map((c) => p1FidelityFixture(c));
  expect(all[0].projection.events).toEqual(all[1].projection.events);
  expect(all[1].projection.events).toEqual(all[2].projection.events);
  expect(new Set(all.map((x) => x.instant)).size).toBe(3);
});

it("direct detail resolves the owning continuous occurrence key across days", () => {
  const f = p1FidelityFixture("today");
  for (const id of ["syn-p1-exact", "syn-p1-crossday"]) {
    const key = p1FidelityFocusKey(f, id);
    expect(key).toBeTruthy();
    expect(key).not.toBe(id);
    expect(
      f.dates
        .flatMap(
          (date) =>
            composeDayStream(itemsForLocalDate(f.projection, date, f.zone), f.instant, {
              occurrenceFocus: true,
            }).rows,
        )
        .some((row) => row.focusKey === key && row.item.event.id === id),
    ).toBe(true);
  }
  expect(p1FidelityFocusKey(f, "syn-p1-unavailable")).toBeUndefined();
});
