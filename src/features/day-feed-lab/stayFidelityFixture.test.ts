import { expect, it, vi } from "vitest";
import {
  stayFidelityFixture,
  stayFidelityRead,
  staySamples,
} from "./stayFidelityFixture";
import { composeDayStream } from "@/features/day-feed/composition";
vi.mock("@/features/day-feed/StayReadView", () => ({ StayReadRow: () => null }));
const fixture = (id: string) =>
  stayFidelityFixture(id, "today", vi.fn(), vi.fn(), vi.fn());
it("keeps one Stay identity with check-in, one end-of-day Daily Base and checkout roles", () => {
  const f = fixture("syn-stay-full");
  expect(f.dates).toHaveLength(4);
  const roles = f.dates.map((date) =>
    f.query!(date, f.zone).coreRows!.map((r) => [
      r.itemRef,
      r.rowKey.projectionRole,
      r.position,
    ]),
  );
  expect(roles).toEqual([
    [[f.stay.id, "CHECKIN", "TNS"]],
    [[f.stay.id, "BASE", "BASE"]],
    [[f.stay.id, "BASE", "BASE"]],
    [[f.stay.id, "CHECKOUT", "TNS"]],
  ]);
  expect(f.query!(f.dates[1], f.zone).coreRows![0].displayTime).toBeUndefined();
});
it("retains Floating planned clocks without manufacturing an instant or zone", () => {
  const f = fixture("syn-stay-floating");
  expect(f.stay.checkinTime).toBeTruthy();
  const query = f.query!(f.stay.start, f.zone);
  expect(query.coreRows![0].displayTime?.comparable).toBe(false);
  expect(query.coreRows![0].displayTime?.instant).toBeUndefined();
  expect(query.coreRows![0].displayTime?.zoneId).toBeUndefined();
});
it("all frozen scenarios compose without repository or mutation access", () => {
  for (const sample of staySamples) {
    const f = fixture(sample.id);
    expect(f.stay.id).toBe(sample.id);
    for (const date of f.dates)
      expect(
        composeDayStream(f.query!(date, f.zone), f.instant).rows.length,
      ).toBeGreaterThan(0);
    expect(
      f.stay.documents?.every((d) =>
        sample.documents.some((source) => source.id === d.id && source.visible),
      ),
    ).toBe(true);
    if (!sample.capabilities.edit) expect(f.stay.onEdit).toBeUndefined();
  }
});
it("does not present private documents, guests, photos, expense values or guessed callbacks", () => {
  const source = staySamples.find((s) => !s.capabilities.edit)!;
  const read = stayFidelityRead(source, vi.fn());
  expect(read.onEdit).toBeUndefined();
  expect(
    read.bookings?.every((b) => source.bookings.some((s) => s.id === b.id && s.visible)),
  ).toBe(true);
  for (const doc of read.documents ?? []) {
    const original = source.documents.find((d) => d.id === doc.id)!;
    if (!original.canOpenOriginal || !original.text) expect(doc.onOpen).toBeUndefined();
  }
});
it("day-use retains two roles for one Stay, while a hotel change retains two distinct Stay identities", () => {
  const dayUse = fixture("syn-stay-dayuse");
  expect(
    dayUse.query!(dayUse.stay.start, dayUse.zone).coreRows!.map((r) => [
      r.itemRef,
      r.rowKey.projectionRole,
    ]),
  ).toEqual([
    [dayUse.stay.id, "CHECKIN"],
    [dayUse.stay.id, "CHECKOUT"],
  ]);
  const change = fixture("syn-stay-change"),
    rows = change.query!(change.stay.end, change.zone).coreRows!;
  expect(change.stays).toHaveLength(2);
  expect(rows.map((r) => [r.itemRef, r.rowKey.projectionRole])).toEqual([
    [change.stay.id, "CHECKOUT"],
    ["syn-stay-next", "CHECKIN"],
  ]);
});
